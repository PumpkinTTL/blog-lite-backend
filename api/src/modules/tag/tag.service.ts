import { Injectable, BadRequestException } from '@nestjs/common';
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
    const qb = this.tagRepo.createQueryBuilder('t')
      .loadRelationCountAndMap('t.postCount', 't.posts');
    applyFilters(qb, {
      exact: { 't.id': filters?.id },
      like: { keyword: filters?.keyword, fields: ['t.name', 't.slug'] },
    });
    qb.orderBy('t.createdAt', 'DESC');
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
    // 排除关联字段，只更新纯字段
    const { posts, ...updateData } = data as any;
    await this.tagRepo.update(id, updateData);
    return this.findById(id);
  }

  async remove(id: number) {
    const result = await this.dataSource.query('SELECT COUNT(*) as cnt FROM post_tags WHERE tag_id = ?', [id]);
    const count = Number(result[0]?.cnt ?? 0);
    if (count > 0) {
      throw new BadRequestException(`该标签下有 ${count} 篇文章，无法删除`);
    }
    await this.tagRepo.delete(id);
  }

  async findPopular(limit = 10) {
    const rows = await this.dataSource.query(
      'SELECT t.*, COUNT(pt.post_id) as postCount FROM tags t LEFT JOIN post_tags pt ON pt.tag_id = t.id GROUP BY t.id ORDER BY postCount DESC LIMIT ?',
      [limit],
    );
    return rows;
  }
}
