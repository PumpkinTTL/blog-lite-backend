import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoryEntity } from './category.entity';
import { PostEntity } from '../post/post.entity';
import { applyFilters } from '../../common/utils/apply-filters';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(CategoryEntity)
    private readonly categoryRepo: Repository<CategoryEntity>,
    @InjectRepository(PostEntity)
    private readonly postRepo: Repository<PostEntity>,
  ) {}

  async findAll(filters?: { id?: number; keyword?: string }) {
    const qb = this.categoryRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.children', 'children');

    applyFilters(qb, {
      exact: { 'e.id': filters?.id },
      like: { keyword: filters?.keyword, fields: ['e.name', 'e.slug'] },
    });

    qb.orderBy('e.sortOrder', 'ASC').addOrderBy('children.sortOrder', 'ASC');

    const categories = await qb.getMany();

    const counts = await this.postRepo
      .createQueryBuilder('p')
      .select('p.categoryId', 'categoryId')
      .addSelect('COUNT(*)', 'count')
      .where('p.categoryId IS NOT NULL')
      .groupBy('p.categoryId')
      .getRawMany<{ categoryId: number; count: string }>();

    const countMap = new Map(counts.map((c) => [c.categoryId, parseInt(c.count)]));

    function attachCounts(
      list: CategoryEntity[],
    ): (CategoryEntity & { postCount: number })[] {
      return list.map((cat) => {
        const result = cat as CategoryEntity & { postCount: number };
        result.postCount = countMap.get(cat.id) ?? 0;
        if (result.children && result.children.length > 0) {
          result.children = attachCounts(result.children);
        }
        return result;
      });
    }

    return attachCounts(categories);
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
    const count = await this.postRepo.count({ where: { categoryId: id } });
    if (count > 0) {
      throw new BadRequestException(`该分类下有 ${count} 篇文章，无法删除`);
    }
    await this.categoryRepo.delete(id);
  }

  async findTree() {
    const allCats = await this.categoryRepo.find({ order: { sortOrder: 'ASC' } });

    const counts = await this.postRepo
      .createQueryBuilder('p')
      .select('p.categoryId', 'categoryId')
      .addSelect('COUNT(*)', 'count')
      .where('p.categoryId IS NOT NULL')
      .groupBy('p.categoryId')
      .getRawMany<{ categoryId: number; count: string }>();

    const countMap = new Map(counts.map((c) => [c.categoryId, parseInt(c.count)]));

    const nodeMap = new Map<number, CategoryEntity & { postCount: number; children: any[] }>();
    const roots: (CategoryEntity & { postCount: number; children: any[] })[] = [];

    for (const cat of allCats) {
      nodeMap.set(cat.id, { ...cat, postCount: countMap.get(cat.id) ?? 0, children: [] });
    }

    for (const cat of allCats) {
      const node = nodeMap.get(cat.id)!;
      if (cat.parentId != null) {
        const parent = nodeMap.get(cat.parentId);
        if (parent) {
          parent.children.push(node);
        }
      } else {
        roots.push(node);
      }
    }

    return roots;
  }
}
