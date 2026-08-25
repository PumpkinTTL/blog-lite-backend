import { Injectable, UnauthorizedException, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource, EntityManager } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { UserEntity } from './user.entity';
import { RoleEntity } from './role.entity';
import { LoginDto } from './login.dto';
import { RegisterDto, ClientLoginDto } from './register.dto';
import { USER_STATUS } from '../../common/constants/status';
import { UpdateProfileDto } from './user.dto';
import { AuthService } from '../auth/auth.service';
import type { AuthTokenResponse } from '../auth/auth.service';
import { CasdoorService } from '../auth/casdoor.service';
import { LocalTokenService } from '../auth/local-token.service';
import { CodeService } from '../code/code.service';
import { CodeEntity } from '../code/code.entity';
import { CodeUsageLogEntity } from '../code/code-usage-log.entity';
import { MembershipService } from '../membership/membership.service';
import { MembershipEntity } from '../membership/membership.entity';
import { InteractionEntity } from '../interaction/interaction.entity';
import { PostEntity } from '../post/post.entity';
import { CommentEntity } from '../comment/comment.entity';
import { applyFilters } from '../../common/utils/apply-filters';
import { generateUniqueUserId } from '../../common/utils/generate-user-id';
import { AuditLogService } from '../audit-log/audit-log.service';
import { MediaService } from '../media/media.service';
import { EmailCodeService } from '../email-code/email-code.service';
import { SettingService } from '../setting/setting.service';

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
    private readonly casdoor: CasdoorService,
    private readonly localToken: LocalTokenService,
    private readonly configService: ConfigService,
    private readonly codeService: CodeService,
    private readonly membershipService: MembershipService,
    private readonly dataSource: DataSource,
    private readonly auditLog: AuditLogService,
    private readonly mediaService: MediaService,
    private readonly emailCodeService: EmailCodeService,
    private readonly settingService: SettingService,
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
    // 登录凭证：id 或 email。
    // - 纯数字 → 同时尝试 id（优先）和 email（兼容把邮箱填成纯数字的极端情况）
    // - 非数字 → 仅按 email 匹配
    // username 概念已移除，不再作为登录凭证。
    const account = (dto.account ?? '').trim();
    const isNumeric = /^\d+$/.test(account);
    const user = await this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.roles', 'r')
      .addSelect('u.password')
      .where(
        isNumeric
          ? 'u.id = :account OR u.email = :account'
          : 'u.email = :account',
        { account },
      )
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
      // 封禁到期解封必须同步 Casdoor（isForbidden），否则本地放行但
      // passwordGrant 仍被拒 → 用户被永久锁死（审查 P0）
      if (this.casdoor.enabled) {
        await this.casdoor.setCasdoorUserForbidden(user.id, false);
      }
    }

    // 恒定时间防时序攻击：无论用户存不存在/状态是否正常，都执行一次 bcrypt 比较，
    // 让各分支耗时一致，攻击者无法通过响应快慢判断用户名是否存在。
    // 只有「存在 + 状态正常」才用真实 hash，否则用 DUMMY_HASH（必 false 但耗时相当）。
    const canLogin = user && user.status === USER_STATUS.ACTIVE;

    // ── casdoor 模式：密码校验 + Token 签发统一走 Casdoor password grant ──
    // 本地保留存在性/封禁检查；密码对错由 Casdoor 裁决（本地哈希仅存档不再比对）。
    // Casdoor 拒绝的任何原因（密码错/用户未同步）都返回同一句模糊消息，防枚举。
    if (this.casdoor.enabled) {
      if (!this.casdoor.ready) {
        throw new BadRequestException('统一认证服务未配置完整，请联系管理员');
      }
      if (!canLogin) {
        throw new UnauthorizedException(UserService.LOGIN_FAIL_MSG);
      }
      let casdoorToken;
      try {
        casdoorToken = await this.casdoor.passwordGrant(user.id, dto.password);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // 区分"凭证错误"与"服务故障"（审查 P1）：把 Casdoor 宕机/超时误报成
        // 密码错误会误导用户反复重试甚至去重置密码
        const credentialWrong = /incorrect|password|not found|forbidden|invalid/i.test(msg);
        if (!credentialWrong) {
          this.logger.error(`Casdoor 登录通道异常: ${msg}`);
          throw new UnauthorizedException('登录服务暂时不可用，请稍后重试');
        }
        throw new UnauthorizedException(UserService.LOGIN_FAIL_MSG);
      }
      const roleNames = (user.roles || []).map((r) => r.name);
      this.logger.log(
        `用户 #${user.id} 登录成功（casdoor），角色: [${roleNames.join(', ')}]`,
      );
      // 与 self 分支对齐更新最后登录时间（审查 P1：主登录路径一直漏更）
      await this.userRepo.update(user.id, { lastLoginAt: new Date() });
      return {
        accessToken: casdoorToken.accessToken,
        refreshToken: casdoorToken.refreshToken,
        expiresIn: casdoorToken.expiresIn,
        deviceId,
      };
    }

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
      `用户 #${user.id} 登录成功，角色: [${roles.join(', ')}]`,
    );
    // 最后登录时间（审查 P1：此前仅注册/验证码登录更新，密码主路径漏更）
    await this.userRepo.update(user.id, { lastLoginAt: new Date() });

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
      like: { keyword: filters?.keyword, fields: ['u.nickname'] },
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
    // 邮箱占用预检（审查 P1）：register 有 ER_DUP_ENTRY 兜底，这里没有——
    // 撞唯一键直接 500。提前转友好 400。
    if (userData.email) {
      const existingEmail = await this.findByEmail(userData.email);
      if (existingEmail) {
        throw new BadRequestException('该邮箱已被注册');
      }
    }
    // 生成 9 位随机 id（非自增主键，防推算/防遍历）
    userData.id = await generateUniqueUserId((id) =>
      this.userRepo.exists({ where: { id } }),
    );
    const user = this.userRepo.create(userData);

    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }

    if (roleIds?.length) {
      user.roles = await this.roleRepo.findBy({ id: In(roleIds) });
    }

    const saved = await this.userRepo.save(user);

    // casdoor 模式：admin 手动建的用户也要同步（否则 Casdoor 无此号无法登录）。
    // 无密码的创建不同步（该用户本来就无法密码登录）。
    if (this.casdoor.enabled && password) {
      try {
        await this.casdoor.createCasdoorUser({
          localUserId: saved.id,
          nickname: saved.nickname || `用户#${saved.id}`,
          password,
          email: saved.email,
          avatar: saved.avatar,
        });
      } catch (e) {
        this.logger.error(
          `admin 建用户 #${saved.id} 成功但同步 Casdoor 失败: ${e instanceof Error ? e.message : e}`,
        );
        throw new BadRequestException(
          '用户已创建，但统一认证同步失败：请在用户列表点「同步到Casdoor」补建该账号后，再重置其密码',
        );
      }
    }
    return saved;
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
    const targetName = `${user.nickname || '未命名'}(#${id})`;
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
    // status 剥离（审查 P1）：改状态唯一入口是 toggle-status（含 bannedUntil
    // 语义/Casdoor 同步/审计/防自我封禁），编辑表单直改状态会绕过全套
    delete (userData as any).status;

    // email 占用预检（审查双入口分叉）：admin 改邮箱也查重，撞唯一键 500 → 友好 400
    if (userData.email && userData.email !== user.email) {
      if (!(await this.canUseEmail(userData.email, id))) {
        throw new BadRequestException('该邮箱已被其他账号绑定');
      }
    }

    Object.assign(user, userData);

    if (password) {
      // casdoor 模式：先同步成功再改本地（与 resetPassword 同序，审查 P0）
      if (this.casdoor.enabled) {
        const syncOk = await this.casdoor.updateCasdoorPassword(id, password);
        if (!syncOk) {
          throw new BadRequestException('统一认证服务同步失败，密码未修改，请稍后重试');
        }
      }
      user.password = await bcrypt.hash(password, 10);
    }

    if (roleIds !== undefined) {
      user.roles = roleIds.length
        ? await this.roleRepo.findBy({ id: In(roleIds) })
        : [];
    }

    const saved = await this.userRepo.save(user);

    // 审计挪到 save 成功后（审查 P1：原先先记审计后落库，save 失败会误记"已改"）
    this.auditLog
      .logMany(entries)
      .catch((e) => this.logger.warn('审计日志写入失败', e));

    // casdoor 模式：admin 改资料时展示类字段同步（best-effort）
    await this.casdoor.syncProfileFromLocal(id, userData);

    return saved;
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
        `用户「${user.nickname || `用户#${user.id}`}」是管理员，不能删除`,
      );
    }

    // 级联清理：comments 和 user_roles 有 FK CASCADE 会随用户删除自动清理，
    // 但 interactions / memberships / code_usage_logs 是裸列无 FK，需手动清。
    // interactions 清理后还要回算受影响文章的 likeCount/favoriteCount，否则计数虚高。
    await this.dataSource.transaction(async (manager) => {
      await this.cleanupUserBeforeDelete(manager, id);

      // 删用户（comments/user_roles 因 FK CASCADE 自动删）
      await manager.delete(UserEntity, { id });
    });

    // 头像文件删除放事务外（OSS 调用不应在 DB 事务里）
    if (user.avatar) {
      await this.deleteMediaByUrl(user.avatar).catch((e) =>
        this.logger.warn(`删除用户 ${id} 头像文件失败: ${e.message}`),
      );
    }

    // casdoor 模式：同步删除 Casdoor 侧账号（best-effort，失败仅记日志）
    if (this.casdoor.enabled) {
      await this.casdoor.deleteCasdoorUser(id);
    }
  }

  /**
   * 删除用户前的关联数据清理（事务内执行）。
   * remove 和 batchRemove 共用，保证单删/批删逻辑一致。
   * 清理项：interactions（孤儿数据）、memberships、code_usage_logs，
   * 以及回算受影响文章的 likeCount/favoriteCount/commentCount。
   */
  private async cleanupUserBeforeDelete(
    manager: EntityManager,
    id: number,
  ): Promise<void> {
    // 1. 收集该用户所有 post 互动（点赞/收藏），用于删除后回算文章计数
    const userInteractions = await manager.find(InteractionEntity, {
      where: { userId: id, entityType: 'post' },
    });
    const affectedPostIds = new Set(userInteractions.map((i) => i.entityId));
    const affectedTypes = new Set(userInteractions.map((i) => i.type));

    // 2. 收集该用户所有评论涉及的 post（comments 因 FK CASCADE 会被自动删，
    //    需提前收集以便删完后回算 commentCount，否则计数永久虚高）
    const userComments = await manager.find(CommentEntity, {
      where: { userId: id, entityType: 'post' },
    });
    for (const c of userComments) affectedPostIds.add(c.entityId);

    // 3. 删 interactions（裸列无 FK，需手动清，否则变孤儿）
    await manager.delete(InteractionEntity, { userId: id });

    // 4. 删 memberships（避免已删用户在会员列表残留）
    await manager.delete(MembershipEntity, { userId: id });

    // 5. 删 code_usage_logs（裸列无 FK，避免引用已删用户）
    await manager.delete(CodeUsageLogEntity, { userId: id });

    // 6. 回算受影响文章的 likeCount/favoriteCount
    for (const postId of affectedPostIds) {
      for (const type of affectedTypes) {
        const count = await manager.count(InteractionEntity, {
          where: { entityType: 'post', entityId: postId, type },
        });
        const patch =
          type === 'like' ? { likeCount: count } : { favoriteCount: count };
        await manager.update(PostEntity, { id: postId }, patch as any);
      }
      // 回算 commentCount（用户删除后其评论已被 CASCADE 删，这里重算准确值）
      const commentCount = await manager.count(CommentEntity, {
        where: { entityType: 'post', entityId: postId, status: 'approved' },
      });
      await manager.update(
        PostEntity,
        { id: postId },
        { commentCount } as any,
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
          `用户「${user.nickname || `用户#${user.id}`}」是管理员，不能删除`,
        );
      }
    }

    // 清理所有头像文件（事务外，OSS 调用）
    for (const user of users) {
      if (user.avatar) {
        await this.deleteMediaByUrl(user.avatar).catch(e =>
          this.logger.warn(`删除用户头像文件失败: ${e.message}`),
        );
      }
    }

    // 事务内逐个清理关联数据 + 回算计数 + 删用户（与单删逻辑一致）
    await this.dataSource.transaction(async (manager) => {
      for (const id of ids) {
        await this.cleanupUserBeforeDelete(manager, id);
        await manager.delete(UserEntity, { id });
      }
    });

    // casdoor 模式：同步删除 Casdoor 侧账号（best-effort，失败仅记日志）
    if (this.casdoor.enabled) {
      for (const id of ids) {
        await this.casdoor.deleteCasdoorUser(id);
      }
    }
  }

