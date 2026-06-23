import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID, createHash } from 'node:crypto';
import { extname } from 'node:path';
import { In, Repository } from 'typeorm';
import { applyFilters } from '../../common/utils/apply-filters';
import { MediaEntity, OssPlatform, StorageType } from './media.entity';
import { StorageProvider, StorageConfig } from './storage.provider';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @InjectRepository(MediaEntity)
    private readonly mediaRepo: Repository<MediaEntity>,
    private readonly configService: ConfigService,
  ) {}

  async findAll(
    page = 1,
    pageSize = 20,
    filters?: { id?: number; keyword?: string; mimeType?: string },
  ) {
    const qb = this.mediaRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.uploader', 'u');
    applyFilters(qb, {
      exact: { 'e.id': filters?.id },
      like: { keyword: filters?.keyword, fields: ['e.originalName'] },
    });
    if (filters?.mimeType) {
      qb.andWhere('e.mimeType LIKE :mimeType', {
        mimeType: `${filters.mimeType}%`,
      });
    }
    qb.orderBy('e.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async findById(id: number) {
    const media = await this.mediaRepo.findOne({ where: { id } });
    if (!media) throw new NotFoundException('素材不存在');
    return media;
  }

  async findByUrl(url: string) {
    return this.mediaRepo.findOne({ where: { url } });
  }

  async upload(
    file: Express.Multer.File,
    uploaderId: number,
    options?: {
      storageType?: StorageType;
      ossPlatform?: Exclude<OssPlatform, null>;
      note?: string;
      app?: string;
      folder?: string;
    },
  ) {
    const storageType = options?.storageType ?? 'local';
    const ossPlatform: OssPlatform =
      storageType === 'oss' ? (options?.ossPlatform ?? null) : null;
    const note = options?.note?.trim() || null;
    const app = options?.app?.trim() || null;
    const folder = options?.folder?.trim() || null;

    // 1. 计算文件哈希
    const hash = this.computeHash(file.buffer);

    // 2. 秒传：同存储通道下相同哈希直接返回已有记录（本地/OSS/R2 通用）
    const qb = this.mediaRepo
      .createQueryBuilder('m')
      .where('m.hash = :hash', { hash })
      .andWhere('m.storage_type = :storageType', { storageType });
    if (storageType === 'oss' && ossPlatform) {
      qb.andWhere('m.oss_platform = :ossPlatform', { ossPlatform });
    }
    const existing = await qb.getOne();
    if (existing) {
      // 秒传命中：若本次携带了 note 且与已有 note 不同，则更新 note
      if (note && existing.note !== note) {
        existing.note = note;
        return this.mediaRepo.save(existing);
      }
      this.logger.log(
        `秒传命中: ${file.originalname} -> ${existing.id} (${storageType}${ossPlatform ? '/' + ossPlatform : ''}, hash: ${hash})`,
      );
      return existing;
    }

    // 3. 存储文件
    const originalName = this.decodeFilename(file.originalname);
    const filename = this.generateFilename(originalName, app, folder);
    const provider = this.createStorageProvider(storageType, ossPlatform);
    const url = await provider.upload(file.buffer, filename, file.mimetype);

    // 4. 入库
    const media = this.mediaRepo.create({
      filename,
      originalName,
      mimeType: file.mimetype,
      size: file.size,
      hash,
      url,
      storageType,
      ossPlatform,
      uploaderId,
      note,
    });
    return this.mediaRepo.save(media);
  }

  async uploadMany(
    files: Express.Multer.File[],
    uploaderId: number,
    options?: {
      storageType?: StorageType;
      ossPlatform?: Exclude<OssPlatform, null>;
      note?: string;
      app?: string;
      folder?: string;
    },
  ) {
    const result: MediaEntity[] = [];
    for (const file of files) {
      const media = await this.upload(file, uploaderId, options);
      result.push(media);
    }
    return result;
  }

  async create(data: Partial<MediaEntity>) {
    const media = this.mediaRepo.create(data);
    return this.mediaRepo.save(media);
  }

  /**
   * 签发 R2 presigned PUT URL（前端直传模式）
   *
   * 流程：
   * 1. 前端先算好 sha256 一并传上来 → 这里先查秒传
   * 2. 命中秒传：直接返回已有记录，不签 URL（前端跳过上传）
   * 3. 未命中：生成 key，签 5 分钟有效的 PUT URL，返回给前端
   *
   * 不入库。入库延后到 confirm()，确保对象真上传成功才写记录。
   *
   * @returns
   *   - 命中秒传：`{ alreadyExists: true, media }`
   *   - 需要上传：`{ alreadyExists: false, uploadUrl, key, publicUrl }`
   */
  async presignR2Upload(params: {
    filename: string;
    contentType: string;
    size: number;
    hash?: string;
    app?: string;
    folder?: string;
    note?: string;
  }): Promise<
    | { alreadyExists: true; media: MediaEntity }
    | {
        alreadyExists: false;
        uploadUrl: string;
        key: string;
        publicUrl: string;
      }
  > {
    const { filename, contentType, size, hash, app, folder, note } = params;

    // 0. 文件类型白名单校验：前台直传只允许图片类型，
    // 防止上传 html/svg（存储型 XSS）/exe 等恶意文件。
    // avatar/post/cover/article 等 folder 都应只接受图片。
    if (!this.isAllowedContentType(contentType, folder)) {
      throw new BadRequestException(
        `不支持的文件类型：${contentType}（仅允许图片）`,
      );
    }

    // 1. 秒传检查：前端带 hash 时先查（必须 storageType=oss + ossPlatform=cloudflare）
    if (hash) {
      const qb = this.mediaRepo
        .createQueryBuilder('m')
        .where('m.hash = :hash', { hash })
        .andWhere('m.storage_type = :storageType', { storageType: 'oss' })
        .andWhere('m.oss_platform = :ossPlatform', {
          ossPlatform: 'cloudflare',
        });
      const existing = await qb.getOne();
      if (existing) {
        if (note && existing.note !== note) {
          existing.note = note;
          return { alreadyExists: true, media: await this.mediaRepo.save(existing) };
        }
        return { alreadyExists: true, media: existing };
      }
    }

    // 2. 生成 key + 签 URL
    const originalName = this.decodeFilename(filename);
    const key = this.generateFilename(originalName, app, folder);
    const provider = this.createR2Provider();
    const uploadUrl = await provider.presignPut(key, contentType, size, 300);
    const publicUrl = provider.getUrl(key);

    return { alreadyExists: false, uploadUrl, key, publicUrl };
  }

  /**
   * 直传完成后的入库确认（前端 PUT 成功后调用）
   *
   * 1. HEAD 探测 R2 对象是否真实存在 + 校验大小
   * 2. 幂等：同 key+hash 已有记录则直接返回（防止前端重复 confirm）
   * 3. 不存在/大小不符 → 抛 400
   */
  async confirmR2Upload(params: {
    key: string;
    originalName: string;
    mimeType: string;
    size: number;
    hash: string;
    app?: string;
    folder?: string;
    note?: string;
    uploaderId: number;
  }): Promise<MediaEntity> {
    const {
      key,
      originalName,
      mimeType,
      size,
      hash,
      note,
      uploaderId,
    } = params;

    // 幂等：同 hash + cloudflare 已有记录直接返回
    const existing = await this.mediaRepo.findOne({
      where: { hash, storageType: 'oss', ossPlatform: 'cloudflare' },
    });
    if (existing) return existing;

    // HEAD 探测
    const provider = this.createR2Provider();
    const head = await provider.headObject(key);
    if (!head.exists) {
      throw new BadRequestException(
        '文件未上传成功（R2 中找不到该对象），请重试上传',
      );
    }
    // 大小校验：若 HEAD 拿到大小，必须与声明一致（防伪造）
    if (head.size != null && head.size !== size) {
      throw new BadRequestException(
        `文件大小不一致：声明 ${size} 字节，实际 ${head.size} 字节`,
      );
    }
    // 类型二次校验：用 HEAD 返回的实际 contentType（不信任前端传的 mimeType），
    // 防止 presign 时是图片但实际 PUT 了恶意文件
    const actualType = head.contentType || mimeType;
    if (!this.isAllowedContentType(actualType, params.folder)) {
      throw new BadRequestException(
        `检测到不允许的文件类型：${actualType}（仅允许图片）`,
      );
    }

    const decodedName = this.decodeFilename(originalName);
    const media = this.mediaRepo.create({
      filename: key,
      originalName: decodedName,
      mimeType,
      size,
      hash,
      url: provider.getUrl(key),
      storageType: 'oss',
      ossPlatform: 'cloudflare',
      uploaderId,
      note: note?.trim() || null,
    });
    return this.mediaRepo.save(media);
  }

  async remove(id: number) {
    const media = await this.mediaRepo.findOne({ where: { id } });
    if (!media) return;

    await this.createStorageProvider(
      media.storageType,
      media.ossPlatform,
    ).delete(media.filename);
    await this.mediaRepo.delete(id);
  }

  async update(id: number, data: { originalName?: string; note?: string }) {
    const existing = await this.mediaRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('素材不存在');
    await this.mediaRepo.update(id, data);
    return this.findById(id);
  }

  async batchRemove(ids: number[]) {
    const mediaList = await this.mediaRepo.find({ where: { id: In(ids) } });
    // 并行删除存储文件（各文件互不依赖，串行会 N 次网络往返）
    await Promise.all(
      mediaList.map((media) =>
        this.createStorageProvider(
          media.storageType,
          media.ossPlatform,
        )
          .delete(media.filename)
          .catch((e) =>
            this.logger.warn(`删除存储文件失败 ${media.filename}: ${e.message}`),
          ),
      ),
    );
    await this.mediaRepo.delete(ids);
  }

  /**
   * 文件类型白名单：前台用户直传只允许图片。
   * 排除 svg（可内嵌 JS 执行，存储型 XSS 风险）。
   * admin 端走 multer fileFilter 有自己的白名单（含 svg，admin 可信）。
   */
  private static readonly ALLOWED_CONTENT_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/x-icon', // .ico
  ];

  private isAllowedContentType(contentType: string, _folder?: string): boolean {
    // 去掉 charset 等参数：image/png; charset=utf-8 → image/png
    const base = (contentType || '').split(';')[0].trim().toLowerCase();
    return MediaService.ALLOWED_CONTENT_TYPES.includes(base);
  }

  private decodeFilename(name: string): string {
    if (/[ÃÂÄÅåäöü]/.test(name)) {
      try {
        return Buffer.from(name, 'latin1').toString('utf-8');
      } catch {
        return name;
      }
    }
    return name;
  }

  private generateFilename(
    originalName: string,
    app?: string | null,
    folder?: string | null,
  ): string {
    const ext = extname(originalName) || '';
    const parts: string[] = [];
    if (app) parts.push(app);
    if (folder) parts.push(folder);
    const prefix = parts.length ? parts.join('/') + '/' : '';
    return `${prefix}${Date.now()}-${randomUUID()}${ext}`;
  }

  private computeHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  private createStorageProvider(
    storageType: StorageType,
    ossPlatform: OssPlatform,
  ): StorageProvider {
    if (storageType === 'local') {
      return new StorageProvider({ provider: 'local' });
    }

    if (!ossPlatform) {
      throw new BadRequestException('请选择 OSS 平台');
    }

    // Cloudflare R2 使用独立配置通道
    if (ossPlatform === 'cloudflare') {
      return this.createR2Provider();
    }

    const config: StorageConfig = {
      provider: ossPlatform,
      endpoint: this.configService.get<string>('OSS_ENDPOINT'),
      region: this.configService.get<string>('OSS_REGION', 'auto'),
      bucket: this.configService.get<string>('OSS_BUCKET'),
      accessKeyId: this.configService.get<string>('OSS_ACCESS_KEY_ID'),
      secretAccessKey: this.configService.get<string>('OSS_SECRET_ACCESS_KEY'),
    };

    if (!config.bucket || !config.accessKeyId || !config.secretAccessKey) {
      throw new BadRequestException(
        'OSS 未配置：请设置 OSS_BUCKET / OSS_ACCESS_KEY_ID / OSS_SECRET_ACCESS_KEY',
      );
    }

    return new StorageProvider(config);
  }

  /**
   * 创建 Cloudflare R2 存储实例（独立配置通道）
   */
  private createR2Provider(): StorageProvider {
    const accountId = this.configService.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'R2_SECRET_ACCESS_KEY',
    );
    const bucket = this.configService.get<string>('R2_BUCKET');
    const publicDomain = this.configService.get<string>('R2_PUBLIC_DOMAIN');

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      throw new BadRequestException(
        'R2 未配置：请设置 R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET',
      );
    }

    return new StorageProvider({
      provider: 'cloudflare',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      region: 'auto',
      bucket,
      accessKeyId,
      secretAccessKey,
      publicDomain: publicDomain || undefined,
    });
  }
}
