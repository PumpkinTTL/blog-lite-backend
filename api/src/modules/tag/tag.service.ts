import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TagEntity } from './tag.entity';
import { applyFilters } from '../../common/utils/apply-filters';

@Injectable()
export class TagService {
  constructor(
    @InjectRepository(TagEntity)
    private readonly tagRepo: Repository<TagEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(filters?: { id?: number; keyword?: string }) {
    const qb = this.tagRepo
      .createQueryBuilder('t')
      .loadRelationCountAndMap('t.postCount', 't.posts');
    applyFilters(qb, {
      exact: { 't.id': filters?.id },
      like: { keyword: filters?.keyword, fields: ['t.name', 't.slug'] },
    });
    qb.orderBy('t.createdAt', 'DESC');
    return qb.getMany();
  }

  async findById(id: number) {
    const tag = await this.tagRepo.findOne({ where: { id } });
    if (!tag) throw new NotFoundException('标签不存在');
    return tag;
  }

  async create(data: Partial<TagEntity>) {
    // UNIQUE 预检
    if (data.slug) {
      const exist = await this.tagRepo.findOne({ where: { slug: data.slug } });
      if (exist) throw new ConflictException(`slug「${data.slug}」已存在`);
    }
    if (data.name) {
      const exist = await this.tagRepo.findOne({ where: { name: data.name } });
      if (exist) throw new ConflictException(`标签名「${data.name}」已存在`);
    }
    const tag = this.tagRepo.create(data);
    try {
      return await this.tagRepo.save(tag);
    } catch (e: any) {
      if (e?.code === 'ER_DUP_ENTRY') {
        throw new ConflictException('标签名或 slug 已存在');
      }
      throw e;
    }
  }

  async update(id: number, data: Partial<TagEntity>) {
    const existing = await this.tagRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('标签不存在');

    if (data.slug && data.slug !== existing.slug) {
      const dup = await this.tagRepo.findOne({ where: { slug: data.slug } });
      if (dup) throw new ConflictException(`slug「${data.slug}」已存在`);
    }
    if (data.name && data.name !== existing.name) {
      const dup = await this.tagRepo.findOne({ where: { name: data.name } });
      if (dup) throw new ConflictException(`标签名「${data.name}」已存在`);
    }

    // 排除关联字段，只更新纯字段
    const { posts, ...updateData } = data as any;
    await this.tagRepo.update(id, updateData);
    return this.tagRepo.findOne({ where: { id } });
  }

  async remove(id: number) {
    const result = await this.dataSource.query(
      'SELECT COUNT(*) as cnt FROM post_tags WHERE tag_id = ?',
      [id],
    );
    const count = Number(result[0]?.cnt ?? 0);
    if (count > 0) {
      throw new BadRequestException(`该标签下有 ${count} 篇文章，无法删除`);
    }
    await this.tagRepo.delete(id);
  }

  async batchRemove(ids: number[]): Promise<void> {
    const placeholders = ids.map(() => '?').join(',');
    const result = await this.dataSource.query(
      `SELECT COUNT(*) as cnt FROM post_tags WHERE tag_id IN (${placeholders})`,
      ids,
    );
    const count = Number(result[0]?.cnt ?? 0);
    if (count > 0) {
      throw new BadRequestException(`部分标签下有 ${count} 篇文章，无法删除`);
    }
    await this.tagRepo.delete(ids);
  }

  async findPopular(limit = 10) {
    const rows = await this.dataSource.query(
      'SELECT t.*, COUNT(pt.post_id) as postCount FROM tags t LEFT JOIN post_tags pt ON pt.tag_id = t.id GROUP BY t.id ORDER BY postCount DESC LIMIT ?',
      [limit],
    );
    return rows;
  }
}
