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

/**
 * 限流 Guard（全局）
 *
 * - routeKey = 类名.方法名（如 UserController.login）
 * - tracker：已登录 user:<id>，匿名 ip:<ip>
 * - Redis 计数：INCR key，首次设 EXPIRE
 * - 阈值从 RateLimitConfigService 读内存（零开销，热更新）
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: RateLimitConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // 路由标识
    const routeKey =
      context.getClass().name + '.' + context.getHandler().name;

    // 取阈值（内存，零开销）
    const rule = this.configService.getRule(routeKey);

    // tracker 维度
    const userId = request.user?.sub;
    const tracker = userId
      ? `user:${userId}`
      : `ip:${request.ip || request.headers?.['x-forwarded-for']?.toString() || 'unknown'}`;

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
}
