import { Injectable, UnauthorizedException, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { UserEntity } from './user.entity';
import { RoleEntity } from './role.entity';
import { LoginDto } from './login.dto';
import { RegisterDto, ClientLoginDto } from './register.dto';
import { USER_STATUS } from '../../common/constants/status';
import { UpdateProfileDto } from './user.dto';
import { AuthService } from '../auth/auth.service';
import type { AuthTokenResponse } from '../auth/auth.service';
import { CodeService } from '../code/code.service';
import { CodeEntity } from '../code/code.entity';
import { CodeUsageLogEntity } from '../code/code-usage-log.entity';
import { MembershipService } from '../membership/membership.service';
import { MembershipEntity } from '../membership/membership.entity';
import { InteractionEntity } from '../interaction/interaction.entity';
import { PostEntity } from '../post/post.entity';
import { applyFilters } from '../../common/utils/apply-filters';
import { AuditLogService } from '../audit-log/audit-log.service';
import { MediaService } from '../media/media.service';
import { EmailCodeService } from '../email-code/email-code.service';

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
    private readonly emailCodeService: EmailCodeService,
  ) {}

  /**
   * 管理员登录：
   * 1. 查用户（带角色）
   * 2. 校验密码
   * 3. 调用鉴权中心 POST /auth/token 签发双 Token
   *
   * deviceId 由前端生成（crypto.randomUUID，存 localStorage），续签时原样回传。
   * 不再由后端 IP 派生——IP 会变（切 WiFi/移动网络），导致续签时 deviceId 不一致
   * 被鉴权中心拒绝。clientIp 仅用于审计日志，不参与 deviceId 计算。
   */
  /**
   * 统一的登录失败消息。
   * 账号不存在 / 账号禁用 / 密码错误 一律返回同一句话，
   * 避免攻击者通过差异化提示枚举有效用户名。
   */
  private static readonly LOGIN_FAIL_MSG = '用户名或密码错误';

  /**
   * 一个真实的 bcrypt 占位哈希（cost=10），用于账号不存在时执行一次
   * 假比较，使「用户不存在」与「密码错误」两个分支耗时一致，防时序攻击。
   * （bcrypt.compare 对任意输入都会跑完整哈希流程）
   */
  private static readonly DUMMY_HASH =
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

  async login(
    dto: LoginDto,
    deviceId: string,
    clientFingerprint: string,
    clientIp: string,
  ): Promise<TokenPayload> {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.roles', 'r')
      .addSelect('u.password')
      .where('u.username = :username', { username: dto.username })
      .getOne();

    // 临时封禁已过期 → 惰性自动解封（login 不走 AuthGuard，需在此处理，
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
    }

    // 恒定时间防时序攻击：无论用户存不存在/状态是否正常，都执行一次 bcrypt 比较，
    // 让各分支耗时一致，攻击者无法通过响应快慢判断用户名是否存在。
    // 只有「存在 + 状态正常」才用真实 hash，否则用 DUMMY_HASH（必 false 但耗时相当）。
    const canLogin = user && user.status === USER_STATUS.ACTIVE;
    const passwordValid = await bcrypt.compare(
      dto.password,
      canLogin ? user.password : UserService.DUMMY_HASH,
    );

    // 用户不存在 / 密码错误 / 账号被长期禁用，一律返回同一句模糊消息，
    // 避免攻击者通过差异化提示枚举有效用户名。
    if (!canLogin || !passwordValid) {
      throw new UnauthorizedException(UserService.LOGIN_FAIL_MSG);
    }

    // 收集角色信息传给鉴权中心，后续 AT payload 里会带上
    const roles = user.roles.map((r) => r.name);

    const accessTtl = this.configService.get<number>('ACCESS_TOKEN_TTL', 3600);
    const refreshTtl = this.configService.get<number>(
      'REFRESH_TOKEN_TTL',
      604800,
    );

    const tokenData = await this.issueLoginToken(
      user,
      deviceId,
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
   * 登录/注册后统一签发 Token（login + loginByCode 共用）。
   * 包装 authService.issueToken，捕获签发失败转成友好提示，
   * 避免鉴权中心不可用时把内部 Error 透传成 500。
   * 返回 AuthTokenResponse（不含 deviceId，由调用方拼成完整 TokenPayload）。
   */
  private async issueLoginToken(
    user: UserEntity,
    deviceId: string,
    accessTtl: number,
    refreshTtl: number,
  ): Promise<AuthTokenResponse> {
    const roles = (user.roles || []).map((r) => r.name);
    try {
      return await this.authService.issueToken(
        user.id,
        deviceId,
        { roles, nickname: user.nickname },
        undefined,
        accessTtl,
        refreshTtl,
      );
    } catch (err) {
      this.logger.error(
        `签发 Token 失败 userId=${user.id}: ${err.message}`,
      );
      throw new BadRequestException('登录服务暂时不可用，请稍后重试');
    }
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

    // 级联清理：comments 和 user_roles 有 FK CASCADE 会随用户删除自动清理，
    // 但 interactions / memberships / code_usage_logs 是裸列无 FK，需手动清。
    // interactions 清理后还要回算受影响文章的 likeCount/favoriteCount，否则计数虚高。
    await this.dataSource.transaction(async (manager) => {
      // 1. 收集该用户所有 post 互动（点赞/收藏），用于删除后回算文章计数
      const userInteractions = await manager.find(InteractionEntity, {
        where: { userId: id, entityType: 'post' },
      });
      const affectedPostIds = new Set(
        userInteractions.map((i) => i.entityId),
      );
      const affectedTypes = new Set(userInteractions.map((i) => i.type));

      // 2. 删 interactions（孤儿数据）
      await manager.delete(InteractionEntity, { userId: id });

      // 3. 删 memberships（避免已删用户在会员列表残留）
      await manager.delete(MembershipEntity, { userId: id });

      // 4. 删 code_usage_logs（兑换记录，避免引用已删用户）
      await manager.delete(CodeUsageLogEntity, { userId: id });

      // 5. 回算受影响文章的 likeCount/favoriteCount（用户删了，计数要扣掉）
      for (const postId of affectedPostIds) {
        for (const type of affectedTypes) {
          const count = await manager.count(InteractionEntity, {
            where: { entityType: 'post', entityId: postId, type },
          });
          const patch =
            type === 'like' ? { likeCount: count } : { favoriteCount: count };
          await manager.update(PostEntity, { id: postId }, patch as any);
        }
      }

      // 6. 清理用户头像文件（事务外删文件不安全，放事务内先记 URL）
      // 7. 删用户（comments/user_roles 因 FK CASCADE 自动删）
      await manager.delete(UserEntity, { id });
    });

    // 头像文件删除放事务外（OSS 调用不应在 DB 事务里）
    if (user.avatar) {
      await this.deleteMediaByUrl(user.avatar).catch((e) =>
        this.logger.warn(`删除用户 ${id} 头像文件失败: ${e.message}`),
      );
    }
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
      // 校验：临时封禁的截止时间必须在未来，否则封禁一瞬即过期，AuthGuard 惰性解封会让封禁形同无效
      const bannedUntil = opts?.bannedUntil ?? null;
      if (bannedUntil) {
        const banDate = new Date(bannedUntil);
        if (isNaN(banDate.getTime())) {
          throw new BadRequestException('封禁截止时间格式无效');
        }
        if (banDate.getTime() <= Date.now()) {
          throw new BadRequestException('封禁截止时间必须晚于当前时间');
        }
      }
      user.bannedUntil = bannedUntil;
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
    deviceId: string,
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

    // 1.1 检查邮箱是否已被注册（友好提示，避免触发数据库 unique 约束的原生报错）
    if (dto.email) {
      const existingEmail = await this.findByEmail(dto.email);
      if (existingEmail) {
        throw new BadRequestException('该邮箱已被注册，若忘记密码请重置');
      }
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
    // deviceId 由前端传入（crypto.randomUUID），不再由 IP 派生
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
    deviceId: string,
    clientFingerprint: string,
    clientIp: string,
  ): Promise<TokenPayload> {
    // 复用现有的 login 方法（deviceId 作为独立参数传，login 内部用它调鉴权中心）
    return this.login(
      { username: dto.username, password: dto.password, deviceId },
      deviceId,
      dto.fingerprint || clientFingerprint,
      clientIp,
    );
  }

  /**
   * 邮箱验证码登录（无需密码，仅凭邮箱 + 验证码签发 Token）。
   * 验证码由 send-login-code 接口发送，校验通过即登录。
   * 与忘记密码的 reset-password-by-code 共用 EmailCodeService 的存储/校验逻辑，
   * 但走独立的 purpose 语义：这里是"登录证明"，不是"重置密码授权"。
   */
  async loginByCode(
    email: string,
    code: string,
    deviceId: string,
    clientFingerprint: string,
    clientIp: string,
  ): Promise<TokenPayload> {
    // 1. 校验验证码（verifyCode 失败会抛 BadRequestException）
    await this.emailCodeService.verifyCode(email, code);

    // 2. 查用户（带角色）
    const user = await this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.roles', 'r')
      .where('u.email = :email', { email })
      .getOne();

    if (!user) {
      // 登录场景明确告知未注册（不沿用忘记密码的防枚举静默成功）
      throw new UnauthorizedException('该邮箱尚未注册');
    }

    // 3. 状态检查 + 临时封禁惰性解封（与密码登录 login() 保持一致）
    if (user.status !== USER_STATUS.ACTIVE) {
      if (
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

    // 4. 签发 Token（deviceId 由前端传入，不再由 IP 派生；roles 由 issueLoginToken 内部从 user 取）
    const accessTtl = this.configService.get<number>('ACCESS_TOKEN_TTL', 3600);
    const refreshTtl = this.configService.get<number>(
      'REFRESH_TOKEN_TTL',
      604800,
    );

    const tokenData = await this.issueLoginToken(
      user,
      deviceId,
      accessTtl,
      refreshTtl,
    );

    // 5. 更新最后登录时间
    await this.userRepo.update(user.id, { lastLoginAt: new Date() });

    this.logger.log(
      `用户 ${user.username}(#${user.id}) 验证码登录成功`,
    );

    return {
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresIn: tokenData.expiresIn,
      deviceId,
    };
  }

  /**
   * 用户端登出（清理本地 Token，后端暂无操作）
   * userId 可能为 0（@Public 路由，accessToken 已过期未解出 user），
   * 此时只靠 refreshToken 吊销 Redis 会话，跳过 lastLoginAt 更新。
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
    // 注意：登出不更新 lastLoginAt（那是"最后登录时间"，登出时改它语义错误，
    // 会让前端展示的"最后登录"变成"最后登出"）。如需统计最后活跃时间，应另加字段。
    if (userId > 0) {
      this.logger.log(`用户 ${userId} 登出`);
    } else {
      this.logger.log('匿名登出（accessToken 已过期，仅吊销 refreshToken）');
    }
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
    // 联查会员状态（level + memberships），避免前端再单独发 /membership/me/status。
    // 与 me/status 接口同源（getActiveLevel + getUserActiveMemberships），数据一致。
    const [level, memberships] = await Promise.all([
      this.membershipService.getActiveLevel(userId),
      this.membershipService.getUserActiveMemberships(userId),
    ]);
    // 字段裁剪：不向终端用户暴露运营/审计字段（registerIp/registerCodeId/bannedUntil）
    const {
      password: _pw,
      registerIp: _rip,
      registerCodeId: _rci,
      bannedUntil: _bt,
      ...safeUser
    } = user as any;
    return { ...safeUser, membership: { level, memberships } };
  }

  /**
   * 客户端用户自助修改个人资料。
   * 与 admin 的 update() 区别：operator 是用户自己，字段范围受 UpdateProfileDto 限制。
   * 关键：
   * - findOne 加 relations: ['roles']，保证返回完整对象（前端 adaptUserInfo 要映射 roles）
   * - 写审计日志（targetType='user'，operator=用户自己），与 admin 改资料保持同一套审计链路
   */
  async updateProfile(userId: number, data: UpdateProfileDto) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['roles'],
    });
    if (!user) throw new NotFoundException('用户不存在');

    // 变更审计：对比允许修改的字段，diff 出实际变更项
    const targetName = `${user.nickname || user.username}(#${userId})`;
    const entries = AuditLogService.diff(
      'user',
      userId,
      {
        nickname: user.nickname,
        email: user.email,
        avatar: user.avatar,
        gender: user.gender,
        signature: user.signature,
        phone: user.phone,
      },
      {
        nickname: data.nickname ?? user.nickname,
        email: data.email ?? user.email,
        avatar: data.avatar ?? user.avatar,
        gender: data.gender ?? user.gender,
        signature: data.signature ?? user.signature,
        phone: data.phone ?? user.phone,
      },
      ['nickname', 'email', 'avatar', 'gender', 'signature', 'phone'],
      {
        // 自助修改：operator 就是用户自己
        operatorId: userId,
        operatorName: user.nickname || user.username,
        targetName,
        note: '用户自助修改资料',
      },
    );
    if (entries.length > 0) {
      this.auditLog
        .logMany(entries)
        .catch((e) => this.logger.warn('审计日志写入失败', e));
    }

    Object.assign(user, data);
    await this.userRepo.save(user);
    // 重新查一次返回完整对象。TypeORM save() 返回值在带 @ManyToMany 关系时
    // 可能缺失部分非关系字段（实测 nickname 偶发为 undefined），reload 保证完整。
    const reloaded = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['roles'],
    });
    return reloaded ?? user;
  }

  /**
   * 校验邮箱是否可用：未被其他用户占用（占用者是自己则视为可用，支持重复提交同邮箱）。
   * 换绑/绑定的预校验共用。
   */
  async canUseEmail(email: string, currentUserId: number): Promise<boolean> {
    const existing = await this.findByEmail(email);
    return !existing || existing.id === currentUserId;
  }

  /**
   * 邮箱换绑（含首次绑定，新邮箱未被占用即可）。
   * 验证码由 controller 层校验后调用本方法，本方法只负责落库 + 审计。
   * 再次校验邮箱可用性防并发抢占（验证码发送与换绑之间被别人注册）。
   */
  async changeEmail(userId: number, newEmail: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['roles'],
    });
    if (!user) throw new NotFoundException('用户不存在');

    // 并发保护：发码后到换绑之间，新邮箱可能被别人注册
    if (!(await this.canUseEmail(newEmail, userId))) {
      throw new BadRequestException('该邮箱已被其他账号绑定');
    }

    const oldEmail = user.email;
    // 没变化直接返回（用户重复提交同邮箱）
    if (oldEmail === newEmail) return user;

    // 审计
    const targetName = `${user.nickname || user.username}(#${userId})`;
    this.auditLog
      .log({
        targetType: 'user',
        targetId: userId,
        field: 'email',
        oldValue: oldEmail,
        newValue: newEmail,
        operatorId: userId,
        operatorName: user.nickname || user.username,
        targetName,
        note: '用户自助换绑邮箱',
      })
      .catch((e) => this.logger.warn('审计日志写入失败', e));

    await this.userRepo.update(userId, { email: newEmail });
    // reload 返回完整对象（与 updateProfile 同套，避免 save 返回值缺字段）
    const reloaded = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['roles'],
    });
    return reloaded ?? user;
  }

  async resetPassword(id: number, newPassword: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    user.password = await bcrypt.hash(newPassword, 10);
    return this.userRepo.save(user);
  }
}
