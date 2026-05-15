import { Controller, Post, Body, Req, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { UserService } from '../services/user.service';
import { LoginDto } from '../dto';

@Controller('user')
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(private readonly userService: UserService) {}

  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const fingerprint = req.body.fingerprint || '';
    const ip = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
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
}
