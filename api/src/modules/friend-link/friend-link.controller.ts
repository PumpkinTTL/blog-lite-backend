import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { FriendLinkService } from './friend-link.service';
import {
  CreateFriendLinkDto,
  UpdateFriendLinkDto,
  BatchIdsDto,
} from './friend-link.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { FRIEND_LINK_STATUS } from '../../common/constants/status';
import { parsePage, parsePageSize } from '../../common/utils/parse-pagination';

@Controller('friend-link')
@Roles('admin')
export class FriendLinkController {
  constructor(private readonly service: FriendLinkService) {}

  @Public()
  @Get()
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('id') id?: string,
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Req() req?: Request,
  ) {
    // 未登录或普通用户只返回已启用的友链；管理员看全部
    const user = (req as any)?.user;
    const isAdmin = user?.roles?.includes('admin') ?? false;
    const finalStatus = !isAdmin ? FRIEND_LINK_STATUS.VISIBLE : status;
    const data = await this.service.findAll(
      parsePage(page),
      parsePageSize(pageSize),
      {
        id: id !== undefined ? parseInt(id) : undefined,
        keyword,
        status: finalStatus,
      },
    );
    return { success: true, data, message: 'ok' };
  }

  @Put(':id/toggle-status')
  async toggleStatus(@Param('id', ParseIntPipe) id: number) {
    const data = await this.service.toggleStatus(id);
    return { success: true, data, message: '更新成功' };
  }

  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    const data = await this.service.findById(id);
    return { success: true, data, message: 'ok' };
  }

  @Post()
  async create(@Body() dto: CreateFriendLinkDto) {
    const data = await this.service.create(dto);
    return { success: true, data, message: '创建成功' };
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFriendLinkDto,
  ) {
    const data = await this.service.update(id, dto);
    return { success: true, data, message: '更新成功' };
  }

  @Delete('batch')
  async batchRemove(@Body() dto: BatchIdsDto) {
    await this.service.batchRemove(dto.ids);
    return { success: true, message: '批量删除成功' };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.service.remove(id);
    return { success: true, message: '删除成功' };
  }
}
