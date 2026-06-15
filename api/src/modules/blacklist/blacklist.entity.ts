import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 黑名单实体
 * type + value 唯一：同 IP/用户不可重复封禁
 * expiresAt 为 null 表示永久封禁
 */
@Entity('blacklists')
@Index('uq_bl_type_value', ['type', 'value'], { unique: true })
@Index('idx_bl_status', ['status'])
export class BlacklistEntity {
  @PrimaryGeneratedColumn({ comment: '黑名单 ID' })
  id: number;

  @Column({ type: 'varchar', length: 20, comment: '类型：ip | user' })
  type: string;

  /** 封禁值：type=ip 时为 IP 字符串；type=user 时为 userId 字符串 */
  @Column({ type: 'varchar', length: 100, comment: '封禁值（IP 或 userId）' })
  value: string;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '封禁原因' })
  reason: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'active',
    comment: '状态：active 生效中 | expired 已解除',
  })
  status: string;

  @Column({
    type: 'datetime',
    nullable: true,
    comment: '过期时间（null=永久封禁）',
  })
  expiresAt: Date | null;

  @Column({ type: 'int', nullable: true, comment: '操作人用户ID' })
  creatorId: number | null;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '更新时间' })
  updatedAt: Date;
}
