import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, Req } from '@nestjs/common';
import type { Request } from 'express';
import { UserService } from './user.service';
import { LoginDto } from './login.dto';
import { CreateUserDto, UpdateUserDto } from './user.dto';
import { Public } from '../../common/decorators/public.decorator';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Public()
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

  // ===== 管理接口 =====

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('id') id?: string,
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
  ) {
    const data = await this.userService.findAll(
      Math.max(parseInt(page || '1'), 1),
      Math.min(parseInt(pageSize || '20'), 100),
      {
        id: id !== undefined ? parseInt(id) : undefined,
        keyword,
        status: status !== undefined ? parseInt(status) : undefined,
      },
    );
    return { success: true, data, message: 'ok' };
  }

  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    const data = await this.userService.findById(id);
    return { success: true, data, message: 'ok' };
  }

  @Post()
  async create(@Body() dto: CreateUserDto) {
    const data = await this.userService.create(dto);
    return { success: true, data, message: '创建成功' };
  }

  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    const data = await this.userService.update(id, dto);
    return { success: true, data, message: '更新成功' };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.userService.remove(id);
    return { success: true, message: '删除成功' };
  }
}
