import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { PostEntity } from './post.entity';
import { PostViewEntity } from './post-view.entity';
import { TagEntity } from '../tag/tag.entity';
import { UserEntity } from '../user/user.entity';
import { POST_STATUS } from '../../common/constants/status';

@Injectable()
export class PostService {
  constructor(
    @InjectRepository(PostEntity)
    private readonly postRepo: Repository<PostEntity>,
    @InjectRepository(PostViewEntity)
    private readonly postViewRepo: Repository<PostViewEntity>,
    @InjectRepository(TagEntity)
    private readonly tagRepo: Repository<TagEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async findAll(page = 1, pageSize = 20, filters?: { id?: number; keyword?: string; status?: string; categoryId?: number; tagId?: number }, publicOnly = false) {
    const qb = this.postRepo.createQueryBuilder('p')
      .leftJoinAndSelect('p.author', 'author')
      .leftJoinAndSelect('p.category', 'category')
      .leftJoinAndSelect('p.tags', 'tags')
      .leftJoinAndSelect('p.allowedUsers', 'allowedUsers');

    // 公开接口只返回已发布文章
    if (publicOnly) {
      qb.andWhere('p.status = :published', { published: POST_STATUS.PUBLISHED });
    } else if (filters?.status !== undefined) {
      qb.andWhere('p.status = :status', { status: filters.status });
    }
    if (filters?.id !== undefined) {
      qb.andWhere('p.id = :id', { id: filters.id });
    }
    if (filters?.keyword) {
      qb.andWhere('p.title LIKE :keyword', { keyword: `%${filters.keyword}%` });
    }
    if (filters?.categoryId !== undefined) {
      qb.andWhere('p.categoryId = :categoryId', { categoryId: filters.categoryId });
    }
    if (filters?.tagId !== undefined) {
      qb.innerJoin('post_tags', 'pt', 'pt.post_id = p.id')
        .andWhere('pt.tag_id = :tagId', { tagId: filters.tagId });
    }

    qb.andWhere('p.deletedAt IS NULL')
      .orderBy('p.isPinned', 'DESC')
      .addOrderBy('p.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async findById(id: number, publicOnly = false) {
    const where: any = { id };
    if (publicOnly) {
      where.status = POST_STATUS.PUBLISHED;
    }
    return this.postRepo.findOne({ where, relations: ['author', 'category', 'tags', 'allowedUsers'] });
  }

  async create(data: Partial<PostEntity> & { tagIds?: number[]; allowedUserIds?: number[] }) {
    const { tagIds, allowedUserIds, ...postData } = data;
    const post = this.postRepo.create(postData);

    if (tagIds?.length) {
      post.tags = await this.tagRepo.findBy({ id: In(tagIds) });
    }
    if (allowedUserIds?.length) {
      post.allowedUsers = await this.userRepo.findBy({ id: In(allowedUserIds) });
    }

    if (post.status === POST_STATUS.PUBLISHED && !post.publishedAt) {
      post.publishedAt = new Date();
    } else if (post.status === POST_STATUS.DRAFT) {
      post.publishedAt = null;
    }

    return this.postRepo.save(post);
  }

  async update(id: number, data: Partial<PostEntity> & { tagIds?: number[]; allowedUserIds?: number[] }) {
    const { tagIds, allowedUserIds, ...postData } = data;

    const post = await this.postRepo.findOne({ where: { id }, relations: ['tags', 'allowedUsers'] });
    if (!post) return null;

    Object.assign(post, postData);

    if (tagIds !== undefined) {
      post.tags = tagIds.length ? await this.tagRepo.findBy({ id: In(tagIds) }) : [];
    }
    if (allowedUserIds !== undefined) {
      post.allowedUsers = allowedUserIds.length ? await this.userRepo.findBy({ id: In(allowedUserIds) }) : [];
    }

    if (postData.status === POST_STATUS.PUBLISHED && !post.publishedAt) {
      post.publishedAt = new Date();
    } else if (postData.status === POST_STATUS.DRAFT) {
      post.publishedAt = null;
    }

    return this.postRepo.save(post);
  }

  async remove(id: number) {
    await this.postRepo.update(id, { deletedAt: new Date() });
  }

  async restore(id: number) {
    await this.postRepo.update(id, { deletedAt: null });
  }

  async findTrashed(page = 1, pageSize = 20) {
    const qb = this.postRepo.createQueryBuilder('p')
      .leftJoinAndSelect('p.author', 'author')
      .leftJoinAndSelect('p.category', 'category')
      .leftJoinAndSelect('p.tags', 'tags')
      .andWhere('p.deletedAt IS NOT NULL')
      .orderBy('p.deletedAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async batchUpdateStatus(ids: number[], status: string) {
    const posts = await this.postRepo.findBy({ id: In(ids) });
    for (const post of posts) {
      const update: Record<string, unknown> = { status };
      if (status === POST_STATUS.PUBLISHED && !post.publishedAt) {
        update.publishedAt = new Date();
      } else if (status === POST_STATUS.DRAFT) {
        update.publishedAt = null;
      }
      await this.postRepo.update(post.id, update as any);
    }
  }

  async batchDelete(ids: number[]) {
    await this.postRepo.update({ id: In(ids) }, { deletedAt: new Date() });
  }

  async togglePin(id: number) {
    const post = await this.postRepo.findOne({ where: { id } });
    if (!post) return null;
    post.isPinned = !post.isPinned;
    return this.postRepo.save(post);
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
