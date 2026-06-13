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
      const roles = await this.getUserRoles(Number(payload.sub));
      request.user = { ...payload, roles };
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

  private async getUserRoles(userId: number): Promise<string[]> {
    const rows = await this.dataSource.query(
      `SELECT r.name FROM roles r
       INNER JOIN user_roles ur ON r.id = ur.role_id
       WHERE ur.user_id = ?`,
      [userId],
    );
    return rows.map((r: any) => r.name);
  }
}
