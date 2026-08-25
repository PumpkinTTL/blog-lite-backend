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
import { SettingService } from '../setting/setting.service';

/** 系统设置面板管理的 R2 账号（storage.r2.accounts JSON 的一项） */
export interface R2Account {
  id: string;
  name: string;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** 自定义公开域名（R2 绑定的域名），可空 */
  publicDomain?: string;
  /** 对象 key 前缀（如 blog/），可空 */
  prefix?: string;
  enabled: boolean;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @InjectRepository(MediaEntity)
    private readonly mediaRepo: Repository<MediaEntity>,
    private readonly configService: ConfigService,
    private readonly settingService: SettingService,
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

    // 3. 存储文件（R2 时对象 key 加账号前缀）
    const originalName = this.decodeFilename(file.originalname);
    const r2Account =
      storageType === 'oss' && ossPlatform === 'cloudflare'
        ? await this.getActiveR2Account()
        : null;
    const filename = this.generateFilename(
      originalName,
      app,
      folder,
      r2Account?.prefix,
    );
    const provider = await this.createStorageProvider(storageType, ossPlatform);
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
    /** 前台用户秒传限定本人记录；admin 不传（全库秒传） */
    uploaderId?: number;
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

    // 1. 秒传检查：前端带 hash 时先查（必须 storageType=oss + ossPlatform=cloudflare）。
    //    uploaderId 限定（审查P1）：前台用户只能命中自己的记录——曾不限上传者，
    //    任意用户对公网图片算 sha256 即可读出他人 media 记录并借 note 覆写。
    //    admin 通道（不传 uploaderId）保持全库秒传。
    if (hash) {
      const qb = this.mediaRepo
        .createQueryBuilder('m')
        .where('m.hash = :hash', { hash })
        .andWhere('m.storage_type = :storageType', { storageType: 'oss' })
        .andWhere('m.oss_platform = :ossPlatform', {
          ossPlatform: 'cloudflare',
        });
      if (params.uploaderId) qb.andWhere('m.uploaderId = :uid', { uid: params.uploaderId });
      const existing = await qb.getOne();
      if (existing) {
        if (note && existing.note !== note) {
          existing.note = note;
          return { alreadyExists: true, media: await this.mediaRepo.save(existing) };
        }
        return { alreadyExists: true, media: existing };
      }
    }

    // 2. 生成 key（带启用账号的 key 前缀）+ 签 URL
    const originalName = this.decodeFilename(filename);
    const r2Account = await this.getActiveR2Account();
    const key = this.generateFilename(
      originalName,
      app,
      folder,
      r2Account?.prefix,
    );
    const provider = await this.createR2Provider();
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
  /** 用户直传单文件上限（与 media-user.controller 的 presign 前置检查一致） */
  private static readonly USER_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

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

    // 上限强制校验：presign 阶段的前置检查可被绕过（声明小尺寸实际传大文件），
    // confirm 必须对声明值与 R2 实际值双重把关
    if (size > MediaService.USER_UPLOAD_MAX_BYTES) {
      throw new BadRequestException('文件大小超过 10MB 限制');
    }

    // key 格式守卫（审查P0）：confirm 的 key 曾无任何绑定——任意登录用户传
    // backup/*.sql.gz 等他人/系统对象 key，可借"校验失败删除"链路删光备份或
    // 他人文件。这里强制 key 必须是本系统 generateFilename 的输出格式，
    // 不匹配直接拒绝（HEAD 与 delete 均不执行，同时消除对象存在性探测面）。
    if (!this.isUserMediaKey(key)) {
      throw new BadRequestException('非法的文件标识');
    }

    // 幂等：同 hash + cloudflare + 同一上传者已有记录直接返回。
    // 限定同 uploader：避免按已知 hash 枚举出他人 media 记录（含 uploaderId）。
    const existing = await this.mediaRepo.findOne({
      where: {
        hash,
        storageType: 'oss',
        ossPlatform: 'cloudflare',
        uploaderId,
      },
    });
    if (existing) return existing;

