import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type CodeType =
  | 'invitation'
  | 'activation'
  | 'discount'
  | 'membership'
  | 'resource';
export type CodeStatus = 'active' | 'used' | 'expired' | 'disabled';

/**
 * codes 表索引：
 * - code 列已是 unique（隐式索引），覆盖 findOne({ code }) 热路径
 * - (type, status)：管理端过滤 + 兑换校验常用组合
 * - status：单独过滤（兑换时校验 active）
 * - assignedDonationId：码池查询 WHERE assignedDonationId IS NULL（发码热路径）
 */
@Entity('codes')
@Index('idx_code_type_status', ['type', 'status'])
@Index('idx_code_status', ['status'])
@Index('idx_code_assigned_donation', ['assignedDonationId'])
export class CodeEntity {
  @PrimaryGeneratedColumn({ comment: 'ID' })
  id: number;

  @Column({ length: 32, unique: true, comment: '激活码/邀请码' })
  code: string;

  @Column({
    type: 'enum',
    enum: [
      'invitation',
      'activation',
      'discount',
      'membership',
      'resource',
    ],
    comment: '类型',
  })
  type: CodeType;

  @Column({
    type: 'enum',
    enum: ['active', 'used', 'expired', 'disabled'],
    default: 'active',
    comment: '状态',
  })
  status: CodeStatus;

  /**
   * 已分配给的捐赠单 ID。
   * - null：未分配，码仍在码池中可选（发码热路径 WHERE assignedDonationId IS NULL）
   * - 有值：已发给某个捐赠者，不再进入码池，但仍保持 active 供持有者兑换
   *
   * 背景：原设计发码时把 status 置 disabled 来"移出码池"，但兑换只接受 active，
   * 导致捐赠答谢码用户拿到后无法兑换。用这列把"池内可见性"和"可兑换性"解耦。
   */
  @Column({
    name: 'assigned_donation_id',
    type: 'int',
    nullable: true,
    comment: '已分配给的捐赠单 ID（null=未分配，仍在码池中）',
  })
  assignedDonationId: number | null;

  @Column({ default: 1, comment: '最大使用次数（0=无限制）' })
  maxUses: number;

  @Column({ default: 0, comment: '已使用次数' })
  usedCount: number;

  @Column({
    type: 'datetime',
    nullable: true,
    comment: '过期时间（null=永不过期）',
  })
  expiresAt: Date | null;

  @Column({ type: 'bigint', nullable: true, comment: '创建人用户ID（9位随机，与 users.id 对齐）' })
  creatorId: number | null;

  @Column({ type: 'json', nullable: true, comment: '扩展字段' })
  metadata: Record<string, unknown> | null;

  /**
   * 优惠信息（仅 discount 类型使用）
   * { type: 'percentage'|'threshold'|'fixed', value: number, threshold?: number }
   * percentage: 打折，value = 折扣比例（如 0.8 = 八折）
   * threshold: 满减，value = 减免金额，threshold = 最低消费金额
   * fixed: 立减，value = 减免金额
   */
  @Column({
    type: 'json',
    nullable: true,
    comment: '优惠信息（仅 discount 类型）',
  })
  discount: {
    type: 'percentage' | 'threshold' | 'fixed';
    value: number;
    threshold?: number;
  } | null;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '更新时间' })
  updatedAt: Date;

  @Column({ type: 'datetime', nullable: true, comment: '首次/末次使用时间' })
  usedAt: Date | null;
}