/**
   * 验证码重置密码后自动登录（casdoor 模式：新密码已双端生效，直接复用 login 完整链路）。
   * self 模式下卡友好的 401 文案（若用户换邮箱，原封禁判定会误导，明确告知旧账号不存在）。
   */
  async loginAfterResetByEmail(email: string, newPassword: string, deviceId: string, ip: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; deviceId: string }> {
    const did = (deviceId || '').trim() || `reset-${Date.now().toString(36)}`;
    return this.login({ account: email, password: newPassword, deviceId: did } as any, did, '', ip);
  }

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

    const targetName = `${user.nickname || `用户#${user.id}`}(#${id})`;

    // 封禁时同步吊销凭证，堵死 refresh 续命：
    // - self 模式：调鉴权中心吊销该用户所有 Token
    // - casdoor 模式：设置 Casdoor 侧 isForbidden（登录+续签全拒，等价吊销全部会话）
    if (willDisable) {
      if (this.casdoor.enabled) {
        await this.casdoor.setCasdoorUserForbidden(id, true);
      } else {
        await this.authService.revokeUserTokens(id);
      }
    } else if (this.casdoor.enabled) {
      // 解封同步恢复（Casdoor 侧放行登录/续签）
      await this.casdoor.setCasdoorUserForbidden(id, false);
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
    // 0. 站点设置校验：注册开关 + 邮箱后缀白名单（管理员可在后台 site-setting 配置）
    const regEnabled = await this.settingService.findByKey('registration.enabled');
    const enabledVal = regEnabled?.value;
    if (enabledVal === 'false' || enabledVal === '0') {
      throw new BadRequestException('注册功能暂未开放');
    }
    if (dto.email) {
      const whitelistRaw = (await this.settingService.findByKey('registration.email_whitelist'))?.value || '';
      const whitelist = whitelistRaw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (whitelist.length > 0) {
        const emailDomain = dto.email.split('@')[1]?.toLowerCase() || '';
        if (!emailDomain || !whitelist.includes(emailDomain)) {
          throw new BadRequestException(
            `仅允许以下邮箱后缀注册：${whitelist.join(', ')}`,
          );
        }
      }
    }

    // 1. 邮箱已在事务外做友好提示校验，但并发注册仍可能同时通过。
    //    事务内对 manager.save 的 ER_DUP_ENTRY 做二次兜底，转为 400，避免 500 泄露 DB 细节。
    if (dto.email) {
      const existingEmail = await this.findByEmail(dto.email);
      if (existingEmail) {
        throw new BadRequestException('该邮箱已被注册，若忘记密码请重置');
      }
      // 邮箱验证码：提供 email 必须带有效验证码（证明邮箱所有权，防垃圾注册）。
      // 不提供 email 的注册（历史渠道）不校验。
      const code = (dto.emailCode || '').trim();
      if (!code) {
        throw new BadRequestException('请先获取邮箱验证码');
      }
      const codeValid = await this.emailCodeService.verifyCode(dto.email, code);
      if (!codeValid) {
        throw new BadRequestException('邮箱验证码错误或已过期');
      }
    }

    // 2. 邀请码开关：registration.require_invitation 关闭时开放自由注册（默认开启）
    const requireInviteRaw = (
      await this.settingService.findByKey('registration.require_invitation')
    )?.value;
    const requireInvite = requireInviteRaw !== 'false' && requireInviteRaw !== '0';

    let codeEntity: CodeEntity | null = null;
    if (requireInvite) {
      if (!dto.invitationCode?.trim()) {
        throw new BadRequestException('请输入邀请码');
      }
      const verifyResult = await this.codeService.verifyCode({
        code: dto.invitationCode,
        type: 'invitation',
      });
      if (!verifyResult.valid) {
        throw new BadRequestException(verifyResult.message || '邀请码无效');
      }
      codeEntity = verifyResult.code!;
    }

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

        // 邀请码并发安全消费（自由注册模式下 codeEntity 为 null，直接跳过）
        if (codeEntity) {
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
        }

        // 创建用户（不再写入 username，已移除该字段）
        // id 为 9 位随机数字（非自增），用事务内的 manager 查重保证一致性
        const userId = await generateUniqueUserId((id) =>
          manager.exists(UserEntity, { where: { id } }),
        );
        const user = manager.create(UserEntity, {
          id: userId,
          nickname: dto.nickname,
          password: await bcrypt.hash(dto.password, 10),
          email: dto.email || null,
          avatar: dto.avatar || null,
          status: USER_STATUS.ACTIVE,
          registerIp: clientIp,
          registerSource: dto.registerSource || 'web',
          registerCodeId: codeEntity?.id ?? null,
          lastLoginAt: new Date(),
        });
        user.roles = [userRole];

        try {
          await manager.save(user);
        } catch (e: unknown) {
          const code = (e as { code?: string })?.code;
          // 并发注册同一邮箱：事务外的 findByEmail 同时通过，这里唯一键冲突，转为友好 400
          if (code === 'ER_DUP_ENTRY') {
            throw new BadRequestException('该邮箱已被注册，若忘记密码请重置');
          }
          throw e;
        }

        // 记录邀请码使用日志（自由注册无邀请码则跳过）
        if (codeEntity) {
          await manager.insert(CodeUsageLogEntity, {
            codeId: codeEntity.id,
            userId: user.id,
            usedAt: new Date(),
            clientIp,
            metadata: { action: 'register' },
            createdAt: new Date(),
          });
        }

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

    // ── casdoor 模式：先同步用户到 Casdoor（凭证落 Casdoor），再用注册密码
    // 走 password grant 完成"注册即登录"。任一步失败用户已落库（事务已提交），
    // 提示用户用刚注册的账号登录，不静默吞错。 ──
    if (this.casdoor.enabled) {
      if (!this.casdoor.ready) {
        throw new BadRequestException('统一认证服务未配置完整，请联系管理员');
      }
      try {
        await this.casdoor.createCasdoorUser({
          localUserId: userId,
          nickname,
          password: dto.password,
          email: dto.email,
          avatar: dto.avatar,
        });
      } catch (e) {
        this.logger.error(
          `用户 #${userId} 注册成功但同步 Casdoor 失败: ${e instanceof Error ? e.message : e}`,
        );
        throw new BadRequestException(
          '注册成功，但统一认证同步失败，请联系管理员处理',
        );
      }
      try {
        const t = await this.casdoor.passwordGrant(userId, dto.password);
        this.logger.log(`用户 #${userId}(${nickname}) 注册成功（casdoor）`);
        return {
          accessToken: t.accessToken,
          refreshToken: t.refreshToken,
          expiresIn: t.expiresIn,
          deviceId,
        };
      } catch (e) {
        this.logger.error(
          `用户 #${userId} 注册成功但 Casdoor 登录失败: ${e instanceof Error ? e.message : e}`,
        );
        throw new BadRequestException(
          '注册成功，但登录凭证签发失败，请使用刚注册的账号登录',
        );
      }
    }

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
        `用户 #${userId} 注册成功但签发 Token 失败: ${e instanceof Error ? e.message : e}`,
      );
      throw new BadRequestException(
        '注册成功，但登录凭证签发失败，请使用刚注册的账号登录',
      );
    }

    this.logger.log(`用户 #${userId}(${nickname}) 注册成功`);

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
      { account: dto.account, password: dto.password, deviceId },
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
        // 同 login()：解封同步 Casdoor，防永久锁死（审查 P0）
        if (this.casdoor.enabled) {
          await this.casdoor.setCasdoorUserForbidden(user.id, false);
        }
      } else {
        throw new UnauthorizedException('账号不存在或已禁用');
      }
    }

    // 4. 签发 Token（deviceId 由前端传入，不再由 IP 派生；roles 由 issueLoginToken 内部从 user 取）
    // tokenType 仅自建/casdoor 通道有，本地 token 对无该字段，这里只取三公共字段
    let tokenData: Pick<AuthTokenResponse, 'accessToken' | 'refreshToken' | 'expiresIn'>;
    if (this.casdoor.enabled) {
      // casdoor 模式：Casdoor 单密码模型无免密签发能力，改用本地 Ed25519
      // 短命 JWT（C'' 方案）：AT 2h（iss=blog-lite-local，AuthGuard 按 iss 分流
      // 到本地验签）+ RT 7d（local- 前缀，refresh 走本地旋转续签）
      const roles = (user.roles || []).map((r) => r.name);
      tokenData = await this.localToken.signTokenPair(user.id, roles);
    } else {
      // self 模式：保持原 issueLoginToken（自建鉴权中心）逻辑
      const accessTtl = this.configService.get<number>('ACCESS_TOKEN_TTL', 3600);
      const refreshTtl = this.configService.get<number>(
        'REFRESH_TOKEN_TTL',
        604800,
      );
      tokenData = await this.issueLoginToken(
        user,
        deviceId,
        accessTtl,
        refreshTtl,
      );
    }

    // 5. 更新最后登录时间
    await this.userRepo.update(user.id, { lastLoginAt: new Date() });

    this.logger.log(
      `用户 #${user.id} 验证码登录成功（${this.casdoor.enabled ? 'casdoor 模式，本地 token' : 'self 模式'}）`,
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
   * local- 前缀的 RT（验证码登录签发的本地短命 token）走本地旋转续签
   */
  async refreshToken(
    refreshToken: string,
    deviceId: string,
  ): Promise<TokenPayload> {
    // ── 本地短命 token（C'' 方案）：本地验签 + 旋转签发新 AT/RT 对 ──
    if (refreshToken.startsWith('local-')) {
      try {
        const payload = await this.localToken.verifyRefreshToken(refreshToken);
        const userId = Number(payload.sub);
        if (!Number.isInteger(userId) || userId <= 0) {
          throw new Error('refreshToken sub 无效');
        }
        // 重查用户拿最新角色/状态：RT 有效期 7 天，期间角色可能被改、账号可能被封
        const user = await this.userRepo.findOne({
          where: { id: userId },
          relations: ['roles'],
        });
        if (!user || user.status !== USER_STATUS.ACTIVE) {
          // 已封禁/删除用户不允许续签（本地 token 无外部吊销通道，这里是唯一闸口）
          throw new Error('用户不存在或已禁用');
        }
        const roles = (user.roles || []).map((r) => r.name);
        const pair = await this.localToken.signTokenPair(user.id, roles);
        return {
          accessToken: pair.accessToken,
          refreshToken: pair.refreshToken,
          expiresIn: pair.expiresIn,
          deviceId,
        };
      } catch {
        throw new UnauthorizedException('登录已过期，请重新登录');
      }
    }

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
    // casdoor 模式：续签成功后复查封禁（审查纵深缺口：本地 token 路径有查、
    // casdoor 路径没有）。Casdoor RT 的 sub 是内部 UUID，身份在新 AT 的 name(u<id>)。
    if (this.casdoor.enabled) {
      try {
        const seg = tokenData.accessToken.split('.')[1];
        const payload = JSON.parse(Buffer.from(seg, 'base64').toString('utf8'));
        const m = /^u(\d+)$/.exec(String(payload.name || ''));
        if (m) {
          const u = await this.userRepo.findOne({
            where: { id: Number(m[1]) },
            select: ['id', 'status'],
          });
          if (u && u.status !== 'active') {
            throw new UnauthorizedException('账号已被禁用');
          }
        }
      } catch (e) {
        if (e instanceof UnauthorizedException) throw e;
        // 解析失败不阻塞续签（AuthGuard 每请求查 status 兜底）
      }
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
    const targetName = `${user.nickname || `用户#${user.id}`}(#${userId})`;
    const entries = AuditLogService.diff(
      'user',
      userId,
      {
        nickname: user.nickname,
        avatar: user.avatar,
        gender: user.gender,
        signature: user.signature,
        phone: user.phone,
      },
      {
        nickname: data.nickname ?? user.nickname,
        avatar: data.avatar ?? user.avatar,
        gender: data.gender ?? user.gender,
        signature: data.signature ?? user.signature,
        phone: data.phone ?? user.phone,
      },
      ['nickname', 'avatar', 'gender', 'signature', 'phone'],
      {
        // 自助修改：operator 就是用户自己
        operatorId: userId,
        operatorName: user.nickname || `用户#${user.id}`,
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
    // casdoor 模式：展示类字段同步（best-effort，快照滞后无害）
    await this.casdoor.syncProfileFromLocal(userId, data);
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
    const targetName = `${user.nickname || `用户#${user.id}`}(#${userId})`;
    this.auditLog
      .log({
        targetType: 'user',
        targetId: userId,
        field: 'email',
        oldValue: oldEmail,
        newValue: newEmail,
        operatorId: userId,
        operatorName: user.nickname || `用户#${user.id}`,
        targetName,
        note: '用户自助换绑邮箱',
      })
      .catch((e) => this.logger.warn('审计日志写入失败', e));

    await this.userRepo.update(userId, { email: newEmail });
    // casdoor 模式：邮箱换绑同步（best-effort）
    if (this.casdoor.enabled) {
      await this.casdoor.syncProfileFromLocal(userId, { email: newEmail });
    }
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
    // casdoor 模式：Casdoor 是凭据真相源，先同步成功再落本地——
    // 反过来（先本地后 best-effort 同步）失败时会出现"重置成功但旧密码仍有效"（审查 P0）
    if (this.casdoor.enabled) {
      const ok = await this.casdoor.updateCasdoorPassword(id, newPassword);
      if (!ok) {
        throw new BadRequestException(
          '统一认证服务同步失败，密码未修改，请稍后重试（若持续失败，请在用户管理执行「同步到Casdoor」）',
        );
      }
    }
    user.password = await bcrypt.hash(newPassword, 10);
    await this.userRepo.save(user);
    // 审计（审查双入口分叉：resetPassword 可经公开的验证码重置接口触达，
    // 此前无任何痕迹；admin update 改密有审计，此处对齐）
    this.auditLog
      .log({
        targetType: 'user',
        targetId: id,
        field: 'password',
        note: '密码重置（admin/验证码重置共用）',
        targetName: `${user.nickname || `用户#${id}`}(#${id})`,
      })
      .catch((e) => this.logger.warn('审计日志写入失败', e));
  }

  /**
   * 存量用户对账同步到 Casdoor（admin 手动触发，可重复执行）：
   * - Casdoor 缺号的用户 → 补建（随机密码——密码不可逆拿不回，补建的号走
   *   "忘记密码"重置后即可正常登录；展示字段/头像先对齐）
   * - 已有号的用户 → 对齐展示字段（显示名/头像/邮箱/手机）
   * 返回 { created, updated, failed } 汇总。
   */
  async syncAllToCasdoor(operator?: {
    id: number;
    nickname: string;
  }): Promise<{ created: number; updated: number; failed: string[] }> {
    if (!this.casdoor.enabled) {
      throw new BadRequestException('当前非 casdoor 模式，无需同步');
    }
    const users = await this.userRepo.find({ select: ['id', 'nickname', 'email', 'avatar', 'phone'] });
    let created = 0;
    let updated = 0;
    const failed: string[] = [];
    for (const u of users) {
      try {
        const exists = await this.casdoor.userExists(u.id);
        if (!exists) {
          // 随机密码占位：bcrypt 强度随机串，用户本人也未知——
          // 补建的号需走"忘记密码"设置新密码后才能登录
          const randomPwd =
            randomBytes(18).toString('base64url') + '!aA1';
          await this.casdoor.createCasdoorUser({
            localUserId: u.id,
            nickname: u.nickname || `用户#${u.id}`,
            password: randomPwd,
            email: u.email,
            avatar: u.avatar,
          });
          created++;
        } else {
          await this.casdoor.syncCasdoorProfile(u.id, {
            displayName: u.nickname || `用户#${u.id}`,
            avatar: u.avatar,
            email: u.email,
            phone: u.phone,
          });
          updated++;
        }
      } catch (e) {
        failed.push(`#${u.id}: ${e instanceof Error ? e.message : e}`);
      }
    }
    this.logger.log(
      `Casdoor 对账同步完成：补建 ${created}，对齐 ${updated}，失败 ${failed.length}（操作者 ${operator?.id ?? 'system'}）`,
    );
    return { created, updated, failed };
  }
}
