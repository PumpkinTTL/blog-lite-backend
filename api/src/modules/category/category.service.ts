import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoryEntity } from './category.entity';
import { applyFilters } from '../../common/utils/apply-filters';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(CategoryEntity)
    private readonly categoryRepo: Repository<CategoryEntity>,
  ) {}

  async findAll(filters?: { id?: number; keyword?: string }) {
    const qb = this.categoryRepo.createQueryBuilder('e');
    applyFilters(qb, {
      exact: { 'e.id': filters?.id },
      like: { keyword: filters?.keyword, fields: ['e.name', 'e.slug'] },
    });
    qb.orderBy('e.sortOrder', 'ASC');
    return qb.getMany();
  }

  async findById(id: number) {
    return this.categoryRepo.findOne({ where: { id } });
  }

  async create(data: Partial<CategoryEntity>) {
    const category = this.categoryRepo.create(data);
    return this.categoryRepo.save(category);
  }

  async update(id: number, data: Partial<CategoryEntity>) {
    await this.categoryRepo.update(id, data);
    return this.findById(id);
  }

  async remove(id: number) {
    await this.categoryRepo.delete(id);
  }
}
