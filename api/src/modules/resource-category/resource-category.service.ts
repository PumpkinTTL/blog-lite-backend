import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResourceCategoryEntity } from './resource-category.entity';
import { applyFilters } from '../../common/utils/apply-filters';

@Injectable()
export class ResourceCategoryService {
  constructor(
    @InjectRepository(ResourceCategoryEntity)
    private readonly repo: Repository<ResourceCategoryEntity>,
  ) {}

  async findAll(
    page = 1,
    pageSize = 20,
    filters?: { id?: number; keyword?: string },
  ) {
    const qb = this.repo.createQueryBuilder('e');
    applyFilters(qb, {
      exact: { 'e.id': filters?.id },
      like: { keyword: filters?.keyword, fields: ['e.name'] },
    });
    qb.orderBy('e.sortOrder', 'ASC')
      .addOrderBy('e.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async findById(id: number) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('资源分类不存在');
    return entity;
  }

  async create(data: Partial<ResourceCategoryEntity>) {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(id: number, data: Partial<ResourceCategoryEntity>) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('资源分类不存在');
    await this.repo.update(id, data);
    return this.repo.findOne({ where: { id } });
  }

  async remove(id: number) {
    await this.repo.delete(id);
  }

  async batchRemove(ids: number[]): Promise<void> {
    await this.repo.delete(ids);
  }
}
