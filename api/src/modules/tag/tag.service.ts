import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TagEntity } from './tag.entity';
import { applyFilters } from '../../common/utils/apply-filters';

@Injectable()
export class TagService {
  constructor(
    @InjectRepository(TagEntity)
    private readonly tagRepo: Repository<TagEntity>,
  ) {}

  async findAll(filters?: { id?: number; keyword?: string }) {
    const qb = this.tagRepo.createQueryBuilder('e');
    applyFilters(qb, {
      exact: { 'e.id': filters?.id },
      like: { keyword: filters?.keyword, fields: ['e.name', 'e.slug'] },
    });
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
