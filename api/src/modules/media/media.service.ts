import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { MediaEntity } from './media.entity';
import { applyFilters } from '../../common/utils/apply-filters';

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(MediaEntity)
    private readonly mediaRepo: Repository<MediaEntity>,
  ) {}

  async findAll(page = 1, pageSize = 20, filters?: { id?: number; keyword?: string; mimeType?: string }) {
    const qb = this.mediaRepo.createQueryBuilder('e');
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

  async upload(file: Express.Multer.File, uploaderId: number) {
    const media = this.mediaRepo.create({
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      url: `/uploads/${file.filename}`,
      uploaderId,
    });
    return this.mediaRepo.save(media);
  }

  async uploadMany(files: Express.Multer.File[], uploaderId: number) {
    const mediaList = files.map((file) =>
      this.mediaRepo.create({
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url: `/uploads/${file.filename}`,
        uploaderId,
      }),
    );
    return this.mediaRepo.save(mediaList);
  }

  async create(data: Partial<MediaEntity>) {
    const media = this.mediaRepo.create(data);
    return this.mediaRepo.save(media);
  }

  async remove(id: number) {
    const media = await this.mediaRepo.findOne({ where: { id } });
    if (media) {
      const { unlink } = await import('fs/promises');
      const { join } = await import('path');
      try {
        await unlink(join(process.cwd(), 'uploads', media.filename));
      } catch (err) {
        console.error('删除文件失败:', err);
      }
    }
    await this.mediaRepo.delete(id);
  }

  async update(id: number, data: { originalName?: string }) {
    await this.mediaRepo.update(id, data as any);
    return this.findById(id);
  }

  async batchRemove(ids: number[]) {
    const mediaList = await this.mediaRepo.find({ where: { id: In(ids) } });
    const { unlink } = await import('fs/promises');
    const { join } = await import('path');
    for (const media of mediaList) {
      try {
        await unlink(join(process.cwd(), 'uploads', media.filename));
      } catch (err) {
        console.error('删除文件失败:', err);
      }
    }
    await this.mediaRepo.delete(ids);
  }
}
