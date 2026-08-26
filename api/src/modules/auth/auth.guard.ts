import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuthService } from './auth.service';
import { CasdoorService } from './casdoor.service';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

/** TypeORM/驱动层错误名（DB 故障时不应伪装成 401 把全体用户登出） */
const DB_ERROR_NAMES = new Set([
  'QueryFailedError',
  'ConnectionNotFoundError',
  'CannotExecuteNotConnectedError',
  'TransactionNotStartedError',
]);

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

    let payload: Record<string, unknown>;
    let roleInfo: { roleNames: string[]; roleIds: number[] };
    try {
      payload = await this.authService.verifyToken(authHeader.slice(7));
      roleInfo = await this.getUserRoles(Number(payload.sub));
    } catch (error) {
      // 公开接口 token 无效 → 当未登录放行
      if (isPublic) {
        return true;
      }
      // DB 故障（连接抖动/超时）≠ token 无效：报 503 让前端走重试退避，
      // 报 401 会被前端理解为登录过期 → 触发 refresh → 同样查库失败 →
      // 强制登出，一次数据库抖动演变成全站集体登出
      const errName = (error as Error)?.constructor?.name ?? '';
      const isDbError =
        DB_ERROR_NAMES.has(errName) ||
        (error as Error)?.message?.includes('ECONNREFUSED') ||
        (error as Error)?.message?.includes('ETIMEDOUT');
      if (isDbError) {
        this.logger.error(`鉴权时数据库不可用: ${(error as Error).message}`);
        throw new ServiceUnavailableException('服务暂时不可用，请稍后重试');
      }
      this.logger.warn(`Token 验证失败: ${(error as Error).message}`);
      throw new UnauthorizedException('Token 无效或已过期');
    }
    request.user = { ...payload, roles: roleInfo.roleNames, roleIds: roleInfo.roleIds };
    return true;
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
        // 条件更新（带原值乐观锁）：读到过期快照后、UPDATE 落地前，管理员可能
        // 恰好对该用户下达新的永久封禁（banned_until 置 NULL）——无条件 UPDATE
        // 会把新封禁静默覆盖成 active（丢失更新）。带原值条件后输了就重新走判定。
        const upd = await this.dataSource.query(
          `UPDATE users SET status = 'active', banned_until = NULL
           WHERE id = ? AND status = 'disabled' AND banned_until = ?`,
          [userId, bannedUntil],
        );
        if (!upd.affectedRows) {
          // 条件未命中：并发被改写（新封禁/已解封），按当前最新状态重新判定
          const fresh = await this.dataSource.query(
            `SELECT status FROM users WHERE id = ?`,
            [userId],
          );
          if (fresh[0]?.status !== 'active') {
            throw new UnauthorizedException('账号已被禁用');
          }
        }
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
