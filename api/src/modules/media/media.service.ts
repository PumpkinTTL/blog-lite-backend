import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
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

  async findAll(page = 1, pageSize = 20, filters?: { id?: number; keyword?: string; mimeType?: string }) {
    const qb = this.mediaRepo.createQueryBuilder('e')
      .leftJoinAndSelect('e.uploader', 'u');
    applyFilters(qb, {
      exact: { 'e.id': filters?.id },
      like: { keyword: filters?.keyword, fields: ['e.originalName'] },
    });
    if (filters?.mimeType) {
      qb.andWhere('e.mimeType LIKE :mimeType', { mimeType: `${filters.mimeType}%` });
    }
    qb.orderBy('e.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async findById(id: number) {
    return this.mediaRepo.findOne({ where: { id } });
  }

  async upload(
    file: Express.Multer.File,
    uploaderId: number,
    options?: { storageType?: StorageType; ossPlatform?: Exclude<OssPlatform, null> },
  ) {
    const storageType = options?.storageType ?? 'local';
    const ossPlatform: OssPlatform = storageType === 'oss' ? (options?.ossPlatform ?? null) : null;
    const originalName = this.decodeFilename(file.originalname);
    const filename = this.generateFilename(originalName);
    const provider = this.createStorageProvider(storageType, ossPlatform);
    const url = await provider.upload(file.buffer, filename, file.mimetype);

    const media = this.mediaRepo.create({
      filename,
      originalName,
      mimeType: file.mimetype,
      size: file.size,
      url,
      storageType,
      ossPlatform,
      uploaderId,
    });
    return this.mediaRepo.save(media);
  }

  async uploadMany(
    files: Express.Multer.File[],
    uploaderId: number,
    options?: { storageType?: StorageType; ossPlatform?: Exclude<OssPlatform, null> },
  ) {
    const result: MediaEntity[] = [];
    for (const file of files) {
      result.push(await this.upload(file, uploaderId, options));
    }
    return result;
  }

  async create(data: Partial<MediaEntity>) {
    const media = this.mediaRepo.create(data);
    return this.mediaRepo.save(media);
  }

  async remove(id: number) {
    const media = await this.mediaRepo.findOne({ where: { id } });
    if (!media) return;

    await this.createStorageProvider(media.storageType, media.ossPlatform).delete(media.filename);
    await this.mediaRepo.delete(id);
  }

  async update(id: number, data: { originalName?: string }) {
    await this.mediaRepo.update(id, data);
    return this.findById(id);
  }

  async batchRemove(ids: number[]) {
    const mediaList = await this.mediaRepo.find({ where: { id: In(ids) } });
    for (const media of mediaList) {
      await this.createStorageProvider(media.storageType, media.ossPlatform).delete(media.filename);
    }
    await this.mediaRepo.delete(ids);
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

  private generateFilename(originalName: string): string {
    const ext = extname(originalName) || '';
    return `${Date.now()}-${randomUUID()}${ext}`;
  }

  private createStorageProvider(storageType: StorageType, ossPlatform: OssPlatform): StorageProvider {
    if (storageType === 'local') {
      return new StorageProvider({ provider: 'local' });
    }

    if (!ossPlatform) {
      throw new BadRequestException('请选择 OSS 平台');
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
      throw new BadRequestException('OSS 未配置：请设置 OSS_BUCKET / OSS_ACCESS_KEY_ID / OSS_SECRET_ACCESS_KEY');
    }

    return new StorageProvider(config);
  }
}
