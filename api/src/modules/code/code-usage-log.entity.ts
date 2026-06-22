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
 * - idx_codeusage_code(codeId)：findUsageLogs 热路径 WHERE codeId=? + 外键所需
 *   （MySQL InnoDB 外键需在被引用列上有索引，此索引同时满足）
 *
 * 历史背景：原代码三个 @Index 装饰器悬空（夹在 @Column 和 @ManyToOne 之间，未挂在任何列上），
 * TypeORM 错误地把名为 used_at 的索引建在了 code_id 列上，且被外键复用，无法直接 drop。
 * 已在数据库侧清理：建 idx_codeusage_code → 删旧外键 → 删脏索引 used_at → 重建外键。
 * 这里索引名与数据库严格对齐，避免 TypeORM synchronize 再次尝试 drop 触发外键冲突。
 *
 * 注意：不使用复合索引 (codeId, usedAt)——findUsageLogs 的 ORDER BY usedAt DESC
 * 在单条 code 的日志量级（通常几十条）下 filesort 开销可忽略，不值得为它引入新索引名差异。
 */
@Entity('code_usage_logs')
@Index('idx_codeusage_code', ['codeId'])
export class CodeUsageLogEntity {
  @PrimaryGeneratedColumn({ comment: 'ID' })
  id: number;

  @Column({ name: 'code_id', comment: '关联的码ID' })
  codeId: number;

  @Column({
    type: 'int',
    name: 'user_id',
    nullable: true,
    comment: '使用用户ID（未登录可能为null）',
  })
  userId: number | null;

  @Column({ type: 'datetime', name: 'used_at', comment: '使用时间' })
  usedAt: Date;

  @Column({ type: 'varchar', length: 45, nullable: true, comment: '客户端IP' })
  clientIp: string | null;

  @Column({ type: 'json', nullable: true, comment: '扩展字段' })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  // 外键关联。@JoinColumn 只控制列名（code_id），外键约束名由 TypeORM 自动生成。
  // 数据库侧已重建外键约束（删旧 FK_哈希串 → 建 FK_code_usage_logs_code），
  // TypeORM synchronize 对外键约束名不一致是容忍的（不会 drop/recreate 外键），只看列名匹配。
  @ManyToOne(() => CodeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'code_id' })
  code: CodeEntity;
}
