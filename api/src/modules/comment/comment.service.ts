import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import { CommentEntity } from './comment.entity';
import {
  CreateCommentDto,
  UpdateCommentDto,
} from './comment.dto';
import { PostEntity } from '../post/post.entity';

/**
 * 评论服务（2 层嵌套 + 审核）
 *
 * 业务规则：
 * - 创建一级：parentId = NULL → 直接落库，status=pending
 * - 创建二级：parentId = 一级评论 id（必须 entityType+entityId 一致 + 自身是一级 parentId=NULL）
 *   - 二级回复不能再被回复（创建时若 parent.parentId != null → 报错）
 *   - replyToUserId 必须是同一一级下的另一条二级作者（前端校验为主，后端宽松不查）
 * - 编辑：仅本人 + status=pending（已通过/拒绝的不允许编辑，避免审核后篡改）
 * - 删除：本人（任何状态）+ admin
 * - 审核：admin 通过/拒绝，通过后才能在前台展示
 */
@Injectable()
export class CommentService {
  private readonly logger = new Logger(CommentService.name);

  constructor(
    @InjectRepository(CommentEntity)
    private readonly repo: Repository<CommentEntity>,
    @InjectRepository(PostEntity)
    private readonly postRepo: Repository<PostEntity>,
  ) {}

  // ===== 用户端：列表/详情 =====

