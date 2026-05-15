import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { PostEntity } from './post.entity';
import { PostViewEntity } from './post-view.entity';
import { TagEntity } from '../tag/tag.entity';

@Injectable()
export class PostService {
  constructor(
    @InjectRepository(PostEntity)
    private readonly postRepo: Repository<PostEntity>,
    @InjectRepository(PostViewEntity)
    private readonly postViewRepo: Repository<PostViewEntity>,
    @InjectRepository(TagEntity)
    private readonly tagRepo: Repository<TagEntity>,
  ) {}

  async findAll(page = 1, pageSize = 20, filters?: { id?: number; keyword?: string; status?: number; categoryId?: number; tagId?: number }) {
    const qb = this.postRepo.createQueryBuilder('p')
      .leftJoinAndSelect('p.author', 'author')
      .leftJoinAndSelect('p.category', 'category')
      .leftJoinAndSelect('p.tags', 'tags');

    if (filters?.id !== undefined) {
      qb.andWhere('p.id = :id', { id: filters.id });
    }
    if (filters?.keyword) {
      qb.andWhere('p.title LIKE :keyword', { keyword: `%${filters.keyword}%` });
    }
    if (filters?.status !== undefined) {
      qb.andWhere('p.status = :status', { status: filters.status });
    }
    if (filters?.categoryId !== undefined) {
      qb.andWhere('p.categoryId = :categoryId', { categoryId: filters.categoryId });
    }
    if (filters?.tagId !== undefined) {
      qb.innerJoin('post_tags', 'pt', 'pt.post_id = p.id')
        .andWhere('pt.tag_id = :tagId', { tagId: filters.tagId });
    }

    qb.orderBy('p.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async findById(id: number) {
    return this.postRepo.findOne({ where: { id }, relations: ['author', 'category', 'tags'] });
  }

  async create(data: Partial<PostEntity> & { tagIds?: number[] }) {
    const { tagIds, ...postData } = data;
    const post = this.postRepo.create(postData);

    if (tagIds?.length) {
      post.tags = await this.tagRepo.findBy({ id: In(tagIds) });
    }

    if (post.status === 1 && !post.publishedAt) {
      post.publishedAt = new Date();
    } else if (post.status === 2) {
      post.publishedAt = null;
    }

    return this.postRepo.save(post);
  }

  async update(id: number, data: Partial<PostEntity> & { tagIds?: number[] }) {
    const { tagIds, ...postData } = data;

    const post = await this.postRepo.findOne({ where: { id }, relations: ['tags'] });
    if (!post) return null;

    Object.assign(post, postData);

    if (tagIds !== undefined) {
      post.tags = tagIds.length ? await this.tagRepo.findBy({ id: In(tagIds) }) : [];
    }

    if (postData.status === 1 && !post.publishedAt) {
      post.publishedAt = new Date();
    } else if (postData.status === 2) {
      post.publishedAt = null;
    }

    return this.postRepo.save(post);
  }

  async remove(id: number) {
    await this.postRepo.delete(id);
  }

  /**
   * 记录文章阅读：同一 IP 同一文章 24h 内只算一次
   */
  async recordView(postId: number, ip: string, userAgent?: string, userId?: number) {
    const post = await this.postRepo.findOne({ where: { id: postId } });
    if (!post) return;

    // 24h 内同 IP 同文章去重
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const exists = await this.postViewRepo.findOne({
      where: { postId, ip },
      order: { viewedAt: 'DESC' },
    });

    if (!exists || exists.viewedAt < since) {
      await this.postViewRepo.save(
        this.postViewRepo.create({
          postId,
          ip,
          userAgent: userAgent || null,
          userId: userId || null,
        }),
      );
      // 冗余计数 +1
      await this.postRepo.increment({ id: postId }, 'viewCount', 1);
    }
  }
}
