import { Injectable, UnauthorizedException, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { UserEntity } from './user.entity';
import { RoleEntity } from './role.entity';
import { LoginDto } from './login.dto';
import { RegisterDto, ClientLoginDto } from './register.dto';
import { USER_STATUS } from '../../common/constants/status';
import { UpdateProfileDto } from './user.dto';
import { AuthService } from '../auth/auth.service';
import { CodeService } from '../code/code.service';
import { CodeEntity } from '../code/code.entity';
import { CodeUsageLogEntity } from '../code/code-usage-log.entity';
import { MembershipService } from '../membership/membership.service';
import { applyFilters } from '../../common/utils/apply-filters';
import { AuditLogService } from '../audit-log/audit-log.service';
import { MediaService } from '../media/media.service';

export interface TokenPayload {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  deviceId: string;
}

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly codeService: CodeService,
    private readonly membershipService: MembershipService,
    private readonly dataSource: DataSource,
    private readonly auditLog: AuditLogService,
    private readonly mediaService: MediaService,
  ) {}

  /**
   * 管理员登录：
   * 1. 查用户（带角色）
   * 2. 校验密码
   * 3. 调用鉴权中心 POST /auth/token 签发双 Token
   */
  async login(
    dto: LoginDto,
    clientFingerprint: string,
    clientIp: string,
  ): Promise<TokenPayload> {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.roles', 'r')
      .addSelect('u.password')
      .where('u.username = :username', { username: dto.username })
      .getOne();

    if (!user || user.status !== USER_STATUS.ACTIVE) {
      // 临时封禁已过期 → 惰性自动解封（login 不走 AuthGuard，需在此处处理，
      // 否则临时封禁过期的用户登录会死锁：登录被拒 → 拿不到 token → 无法触发 AuthGuard 解封）
      if (
        user &&
        user.status === USER_STATUS.DISABLED &&
        user.bannedUntil &&
        user.bannedUntil < new Date()
      ) {
        await this.userRepo.update(user.id, {
          status: USER_STATUS.ACTIVE,
          bannedUntil: null,
        });
        user.status = USER_STATUS.ACTIVE;
        user.bannedUntil = null;
      } else {
        throw new UnauthorizedException('账号不存在或已禁用');
      }
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);
    if (!passwordValid) {
      throw new UnauthorizedException('密码错误');
    }

    // 设备指纹 = hash(浏览器指纹 + IP)
    const deviceId = crypto
      .createHash('sha256')
      .update(`${clientFingerprint}-${clientIp}`)
      .digest('hex');

    // 收集角色信息传给鉴权中心，后续 AT payload 里会带上
    const roles = user.roles.map((r) => r.name);

    const accessTtl = this.configService.get<number>('ACCESS_TOKEN_TTL', 3600);
    const refreshTtl = this.configService.get<number>(
      'REFRESH_TOKEN_TTL',
      604800,
    );

    const tokenData = await this.authService.issueToken(
      user.id,
      deviceId,
      { roles, nickname: user.nickname },
      undefined,
      accessTtl,
      refreshTtl,
    );

    this.logger.log(
      `用户 ${user.username} 登录成功，角色: [${roles.join(', ')}]`,
    );

    return {
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresIn: tokenData.expiresIn,
      deviceId,
    };
  }

  /**
   * 根据邮箱查找用户
   */
  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.userRepo
      .createQueryBuilder('u')
      .where('u.email = :email', { email })
      .getOne();
  }

  // ===== CRUD =====

  async findAll(
    page = 1,
    pageSize = 20,
    filters?: { id?: number; keyword?: string; status?: number },
  ) {
    const qb = this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.roles', 'roles');
    applyFilters(qb, {
      exact: { 'u.id': filters?.id, 'u.status': filters?.status },
      like: { keyword: filters?.keyword, fields: ['u.username', 'u.nickname'] },
    });
    qb.orderBy('u.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [list, total] = await qb.getManyAndCount();

    // 批量查会员等级（避免 N+1）
    const userIds = list.map((u) => u.id);
    const membershipMap =
      await this.membershipService.getHighestActiveBatch(userIds);
    const enrichedList = list.map((u) => ({
      ...u,
      membership: membershipMap.get(u.id) || null,
    }));

    return { list: enrichedList, total, page, pageSize };
  }

  async findById(id: number) {
    const user = await this.userRepo.findOne({
      where: { id },
      relations: ['roles'],
    });
    if (!user) throw new NotFoundException('用户不存在');
    return user;
  }

  async create(data: Partial<UserEntity> & { roleIds?: number[] }) {
    const { roleIds, password, ...userData } = data;
    const user = this.userRepo.create(userData);

    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }

    if (roleIds?.length) {
      user.roles = await this.roleRepo.findBy({ id: In(roleIds) });
    }

    return this.userRepo.save(user);
  }

  async update(
    id: number,
    data: Partial<UserEntity> & { roleIds?: number[]; password?: string },
    operator?: { id: number; nickname: string },
  ) {
    const { roleIds, password, ...userData } = data;

    const user = await this.userRepo.findOne({
      where: { id },
      relations: ['roles'],
    });
    if (!user) throw new NotFoundException('用户不存在');

    // 变更审计
    const targetName = `${user.nickname || user.username}(#${id})`;
    const oldRoleIds =
      user.roles
        ?.map((r) => r.id)
        .sort((a, b) => a - b)
        .join(',') || '';
    const newRoleIds =
      roleIds !== undefined
        ? [...roleIds].sort((a, b) => a - b).join(',')
        : null;

    const entries = AuditLogService.diff(
      'user',
      id,
      {
        avatar: user.avatar,
        nickname: user.nickname,
        email: user.email,
        status: user.status,
      },
      {
        avatar: userData.avatar,
        nickname: userData.nickname,
        email: userData.email,
        status: userData.status,
      },
      ['avatar', 'nickname', 'email', 'status'],
      {
        operatorId: operator?.id,
        operatorName: operator?.nickname,
        targetName,
      },
    );
    if (password)
      entries.push({
        targetType: 'user',
        targetId: id,
        field: 'password',
        note: '密码已修改',
        targetName,
        operatorId: operator?.id,
        operatorName: operator?.nickname,
      });
    // 角色变更单独审计（避免静默提权）
    if (newRoleIds !== null && newRoleIds !== oldRoleIds) {
      entries.push({
        targetType: 'user',
        targetId: id,
        field: 'roleIds',
        oldValue: oldRoleIds,
        newValue: newRoleIds,
        note: `角色变更：${oldRoleIds || '空'} → ${newRoleIds || '空'}`,
        targetName,
        operatorId: operator?.id,
        operatorName: operator?.nickname,
      });
    }
    this.auditLog
      .logMany(entries)
      .catch((e) => this.logger.warn('审计日志写入失败', e));

    Object.assign(user, userData);

    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }

    if (roleIds !== undefined) {
      user.roles = roleIds.length
        ? await this.roleRepo.findBy({ id: In(roleIds) })
        : [];
    }

    return this.userRepo.save(user);
  }

  async remove(id: number, currentUserId?: number) {
    // 不能删除自己
    if (currentUserId !== undefined && id === currentUserId) {
      throw new BadRequestException('不能删除自己');
    }

    const user = await this.userRepo.findOne({
      where: { id },
      relations: ['roles'],
    });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    // 不能删除管理员
    const hasAdmin = user.roles?.some((r) => r.name === 'admin');
    if (hasAdmin) {
      throw new BadRequestException(
        `用户「${user.nickname || user.username}」是管理员，不能删除`,
      );
    }

    // 清理用户头像文件
    if (user.avatar) {
      await this.deleteMediaByUrl(user.avatar);
    }

    await this.userRepo.delete(id);
  }

  async batchRemove(ids: number[], currentUserId: number): Promise<void> {
    if (ids.includes(currentUserId)) {
      throw new BadRequestException('不能删除自己');
    }

    const users = await this.userRepo.find({
      where: { id: In(ids) },
      relations: ['roles'],
    });

    for (const user of users) {
      const hasAdmin = user.roles?.some((r) => r.name === 'admin');
      if (hasAdmin) {
        throw new BadRequestException(
          `用户「${user.nickname || user.username}」是管理员，不能删除`,
        );
      }
    }

    // 清理所有头像文件
    for (const user of users) {
      if (user.avatar) {
        await this.deleteMediaByUrl(user.avatar).catch(e =>
          this.logger.warn(`删除用户头像文件失败: ${e.message}`),
        );
      }
    }

    await this.userRepo.delete(ids);
  }

  /** 根据 URL 删除对应的 media 记录及 R2 文件 */
  private async deleteMediaByUrl(url: string): Promise<void> {
    const media = await this.mediaService.findByUrl(url);
    if (media) {
      await this.mediaService.remove(media.id);
      this.logger.log(`已删除关联文件: ${url}`);
    }
  }

  /**
   * 切换用户状态（启用/禁用）。
   * - 封禁（active→disabled）：设 bannedUntil，调鉴权中心吊销其所有 Token，写审计日志（含封禁原因）。
   * - 解封（disabled→active）：清空 bannedUntil，写审计日志。
   * 吊销失败时容错降级（仅 warn），不阻塞封禁——AuthGuard 查 status 已兜底。
   */
  async toggleStatus(
    id: number,
    opts?: { reason?: string; bannedUntil?: Date | null },
    operator?: { id: number; nickname: string },
  ): Promise<UserEntity> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const oldStatus = user.status;
    const willDisable = oldStatus === USER_STATUS.ACTIVE;
    user.status = willDisable ? USER_STATUS.DISABLED : USER_STATUS.ACTIVE;

    if (willDisable) {
      // 封禁：设封禁截止时间（null=永久）
      user.bannedUntil = opts?.bannedUntil ?? null;
    } else {
      // 解封：清空封禁截止时间
      user.bannedUntil = null;
    }

    const targetName = `${user.nickname || user.username}(#${id})`;

    // 封禁时调鉴权中心吊销该用户所有 Token（堵死 refresh 续命）
    if (willDisable) {
      await this.authService.revokeUserTokens(id);
    }

    // 写审计日志（含封禁原因，便于事后追溯）
    const banDurationText =
      willDisable && user.bannedUntil
        ? `，到期 ${new Date(user.bannedUntil).toLocaleString('zh-CN')}`
        : '';
    const note = willDisable
      ? `封禁原因：${opts?.reason || '未填写'}${banDurationText}`
      : '解除封禁';
    this.auditLog
      .log({
        targetType: 'user',
        targetId: id,
        field: 'status',
        oldValue: oldStatus,
        newValue: user.status,
        note,
        targetName,
        operatorId: operator?.id,
        operatorName: operator?.nickname,
      })
      .catch((e) => this.logger.warn('审计日志写入失败', e));

    return this.userRepo.save(user);
  }

  /**
   * 用户端注册：
   * 1. 检查用户名是否已存在
   * 2. 检查邀请码是否有效
   * 3. 事务内：消费邀请码（条件更新防超发）+ 创建用户（密码哈希）+ 分配默认角色
   * 4. 事务外：签发 Token（外部 HTTP，避免事务期间占用 DB 连接）
   */
  async register(
    dto: RegisterDto,
    clientFingerprint: string,
    clientIp: string,
  ): Promise<TokenPayload> {
    // 1. 检查用户名是否已存在
    const existingUser = await this.userRepo.findOne({
      where: { username: dto.username },
    });
    if (existingUser) {
      throw new BadRequestException('用户名已存在');
    }

    // 2. 检查邀请码是否有效
    const verifyResult = await this.codeService.verifyCode({
      code: dto.invitationCode,
      type: 'invitation',
    });
    if (!verifyResult.valid) {
      throw new BadRequestException(verifyResult.message || '邀请码无效');
    }

    const codeEntity = verifyResult.code!;

    // 3. 事务内：消费邀请码 + 创建用户（只做 DB 操作，不含外部调用）
    const { userId, nickname } = await this.dataSource.transaction(
      async (manager) => {
        // 查询默认角色（user）
        const userRole = await manager.findOne(RoleEntity, {
          where: { name: 'user' },
        });
        if (!userRole) {
          throw new NotFoundException('默认角色 user 不存在');
        }

        // 邀请码并发安全消费：条件更新，usedCount 未达上限才能 +1。
        // affectedRows=0 表示已被并发抢光，回滚事务。
        const consumeResult = await manager
          .createQueryBuilder()
          .update(CodeEntity)
          .set({
            usedCount: () => 'usedCount + 1',
            usedAt: new Date(),
            status: () =>
              codeEntity.maxUses > 0 &&
              codeEntity.usedCount + 1 >= codeEntity.maxUses
                ? "'used'"
                : 'status',
          })
          .where('id = :id', { id: codeEntity.id })
          // maxUses=0 表示不限次；否则 usedCount 必须 < maxUses
          .andWhere(
            codeEntity.maxUses > 0
              ? 'usedCount < :maxUses'
              : '1 = 1',
            { maxUses: codeEntity.maxUses },
          )
          .execute();

        if (consumeResult.affected === 0) {
          throw new BadRequestException('邀请码已被使用完毕');
        }

        // 创建用户
        const user = manager.create(UserEntity, {
          username: dto.username,
          nickname: dto.nickname,
          password: await bcrypt.hash(dto.password, 10),
          email: dto.email || null,
          avatar: dto.avatar || null,
          status: USER_STATUS.ACTIVE,
          registerIp: clientIp,
          registerSource: dto.registerSource || 'web',
          registerCodeId: codeEntity.id,
          lastLoginAt: new Date(),
        });
        user.roles = [userRole];

        await manager.save(user);

        // 记录邀请码使用日志
        await manager.insert(CodeUsageLogEntity, {
          codeId: codeEntity.id,
          userId: user.id,
          usedAt: new Date(),
          clientIp,
          metadata: { action: 'register' },
          createdAt: new Date(),
        });

        return { userId: user.id, nickname: user.nickname };
      },
    );

    // 4. 事务外签发 Token（外部 HTTP 调用，不占用 DB 连接）
    const deviceId = crypto
      .createHash('sha256')
      .update(`${clientFingerprint}-${clientIp}`)
      .digest('hex');

    const accessTtl = this.configService.get<number>('ACCESS_TOKEN_TTL', 3600);
    const refreshTtl = this.configService.get<number>(
      'REFRESH_TOKEN_TTL',
      604800,
    );

    // issueToken 失败时用户已落库（事务已提交），不能让用户以为注册失败。
    // 捕获后返回明确提示：账号已创建，需重新登录获取 Token。
    let tokenData;
    try {
      tokenData = await this.authService.issueToken(
        userId,
        deviceId,
        { roles: ['user'], nickname },
        undefined,
        accessTtl,
        refreshTtl,
      );
    } catch (e) {
      this.logger.error(
        `用户 ${dto.username}(#${userId}) 注册成功但签发 Token 失败: ${e instanceof Error ? e.message : e}`,
      );
      throw new BadRequestException(
        '注册成功，但登录凭证签发失败，请使用刚注册的账号登录',
      );
    }

    this.logger.log(`用户 ${dto.username} 注册成功`);

    return {
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresIn: tokenData.expiresIn,
      deviceId,
    };
  }

  /**
   * 用户端登录（复用管理端登录逻辑）
   */
  async clientLogin(
    dto: ClientLoginDto,
    clientFingerprint: string,
    clientIp: string,
  ): Promise<TokenPayload> {
    // 复用现有的 login 方法
    return this.login(
      { username: dto.username, password: dto.password },
      dto.fingerprint || clientFingerprint,
      clientIp,
    );
  }

  /**
   * 用户端登出（清理本地 Token，后端暂无操作）
   */
  async logout(userId: number, refreshToken?: string): Promise<void> {
    // 调鉴权中心吊销 refreshToken（删除 Redis 中的会话）
    if (refreshToken) {
      try {
        await this.authService.revokeToken(refreshToken);
      } catch (e) {
        // 吊销失败不阻塞登出流程（token 自然过期）
        this.logger.warn(
          `用户 ${userId} 登出吊销 Token 失败: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
    // 更新最后登录时间
    await this.userRepo.update(userId, { lastLoginAt: new Date() });
    this.logger.log(`用户 ${userId} 登出`);
  }

  /**
   * 刷新 Token：调用鉴权中心刷新双 Token
   */
  async refreshToken(
    refreshToken: string,
    deviceId: string,
  ): Promise<TokenPayload> {
    let tokenData;
    try {
      tokenData = await this.authService.refreshToken(
        refreshToken,
        deviceId,
      );
    } catch {
      // 鉴权中心拒绝（refreshToken 已被吊销/过期/不存在）→ 统一转 401，
      // 让前端走"登录过期"流程，而不是暴露 500
      throw new UnauthorizedException('登录已过期，请重新登录');
    }
    return {
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresIn: tokenData.expiresIn,
      deviceId,
    };
  }

  async getProfile(userId: number) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['roles'],
    });
    if (!user) throw new NotFoundException('用户不存在');
    return user;
  }

  async updateProfile(userId: number, data: UpdateProfileDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    Object.assign(user, data);
    return this.userRepo.save(user);
  }

  async resetPassword(id: number, newPassword: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    user.password = await bcrypt.hash(newPassword, 10);
    return this.userRepo.save(user);
  }
}