  /**
   * 列出某实体的一级评论（已审核通过的，分页）
   * @param includeUser 是否带作者信息
   */
  async listTopLevel(
    entityType: string,
    entityId: number,
    page = 1,
    pageSize = 20,
  ): Promise<{ list: CommentEntity[]; total: number }> {
    const [list, total] = await this.repo.findAndCount({
      where: { entityType, entityId, parentId: IsNull(), status: 'approved' },
      relations: ['user'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total };
  }

  /**
   * 列出某一级评论下的二级回复（已审核通过的）
   */
  async listReplies(parentId: number): Promise<CommentEntity[]> {
    return this.repo.find({
      where: { parentId, status: 'approved' },
      relations: ['user', 'replyToUser'],
      order: { createdAt: 'ASC' },
    });
  }


  // ===== 创建/编辑/删除 =====

  /**
   * 创建评论（用户端）
   * - 一级评论：parentId = null
   * - 二级回复：parentId 必须是一级评论（自身 parentId=null）
   */
  async create(userId: number, dto: CreateCommentDto): Promise<CommentEntity> {
    // 校验目标实体存在（目前只支持 post）
    if (dto.entityType === 'post') {
      const post = await this.postRepo.findOne({
        where: { id: dto.entityId },
        select: ['id', 'status'],
      });
      if (!post) throw new NotFoundException('评论目标不存在');
      if (post.status === 'draft') {
        throw new BadRequestException('文章尚未发布');
      }
    } else {
      throw new BadRequestException(`不支持的 entityType: ${dto.entityType}`);
    }

    // 转义 HTML 防止 XSS（评论是纯文本展示）
    const safeContent = this.escapeHtml(dto.content);

    // 一级评论
    if (!dto.parentId) {
      const entity = this.repo.create({
        userId,
        entityType: dto.entityType,
        entityId: dto.entityId,
        content: safeContent,
        parentId: null,
        replyToUserId: null,
        status: 'pending',
      });
      return this.repo.save(entity);
    }

    // 二级回复
    const parent = await this.repo.findOne({
      where: { id: dto.parentId },
    });
    if (!parent) throw new NotFoundException('父评论不存在');
    if (parent.parentId !== null) {
      throw new BadRequestException('二级回复不能再被回复（最多 2 层嵌套）');
    }
    if (parent.entityType !== dto.entityType || parent.entityId !== dto.entityId) {
      throw new BadRequestException('回复目标与父评论不属于同一实体');
    }

    const entity = this.repo.create({
      userId,
      entityType: dto.entityType,
      entityId: dto.entityId,
      content: safeContent,
      parentId: parent.id,
      replyToUserId: dto.replyToUserId ?? null,
      status: 'pending',
    });
    return this.repo.save(entity);
  }

  /**
   * 编辑评论（仅本人 + status=pending）
   */
  async updateByUser(
    id: number,
    userId: number,
    dto: UpdateCommentDto,
  ): Promise<CommentEntity> {
    const comment = await this.repo.findOne({ where: { id } });
    if (!comment) throw new NotFoundException('评论不存在');
    if (comment.userId !== userId) {
      throw new ForbiddenException('只能编辑自己的评论');
    }
    if (comment.status !== 'pending') {
      throw new BadRequestException('审核完成的评论不允许编辑');
    }
    comment.content = this.escapeHtml(dto.content);
    return this.repo.save(comment);
  }

  // ===== 管理端：审核/列表 =====

  /**
   * 管理端列表（含未审核，可按状态/关键词筛选）
   */
  async adminList(params: {
    entityType?: string;
    entityId?: number;
    status?: 'pending' | 'approved' | 'rejected';
    keyword?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ list: CommentEntity[]; total: number }> {
    const {
      entityType,
      entityId,
      status,
      keyword,
      page = 1,
      pageSize = 20,
    } = params;
    const qb = this.repo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.user', 'user')
      .leftJoinAndSelect('c.replyToUser', 'replyToUser')
      .orderBy('c.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (entityType) qb.andWhere('c.entityType = :et', { et: entityType });
    if (entityId) qb.andWhere('c.entityId = :eid', { eid: entityId });
    if (status) qb.andWhere('c.status = :s', { s: status });
    if (keyword) {
      qb.andWhere('c.content LIKE :kw', { kw: `%${keyword}%` });
    }

    const [list, total] = await qb.getManyAndCount();
    return { list, total };
  }

  /**
   * 管理端审核
   */
  async moderate(
    id: number,
    status: 'approved' | 'rejected',
  ): Promise<CommentEntity> {
    const comment = await this.repo.findOne({ where: { id } });
    if (!comment) throw new NotFoundException('评论不存在');
    const oldStatus = comment.status;
    comment.status = status;
    const saved = await this.repo.save(comment);
    // 同步 post.commentCount：只有从 pending→approved 或 approved→非 approved 才变化
    if (oldStatus !== status) {
      await this.syncPostCommentCount(comment.entityType, comment.entityId);
    }
    return saved;
  }

  /**
   * 管理端批量审核
   */
  async batchModerate(
    ids: number[],
    status: 'approved' | 'rejected',
  ): Promise<void> {
    if (ids.length === 0) return;
    // 取出受影响的实体（用于同步 post.commentCount）
    const affected = await this.repo.find({
      where: { id: In(ids) },
      select: ['id', 'entityType', 'entityId', 'status'],
    });
    await this.repo.update({ id: In(ids) }, { status });
    // 收集所有受影响的目标实体，逐个同步
    const targets = new Set<string>();
    affected.forEach((c) => {
      if (c.status !== status) targets.add(`${c.entityType}:${c.entityId}`);
    });
    for (const key of targets) {
      const [entityType, entityIdStr] = key.split(':');
      await this.syncPostCommentCount(entityType, Number(entityIdStr));
    }
  }

  /**
   * 删除评论（本人或 admin）
   */
  async delete(id: number, userId: number, isAdmin: boolean): Promise<void> {
    const comment = await this.repo.findOne({ where: { id } });
    if (!comment) throw new NotFoundException('评论不存在');
    if (!isAdmin && comment.userId !== userId) {
      throw new ForbiddenException('只能删除自己的评论');
    }
    // 删除一级评论时，连带删除其下所有二级回复
    if (comment.parentId === null) {
      await this.repo.delete({ parentId: id });
    }
    await this.repo.remove(comment);
    // 同步 post.commentCount（只有 approved 状态的删除才影响计数）
    if (comment.status === 'approved') {
      await this.syncPostCommentCount(comment.entityType, comment.entityId);
    }
  }

  /**
   * 重新统计某 post 的 approved 评论数并写回 commentCount 冗余字段
   */
  private async syncPostCommentCount(entityType: string, entityId: number) {
    if (entityType !== 'post') return;
    const count = await this.countApproved(entityType, entityId);
    await this.postRepo.update({ id: entityId }, { commentCount: count });
  }

  /**
   * 管理端批量删除评论
   * 删除一级评论时同步删除其所有二级评论，并更新 post.commentCount
   *
   * 实现细节：分两步删除以避免外键约束错误
   *  - 先删所有子评论 (parentId IN topLevelIds)
   *  - 再删选中的评论本身 (含一级和单独选中的二级)
   *  MySQL 的 ON DELETE NO ACTION 不允许父先行删除，必须先子后父
   */
  async batchRemove(ids: number[]): Promise<void> {
    if (ids.length === 0) return;

    const comments = await this.repo.find({
      where: { id: In(ids) },
      select: ['id', 'entityType', 'entityId', 'parentId', 'status'],
    });

    if (comments.length === 0) return;

    // 收集受影响的实体（仅 approved 状态的评论被删除才影响计数）
    const affectedEntities = new Set<string>();
    for (const c of comments) {
      if (c.status === 'approved') {
        affectedEntities.add(`${c.entityType}:${c.entityId}`);
      }
    }

    // Step 1: 找出选中项中的一级评论，先删除其下所有二级回复
    // （即使这些二级回复没被选中，也要一并清理，避免孤儿评论 + FK 约束）
    const topLevelIds = comments.filter((c) => c.parentId === null).map((c) => c.id);
    if (topLevelIds.length > 0) {
      await this.repo.delete({ parentId: In(topLevelIds) });
    }

    // Step 2: 删除所有选中的评论（此时父的子已全部清理，FK 不再阻止）
    await this.repo.delete({ id: In(ids) });

    // 同步 post.commentCount
    for (const key of affectedEntities) {
      const [entityType, entityIdStr] = key.split(':');
      await this.syncPostCommentCount(entityType, Number(entityIdStr));
    }
  }

  // ===== 内部计数（供 PostService 同步 commentCount）=====

  /**
   * 统计某实体已审核通过的一级 + 二级评论总数
   */
  async countApproved(entityType: string, entityId: number): Promise<number> {
    return this.repo.count({
      where: { entityType, entityId, status: 'approved' },
    });
  }

  // ===== 工具 =====

  /**
   * 转义 HTML 特殊字符，防止 XSS（评论纯文本展示）
   */
  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
