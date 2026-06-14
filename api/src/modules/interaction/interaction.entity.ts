import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

export type InteractionType = 'like' | 'favorite';
export type InteractionEntityType = 'post' | 'comment';

/**
 * 互动表：多态存储用户的点赞/收藏
 * - entityType + entityId: 指向被互动的实体（文章/评论/未来扩展）
 * - type: 'like' | 'favorite'，预留 'dislike' 等
 * - 唯一约束：同一用户对同一实体的同一类型只能有一条记录
 */
@Entity('interactions')
@Unique('uq_user_entity_type', ['userId', 'entityType', 'entityId', 'type'])
@Index('idx_entity', ['entityType', 'entityId', 'type'])
@Index('idx_user_type', ['userId', 'type'])
export class InteractionEntity {
  @PrimaryGeneratedColumn({ comment: 'ID' })
  id: number;

  @Column({ name: 'user_id', comment: '用户 ID' })
  userId: number;

  @Column({
    type: 'varchar',
    length: 32,
    name: 'entity_type',
    comment: '目标实体类型 post|comment',
  })
  entityType: InteractionEntityType;

  @Column({ name: 'entity_id', comment: '目标实体 ID' })
  entityId: number;

  @Column({
    type: 'varchar',
    length: 16,
    comment: '互动类型 like|favorite',
  })
  type: InteractionType;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;
}
