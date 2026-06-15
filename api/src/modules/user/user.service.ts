import { Injectable, UnauthorizedException, Logger, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
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
import { MembershipService, MembershipSummary } from '../membership/membership.service';
import { applyFilters } from '../../common/utils/apply-filters';
import { AuditLogService } from '../audit-log/audit-log.service';

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
  ) {}

  /**
   * 管理员登录：
   * 1. 查用户（带角色）
   * 2. 校验密码
   * 3. 调用鉴权中心 POST /auth/token 签发双 Token
   */
  async login(dto: LoginDto, clientFingerprint: string, clientIp: string): Promise<TokenPayload> {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.roles', 'r')
      .addSelect('u.password')
      .where('u.username = :username', { username: dto.username })
      .getOne();

    if (!user || user.status !== USER_STATUS.ACTIVE) {
      throw new UnauthorizedException('账号不存在或已禁用');
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

    const accessTtl = this.configService.get<number>('ACCESS_TOKEN_TTL', 900);
    const refreshTtl = this.configService.get<number>('REFRESH_TOKEN_TTL', 604800);

    const tokenData = await this.authService.issueToken(
      user.id,
      deviceId,
      { roles, nickname: user.nickname },
      undefined,
      accessTtl,
      refreshTtl,
    );

    this.logger.log(`用户 ${user.username} 登录成功，角色: [${roles.join(', ')}]`);

    return {
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresIn: tokenData.expiresIn,
      deviceId,
    };
  }

  /**
   * 根据用户名查找用户（含角色）
   */
  async findByUsername(username: string): Promise<UserEntity | null> {
    return this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.roles', 'r')
      .where('u.username = :username', { username })
      .getOne();
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

  async findAll(page = 1, pageSize = 20, filters?: { id?: number; keyword?: string; status?: number }) {
    const qb = this.userRepo.createQueryBuilder('u')
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
    const membershipMap = await this.membershipService.getHighestActiveBatch(userIds);
    const enrichedList = list.map((u) => ({
      ...u,
      membership: membershipMap.get(u.id) || null,
    }));

    return { list: enrichedList, total, page, pageSize };
  }

  async findById(id: number) {
    return this.userRepo.findOne({ where: { id }, relations: ['roles'] });
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

  async update(id: number, data: Partial<UserEntity> & { roleIds?: number[]; password?: string }, operator?: { id: number; nickname: string }) {
    const { roleIds, password, ...userData } = data;

    const user = await this.userRepo.findOne({ where: { id }, relations: ['roles'] });
    if (!user) return null;

    // 变更审计
    const targetName = `${user.nickname || user.username}(#${id})`;
    const entries = AuditLogService.diff('user', id, {
      avatar: user.avatar, nickname: user.nickname, email: user.email, status: user.status,
    }, {
      avatar: userData.avatar, nickname: userData.nickname, email: userData.email, status: userData.status,
    }, ['avatar', 'nickname', 'email', 'status'], {
      operatorId: operator?.id, operatorName: operator?.nickname, targetName,
    });
    if (password) entries.push({ targetType: 'user', targetId: id, field: 'password', note: '密码已修改', targetName, operatorId: operator?.id, operatorName: operator?.nickname });
    this.auditLog.logMany(entries).catch(e => this.logger.warn('审计日志写入失败', e));

    Object.assign(user, userData);

    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }

    if (roleIds !== undefined) {
      user.roles = roleIds.length ? await this.roleRepo.findBy({ id: In(roleIds) }) : [];
    }

    return this.userRepo.save(user);
  }

  async remove(id: number) {
    await this.userRepo.delete(id);
  }

  /**
   * 切换用户状态（启用/禁用）
   */
  async toggleStatus(id: number): Promise<UserEntity> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    user.status = user.status === USER_STATUS.ACTIVE ? USER_STATUS.DISABLED : USER_STATUS.ACTIVE;
    return this.userRepo.save(user);
  }

  /**
   * 用户端注册：
   * 1. 检查用户名是否已存在
   * 2. 检查邀请码是否有效
   * 3. 使用邀请码（事务）
   * 4. 创建用户（密码哈希）
   * 5. 分配默认角色（user）
   * 6. 签发 Token
   * 7. 更新最后登录时间
   */
  async register(dto: RegisterDto, clientFingerprint: string, clientIp: string): Promise<TokenPayload> {
    // 1. 检查用户名是否已存在
    const existingUser = await this.userRepo.findOne({ where: { username: dto.username } });
    if (existingUser) {
      throw new BadRequestException('用户名已存在');
    }

    // 2. 检查邀请码是否有效
    const verifyResult = await this.codeService.verifyCode({ code: dto.invitationCode, type: 'invitation' });
    if (!verifyResult.valid) {
      throw new BadRequestException(verifyResult.message || '邀请码无效');
    }

    const codeEntity = verifyResult.code!;

    // 3. 使用注册（事务）
    return this.dataSource.transaction(async (manager) => {
      // 查询默认角色（user）
      const userRole = await manager.findOne(RoleEntity, { where: { name: 'user' } });
      if (!userRole) {
        throw new NotFoundException('默认角色 user 不存在');
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

      // 使用邀请码（通过直接调用 CodeService 的 useCode 方法）
      // 注意：useCode 内部已经有事务管理，但在当前事务中调用可能有问题
      // 让我们先插入使用记录，然后手动更新 usedCount
      await manager.insert(CodeUsageLogEntity, {
        codeId: codeEntity.id,
        userId: user.id,
        usedAt: new Date(),
        clientIp,
        metadata: { action: 'register' },
        createdAt: new Date(),
      });

      // 更新 usedCount
      await manager.increment(CodeEntity, { id: codeEntity.id }, 'usedCount', 1);

      // 检查是否用完，更新状态
      if (codeEntity.maxUses > 0 && codeEntity.usedCount + 1 >= codeEntity.maxUses) {
        await manager.update(CodeEntity, codeEntity.id, {
          status: 'used',
          usedAt: new Date(),
        });
      } else {
        await manager.update(CodeEntity, codeEntity.id, {
          usedAt: new Date(),
        });
      }

      // 6. 签发 Token
      const deviceId = crypto
        .createHash('sha256')
        .update(`${clientFingerprint}-${clientIp}`)
        .digest('hex');

      const roles = user.roles.map((r) => r.name);
      const accessTtl = this.configService.get<number>('ACCESS_TOKEN_TTL', 900);
      const refreshTtl = this.configService.get<number>('REFRESH_TOKEN_TTL', 604800);

      const tokenData = await this.authService.issueToken(
        user.id,
        deviceId,
        { roles, nickname: user.nickname },
        undefined,
        accessTtl,
        refreshTtl,
      );

      this.logger.log(`用户 ${user.username} 注册成功，角色: [${roles.join(', ')}]`);

      return {
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        expiresIn: tokenData.expiresIn,
        deviceId,
      };
    });
  }

  /**
   * 用户端登录（复用管理端登录逻辑）
   */
  async clientLogin(dto: ClientLoginDto, clientFingerprint: string, clientIp: string): Promise<TokenPayload> {
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
  async logout(userId: number): Promise<void> {
    // 更新最后登录时间
    await this.userRepo.update(userId, { lastLoginAt: new Date() });
    this.logger.log(`用户 ${userId} 登出`);
  }

  /**
   * 刷新 Token：调用鉴权中心刷新双 Token
   */
  async refreshToken(refreshToken: string, deviceId: string): Promise<TokenPayload> {
    const tokenData = await this.authService.refreshToken(refreshToken, deviceId);
    return {
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresIn: tokenData.expiresIn,
      deviceId,
    };
  }

  async getProfile(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId }, relations: ['roles'] });
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
