import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type CodeType = 'invitation' | 'activation' | 'discount';
export type CodeStatus = 'active' | 'used' | 'expired' | 'disabled';

@Entity('codes')
export class CodeEntity {
  @PrimaryGeneratedColumn({ comment: 'ID' })
  id: number;

  @Column({ length: 32, unique: true, comment: '激活码/邀请码' })
  code: string;

  @Column({
    type: 'enum',
    enum: ['invitation', 'activation', 'discount'],
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

  @Column({ default: 1, comment: '最大使用次数（0=无限制）' })
  maxUses: number;

  @Column({ default: 0, comment: '已使用次数' })
  usedCount: number;

  @Column({ type: 'datetime', nullable: true, comment: '过期时间（null=永不过期）' })
  expiresAt: Date | null;

  @Column({ type: 'int', nullable: true, comment: '创建人用户ID' })
  creatorId: number | null;

  @Column({ type: 'json', nullable: true, comment: '扩展字段' })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '更新时间' })
  updatedAt: Date;

  @Column({ type: 'datetime', nullable: true, comment: '首次/末次使用时间' })
  usedAt: Date | null;
}