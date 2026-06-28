import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { InteractionEntity } from './interaction.entity';
import { UserEntity } from '../user/user.entity';
import { PostEntity } from '../post/post.entity';
import type { InteractionEntityType, InteractionType } from './interaction.dto';
import { escapeLike } from '../../common/utils/apply-filters';

/**
 * 互动服务：点赞 / 收藏（多态）
 *
 * - toggle: 已存在取消 / 不存在创建，返回当前 active 状态
 * - 批量查状态/计数：避免列表页 N+1 查询
 *
 * 关于聚合字段：post.likeCount 由 PostService 维护（避免反向依赖），
 * 本 service 只负责 interactions 表，toggle 返回 active=true/false，
 * 由调用方（PostController 或 CommentController）按需更新缓存计数。
 */
@Injectable()
export class InteractionService {
  constructor(
    @InjectRepository(InteractionEntity)
    private readonly repo: Repository<InteractionEntity>,
    @InjectRepository(PostEntity)
    private readonly postRepo: Repository<PostEntity>,
  ) {}

  /**
   * 切换互动：已存在 → 删除（取消）；不存在 → 创建。
   * 原子化实现：先 DELETE，affected=1 表示已取消；否则 INSERT（catch unique 冲突视为已点赞）。
   * 解决旧的 findOne→save 并发双击点赞触发 unique 约束抛错的问题。
   * @returns { active: boolean } active=true 表示新增，false 表示已取消
   */
  async toggle(
    userId: number,
    entityType: InteractionEntityType,
    entityId: number,
    type: InteractionType,
  ): Promise<{ active: boolean }> {
    if (!entityType || !entityId || !type) {
      throw new BadRequestException('无效的互动参数');
    }

    // 先尝试 DELETE（取消）。affected=1 表示原本存在 → 已取消。
    const del = await this.repo.delete({
      userId,
      entityType,
      entityId,
      type,
    });
    if (del.affected && del.affected > 0) {
      return { active: false };
    }

    // 不存在 → INSERT。并发下唯一一个赢，另一个走 catch。
    try {
      await this.repo.insert({ userId, entityType, entityId, type });
      return { active: true };
    } catch (e: any) {
      // ER_DUP_ENTRY：别人抢先 INSERT 了，本次视为已点赞（幂等）
      if (e?.code === 'ER_DUP_ENTRY') {
        return { active: true };
      }
      throw e;
    }
  }

  /**
   * 批量查当前用户在某组实体上的互动状态
   * @returns Map<entityId, boolean>
   */
  async getUserStatus(
    userId: number,
    entityType: InteractionEntityType,
    entityIds: number[],
    type: InteractionType,
  ): Promise<Map<number, boolean>> {
    if (entityIds.length === 0) return new Map();
    const rows = await this.repo.find({
      where: { userId, entityType, entityId: In(entityIds), type },
    });
    return new Map(rows.map((r) => [r.entityId, true]));
  }

  /**
   * 批量统计多个实体的某类型互动数
   * @returns Map<entityId, number>
   */
  async getCounts(
    entityType: InteractionEntityType,
    entityIds: number[],
    type: InteractionType,
  ): Promise<Map<number, number>> {
    const result = new Map<number, number>();
    if (entityIds.length === 0) return result;
    // 初始化为 0，确保未点赞的实体也有计数
    entityIds.forEach((id) => result.set(id, 0));

    const rows: { entityId: number; cnt: number }[] = await this.repo
      .createQueryBuilder('i')
      .select('i.entityId', 'entityId')
      .addSelect('COUNT(*)', 'cnt')
      .where('i.entityType = :et', { et: entityType })
      .andWhere('i.type = :t', { t: type })
      .andWhere('i.entityId IN (:...ids)', { ids: entityIds })
      .groupBy('i.entityId')
      .getRawMany();

    rows.forEach((r) => result.set(Number(r.entityId), Number(r.cnt)));
    return result;
  }

