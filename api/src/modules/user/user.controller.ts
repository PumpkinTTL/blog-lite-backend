import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { UserService } from './user.service';
import { LoginDto } from './login.dto';
import { RefreshTokenDto } from './login.dto';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateProfileDto,
  ResetPasswordDto,
  SendResetCodeDto,
  ResetPasswordByCodeDto,
  BatchIdsDto,
  ToggleStatusDto,
} from './user.dto';
import { RegisterDto, ClientLoginDto } from './register.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { parsePage, parsePageSize } from '../../common/utils/parse-pagination';
import { EmailCodeService } from '../email-code/email-code.service';
import { USER_STATUS } from '../../common/constants/status';

@Controller('user')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly emailCodeService: EmailCodeService,
  ) {}

  // ===== 管理端登录 =====

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const fingerprint = req.body.fingerprint || '';
    const ip =
      req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
    const tokenPayload = await this.userService.login(dto, fingerprint, ip);

    return {
      success: true,
      data: {
        ...tokenPayload,
        tokenType: 'Bearer',
      },
      message: '登录成功',
    };
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto) {
    const tokenData = await this.userService.refreshToken(
      dto.refreshToken,
      dto.deviceId,
    );
    return {
      success: true,
      data: { ...tokenData, tokenType: 'Bearer' },
      message: 'Token 已刷新',
    };
  }

  // ===== 用户端注册 =====

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const fingerprint = req.body.fingerprint || '';
    const ip =
      req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
    const tokenPayload = await this.userService.register(dto, fingerprint, ip);

    return {
      success: true,
      data: {
        ...tokenPayload,
        tokenType: 'Bearer',
      },
      message: '注册成功',
    };
  }

  // ===== 用户端登录 =====

  @Public()
  @Post('client-login')
  async clientLogin(@Body() dto: ClientLoginDto, @Req() req: Request) {
    const fingerprint = dto.fingerprint || req.body.fingerprint || '';
    const ip =
      req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
    const tokenPayload = await this.userService.clientLogin(
      dto,
      fingerprint,
      ip,
    );

    return {
      success: true,
      data: {
        ...tokenPayload,
        tokenType: 'Bearer',
      },
      message: '登录成功',
    };
  }

  // ===== 用户端登出 =====

  @Post('logout')
  async logout(@Req() req: Request, @Body() body: { refreshToken?: string }) {
    const userId = parseInt((req as any).user?.sub, 10);
    await this.userService.logout(userId, body?.refreshToken);
    return { success: true, message: '登出成功' };
  }

  // ===== 个人资料 =====

  @Get('profile')
  async getProfile(@Req() req: Request) {
    const userId = parseInt((req as any).user?.sub, 10);
    const data = await this.userService.getProfile(userId);
    return { success: true, data, message: 'ok' };
  }

  @Put('profile')
  async updateProfile(@Req() req: Request, @Body() dto: UpdateProfileDto) {
    const userId = parseInt((req as any).user?.sub, 10);
    const data = await this.userService.updateProfile(userId, dto);
    return { success: true, data, message: '更新成功' };
  }

  // ===== 管理接口 =====

  @Roles('admin')
  @Get()
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('id') id?: string,
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
  ) {
    const data = await this.userService.findAll(
      parsePage(page),
      parsePageSize(pageSize),
      {
        id: id !== undefined ? parseInt(id) : undefined,
        keyword,
        status: status !== undefined ? parseInt(status) : undefined,
      },
    );
    return { success: true, data, message: 'ok' };
  }

  @Roles('admin')
  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    const data = await this.userService.findById(id);
    return { success: true, data, message: 'ok' };
  }

  @Roles('admin')
  @Post()
  async create(@Body() dto: CreateUserDto) {
    const data = await this.userService.create(dto);
    return { success: true, data, message: '创建成功' };
  }

  @Roles('admin')
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @Req() req: Request,
  ) {
    const op = (req as any).user;
    const data = await this.userService.update(
      id,
      dto,
      op ? { id: Number(op.sub), nickname: op.nickname || op.sub } : undefined,
    );
    return { success: true, data, message: '更新成功' };
  }

  @Roles('admin')
  @Delete('batch')
  async batchRemove(@Body() dto: BatchIdsDto, @Req() req: Request) {
    const currentUserId = Number((req as any).user?.sub);
    await this.userService.batchRemove(dto.ids, currentUserId);
    return { success: true, message: '批量删除成功' };
  }

  @Roles('admin')
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const currentUserId = Number((req as any).user?.sub);
    await this.userService.remove(id, currentUserId);
    return { success: true, message: '删除成功' };
  }

  @Roles('admin')
  @Put(':id/toggle-status')
  async toggleStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ToggleStatusDto,
    @Req() req: Request,
  ) {
    const currentUserId = parseInt((req as any).user?.sub, 10);
    if (currentUserId === id) {
      return { success: false, message: '不能禁用自己' };
    }
    const op = (req as any).user;
    const data = await this.userService.toggleStatus(
      id,
      {
        reason: dto?.reason,
        bannedUntil: dto?.bannedUntil ? new Date(dto.bannedUntil) : null,
      },
      op ? { id: Number(op.sub), nickname: op.nickname || op.sub } : undefined,
    );
    return {
      success: true,
      data,
      message: data.status === USER_STATUS.ACTIVE ? '已启用' : '已禁用',
    };
  }

  @Roles('admin')
  @Put(':id/reset-password')
  async resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
    @Req() req: Request,
  ) {
    const op = (req as any).user;
    const operatorId = op ? Number(op.sub) : undefined;

    // 禁止管理员重置其他管理员的密码（防止接管超管）
    const targetUser = await this.userService.findById(id);
    const targetIsAdmin = targetUser.roles?.some(
      (r: any) => r.name === 'admin',
    );
    if (targetIsAdmin && operatorId !== id) {
      return { success: false, message: '不能重置其他管理员的密码' };
    }

    await this.userService.resetPassword(id, dto.newPassword);
    return { success: true, message: '密码重置成功' };
  }

  // ===== 忘记密码：发送验证码 =====

  @Public()
  @Post('send-reset-code')
  async sendResetCode(@Body() dto: SendResetCodeDto) {
    // 统一消息，防止邮箱枚举
    const user = await this.userService.findByEmail(dto.email);
    if (user) {
      await this.emailCodeService.sendCode(dto.email);
    }
    return { success: true, message: '如果该邮箱已注册，验证码已发送' };
  }

  // ===== 忘记密码：验证码重置密码 =====

  @Public()
  @Post('reset-password-by-code')
  async resetPasswordByCode(@Body() dto: ResetPasswordByCodeDto) {
    // 验证验证码
    this.emailCodeService.verifyCode(dto.email, dto.code);

    // 查找用户并重置密码
    const user = await this.userService.findByEmail(dto.email);
    if (!user) {
      // 统一消息，防止邮箱枚举
      return { success: false, message: '验证码无效或已过期' };
    }

    await this.userService.resetPassword(user.id, dto.newPassword);
    return { success: true, message: '密码重置成功' };
  }
}