    // HEAD 探测
    const provider = await this.createR2Provider();
    const head = await provider.headObject(key);
    if (!head.exists) {
      throw new BadRequestException(
        '文件未上传成功（R2 中找不到该对象），请重试上传',
      );
    }
    // 大小校验：若 HEAD 拿到大小，必须与声明一致（防伪造）且不超上限
    if (head.size != null && head.size !== size) {
      // 实际对象与声明不符（绕过 presign 声明的典型痕迹），删除防止占用公开桶。
      // 错误不回显实际 size（对象大小探测 oracle，审查P1）
      await provider.delete(key).catch(() => {});
      throw new BadRequestException('文件大小校验不一致，请重新上传');
    }
    if (head.size != null && head.size > MediaService.USER_UPLOAD_MAX_BYTES) {
      await provider.delete(key).catch(() => {});
      throw new BadRequestException('文件大小超过 10MB 限制');
    }
    // 类型二次校验：用 HEAD 返回的实际 contentType（不信任前端传的 mimeType），
    // 防止 presign 时是图片但实际 PUT 了恶意文件。
    // presign 已把 ContentType 签入签名，正常流程不会不一致；此处为纵深防御。
    const actualType = head.contentType || mimeType;
    if (!this.isAllowedContentType(actualType, params.folder)) {
      await provider.delete(key).catch(() => {});
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

    await (
      await this.createStorageProvider(media.storageType, media.ossPlatform)
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
        this.createStorageProvider(media.storageType, media.ossPlatform)
          .then((provider) => provider.delete(media.filename))
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
    keyPrefix?: string | null,
  ): string {
    const ext = extname(originalName) || '';
    const parts: string[] = [];
    // 账号级 key 前缀（系统设置面板按 R2 账号配置，多账号隔离用）
    if (keyPrefix) parts.push(keyPrefix.replace(/^\/+|\/+$/g, ''));
    if (app) parts.push(app);
    if (folder) parts.push(folder);
    const prefix = parts.length ? parts.join('/') + '/' : '';
    return `${prefix}${Date.now()}-${randomUUID()}${ext}`;
  }

  /** confirm 的 key 合法性校验：仅接受本系统生成的媒体对象 key（时间戳-UUID 文件名） */
  private isUserMediaKey(key: string): boolean {
    if (!key || key.length > 256 || key.includes('..')) return false;
    const segs = key.split('/');
    if (segs.length < 1) return false;
    // 路径段：字母数字/下划线/连字符，1-64 字符（不允许空段）
    for (const seg of segs.slice(0, -1)) {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(seg)) return false;
    }
    // 末段文件名：<13位毫秒时间戳>-<UUID>[.扩展名]（与 generateFilename 一致）
    const file = segs[segs.length - 1];
    return /^\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-zA-Z0-9]{1,8})?$/.test(file);
  }

  private computeHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  private async createStorageProvider(
    storageType: StorageType,
    ossPlatform: OssPlatform,
  ): Promise<StorageProvider> {
    if (storageType === 'local') {
      return new StorageProvider({ provider: 'local' });
    }

    if (!ossPlatform) {
      throw new BadRequestException('请选择 OSS 平台');
    }

    // Cloudflare R2 使用独立配置通道（数据库多账号优先，.env 兜底）
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

  /** 当前启用的 R2 账号（系统设置 storage.r2.accounts JSON）。
   * 无账号配置时返回 null（走 .env 兜底）。
   * active_id 匹配优先，否则取第一个 enabled 账号。
   */
  private async getActiveR2Account(): Promise<R2Account | null> {
    const raw = (await this.settingService.findByKey('storage.r2.accounts'))
      ?.value;
    if (!raw) return null;
    let list: unknown;
    try {
      list = JSON.parse(raw);
    } catch {
      this.logger.warn('storage.r2.accounts JSON 解析失败，忽略并走 .env 配置');
      return null;
    }
    if (!Array.isArray(list)) return null;
    const accounts = list.filter(
      (a): a is R2Account =>
        !!a && typeof a === 'object' && (a as R2Account).enabled !== false,
    );
    if (accounts.length === 0) return null;
    const activeId = (
      (await this.settingService.findByKey('storage.r2.active_id'))?.value ?? ''
    ).trim();
    return accounts.find((a) => a.id === activeId) ?? accounts[0];
  }

  /**
   * 创建 Cloudflare R2 存储实例。
   * 优先用系统设置面板的多账号配置；无账号时回落 .env（R2_* 环境变量）。
   * 按配置签名缓存实例：StorageProvider 构造即建 S3Client（TLS 握手池），
   * presign/confirm 是头像上传热路径，不能每次请求都重建（参照 mailer 的 transporter 缓存）。
   */
  private r2ProviderCache = new Map<string, StorageProvider>();

  private async createR2Provider(): Promise<StorageProvider> {
    const account = await this.getActiveR2Account();
    if (account) {
      const missing = (
        ['accountId', 'accessKeyId', 'secretAccessKey', 'bucket'] as const
      ).filter((f) => !account[f]);
      if (missing.length > 0) {
        throw new BadRequestException(
          `R2 账号「${account.name || account.id}」配置不完整，缺少：${missing.join('、')}（系统设置 → 存储配置）`,
        );
      }
      const config = {
        provider: 'cloudflare' as const,
        endpoint: this.resolveR2Endpoint(account.accountId),
        region: 'auto',
        bucket: account.bucket,
        accessKeyId: account.accessKeyId,
        secretAccessKey: account.secretAccessKey,
        publicDomain: account.publicDomain || undefined,
      };
      const sig = JSON.stringify(config);
      const cached = this.r2ProviderCache.get(sig);
      if (cached) return cached;
      const created = new StorageProvider(config);
      this.r2ProviderCache.set(sig, created);
      // 面板可多账号轮换，缓存按签名隔离；上限防极端情况（账号反复改配）无限增长
      if (this.r2ProviderCache.size > 8) {
        this.r2ProviderCache.delete(this.r2ProviderCache.keys().next().value);
      }
      return created;
    }

    // .env 兜底（未在面板配置任何账号时的旧行为）
    const accountId = this.configService.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'R2_SECRET_ACCESS_KEY',
    );
    const bucket = this.configService.get<string>('R2_BUCKET');
    const publicDomain = this.configService.get<string>('R2_PUBLIC_DOMAIN');

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      throw new BadRequestException(
        'R2 未配置：请在系统设置 → 存储配置添加账号，或设置 R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET',
      );
    }

    const envSig = JSON.stringify([accountId, accessKeyId, bucket, publicDomain]);
    const envCached = this.r2ProviderCache.get(envSig);
    if (envCached) return envCached;
    const envProvider = new StorageProvider({
      provider: 'cloudflare',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      region: 'auto',
      bucket,
      accessKeyId,
      secretAccessKey,
      publicDomain: publicDomain || undefined,
    });
    this.r2ProviderCache.set(envSig, envProvider);
    return envProvider;
  }

  /**
   * 解析 R2 endpoint：输入可以是完整 endpoint（https://xxx.r2.cloudflarestorage.com）
   * 或纯 Account ID（自动拼上 R2 域名）。两种粘贴习惯都兼容。
   */
  private resolveR2Endpoint(accountIdOrEndpoint: string): string {
    const v = (accountIdOrEndpoint || '').trim();
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v.replace(/\/+$/, '');
    return `https://${v}.r2.cloudflarestorage.com`;
  }

  /**
   * 测试 R2 账号连通性（系统设置面板用）：用表单当前值直接 HeadBucket，
   * 不需要先保存。返回分类后的中文错误信息。
   */
  async testR2Connection(dto: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
  }): Promise<{ ok: boolean; message: string; latencyMs: number }> {
    const provider = new StorageProvider({
      provider: 'cloudflare',
      endpoint: this.resolveR2Endpoint(dto.accountId),
      region: 'auto',
      bucket: dto.bucket.trim(),
      accessKeyId: dto.accessKeyId.trim(),
      secretAccessKey: dto.secretAccessKey,
    });
    const startedAt = Date.now();
    const result = await provider.headBucket();
    return { ...result, latencyMs: Date.now() - startedAt };
  }
}
