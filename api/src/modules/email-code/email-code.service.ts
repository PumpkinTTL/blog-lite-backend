import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { MailerService } from '../mailer/mailer.service';

interface CodeRecord {
  code: string;
  expiresAt: number;
  attempts: number;
}

@Injectable()
export class EmailCodeService {
  private readonly logger = new Logger(EmailCodeService.name);

  /** email -> CodeRecord */
  private readonly store = new Map<string, CodeRecord>();

  /** 验证码有效期（毫秒） */
  private readonly CODE_TTL = 10 * 60 * 1000; // 10 分钟

  /** 最大尝试次数 */
  private readonly MAX_ATTEMPTS = 5;

  /** 发送冷却（毫秒） */
  private readonly SEND_COOLDOWN = 60 * 1000; // 60 秒
  private readonly lastSentAt = new Map<string, number>();

  constructor(private readonly mailerService: MailerService) {
    // 每分钟清理过期验证码
    setInterval(() => this.cleanup(), 60 * 1000);
  }

  /**
   * 发送验证码到指定邮箱
   */
  async sendCode(email: string): Promise<void> {
    // 冷却检查
    const lastSent = this.lastSentAt.get(email) || 0;
    if (Date.now() - lastSent < this.SEND_COOLDOWN) {
      const remaining = Math.ceil((this.SEND_COOLDOWN - (Date.now() - lastSent)) / 1000);
      throw new BadRequestException(`操作过于频繁，请 ${remaining} 秒后再试`);
    }

    // 生成 6 位数字验证码
    const code = Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)).join('');

    // 发送邮件
    const expireMinutes = this.CODE_TTL / 60000;
    const sent = await this.mailerService.sendVerifyCode(email, code, expireMinutes);
    if (!sent) {
      throw new BadRequestException('邮件发送失败，请稍后重试');
    }

    // 存储
    this.store.set(email, {
      code,
      expiresAt: Date.now() + this.CODE_TTL,
      attempts: 0,
    });
    this.lastSentAt.set(email, Date.now());

    this.logger.log(`验证码已发送至 ${email}`);
  }

  /**
   * 验证验证码
   */
  verifyCode(email: string, code: string): boolean {
    const record = this.store.get(email);

    if (!record) {
      throw new BadRequestException('请先获取验证码');
    }

    if (record.expiresAt < Date.now()) {
      this.store.delete(email);
      throw new BadRequestException('验证码已过期，请重新获取');
    }

    record.attempts++;

    if (record.attempts > this.MAX_ATTEMPTS) {
      this.store.delete(email);
      throw new BadRequestException('验证码错误次数过多，请重新获取');
    }

    if (record.code !== code) {
      throw new BadRequestException(`验证码错误，还剩 ${this.MAX_ATTEMPTS - record.attempts} 次机会`);
    }

    // 验证成功，删除记录
    this.store.delete(email);
    this.lastSentAt.delete(email);
    return true;
  }

  /**
   * 清理过期验证码
   */
  private cleanup() {
    const now = Date.now();
    for (const [email, record] of this.store) {
      if (record.expiresAt < now) {
        this.store.delete(email);
      }
    }
    for (const [email, ts] of this.lastSentAt) {
      if (now - ts > this.SEND_COOLDOWN * 2) {
        this.lastSentAt.delete(email);
      }
    }
  }
}
