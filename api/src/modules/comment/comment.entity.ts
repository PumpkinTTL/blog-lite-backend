import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from '../user/user.entity';

export type CommentStatus = 'pending' | 'approved' | 'rejected';

/**
 * 评论表（多态 + 2 层嵌套）
 *
 * 嵌套规则：
 * - 一级评论：parentId = NULL
 * - 二级回复：parentId = 一级评论 id；replyToUserId = @ 谁（同一级下的另一条二级回复作者）
 * - 二级回复不能再被回复（前端不允许，后端校验）
 *
 * 多态目标：entityType + entityId（post / 未来扩展）
 *
 * 审核：默认 pending，admin 审核通过后 approved 才会显示
 */
@Entity('comments')
@Index('idx_entity', ['entityType', 'entityId', 'status'])
@Index('idx_parent', ['parentId'])
@Index('idx_user', ['userId'])
export class CommentEntity {
  @PrimaryGeneratedColumn({ comment: '评论 ID' })
  id: number;

  @Column({
    type: 'varchar',
    length: 32,
    name: 'entity_type',
    comment: '目标实体类型 post|...',
  })
  entityType: string;

  @Column({ name: 'entity_id', comment: '目标实体 ID' })
  entityId: number;

  @Column({ name: 'user_id', comment: '评论作者 ID' })
  userId: number;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ type: 'text', comment: '评论内容（纯文本，已转义）' })
  content: string;

  /**
   * 父评论 ID
   * - NULL: 一级评论
   * - 非 NULL: 二级回复（必须是 type=comment/entityType+entityId 一致的一级评论）
   */
  @Column({ type: 'int', nullable: true, name: 'parent_id', comment: '父评论 ID（NULL=一级）' })
  parentId: number | null;

  /**
   * 一级评论自身（用于 ORM 关联查询）
   */
  @ManyToOne(() => CommentEntity)
  @JoinColumn({ name: 'parent_id' })
  parent: CommentEntity | null;

  /**
   * 回复目标用户 ID（二级回复 @ 谁，同一一级下的另一条二级作者）
   */
  @Column({ type: 'int', nullable: true, name: 'reply_to_user_id', comment: '@ 目标用户 ID（二级回复间）' })
  replyToUserId: number | null;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'reply_to_user_id' })
  replyToUser: UserEntity | null;

  @Column({
    type: 'varchar',
    length: 16,
    default: 'pending',
    comment: '审核状态 pending|approved|rejected',
  })
  status: CommentStatus;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '更新时间' })
  updatedAt: Date;
}
