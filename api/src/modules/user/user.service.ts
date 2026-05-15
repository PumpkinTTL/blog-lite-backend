import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { UserEntity } from './user.entity';
import { RoleEntity } from './role.entity';
import { LoginDto } from './login.dto';
import { AuthService } from '../auth/auth.service';

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

    if (!user || user.status !== 1) {
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

    const tokenData = await this.authService.issueToken(
      user.id,
      deviceId,
      { roles, nickname: user.nickname },
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

  // ===== CRUD =====

  async findAll(page = 1, pageSize = 20) {
    const [list, total] = await this.userRepo.findAndCount({
      relations: ['roles'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total, page, pageSize };
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

  async update(id: number, data: Partial<UserEntity> & { roleIds?: number[]; password?: string }) {
    const { roleIds, password, ...userData } = data;

    const user = await this.userRepo.findOne({ where: { id }, relations: ['roles'] });
    if (!user) return null;

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
}
