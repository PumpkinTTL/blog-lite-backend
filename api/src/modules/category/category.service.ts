import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
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

    const countMap = new Map(
      counts.map((c) => [c.categoryId, parseInt(c.count)]),
    );

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
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category) throw new NotFoundException('分类不存在');
    return category;
  }

  async create(data: Partial<CategoryEntity>) {
    // UNIQUE 预检
    if (data.slug) {
      const exist = await this.categoryRepo.findOne({
        where: { slug: data.slug },
      });
      if (exist) throw new ConflictException(`slug「${data.slug}」已存在`);
    }
    if (data.name) {
      const exist = await this.categoryRepo.findOne({
        where: { name: data.name },
      });
      if (exist) throw new ConflictException(`分类名「${data.name}」已存在`);
    }
    const category = this.categoryRepo.create(data);
    try {
      return await this.categoryRepo.save(category);
    } catch (e: any) {
      // 兜底：并发场景下的 DB 层约束
      if (e?.code === 'ER_DUP_ENTRY') {
        throw new ConflictException('分类名或 slug 已存在');
      }
      throw e;
    }
  }

  async update(id: number, data: Partial<CategoryEntity>) {
    // 预检存在
    const existing = await this.categoryRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('分类不存在');

    // 更新时的 UNIQUE 冲突预检（仅当字段被显式传入）
    if (data.slug && data.slug !== existing.slug) {
      const dup = await this.categoryRepo.findOne({
        where: { slug: data.slug },
      });
      if (dup) throw new ConflictException(`slug「${data.slug}」已存在`);
    }
    if (data.name && data.name !== existing.name) {
      const dup = await this.categoryRepo.findOne({
        where: { name: data.name },
      });
      if (dup) throw new ConflictException(`分类名「${data.name}」已存在`);
    }

    await this.categoryRepo.update(id, data);
    return this.categoryRepo.findOne({ where: { id } });
  }

  async remove(id: number) {
    const count = await this.postRepo.count({ where: { categoryId: id } });
    if (count > 0) {
      throw new BadRequestException(`该分类下有 ${count} 篇文章，无法删除`);
    }
    await this.categoryRepo.delete(id);
  }

  async batchRemove(ids: number[]): Promise<void> {
    const count = await this.postRepo.count({ where: { categoryId: In(ids) } });
    if (count > 0) {
      throw new BadRequestException(`部分分类下有 ${count} 篇文章，无法删除`);
    }
    await this.categoryRepo.delete(ids);
  }

  async findTree() {
    const allCats = await this.categoryRepo.find({
      order: { sortOrder: 'ASC' },
    });

    const counts = await this.postRepo
      .createQueryBuilder('p')
      .select('p.categoryId', 'categoryId')
      .addSelect('COUNT(*)', 'count')
      .where('p.categoryId IS NOT NULL')
      .groupBy('p.categoryId')
      .getRawMany<{ categoryId: number; count: string }>();

    const countMap = new Map(
      counts.map((c) => [c.categoryId, parseInt(c.count)]),
    );

    const nodeMap = new Map<
      number,
      CategoryEntity & { postCount: number; children: any[] }
    >();
    const roots: (CategoryEntity & { postCount: number; children: any[] })[] =
      [];

    for (const cat of allCats) {
      nodeMap.set(cat.id, {
        ...cat,
        postCount: countMap.get(cat.id) ?? 0,
        children: [],
      });
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
