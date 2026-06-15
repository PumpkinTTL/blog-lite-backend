import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { BlacklistService } from '../../modules/blacklist/blacklist.service';

/**
 * 黑名单 Guard：在 AuthGuard 之后执行（能读到 req.user.sub）
 * 命中 active 且未过期的 IP/用户 → 抛 403 ForbiddenException
 * 性能：BlacklistService.isBlocked 带 30s 内存缓存
 */
@Injectable()
export class BlacklistGuard implements CanActivate {
  constructor(private readonly blacklistService: BlacklistService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // IP 维度（匿名也查）
    const ip =
      request.ip ||
      request.headers?.['x-forwarded-for']?.toString() ||
      'unknown';
    if (ip && ip !== 'unknown') {
      const ipBlocked = await this.blacklistService.isBlocked('ip', ip);
      if (ipBlocked) {
        throw new ForbiddenException('您的访问已被限制');
      }
    }

    // 用户维度（已登录才查）
    const userId = request.user?.sub;
    if (userId) {
      const userBlocked = await this.blacklistService.isBlocked(
        'user',
        String(userId),
      );
      if (userBlocked) {
        throw new ForbiddenException('您的账号已被限制访问');
      }
    }

    return true;
  }
}
