import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 通知类型
 * - code：发码邮件（含激活码）
 * - thanks：纯感谢邮件（不含码）
 */
export type DonationNotificationType = 'code' | 'thanks';

@Entity('donation_notifications')
export class DonationNotificationEntity {
  @PrimaryGeneratedColumn({ comment: '通知记录 ID' })
  id: number;

  @Index()
  @Column({ type: 'int', name: 'donation_id', comment: '关联的捐赠记录 ID' })
  donationId: number;

  @Column({
    type: 'varchar',
    length: 20,
    comment: '通知类型：code=发码邮件 / thanks=感谢邮件',
  })
  type: DonationNotificationType;

  @Column({
    type: 'varchar',
    length: 100,
    comment: '收件邮箱（发送时填写的，可能与捐赠原始邮箱不同）',
  })
  recipientEmail: string;

  /** 若是发码类型，关联的激活码 ID（其他类型为 null） */
  @Column({ type: 'int', nullable: true, name: 'code_id', comment: '关联激活码 ID（仅 type=code）' })
  codeId: number | null;

  /** 邮件主题 */
  @Column({ type: 'varchar', length: 200 })
  subject: string;

  /** 发送是否成功 */
  @Column({ type: 'boolean', default: false, name: 'is_sent' })
  isSent: boolean;

  /** 失败原因（成功为 null） */
  @Column({ type: 'varchar', length: 500, nullable: true, name: 'error_message' })
  errorMessage: string | null;

  /** 操作管理员 ID */
  @Column({ type: 'int', nullable: true, name: 'operator_id' })
  operatorId: number | null;

  @CreateDateColumn({ name: 'created_at', comment: '发送时间' })
  createdAt: Date;
}
