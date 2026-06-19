import {
  Injectable,
  OnModuleInit,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { PostEntity } from './post.entity';
import { PostViewEntity } from './post-view.entity';
import { TagEntity } from '../tag/tag.entity';
import { EntityVisibilityService } from '../entity-visibility/entity-visibility.service';
import { POST_STATUS } from '../../common/constants/status';
import { MediaService } from '../media/media.service';

const POST_ENTITY_TYPE = 'post';

@Injectable()
export class PostService implements OnModuleInit {
  private readonly logger = new Logger(PostService.name);
  constructor(
    @InjectRepository(PostEntity)
    private readonly postRepo: Repository<PostEntity>,
    @InjectRepository(PostViewEntity)
    private readonly postViewRepo: Repository<PostViewEntity>,
    @InjectRepository(TagEntity)
    private readonly tagRepo: Repository<TagEntity>,
    private readonly visibilityService: EntityVisibilityService,
    private readonly mediaService: MediaService,
  ) {}

  /**
   * 一次性迁移：把旧 post_allowed_users 表的数据搬到 entity_visibility
   * 幂等：目标表已有 entityType='post' 的记录时跳过
   */
  async onModuleInit() {
    try {
      const migrated =
        await this.visibilityService.getVisibilityCount?.(POST_ENTITY_TYPE);
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
        rows.flatMap((r) => [
          POST_ENTITY_TYPE,
          r.entityId,
          'user',
          r.subjectId,
        ]),
      );
      // 迁移完成清空旧表
      await rawRepo.query('TRUNCATE TABLE post_allowed_users');
      this.logger.log(`迁移完成：${rows.length} 条 post_allowed_users → entity_visibility`);
    } catch {
      // 旧表可能已不存在，忽略
    }
  }

  async findAll(
    page = 1,
    pageSize = 20,
    filters?: {
      id?: number;
      keyword?: string;
      status?: string;
      categoryId?: number;
      tagId?: number;
    },
    publicOnly = false,
    withVisibility = false,
    isLoggedIn = false,
  ) {
    const qb = this.postRepo
      .createQueryBuilder('p')
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
        qb.andWhere('p.status = :published', {
          published: POST_STATUS.PUBLISHED,
        });
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
      qb.andWhere('p.categoryId = :categoryId', {
        categoryId: filters.categoryId,
      });
    }
    if (filters?.tagId !== undefined) {
      qb.innerJoin('post_tags', 'pt', 'pt.post_id = p.id').andWhere(
        'pt.tag_id = :tagId',
        { tagId: filters.tagId },
      );
    }

    qb.andWhere('p.deletedAt IS NULL')
      .orderBy('p.isPinned', 'DESC')
      .addOrderBy('p.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [list, total] = await qb.getManyAndCount();

    // admin 列表：仅为 private 行注入可见性配置（避免 N+1，已用批量查询）
    if (withVisibility && list.length) {
      const privateIds = list
        .filter((p) => p.status === POST_STATUS.PRIVATE)
        .map((p) => p.id);
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
    return this.postRepo.findOne({
      where,
      relations: ['author', 'category', 'tags'],
    });
  }

  async create(
    data: Partial<PostEntity> & {
      tagIds?: number[];
      allowedUserIds?: number[];
      allowedRoleIds?: number[];
    },
  ) {
    const { tagIds, allowedUserIds, allowedRoleIds, ...postData } = data;

    // UNIQUE 预检：slug
    if (postData.slug) {
      const exist = await this.postRepo.findOne({
        where: { slug: postData.slug },
        select: ['id', 'deletedAt'],
      });
      if (exist && exist.deletedAt === null) {
        throw new ConflictException(`slug「${postData.slug}」已存在`);
      }
    }

    const post = this.postRepo.create(postData);

    if (tagIds?.length) {
      post.tags = await this.tagRepo.findBy({ id: In(tagIds) });
    }

    if (post.status === POST_STATUS.PUBLISHED && !post.publishedAt) {
      post.publishedAt = new Date();
    } else if (post.status === POST_STATUS.DRAFT) {
      post.publishedAt = null;
    }

    let saved: PostEntity;
    try {
      saved = await this.postRepo.save(post);
    } catch (e: any) {
      if (e?.code === 'ER_DUP_ENTRY') {
        throw new ConflictException('slug 已存在');
      }
      throw e;
    }

    // 写入可见性配置（即使是 private 状态，也允许配置空的可见性）
    await this.visibilityService.setVisibility(
      POST_ENTITY_TYPE,
      saved.id,
      allowedUserIds ?? [],
      allowedRoleIds ?? [],
    );

    return saved;
  }

  async update(
    id: number,
    data: Partial<PostEntity> & {
      tagIds?: number[];
      allowedUserIds?: number[];
      allowedRoleIds?: number[];
    },
  ) {
    const { tagIds, allowedUserIds, allowedRoleIds, ...postData } = data;

    const post = await this.postRepo.findOne({
      where: { id },
      relations: ['tags'],
    });
    if (!post) throw new NotFoundException('文章不存在');

    // 更新时 slug 冲突预检
    if (postData.slug && postData.slug !== post.slug) {
      const dup = await this.postRepo.findOne({
        where: { slug: postData.slug },
        select: ['id', 'deletedAt'],
      });
      if (dup && dup.id !== id && dup.deletedAt === null) {
        throw new ConflictException(`slug「${postData.slug}」已存在`);
      }
    }

    Object.assign(post, postData);

    if (tagIds !== undefined) {
      post.tags = tagIds.length
        ? await this.tagRepo.findBy({ id: In(tagIds) })
        : [];
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
   * 批量获取多篇文章的可见性（列表使用，避免 N+1）。
   * 委托给 EntityVisibilityService 的真批量查询（一次 WHERE IN）。
   * 返回 Map<postId, { allowedUserIds, allowedRoleIds }>。
   */
  async getVisibilityMap(postIds: number[]) {
    return this.visibilityService.getVisibilityBatch(POST_ENTITY_TYPE, postIds);
  }

  /**
   * 判定用户能否访问 private 文章
   * 直接授权 OR 用户角色命中
   */
  async canAccess(
    postId: number,
    userId: number,
    userRoleIds: number[] = [],
  ): Promise<boolean> {
    return this.visibilityService.canAccess(
      POST_ENTITY_TYPE,
      postId,
      userId,
      userRoleIds,
    );
  }

  async remove(id: number, force = false) {
    if (force) {
      const post = await this.postRepo.findOne({ where: { id } });
      if (!post) throw new NotFoundException('文章不存在');
      const urls = this.extractImageUrls(post.coverImage, post.content);
      await this.deleteMediaByUrls(urls);
      await this.postRepo.delete(id);
    } else {
      await this.postRepo.update(id, { deletedAt: new Date() });
    }
  }

  /** 从封面和正文中提取所有图片 URL */
  private extractImageUrls(cover: string | null, content: string): string[] {
    const urls: string[] = [];
    if (cover) urls.push(cover);
    // HTML img tag
    const htmlRe = /<img[^>]+src=["']([^"']+)["']/gi;
    // Markdown image
    const mdRe = /!\[[^\]]*\]\(([^)]+)\)/g;
    let m;
    while ((m = htmlRe.exec(content)) !== null) urls.push(m[1]);
    while ((m = mdRe.exec(content)) !== null) urls.push(m[1]);
    return urls;
  }

  /** 批量删除 media 记录及对应的 R2 文件 */
  private async deleteMediaByUrls(urls: string[]) {
    for (const url of urls) {
      try {
        const media = await this.mediaService.findByUrl(url);
        if (media) await this.mediaService.remove(media.id);
      } catch (e: any) {
        this.logger.warn(`删除关联文件失败: ${url} - ${e.message}`);
      }
    }
  }

  async restore(id: number) {
    await this.postRepo.update(id, { deletedAt: null });
  }

  async findTrashed(page = 1, pageSize = 20) {
    const qb = this.postRepo
      .createQueryBuilder('p')
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
    if (ids.length === 0) return;
    const posts = await this.postRepo.findBy({ id: In(ids) });
    if (posts.length === 0) return;

    // 分两类处理，减少 update 次数：
    // 1. 已有 publishedAt 或非 published 状态：只需更新 status（可批量一条 SQL）
    // 2. 待发布（published）且尚无 publishedAt：需补 publishedAt
    if (status === POST_STATUS.PUBLISHED) {
      // 先批量更新 status，再为无 publishedAt 的补上
      await this.postRepo.update({ id: In(ids) }, { status });
      const needPublishDate = posts.filter((p) => !p.publishedAt);
      if (needPublishDate.length) {
        await this.postRepo.update(
          { id: In(needPublishDate.map((p) => p.id)) },
          { publishedAt: new Date() },
        );
      }
    } else {
      const update: Record<string, unknown> = { status };
      if (status === POST_STATUS.DRAFT) update.publishedAt = null;
      await this.postRepo.update({ id: In(ids) }, update);
    }
  }

  async batchDelete(ids: number[], force = false) {
    if (force) {
      const posts = await this.postRepo.findBy({ id: In(ids) });
      const allUrls: string[] = [];
      for (const post of posts) {
        allUrls.push(...this.extractImageUrls(post.coverImage, post.content));
      }
      await this.deleteMediaByUrls([...new Set(allUrls)]);
      await this.postRepo.delete(ids);
    } else {
      await this.postRepo.update({ id: In(ids) }, { deletedAt: new Date() });
    }
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
  async recordView(
    postId: number,
    ip: string,
    userAgent?: string,
    userId?: number,
  ) {
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
