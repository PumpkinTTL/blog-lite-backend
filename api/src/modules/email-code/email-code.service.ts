import { Inject, Injectable, BadRequestException, ServiceUnavailableException, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { MailerService } from '../mailer/mailer.service';

/**
 * 邮箱验证码服务（Redis 存储）。
 *
 * 之前用进程内 Map 存储，存在三个问题：
 * 1. 多实例部署不共享（A 实例发码 B 实例验证必失败）
 * 2. 进程重启丢失所有待验证码
 * 3. 防刷维度（尝试次数、发送冷却）只限单实例，多实例可绕过
 *
 * 改用 Redis 后：验证码用 hash 存（code + attempts），冷却用独立 key + PX NX 原子保证
 * 60s 一次。所有操作原子，多实例安全。
 */
@Injectable()
export class EmailCodeService {
  private readonly logger = new Logger(EmailCodeService.name);
  /** 验证码有效期 10 分钟 */
  private readonly CODE_TTL = 10 * 60 * 1000;
  /** 发送冷却 60 秒（同一邮箱） */
  private readonly SEND_COOLDOWN = 60 * 1000;
  /** 最大尝试次数 */
  private readonly MAX_ATTEMPTS = 5;

  private readonly PREFIX = 'emailcode:';
  private readonly COOLDOWN_PREFIX = 'emailcode:cd:';

  constructor(
    private readonly mailerService: MailerService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * 发送验证码。
   * 用 SETNX + PX 原子保证冷却：60s 内同一邮箱只能发一次。
   */
  async sendCode(email: string): Promise<void> {
    // 冷却检查：SET NX PX 原子，ok=null 表示仍在冷却
    const cooldownKey = this.COOLDOWN_PREFIX + email;
    let ok: string | null;
    try {
      ok = await this.redis.set(
        cooldownKey,
        '1',
        'PX',
        this.SEND_COOLDOWN,
        'NX',
      );
    } catch (e) {
      // Redis 故障：验证码全链路依赖 Redis（存储/计数），无法降级，
      // 明确报 503 而非让 ioredis 原生错误冒成 500（登录/注册/找回同时不可用时排障需要语义）
      this.logger.error(`Redis 不可用，验证码发送失败: ${(e as Error).message}`);
      throw new ServiceUnavailableException('验证码服务暂时不可用，请稍后重试');
    }
    if (!ok) {
      const ttl = await this.redis.pttl(cooldownKey);
      const wait = Math.ceil((ttl || this.SEND_COOLDOWN) / 1000);
      throw new BadRequestException(`操作过于频繁，请 ${wait} 秒后再试`);
    }

    // 生成 6 位验证码
    const code = String(Math.floor(100000 + Math.random() * 900000));

    // 发送邮件（失败则清除冷却，允许立即重试）
    const expireMinutes = this.CODE_TTL / 60000;
    try {
      const sent = await this.mailerService.sendVerifyCode(
        email,
        code,
        expireMinutes,
      );
      if (!sent) {
        await this.redis.del(cooldownKey);
        throw new BadRequestException('邮件发送失败，请稍后重试');
      }
    } catch (err) {
      // 清除冷却让用户能重试，记日志（不暴露 SMTP 细节给用户）
      await this.redis.del(cooldownKey);
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`邮件发送失败: ${(err as Error).message}`, (err as Error).stack);
      throw new BadRequestException('邮件发送失败，请稍后重试');
    }

    // 存验证码：hash 含 code + attempts，整体 TTL 10 分钟
    // 用 hmset 兼容所有 Redis 版本（hset 多字段写法需 4.0+，hmset 全版本支持）
    const key = this.PREFIX + email;
    await this.redis.hmset(key, 'code', code, 'attempts', '0');
    await this.redis.pexpire(key, this.CODE_TTL);
  }

  /**
   * 校验验证码（异步，调用方需 await）。
   * HINCRBY attempts 原子自增，防并发绕过次数上限。
   * 校验成功删除 key + 冷却 key；失败达上限也删除 key 强制重新获取。
   */
  async verifyCode(email: string, code: string): Promise<boolean> {
    const key = this.PREFIX + email;
    // 原子自增尝试次数
    const attempts = await this.redis.hincrby(key, 'attempts', 1);
    if (attempts > this.MAX_ATTEMPTS) {
      await this.redis.del(key);
      throw new BadRequestException('验证码错误次数过多，请重新获取');
    }
    const stored = await this.redis.hget(key, 'code');
    if (stored === null) {
      throw new BadRequestException('请先获取验证码');
    }
    if (stored !== code) {
      throw new BadRequestException(
        `验证码错误，还剩 ${this.MAX_ATTEMPTS - attempts} 次机会`,
      );
    }
    // 成功：清除验证码 + 冷却
    await this.redis.del(key);
    await this.redis.del(this.COOLDOWN_PREFIX + email);
    return true;
  }
}
