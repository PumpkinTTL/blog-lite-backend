import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { PostEntity } from './post.entity';
import { PostViewEntity } from './post-view.entity';
import { TagEntity } from '../tag/tag.entity';
import { EntityVisibilityService } from '../entity-visibility/entity-visibility.service';
import { POST_STATUS } from '../../common/constants/status';

const POST_ENTITY_TYPE = 'post';

@Injectable()
export class PostService implements OnModuleInit {
  constructor(
    @InjectRepository(PostEntity)
    private readonly postRepo: Repository<PostEntity>,
    @InjectRepository(PostViewEntity)
    private readonly postViewRepo: Repository<PostViewEntity>,
    @InjectRepository(TagEntity)
    private readonly tagRepo: Repository<TagEntity>,
    private readonly visibilityService: EntityVisibilityService,
  ) {}

  /**
   * 一次性迁移：把旧 post_allowed_users 表的数据搬到 entity_visibility
   * 幂等：目标表已有 entityType='post' 的记录时跳过
   */
  async onModuleInit() {
    try {
      const migrated = await this.visibilityService.getVisibilityCount?.(POST_ENTITY_TYPE);
      if (migrated && migrated > 0) return;

      // 旧表还存在的话查询迁移（raw query 兼容 synchronize 旧表残留）
      const rawRepo = this.postRepo.manager;
      const rows: any[] = await rawRepo.query(
        'SELECT post_id AS entityId, user_id AS subjectId FROM post_allowed_users',
      );
      if (rows.length === 0) return;
      await rawRepo.query(
        `INSERT IGNORE INTO entity_visibility (entity_type, entity_id, subject_type, subject_id, created_at)
         VALUES ${rows.map(() => '(?, ?, ?, ?, NOW())').join(', ')}`,
        rows.flatMap((r) => [POST_ENTITY_TYPE, r.entityId, 'user', r.subjectId]),
      );
      // 迁移完成清空旧表
      await rawRepo.query('TRUNCATE TABLE post_allowed_users');
      // eslint-disable-next-line no-console
      console.log(`[PostService] 迁移完成：${rows.length} 条 post_allowed_users → entity_visibility`);
    } catch (e) {
      // 旧表可能已不存在，忽略
    }
  }

  async findAll(
    page = 1,
    pageSize = 20,
    filters?: { id?: number; keyword?: string; status?: string; categoryId?: number; tagId?: number },
    publicOnly = false,
    withVisibility = false,
    isLoggedIn = false,
  ) {
    const qb = this.postRepo.createQueryBuilder('p')
      .leftJoinAndSelect('p.author', 'author')
      .leftJoinAndSelect('p.category', 'category')
      .leftJoinAndSelect('p.tags', 'tags');

    // 公开接口只返回已发布文章；已登录用户额外可见 login 状态
    if (publicOnly) {
      if (isLoggedIn) {
        qb.andWhere('p.status IN (:...visible)', {
          visible: [POST_STATUS.PUBLISHED, POST_STATUS.LOGIN],
        });
      } else {
        qb.andWhere('p.status = :published', { published: POST_STATUS.PUBLISHED });
      }
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

    // admin 列表：仅为 private 行注入可见性配置（避免 N+1，已用批量查询）
    if (withVisibility && list.length) {
      const privateIds = list.filter((p) => p.status === POST_STATUS.PRIVATE).map((p) => p.id);
      if (privateIds.length) {
        const visMap = await this.getVisibilityMap(privateIds);
        for (const p of list) {
          if (visMap.has(p.id)) {
            const v = visMap.get(p.id)!;
            (p as any).allowedUserIds = v.allowedUserIds;
            (p as any).allowedRoleIds = v.allowedRoleIds;
          }
        }
      }
    }

    return { list, total, page, pageSize };
  }

  async findById(id: number, publicOnly = false) {
    const where: any = { id };
    if (publicOnly) {
      where.status = POST_STATUS.PUBLISHED;
    }
    return this.postRepo.findOne({ where, relations: ['author', 'category', 'tags'] });
  }

  async create(data: Partial<PostEntity> & { tagIds?: number[]; allowedUserIds?: number[]; allowedRoleIds?: number[] }) {
    const { tagIds, allowedUserIds, allowedRoleIds, ...postData } = data;
    const post = this.postRepo.create(postData);

    if (tagIds?.length) {
      post.tags = await this.tagRepo.findBy({ id: In(tagIds) });
    }

    if (post.status === POST_STATUS.PUBLISHED && !post.publishedAt) {
      post.publishedAt = new Date();
    } else if (post.status === POST_STATUS.DRAFT) {
      post.publishedAt = null;
    }

    const saved = await this.postRepo.save(post);

    // 写入可见性配置（即使是 private 状态，也允许配置空的可见性）
    await this.visibilityService.setVisibility(
      POST_ENTITY_TYPE,
      saved.id,
      allowedUserIds ?? [],
      allowedRoleIds ?? [],
    );

    return saved;
  }

  async update(id: number, data: Partial<PostEntity> & { tagIds?: number[]; allowedUserIds?: number[]; allowedRoleIds?: number[] }) {
    const { tagIds, allowedUserIds, allowedRoleIds, ...postData } = data;

    const post = await this.postRepo.findOne({ where: { id }, relations: ['tags'] });
    if (!post) return null;

    Object.assign(post, postData);

    if (tagIds !== undefined) {
      post.tags = tagIds.length ? await this.tagRepo.findBy({ id: In(tagIds) }) : [];
    }

    if (postData.status === POST_STATUS.PUBLISHED && !post.publishedAt) {
      post.publishedAt = new Date();
    } else if (postData.status === POST_STATUS.DRAFT) {
      post.publishedAt = null;
    }

    const saved = await this.postRepo.save(post);

    // 只在显式传入 allowedUserIds/allowedRoleIds 时才更新可见性
    if (allowedUserIds !== undefined || allowedRoleIds !== undefined) {
      await this.visibilityService.setVisibility(
        POST_ENTITY_TYPE,
        saved.id,
        allowedUserIds ?? [],
        allowedRoleIds ?? [],
      );
    }

    return saved;
  }

  /**
   * 获取文章可见性配置（包含 allowedUsers + allowedRoles）
   * 给详情接口、admin 列表使用
   */
  async getVisibility(postId: number) {
    return this.visibilityService.getVisibility(POST_ENTITY_TYPE, postId);
  }

  /**
   * 批量获取多篇文章的可见性（列表使用，避免 N+1）
   * 返回 Map<postId, { allowedUserIds, allowedRoleIds }>
   */
  async getVisibilityMap(postIds: number[]) {
    if (postIds.length === 0) return new Map();
    // 利用 service 的批量查询能力
    const result = new Map<number, { allowedUserIds: number[]; allowedRoleIds: number[] }>();
    // 简单实现：并行查（postIds 通常一页最多 50 个）
    const items = await Promise.all(
      postIds.map(async (id) => [id, await this.visibilityService.getVisibility(POST_ENTITY_TYPE, id)] as const),
    );
    for (const [id, vis] of items) {
      result.set(id, vis);
    }
    return result;
  }

  /**
   * 判定用户能否访问 private 文章
   * 直接授权 OR 用户角色命中
   */
  async canAccess(postId: number, userId: number, userRoleIds: number[] = []): Promise<boolean> {
    return this.visibilityService.canAccess(POST_ENTITY_TYPE, postId, userId, userRoleIds);
  }

  async remove(id: number) {
    await this.postRepo.update(id, { deletedAt: new Date() });
    // 软删除不清除可见性配置，restore 后仍生效
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
