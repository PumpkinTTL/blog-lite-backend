import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 备份状态
 * - running：备份进行中（dump/上传/校验）
 * - success：成功（已上传 R2 + HEAD 校验通过）
 * - failed：失败（dump 失败 / 上传失败 / 校验失败）
 */
export type BackupStatus = 'running' | 'success' | 'failed';

/**
 * backup_logs 表：每次备份的历史记录
 *
 * 索引：
 * - createdAt：默认按时间倒序查历史
 * - status：按状态筛（查失败记录）
 * - trigger：按触发方式筛（定时 vs 手动）
 */
@Entity('backup_logs')
@Index('idx_backup_created', ['createdAt'])
@Index('idx_backup_status', ['status'])
@Index('idx_backup_trigger', ['trigger'])
export class BackupLogEntity {
  @PrimaryGeneratedColumn({ comment: '记录 ID' })
  id: number;

  /** 触发方式：schedule=定时器 / manual=手动 */
  @Column({
    type: 'varchar',
    length: 20,
    comment: '触发方式: schedule=定时器 manual=手动',
  })
  trigger: 'schedule' | 'manual';

  /** 触发的定时器名称（trigger=schedule 时填，manual 时 null） */
  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'schedule_name',
    comment: '触发的定时器名称（手动触发为 null）',
  })
  scheduleName: string | null;

  /** R2 对象 key（如 backup/2026-06-24_030000.sql.gz） */
  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'r2_key',
    comment: 'R2 对象 key（失败时可能为 null）',
  })
  r2Key: string | null;

  /** 备份文件大小（字节，压缩后） */
  @Column({
    type: 'bigint',
    nullable: true,
    comment: '备份文件大小（字节，压缩后）',
  })
  size: number | null;

  /** 备份状态 */
  @Column({
    type: 'varchar',
    length: 20,
    default: 'running',
    comment: '状态: running=进行中 success=成功 failed=失败',
  })
  status: BackupStatus;

  /** 失败原因（status=failed 时填） */
  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    name: 'error_message',
    comment: '失败原因（status=failed 时填）',
  })
  errorMessage: string | null;

  /** 备份耗时（毫秒） */
  @Column({
    type: 'int',
    nullable: true,
    name: 'duration_ms',
    comment: '备份耗时（毫秒）',
  })
  durationMs: number | null;

  /** R2 HEAD 校验：true=已校验存在且大小匹配 */
  @Column({
    type: 'boolean',
    default: false,
    name: 'r2_verified',
    comment: 'R2 HEAD 校验是否通过',
  })
  r2Verified: boolean;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;
}
