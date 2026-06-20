import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { BlacklistService } from '../../modules/blacklist/blacklist.service';

/**
 * 黑名单 Guard：在 AuthGuard 之后执行，只拦截 IP 维度封禁。
 * 用户维度封禁已迁移到 user.status + banned_until（由 AuthGuard 统一拦截），
 * 故本 Guard 不再查询用户黑名单。
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

    return true;
  }
}
