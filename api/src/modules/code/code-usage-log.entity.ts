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

/**
 * code_usage_logs 表索引：
 * - (codeId, usedAt)：findUsageLogs 热路径 WHERE codeId=? ORDER BY usedAt DESC
 * - userId：按用户查"我的兑换记录"
 *
 * 注意：原代码三个 @Index 装饰器悬空（夹在 @Column 和 @ManyToOne 之间，未挂在任何列上），
 * TypeORM 不会绑定到对应列，索引实际未生成。这里改为属性级装饰器，并补复合索引。
 */
@Entity('code_usage_logs')
@Index('idx_codeusage_code_used', ['codeId', 'usedAt'])
export class CodeUsageLogEntity {
  @PrimaryGeneratedColumn({ comment: 'ID' })
  id: number;

  @Index()
  @Column({ name: 'code_id', comment: '关联的码ID' })
  codeId: number;

  @Index()
  @Column({
    type: 'int',
    name: 'user_id',
    nullable: true,
    comment: '使用用户ID（未登录可能为null）',
  })
  userId: number | null;

  @Index()
  @Column({ type: 'datetime', name: 'used_at', comment: '使用时间' })
  usedAt: Date;

  @Column({ type: 'varchar', length: 45, nullable: true, comment: '客户端IP' })
  clientIp: string | null;

  @Column({ type: 'json', nullable: true, comment: '扩展字段' })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  // 外键关联
  @ManyToOne(() => CodeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'code_id' })
  code: CodeEntity;
}
