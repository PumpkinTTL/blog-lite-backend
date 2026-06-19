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
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly authService: AuthService,
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
   */
  private async getUserRoles(
    userId: number,
  ): Promise<{ roleNames: string[]; roleIds: number[] }> {
    // 先独立查用户 status（不能用 INNER JOIN roles，否则无角色的用户 rows 为空会绕过校验）
    const userRows = await this.dataSource.query(
      `SELECT status FROM users WHERE id = ?`,
      [userId],
    );
    if (userRows.length === 0) {
      throw new UnauthorizedException('用户不存在');
    }
    if (userRows[0].status !== 'active') {
      throw new UnauthorizedException('账号已被禁用');
    }
    // 再查角色（LEFT JOIN 保证无角色用户也能通过 status 校验）
    const rows = await this.dataSource.query(
      `SELECT r.id, r.name FROM roles r
       INNER JOIN user_roles ur ON r.id = ur.role_id
       WHERE ur.user_id = ?`,
      [userId],
    );
    return {
      roleNames: rows.map((r: any) => r.name),
      roleIds: rows.map((r: any) => r.id),
    };
  }
}
