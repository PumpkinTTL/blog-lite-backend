import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { CodeEntity } from './code.entity';

@Entity('code_usage_logs')
export class CodeUsageLogEntity {
  @PrimaryGeneratedColumn({ comment: 'ID' })
  id: number;

  @Column({ name: 'code_id', comment: '关联的码ID' })
  codeId: number;

  @Column({ type: 'int', name: 'user_id', nullable: true, comment: '使用用户ID（未登录可能为null）' })
  userId: number | null;

  @Column({ type: 'datetime', name: 'used_at', comment: '使用时间' })
  usedAt: Date;

  @Column({ type: 'varchar', length: 45, nullable: true, comment: '客户端IP' })
  clientIp: string | null;

  @Column({ type: 'json', nullable: true, comment: '扩展字段' })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  // 索引
  @Index('used_at')
  @Index('code_id')
  @Index('user_id')

  // 外键关联
  @ManyToOne(() => CodeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'code_id' })
  code: CodeEntity;
}