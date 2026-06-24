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
import { RateLimitConfigService } from './rate-limit-config.service';

/**
 * 用户维度限流 Guard（全局，鉴权后执行）
 *
 * 与 RateLimitGuard（IP 维度，鉴权前）配合：
 * - RateLimitGuard 排在 AuthGuard 之前，request.user 还没挂载，
 *   只能做 IP 维度限流（挡匿名洪水）
 * - 本 Guard 排在 AuthGuard 之后，request.user 已挂载，
 *   对已登录用户按 user id 限流（挡已登录用户刷接口）
 *
 * 两者共用同一套 routeKey 和阈值配置，但 Redis key 前缀不同避免互相干扰。
 * 若未登录（无 user），本 Guard 直接放行（IP 维度已由 RateLimitGuard 覆盖）。
 */
@Injectable()
export class RateLimitUserGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitUserGuard.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: RateLimitConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.sub;
    // 未登录用户：IP 维度已由 RateLimitGuard 覆盖，这里直接放行
    if (!userId) return true;

    const routeKey =
      context.getClass().name + '.' + context.getHandler().name;
    const rule = this.configService.getRule(routeKey);

    // 用户维度计数 key（前缀 rlu 区别于 IP 维度的 rl）
    const windowSec = Math.floor(rule.ttl / 1000) || 1;
    const windowKey = Math.floor(Date.now() / (windowSec * 1000));
    const key = `rlu:${routeKey}:user:${userId}:${windowKey}`;

    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, windowSec);
      }
      if (count > rule.limit) {
        throw new HttpException(
          {
            success: false,
            message: '操作过于频繁，请稍后再试',
            statusCode: 429,
          },
          429,
        );
      }
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.warn(`Redis 用户限流计数失败，放行: ${(err as Error).message}`);
    }

    return true;
  }
}
