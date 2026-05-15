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

  async findAll(page = 1, pageSize = 20, status?: number) {
    const where: any = {};
    if (status !== undefined) where.status = status;

    const [list, total] = await this.postRepo.findAndCount({
      where,
      relations: ['author', 'category', 'tags'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
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
