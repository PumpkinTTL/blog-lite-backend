import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SettingService } from '../../modules/setting/setting.service';
import { parseSettingBool } from '../utils/parse-setting-bool';

/**
 * 维护模式 Guard（全局，只读策略）。
 *
 * 策略（maintenance.enabled=true 时）：
 * - admin 全放行（管理员要能登录后台、关闭维护模式）
 * - 所有 GET 放行（前台可读，不破坏浏览体验）
 * - 登录/登出/刷新等认证接口放行（否则无法登录维护）
 * - 其余写操作（POST/PUT/DELETE/PATCH）拒绝，返回 503
 *
 * 判定 admin：读 req.user.roles。
 * 认证接口放行：按 @Public 标记 + 路径白名单（需兼容 globalPrefix / 代理前缀）。
 */
@Injectable()
export class MaintenanceGuard implements CanActivate {
  private readonly logger = new Logger(MaintenanceGuard.name);

  // 维护期间仍需放行的认证路径（不含 globalPrefix）
  private readonly AUTH_ALLOWLIST = [
    '/user/login',
    '/user/register',
    '/user/refresh',
    '/user/logout',
    '/user/client-login',
    '/user/send-login-code',
    '/user/login-by-code',
    '/user/send-reset-code',
    '/user/reset-password-by-code',
    // 维护期注册链路完整性：register 放行但强制邮箱验证码，
    // 发码接口不放行=维护期注册死路（审查第5轮·配置矩阵 M3）
    '/user/send-register-code',
    // 邀请码预校验（register 流程步骤，语义应与 register 同进退）
    '/code/verify',
  ];

  constructor(
    private readonly reflector: Reflector,
    private readonly settingService: SettingService,
  ) {}

  private normalizePath(req: { path?: string; originalUrl?: string; url?: string }): string {
    const raw = req.originalUrl || req.url || req.path || '';
    const withoutQuery = raw.split('?')[0].split('#')[0];
    // 去掉可能的 globalPrefix /api（生产网关会剥掉，但本地直连可能保留）
    return withoutQuery.replace(/^\/api(?=\/)/, '') || '/';
  }

  private isAuthAllowlisted(path: string): boolean {
    return this.AUTH_ALLOWLIST.some((p) => path === p || path.startsWith(p + '/') || path.startsWith(p + '?'));
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const enabledRow = await this.settingService.findByKey('maintenance.enabled');
    const enabled = parseSettingBool(enabledRow?.value, false);
    if (!enabled) return true;

    const request = context.switchToHttp().getRequest();
    const method: string = request.method;

    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;

    const user = request.user;
    const userRoles: string[] = user?.roles || [];
    if (userRoles.includes('admin')) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      const path = this.normalizePath(request);
      if (this.isAuthAllowlisted(path)) return true;
    }

    this.logger.warn(`维护模式拦截写操作: ${method} ${this.normalizePath(request)}`);
    throw new HttpException(
      {
        success: false,
        message: '站点维护中，暂时无法操作，请稍后再试',
        statusCode: 503,
      },
      503,
    );
  }
}
