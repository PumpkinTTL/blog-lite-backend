import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TagEntity } from './tag.entity';

@Injectable()
export class TagService {
  constructor(
    @InjectRepository(TagEntity)
    private readonly tagRepo: Repository<TagEntity>,
  ) {}

  async findAll(filters?: { id?: number; keyword?: string }) {
    const qb = this.tagRepo.createQueryBuilder('e');
    if (filters?.id !== undefined) {
      qb.andWhere('e.id = :id', { id: filters.id });
    }
    if (filters?.keyword) {
      qb.andWhere('(e.name LIKE :kw OR e.slug LIKE :kw)', { kw: `%${filters.keyword}%` });
    }
    qb.orderBy('e.createdAt', 'DESC');
    return qb.getMany();
  }

  async findById(id: number) {
    return this.tagRepo.findOne({ where: { id } });
  }

  async create(data: Partial<TagEntity>) {
    const tag = this.tagRepo.create(data);
    return this.tagRepo.save(tag);
  }

  async update(id: number, data: Partial<TagEntity>) {
    await this.tagRepo.update(id, data);
    return this.findById(id);
  }

  async remove(id: number) {
    await this.tagRepo.delete(id);
  }
}
