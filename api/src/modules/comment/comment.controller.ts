import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Patch,
  Req,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { CommentService } from './comment.service';
import {
  CreateCommentDto,
  UpdateCommentDto,
  ModerateCommentDto,
  BatchIdsDto,
} from './comment.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('comment')
export class CommentController {
  constructor(private readonly service: CommentService) {}

  // ===== 用户端：列表（公开，只看 approved）=====

  /**
   * 列出某实体的一级评论（已审核）
   */
  @Public()
  @Get()
  async list(
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    if (!entityType || !entityId) {
      throw new BadRequestException('entityType/entityId 必填');
    }
    const { list, total } = await this.service.listTopLevel(
      entityType,
      Number(entityId),
      Number(page),
      Number(pageSize),
    );
    return { success: true, data: { list, total }, message: 'ok' };
  }

  /**
   * 单条一级评论的二级回复（已审核）
   */
  @Public()
  @Get(':id/replies')
  async replies(@Param('id', ParseIntPipe) id: number) {
    const list = await this.service.listReplies(id);
    return { success: true, data: list, message: 'ok' };
  }

  // ===== 用户端：创建/编辑/删除（需登录）=====

  @Post()
  async create(@Body() dto: CreateCommentDto, @Req() req: Request) {
    const userId = Number((req as any)?.user?.sub);
    if (!userId) {
      return { success: false, message: '请先登录', data: null };
    }
    const comment = await this.service.create(userId, dto);
    return { success: true, data: comment, message: '评论已提交，待审核' };
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCommentDto,
    @Req() req: Request,
  ) {
    const userId = Number((req as any)?.user?.sub);
    if (!userId) {
      return { success: false, message: '请先登录', data: null };
    }
    const comment = await this.service.updateByUser(id, userId, dto);
    return { success: true, data: comment, message: '已更新' };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const userId = Number((req as any)?.user?.sub);
    const roles: string[] = (req as any)?.user?.roles || [];
    const isAdmin = roles.includes('admin');
    if (!userId) {
      return { success: false, message: '请先登录', data: null };
    }
    await this.service.delete(id, userId, isAdmin);
    return { success: true, message: '已删除' };
  }

  // ===== 管理端：审核 =====

  /**
   * 管理端列表（可按状态/关键词筛选）
   */
  @Roles('admin')
  @Get('admin/list')
  async adminList(
    @Query('entityType') entityType: string | undefined,
    @Query('entityId') entityId: string | undefined,
    @Query('status') status: 'pending' | 'approved' | 'rejected' | undefined,
    @Query('keyword') keyword: string | undefined,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const result = await this.service.adminList({
      entityType,
      entityId: entityId ? Number(entityId) : undefined,
      status,
      keyword,
      page: Number(page),
      pageSize: Number(pageSize),
    });
    return { success: true, data: result, message: 'ok' };
  }

  /**
   * 单条审核
   */
  @Roles('admin')
  @Patch(':id/moderate')
  async moderate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModerateCommentDto,
  ) {
    const comment = await this.service.moderate(id, dto.status);
    return {
      success: true,
      data: comment,
      message: dto.status === 'approved' ? '已通过' : '已拒绝',
    };
  }

  /**
   * 批量删除
   */
  @Roles('admin')
  @Delete('admin/batch')
  async batchRemove(@Body() dto: BatchIdsDto) {
    await this.service.batchRemove(dto.ids);
    return { success: true, message: '批量删除成功' };
  }

  /**
   * 批量审核
   */
  @Roles('admin')
  @Patch('admin/batch-moderate')
  async batchModerate(
    @Body() dto: { ids: number[]; status: 'approved' | 'rejected' },
  ) {
    if (!Array.isArray(dto?.ids) || dto.ids.length === 0) {
      throw new BadRequestException('ids 必填');
    }
    await this.service.batchModerate(dto.ids, dto.status);
    return { success: true, message: `已批量${dto.status === 'approved' ? '通过' : '拒绝'} ${dto.ids.length} 条` };
  }
}
