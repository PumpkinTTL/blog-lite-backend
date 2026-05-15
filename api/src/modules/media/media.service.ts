import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MediaEntity } from './media.entity';

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(MediaEntity)
    private readonly mediaRepo: Repository<MediaEntity>,
  ) {}

  async findAll(page = 1, pageSize = 20, filters?: { id?: number; keyword?: string }) {
    const qb = this.mediaRepo.createQueryBuilder('e');

    if (filters?.id !== undefined) {
      qb.andWhere('e.id = :id', { id: filters.id });
    }
    if (filters?.keyword) {
      qb.andWhere('e.originalName LIKE :kw', { kw: `%${filters.keyword}%` });
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

  async create(data: Partial<MediaEntity>) {
    const media = this.mediaRepo.create(data);
    return this.mediaRepo.save(media);
  }

  async remove(id: number) {
    await this.mediaRepo.delete(id);
  }
}
