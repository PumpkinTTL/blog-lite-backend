import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MediaEntity } from './media.entity';
import { applyFilters } from '../../common/utils/apply-filters';

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(MediaEntity)
    private readonly mediaRepo: Repository<MediaEntity>,
  ) {}

  async findAll(page = 1, pageSize = 20, filters?: { id?: number; keyword?: string }) {
    const qb = this.mediaRepo.createQueryBuilder('e');
    applyFilters(qb, {
      exact: { 'e.id': filters?.id },
      like: { keyword: filters?.keyword, fields: ['e.originalName'] },
    });
    qb.orderBy('e.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async findById(id: number) {
    return this.mediaRepo.findOne({ where: { id } });
  }

  async upload(file: Express.Multer.File) {
    const media = this.mediaRepo.create({
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      url: `/uploads/${file.filename}`,
      uploaderId: 1, // TODO: 从 AuthGuard 获取当前用户 ID
    });
    return this.mediaRepo.save(media);
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
}
