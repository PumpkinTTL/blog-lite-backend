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
import { ResourceService } from './resource.service';
import {
  CreateResourceDto,
  UpdateResourceDto,
  UpdateVisibilityDto,
  RedeemResourceDto,
  BatchIdsDto,
} from './resource.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { parsePage, parsePageSize } from '../../common/utils/parse-pagination';
import { RESOURCE_STATUS } from '../../common/constants/status';
import { MembershipService } from '../membership/membership.service';

@Controller('resource')
@Roles('admin')
export class ResourceController {
  constructor(
    private readonly resourceService: ResourceService,
    private readonly membershipService: MembershipService,
  ) {}

  /** 公开列表：admin 看全部；登录用户看 published+login；匿名看 published。列表永不返回 panLinks */
  @Public()
  @Get()
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('categoryId') categoryId?: string,
    @Query('id') id?: string,
    @Query('keyword') keyword?: string,
    @Req() req?: Request,
  ) {
    const user = (req as any)?.user;
    const isAdmin = user?.roles?.includes('admin') ?? false;
    const isLoggedIn = !!user && !isAdmin;
    const finalStatus = !isAdmin ? undefined : status;

    const data = await this.resourceService.findAll(
      parsePage(page),
      parsePageSize(pageSize),
      {
        id: id !== undefined ? parseInt(id) : undefined,
        keyword,
        status: finalStatus,
        categoryId: categoryId !== undefined ? parseInt(categoryId) : undefined,
      },
      !isAdmin,
      isLoggedIn,
      isAdmin, // withAdminVisibility
    );
    return { success: true, data, message: 'ok' };
  }

  /**
   * 详情：核心锁定逻辑
   * - admin → 完整内容
   * - 无权访问 → 预览信息（基本信息 + locked:true + lockReason），panLinks 为 null
   * - 有权访问 → 完整内容（含 panLinks）
   */
  @Public()
  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const user = (req as any)?.user;
    const isAdmin = user?.roles?.includes('admin') ?? false;
    const userId = user?.sub ? Number(user.sub) : null;
    const userRoleIds: number[] = user?.roleIds ?? [];

    // 查用户当前会员等级（匿名用户为 null）
    const memberLevel = userId
      ? await this.membershipService.getActiveLevel(userId)
      : null;

    const result = await this.resourceService.findByIdForUser(
      id,
      userId,
      userRoleIds,
      memberLevel,
      isAdmin,
    );

    if (!result) {
      return { success: false, message: '资源不存在', data: null };
    }

    // 记录浏览（仅 published 资源）
    if (result.resource.status === RESOURCE_STATUS.PUBLISHED) {
      this.resourceService.incrementView(id).catch(() => void 0);
    }

    const { resource, accessStatus, lockReason } = result;
    return {
      success: true,
      data: {
        ...resource,
        locked: accessStatus === 'locked',
        ...(lockReason ? { lockReason } : {}),
      },
      message: 'ok',
    };
  }

  /** 记录浏览（前台可主动调用） */
  @Public()
  @Post(':id/view')
  async recordView(@Param('id', ParseIntPipe) id: number) {
    await this.resourceService.incrementView(id);
    return { success: true, message: 'ok' };
  }

  /** 兑换码解锁资源（任意登录用户） */
  @Roles()
  @Post('redeem')
  async redeem(
    @Body() dto: RedeemResourceDto,
    @Req() req: Request,
  ) {
    const user = (req as any)?.user;
    const userId = user?.sub ? Number(user.sub) : null;
    if (!userId) {
      return { success: false, message: '请先登录', data: null };
    }
    const ip =
      req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
    const { resource, message } = await this.resourceService.redeem(
      dto.code,
      userId,
      ip,
    );
    return { success: true, data: resource, message };
  }

  @Post()
  async create(@Body() dto: CreateResourceDto) {
    const data = await this.resourceService.create(dto as any);
    return { success: true, data, message: '创建成功' };
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateResourceDto,
  ) {
    const data = await this.resourceService.update(id, dto as any);
    return { success: true, data, message: '更新成功' };
  }

  /** 配置可见性（private 资源用） */
  @Put(':id/visibility')
  async updateVisibility(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVisibilityDto,
  ) {
    await this.resourceService.setVisibility(
      id,
      dto.allowedUserIds,
      dto.allowedRoleIds,
    );
    return { success: true, message: '可见性已更新' };
  }

  @Put(':id/toggle-status')
  async toggleStatus(@Param('id', ParseIntPipe) id: number) {
    const data = await this.resourceService.toggleStatus(id);
    return { success: true, data, message: '状态已切换' };
  }

  /** 批量删除（必须放在 :id 路由之前） */
  @Delete('batch')
  async batchRemove(@Body() dto: BatchIdsDto) {
    await this.resourceService.batchRemove(dto.ids);
    return { success: true, message: '批量删除成功' };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.resourceService.remove(id);
    return { success: true, message: '删除成功' };
  }
}
