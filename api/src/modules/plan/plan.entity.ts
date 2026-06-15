import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * 套餐等级
 * - plus:  Plus（基础会员，权重 1）
 * - pro:   Pro（专业版，权重 2）
 * - max:   Max（旗舰版，权重 3，最高级）
 * 终身场景用 durationDays=0 表达（任意 level 都可终身）
 */
export type PlanLevel = 'plus' | 'pro' | 'max';

@Entity('plans')
export class PlanEntity {
  @PrimaryGeneratedColumn({ comment: '套餐 ID' })
  id: number;

  @Column({ length: 100, comment: '套餐名称（如：专业版月付）' })
  name: string;

  @Column({ length: 50, unique: true, comment: 'URL slug（如 pro_monthly）' })
  slug: string;

  @Column({
    type: 'varchar',
    length: 20,
    comment: '权益等级（plus/pro/max），决定可见权益层级',
  })
  level: PlanLevel;

  /**
   * 有效期（天）
   * 0 = 终身有效
   * 30 = 月付
   * 365 = 年付
   */
  @Column({ type: 'int', default: 30, comment: '有效期天数（0=终身）' })
  durationDays: number;

  /**
   * 价格（分，避免浮点）
   * 0 = 免费 / 不售卖（仅兑换码或管理员开通）
   */
  @Column({ type: 'int', default: 0, comment: '价格（分）' })
  priceCents: number;

  /**
   * 权益列表
   * 例：["去广告","专属内容","下载额度1000","专属徽章"]
   */
  @Column({ type: 'json', nullable: true, comment: '权益列表' })
  benefits: string[] | null;

  @Column({ type: 'text', nullable: true, comment: '套餐描述' })
  description: string | null;

  @Column({
    type: 'boolean',
    default: true,
    comment: '是否上架（false=下架，不再售卖）',
  })
  isActive: boolean;

  @Column({ type: 'int', default: 0, comment: '排序权重（升序）' })
  sort: number;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '更新时间' })
  updatedAt: Date;
}
