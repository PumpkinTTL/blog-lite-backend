import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoryEntity } from './category.entity';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(CategoryEntity)
    private readonly categoryRepo: Repository<CategoryEntity>,
  ) {}

  async findAll(filters?: { id?: number; keyword?: string }) {
    const qb = this.categoryRepo.createQueryBuilder('e');
    if (filters?.id !== undefined) {
      qb.andWhere('e.id = :id', { id: filters.id });
    }
    if (filters?.keyword) {
      qb.andWhere('(e.name LIKE :kw OR e.slug LIKE :kw)', { kw: `%${filters.keyword}%` });
    }
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
