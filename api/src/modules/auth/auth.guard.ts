import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuthService } from './auth.service';
import { CasdoorService } from './casdoor.service';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly authService: AuthService,
    private readonly casdoor: CasdoorService,
    private readonly reflector: Reflector,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    // 公开接口无 token → 直接放行
    if (isPublic && !authHeader?.startsWith('Bearer ')) {
      return true;
    }

    // 非公开接口无 token → 401
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少 Authorization 头');
    }

    try {
      const payload = await this.authService.verifyToken(authHeader.slice(7));
      const { roleNames, roleIds } = await this.getUserRoles(
        Number(payload.sub),
      );
      request.user = { ...payload, roles: roleNames, roleIds };
      return true;
    } catch (error) {
      // 公开接口 token 无效 → 当未登录放行
      if (isPublic) {
        return true;
      }
      this.logger.warn(`Token 验证失败: ${(error as Error).message}`);
      throw new UnauthorizedException('Token 无效或已过期');
    }
  }

  /**
   * 查询用户角色，同时返回 roleNames（用于 @Roles 装饰器）和 roleIds（用于可见性校验）。
   * 同时校验用户当前 status：禁用用户即使 Token 未过期也拒绝访问（防止禁用后仍可操作）。
   * 若为临时封禁且已过期，则惰性自动解封。
   */
  private async getUserRoles(
    userId: number,
  ): Promise<{ roleNames: string[]; roleIds: number[] }> {
    // 一次查询拿到 status + 所有角色（LEFT JOIN 保证无角色用户也能返回 status）
    const rows = await this.dataSource.query(
      `SELECT u.status, u.banned_until, r.id AS roleId, r.name AS roleName
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = ?`,
      [userId],
    );
    if (rows.length === 0) {
      throw new UnauthorizedException('用户不存在');
    }
    const status = rows[0].status;
    if (status !== 'active') {
      // 临时封禁已过期 → 惰性自动解封（无需 cron）
      const bannedUntil = rows[0].banned_until;
      if (bannedUntil && new Date(bannedUntil) < new Date()) {
        await this.dataSource.query(
          `UPDATE users SET status = 'active', banned_until = NULL WHERE id = ?`,
          [userId],
        );
        // 解封同步 Casdoor（审查 P0：否则 passwordGrant 仍被拒，用户永久锁死）。
        // fire-and-forget：本地 status 是权威，同步失败不阻塞本次请求。
        if (this.casdoor.enabled) {
          this.casdoor
            .setCasdoorUserForbidden(userId, false)
            .catch((e) =>
              this.logger.warn(
                `解封同步 Casdoor 失败 userId=${userId}: ${e instanceof Error ? e.message : e}`,
              ),
            );
        }
      } else {
        throw new UnauthorizedException('账号已被禁用');
      }
    }
    // 过滤掉无角色行（LEFT JOIN 无角色时 roleId 为 null）
    const roles = rows.filter((r: any) => r.roleId != null);
    return {
      roleNames: roles.map((r: any) => r.roleName),
      roleIds: roles.map((r: any) => r.roleId),
    };
  }
}
