import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Query,
  Param,
  Req,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { InteractionService } from './interaction.service';
import { ToggleInteractionDto, BatchCountDto } from './interaction.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { parsePage, parsePageSize } from '../../common/utils/parse-pagination';

/**
 * 互动控制器：点赞 / 收藏
 * 装饰器签名一律用 string，避免 isolatedModules + emitDecoratorMetadata 引用
 * type-only export 的兼容性问题。
 */
@Controller('interaction')
export class InteractionController {
  constructor(private readonly service: InteractionService) {}

  /**
   * 切换互动（点赞/收藏）
   * 需登录，未登录会被 AuthGuard 拦截
   */
  @Post('toggle')
  async toggle(@Body() dto: ToggleInteractionDto, @Req() req: Request) {
    const userId = Number((req as any)?.user?.sub);
    if (!userId) {
      return { success: false, message: '请先登录', data: null };
    }
    const result = await this.service.toggle(
      userId,
      dto.entityType,
      dto.entityId,
      dto.type,
    );
    return {
      success: true,
      data: result,
      message: result.active ? '已操作' : '已取消',
    };
  }

  /**
   * 批量查当前用户在某组实体上的互动状态
   * @Public 因为未登录用户也算"未互动"，需要返回全 false
   */
  @Public()
  @Get('status')
  async status(
    @Query('entityType') entityType: string,
    @Query('type') type: string,
    @Query('entityIds') entityIdsStr: string,
    @Req() req: Request,
  ) {
    if (!entityType || !type || !entityIdsStr) {
      throw new BadRequestException('entityType/type/entityIds 必填');
    }
    const entityIds = entityIdsStr
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (entityIds.length === 0) {
      return { success: true, data: {}, message: 'ok' };
    }
    const userId = Number((req as any)?.user?.sub) || 0;
    if (!userId) {
      const result: Record<number, boolean> = {};
      entityIds.forEach((id) => (result[id] = false));
      return { success: true, data: result, message: 'ok' };
    }
    const map = await this.service.getUserStatus(
      userId,
      entityType as any,
      entityIds,
      type as any,
    );
    const result: Record<number, boolean> = {};
    entityIds.forEach((id) => (result[id] = map.get(id) ?? false));
    return { success: true, data: result, message: 'ok' };
  }

  /**
   * 批量查多个实体的互动计数（公开）
   */
  @Public()
  @Post('count')
  async count(@Body() dto: BatchCountDto) {
    if (
      !dto?.entityType ||
      !Array.isArray(dto?.entityIds) ||
      dto.entityIds.length === 0
    ) {
      throw new BadRequestException('entityType/entityIds 必填');
    }
    const likeMap = await this.service.getCounts(
      dto.entityType,
      dto.entityIds,
      'like',
    );
    const favMap = await this.service.getCounts(
      dto.entityType,
      dto.entityIds,
      'favorite',
    );
    const result: Record<
      number,
      { likeCount: number; favoriteCount: number }
    > = {};
    dto.entityIds.forEach((id) => {
      result[id] = {
        likeCount: likeMap.get(id) ?? 0,
        favoriteCount: favMap.get(id) ?? 0,
      };
    });
    return { success: true, data: result, message: 'ok' };
  }

  /**
   * 我的互动列表（点赞/收藏，分页）
   */
  @Get('me')
  async myList(
    @Query('type') type: string,
    @Query('entityType') entityType: string | undefined,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Req() req: Request,
  ) {
    const userId = Number((req as any)?.user?.sub);
    if (!userId) {
      return { success: false, message: '请先登录', data: null };
    }
    if (!type) throw new BadRequestException('type 必填');
    const { list, total } = await this.service.listMine(
      userId,
      type as any,
      entityType as any,
      parsePage(page),
      parsePageSize(pageSize),
    );
    return {
      success: true,
      data: { list, total },
      message: 'ok',
    };
  }

  // ===== 管理端：列表/删除 =====

  /**
   * 管理端列表（可按 类型/目标类型/userId/entityId/用户名关键词 筛选）
   */
  @Roles('admin')
  @Get('admin/list')
  async adminList(
    @Query('type') type: string | undefined,
    @Query('entityType') entityType: string | undefined,
    @Query('userId') userId: string | undefined,
    @Query('entityId') entityId: string | undefined,
    @Query('keyword') keyword: string | undefined,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const result = await this.service.adminList({
      type: type as any,
      entityType: entityType as any,
      userId: userId ? Number(userId) : undefined,
      entityId: entityId ? Number(entityId) : undefined,
      keyword,
      page: parsePage(page),
      pageSize: parsePageSize(pageSize),
    });
    return { success: true, data: result, message: 'ok' };
  }

  /**
   * 批量删除（admin）
   * 注意：必须放在 :id 路由前面，否则 "batch" 会被 :id 匹配
   */
  @Roles('admin')
  @Delete('admin/batch')
  async adminBatchDelete(@Body() dto: { ids: number[] }) {
    if (!Array.isArray(dto?.ids) || dto.ids.length === 0) {
      throw new BadRequestException('ids 必填');
    }
    await this.service.adminBatchDelete(dto.ids);
    return { success: true, message: `已批量删除 ${dto.ids.length} 条` };
  }

  /**
   * 删除单条互动（admin）
   */
  @Roles('admin')
  @Delete('admin/:id')
  async adminDelete(@Param('id', ParseIntPipe) id: number) {
    await this.service.adminDelete(id);
    return { success: true, message: '已删除' };
  }
}
