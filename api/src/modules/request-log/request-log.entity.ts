import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 请求日志实体 —— 记录每个 HTTP 请求的追溯信息。
 *
 * 用途：用户报错时提供追踪号（requestId），admin 后台可按 requestId
 * 精确反查该请求的方法/路径/状态码/耗时/IP/用户/错误信息，形成闭环。
 *
 * 写入时机：请求结束时（res.on('finish')）异步落库，不阻塞响应。
 *
 * 索引：
 * - requestId（唯一追踪号，精确查询）
 * - createdAt（按时间倒序浏览）
 * - status（按成功/失败/错误筛选）
 * - ip（按客户端排查，配合限流/黑名单追溯）
 */
@Entity('request_logs')
@Index('idx_reqlog_request_id', ['requestId'])
@Index('idx_reqlog_created', ['createdAt'])
@Index('idx_reqlog_status', ['status'])
@Index('idx_reqlog_ip', ['ip'])
export class RequestLogEntity {
  @PrimaryGeneratedColumn() id: number;

  /** 追踪号（pino genReqId 生成的 uuid） */
  @Column({ type: 'varchar', length: 64, name: 'request_id' })
  requestId: string;

  /** HTTP 方法（GET/POST/PUT/DELETE） */
  @Column({ type: 'varchar', length: 10 }) method: string;

  /** 请求路径（不含 query） */
  @Column({ type: 'varchar', length: 255 }) path: string;

  /** HTTP 响应状态码 */
  @Column({ type: 'int' }) status: number;

  /** 请求耗时（毫秒） */
  @Column({ type: 'int', name: 'duration_ms' }) durationMs: number;

  /** 客户端 IP（getClientIp 解析后的真实 IP） */
  @Column({ type: 'varchar', length: 64 }) ip: string;

  /** 发起请求的用户 ID（未登录为 null） */
  @Column({ type: 'bigint', nullable: true, name: 'user_id' })
  userId: number | null;

  /** 错误信息（仅 4xx/5xx 记录，成功请求为 null） */
  @Column({ type: 'varchar', length: 500, nullable: true, name: 'error_message' })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