  /**
   * 我的收藏/点赞列表（分页）。
   * 对 post 类型直接 JOIN 文章表返回标题/封面，避免前端逐条 getPostDetail
   * （那会导致已删除文章弹"文章不存在"，且 N 次请求）。
   * 软删除的文章（deletedAt 非空）通过 JOIN 条件排除，不出现在列表里。
   */
  async listMine(
    userId: number,
    type: InteractionType,
    entityType?: InteractionEntityType,
    page = 1,
    pageSize = 20,
  ): Promise<{ list: any[]; total: number }> {
    const qb = this.repo
      .createQueryBuilder('i')
      // 仅 post 类型 join 文章；deletedAt IS NULL 排除软删除文章（不让收藏列表残留死链）
      .leftJoin(
        PostEntity,
        'p',
        'p.id = i.entityId AND i.entityType = :postType AND p.deletedAt IS NULL',
        { postType: 'post' },
      )
      .addSelect([
        'i.id AS id',
        'i.entityType AS entityType',
        'i.entityId AS entityId',
        'i.type AS type',
        'i.createdAt AS createdAt',
        'p.title AS postTitle',
        'p.cover_image AS postCover',
        'p.category_id AS postCategoryId',
        'p.created_at AS postCreatedAt',
      ])
      .where('i.userId = :uid', { uid: userId })
      .andWhere('i.type = :t', { t: type })
      .orderBy('i.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (entityType) qb.andWhere('i.entityType = :et', { et: entityType });

    const rows = await qb.getRawMany();

    // total 用独立 count（join 不影响计数，统计的是用户的所有互动记录）
    const countQb = this.repo
      .createQueryBuilder('i')
      .where('i.userId = :uid', { uid: userId })
      .andWhere('i.type = :t', { t: type });
    if (entityType) countQb.andWhere('i.entityType = :et', { et: entityType });
    const total = await countQb.getCount();

    const list = rows.map((r: any) => ({
      id: Number(r.id),
      entityType: r.entityType,
      entityId: Number(r.entityId),
      type: r.type,
      createdAt: r.createdAt,
      // post 类型附带文章摘要（已删除的为 null，前端据此过滤）
      post: r.postTitle
        ? {
            id: Number(r.entityId),
            title: r.postTitle,
            coverImage: r.postCover || '',
            categoryId: r.postCategoryId ? Number(r.postCategoryId) : null,
            createdAt: r.postCreatedAt,
          }
        : null,
    }));

    return { list, total };
  }

  /**
   * 统计某实体的某类型互动数（单个，主要给 PostService 增量同步用）
   */
  async countOne(
    entityType: InteractionEntityType,
    entityId: number,
    type: InteractionType,
  ): Promise<number> {
    return this.repo.count({ where: { entityType, entityId, type } });
  }

  // ===== 管理端：列表/删除 =====

  /**
   * 管理端列表（可按 类型/目标类型/userId/entityId/用户名关键词 筛选，分页）
   *
   * InteractionEntity 没有声明 @ManyToOne 关系，无法用 leftJoinAndSelect，
   * 这里用手动 leftJoin + getRawMany() 取出 user / post 摘要字段。
   */
  async adminList(params: {
    type?: InteractionType;
    entityType?: InteractionEntityType;
    userId?: number;
    entityId?: number;
    keyword?: string; // 按用户名/昵称模糊搜索
    page?: number;
    pageSize?: number;
  }): Promise<{ list: any[]; total: number }> {
    const {
      type,
      entityType,
      userId,
      entityId,
      keyword,
      page = 1,
      pageSize = 20,
    } = params;

    const qb = this.repo
      .createQueryBuilder('i')
      .leftJoin(UserEntity, 'u', 'u.id = i.userId')
      // 仅 post 类型 join 文章（comment 类型暂不 join，避免笛卡尔）
      .leftJoin(PostEntity, 'p', 'p.id = i.entityId AND i.entityType = :postType', {
        postType: 'post',
      })
      .addSelect([
        'i.id AS id',
        'i.userId AS userId',
        'i.entityType AS entityType',
        'i.entityId AS entityId',
        'i.type AS type',
        'i.createdAt AS createdAt',
        'u.nickname AS nickname',
        'u.avatar AS avatar',
        'p.title AS postTitle',
        'p.slug AS postSlug',
      ])
      .orderBy('i.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (type) qb.andWhere('i.type = :t', { t: type });
    if (entityType) qb.andWhere('i.entityType = :et', { et: entityType });
    if (userId) qb.andWhere('i.userId = :uid', { uid: userId });
    if (entityId) qb.andWhere('i.entityId = :eid', { eid: entityId });
    if (keyword) {
      qb.andWhere('u.nickname LIKE :kw ESCAPE \'\\\\\'', {
        kw: `%${escapeLike(keyword)}%`,
      });
    }

    const rows = await qb.getRawMany();

    // 手动 join 时不能用 getManyAndCount（没有实体映射），total 用独立 count 查询
    const countQb = this.repo
      .createQueryBuilder('i')
      .leftJoin(UserEntity, 'u', 'u.id = i.userId');
    if (type) countQb.andWhere('i.type = :t', { t: type });
    if (entityType) countQb.andWhere('i.entityType = :et', { et: entityType });
    if (userId) countQb.andWhere('i.userId = :uid', { uid: userId });
    if (entityId) countQb.andWhere('i.entityId = :eid', { eid: entityId });
    if (keyword) {
      countQb.andWhere('u.nickname LIKE :kw ESCAPE \'\\\\\'', {
        kw: `%${escapeLike(keyword)}%`,
      });
    }
    const finalTotal = await countQb.getCount();

    const list = rows.map((r: any) => ({
      id: Number(r.id),
      userId: Number(r.userId),
      entityType: r.entityType,
      entityId: Number(r.entityId),
      type: r.type,
      createdAt: r.createdAt,
      user: r.userId
        ? {
            id: Number(r.userId),
            nickname: r.nickname,
            avatar: r.avatar,
          }
        : null,
      post:
        r.entityType === 'post' && r.postTitle
          ? { id: Number(r.entityId), title: r.postTitle, slug: r.postSlug }
          : null,
    }));

    return { list, total: finalTotal };
  }

  /**
   * 管理端删除单条互动（admin 无需校验归属）
   * 删除 post 类型的互动后，同步 posts.like_count/favorite_count 冗余字段
   */
  async adminDelete(id: number): Promise<void> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('互动记录不存在');
    await this.repo.remove(item);
    if (item.entityType === 'post') {
      await this.syncPostCount(item.entityId, item.type);
    }
  }

  /**
   * 管理端批量删除
   */
  async adminBatchDelete(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const items = await this.repo.find({
      where: { id: In(ids) },
      select: ['id', 'entityType', 'entityId', 'type'],
    });
    await this.repo.delete({ id: In(ids) });
    // 收集受影响的 (postId, type)，逐个同步冗余计数
    const affected = new Set<string>();
    items.forEach((it) => {
      if (it.entityType === 'post') {
        affected.add(`${it.entityId}:${it.type}`);
      }
    });
    for (const key of affected) {
      const [postIdStr, type] = key.split(':');
      await this.syncPostCount(Number(postIdStr), type as InteractionType);
    }
  }

  /**
   * 重算某 post 的 like/favorite 计数并写回冗余字段
   */
  private async syncPostCount(postId: number, type: InteractionType): Promise<void> {
    const count = await this.repo.count({
      where: { entityType: 'post', entityId: postId, type },
    });
    // 用具体字段名对象，避免 Partial<PostEntity> 把关联字段也带进 update 类型
    const patch =
      type === 'like' ? { likeCount: count } : { favoriteCount: count };
    await this.postRepo.update({ id: postId }, patch as any);
  }
}
