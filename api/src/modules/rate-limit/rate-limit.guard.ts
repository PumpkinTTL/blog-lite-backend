import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { RateLimitConfigService } from '../rate-limit/rate-limit-config.service';
import { BlacklistService } from '../blacklist/blacklist.service';
import { getClientIp } from '../../common/utils/get-client-ip';

/**
 * 自动拉黑阈值：统计窗口内违规次数。
 * 例如 VIOLATION_WINDOW=600s（10分钟）内触发限流 5 次 → 自动临时拉黑。
 * 这些常量后续可下沉到 settings 表由 GUI 配置，当前先用合理默认值。
 */
const VIOLATION_THRESHOLD = 5; // 10 分钟内触发限流 5 次即拉黑
const VIOLATION_WINDOW_SEC = 600; // 违规计数窗口 10 分钟
const AUTO_BAN_DURATION_MIN = 30; // 自动拉黑时长 30 分钟

/**
 * 限流 Guard（全局，鉴权前执行，IP 维度）
 *
 * - routeKey = 类名.方法名（如 UserController.login）
 * - tracker：已登录 user:<id>，匿名 ip:<ip>
 *   注：本 Guard 在 AuthGuard 之前执行，request.user 尚未挂载，
 *   故用户维度限流由 RateLimitUserGuard（鉴权后）负责，这里只做 IP 维度。
 *   但保留 userId 读取逻辑——若未来调整 Guard 顺序可自动生效。
 * - Redis 计数：INCR key，首次设 EXPIRE
 * - 阈值从 RateLimitConfigService 读内存（零开销，热更新）
 * - 违规联动：触发 429 时累计违规计数，达阈值自动写入黑名单（临时）
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: RateLimitConfigService,
    private readonly blacklistService: BlacklistService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // 路由标识
    const routeKey =
      context.getClass().name + '.' + context.getHandler().name;

    // 取阈值（内存，零开销）
    const rule = this.configService.getRule(routeKey);

    // tracker 维度：用统一工具取真实 IP（trust proxy 生效后 req.ip 即真实客户端）
    const userId = request.user?.sub;
    const ip = getClientIp(request);
    const tracker = userId ? `user:${userId}` : `ip:${ip}`;

    // Redis 计数 key：按窗口秒对齐，避免 ttl 边界抖动
    // key 格式：rl:{routeKey}:{tracker}:{floor(now/ttl秒)}
    const windowSec = Math.floor(rule.ttl / 1000) || 1;
    const windowKey = Math.floor(Date.now() / (windowSec * 1000));
    const key = `rl:${routeKey}:${tracker}:${windowKey}`;

    try {
      const count = await this.redis.incr(key);
      // 仅首次设置过期（避免每次请求都 EXPIRE）
      if (count === 1) {
        await this.redis.expire(key, windowSec);
      }
      if (count > rule.limit) {
        // 触发限流：累计违规次数，达阈值自动拉黑（不 await，避免阻塞 429 响应）
        if (ip && ip !== 'unknown') {
          this.maybeAutoBan(ip, routeKey).catch((e) => {
            this.logger.warn(`自动拉黑失败（不影响限流）: ${(e as Error).message}`);
          });
        }
        // Retry-After：告知客户端当前固定窗口还剩多久（此前缺失，前端只能盲等）
        const response = context.switchToHttp().getResponse();
        response?.setHeader?.('Retry-After', String(windowSec));
        throw new HttpException(
          {
            success: false,
            message: '请求过于频繁，请稍后再试',
            statusCode: 429,
          },
          429,
        );
      }
    } catch (err) {
      // Redis 故障时放行（限流降级，不阻断业务）
      if (err instanceof HttpException) throw err;
      this.logger.warn(`Redis 限流计数失败，放行: ${(err as Error).message}`);
    }

    return true;
  }

  /**
   * 累计违规计数，达阈值自动拉黑。
   * - 用独立 Redis key 统计该 IP 在窗口内的违规（触发 429）次数
   * - 达阈值则写入黑名单（临时，30 分钟），reason 标注「系统自动」便于管理员识别
   * - 已在黑名单中的 IP 不重复拉黑（isBlocked 兜底，且避免刷黑名单表）
   */
  private async maybeAutoBan(ip: string, routeKey: string): Promise<void> {
    const violationKey = `rl:violation:${ip}`;
    const vCount = await this.redis.incr(violationKey);
    if (vCount === 1) {
      await this.redis.expire(violationKey, VIOLATION_WINDOW_SEC);
    }

    if (vCount >= VIOLATION_THRESHOLD) {
      // 达阈值：检查是否已在黑名单（避免重复写入 + 刷表）
      const alreadyBanned = await this.blacklistService.isBlocked('ip', ip);
      if (alreadyBanned) return;

      const expiresAt = new Date(Date.now() + AUTO_BAN_DURATION_MIN * 60 * 1000);
      await this.blacklistService.create(
        {
          type: 'ip',
          value: ip,
          reason: `系统自动：限流违规累计 ${vCount} 次（窗口 ${VIOLATION_WINDOW_SEC}s，触发路由 ${routeKey}）`,
          expiresAt: expiresAt.toISOString(),
        },
        // creatorId 省略表示系统自动（区别于管理员手动，admin 能在后台识别）
      );
      // 拉黑后清零违规计数（该 IP 已封，计数无意义，重新计数从解封后开始）
      await this.redis.del(violationKey);
      this.logger.warn(
        `IP ${ip} 因限流违规累计 ${vCount} 次被自动拉黑 ${AUTO_BAN_DURATION_MIN} 分钟`,
      );
    }
  }
}
