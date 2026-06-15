import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserEntity } from '../user/user.entity';
import { PlanEntity } from '../plan/plan.entity';

export type MembershipStatus = 'active' | 'expired' | 'cancelled';
export type MembershipSource = 'admin' | 'code' | 'payment';

@Entity('memberships')
@Index('idx_member_user', ['userId'])
@Index('idx_member_plan', ['planId'])
@Index('idx_member_status', ['status'])
@Index('idx_member_expires', ['expiresAt'])
@Index('idx_member_user_status', ['userId', 'status', 'expiresAt'])
export class MembershipEntity {
  @PrimaryGeneratedColumn({ comment: '订阅 ID' })
  id: number;

  @Column({ name: 'user_id', comment: '用户 ID' })
  userId: number;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ name: 'plan_id', comment: '套餐 ID' })
  planId: number;

  @ManyToOne(() => PlanEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plan_id' })
  plan: PlanEntity;
  @Column({ type: 'datetime', name: 'started_at', comment: '开始时间' })
  startedAt: Date;

  /**
   * 到期时间
   * null = 终身有效
   */
  @Column({
    type: 'datetime',
    nullable: true,
    name: 'expires_at',
    comment: '到期时间（null=终身）',
  })
  expiresAt: Date | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'active',
    comment: '状态 active=生效 expired=已过期 cancelled=已取消',
  })
  status: MembershipStatus;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'admin',
    comment: '来源 admin=手动 code=兑换码 payment=支付',
  })
  source: MembershipSource;

  /**
   * 来源 ID（可选）
   * source='code' → 兑换码 ID
   * source='payment' → 订单 ID
   */
  @Column({
    type: 'int',
    nullable: true,
    name: 'source_id',
    comment: '来源关联 ID',
  })
  sourceId: number | null;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: '备注（如：管理员手动续期）',
  })
  note: string | null;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '更新时间' })
  updatedAt: Date;
}
