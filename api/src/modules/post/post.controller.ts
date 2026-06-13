import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PostService } from './post.service';
import { CreatePostDto, UpdatePostDto, BatchIdsDto } from './post.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { POST_STATUS } from '../../common/constants/status';

@Controller('post')
@Roles('admin')
export class PostController {
  constructor(private readonly postService: PostService) {}

  @Public()
  @Get()
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('id') id?: string,
    @Query('keyword') keyword?: string,
    @Query('categoryId') categoryId?: string,
    @Query('tagId') tagId?: string,
    @Req() req?: Request,
  ) {
    // 已登录管理员看全部；未登录或普通用户只返回已发布
    const user = (req as any)?.user;
    const isAdmin = user?.roles?.includes('admin') ?? false;
    const data = await this.postService.findAll(
      Math.max(parseInt(page || '1'), 1),
      Math.min(parseInt(pageSize || '20'), 100),
      {
        id: id !== undefined ? parseInt(id) : undefined,
        keyword,
        status: status !== undefined ? status : undefined,
        categoryId: categoryId !== undefined ? parseInt(categoryId) : undefined,
        tagId: tagId !== undefined ? parseInt(tagId) : undefined,
      },
      !isAdmin,
    );
    return { success: true, data, message: 'ok' };
  }

  @Get('trashed')
  async trashed(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const data = await this.postService.findTrashed(
      Math.max(parseInt(page || '1'), 1),
      Math.min(parseInt(pageSize || '20'), 100),
    );
    return { success: true, data, message: 'ok' };
  }

  @Public()
  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const user = (req as any)?.user;
    const isAdmin = user?.roles?.includes('admin') ?? false;
    const userId = user?.sub ? Number(user.sub) : null;

    // admin 看全部，未登录只看 published，已登录非 admin 看除 private 外的（private 另行校验）
    const publicOnly = !isAdmin && userId === null;
    const post = await this.postService.findById(id, publicOnly);
    if (!post) {
      return { success: false, message: '文章不存在', data: null };
    }

    // private 文章：非 admin 用户必须在 allowedUsers 列表里
    if (post.status === POST_STATUS.PRIVATE && !isAdmin) {
      const allowed = (post.allowedUsers || []).some((u: any) => u.id === userId);
      if (!allowed) {
        return { success: false, message: '无权访问', data: null };
      }
    }

    return { success: true, data: post, message: 'ok' };
  }

  @Public()
  @Post(':id/view')
  async recordView(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const ip = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
    const ua = req.headers['user-agent'] || '';
    await this.postService.recordView(id, ip, ua);
    return { success: true, message: 'ok' };
  }

  @Post('batch/publish')
  async batchPublish(@Body() body: BatchIdsDto) {
    await this.postService.batchUpdateStatus(body.ids, POST_STATUS.PUBLISHED);
    return { success: true, message: '批量发布成功' };
  }

  @Post('batch/unpublish')
  async batchUnpublish(@Body() body: BatchIdsDto) {
    await this.postService.batchUpdateStatus(body.ids, POST_STATUS.DRAFT);
    return { success: true, message: '批量下架成功' };
  }

  @Post('batch/delete')
  async batchDelete(@Body() body: BatchIdsDto) {
    await this.postService.batchDelete(body.ids);
    return { success: true, message: '批量删除成功' };
  }

  @Post()
  async create(@Body() dto: CreatePostDto, @Req() req: Request) {
    const payload = req as unknown as { user?: { sub?: string } };
    const authorId = parseInt(payload.user?.sub ?? '1', 10);
    const data = await this.postService.create({ ...dto, authorId });
    return { success: true, data, message: '创建成功' };
  }

  @Put(':id/restore')
  async restore(@Param('id', ParseIntPipe) id: number) {
    await this.postService.restore(id);
    return { success: true, message: '恢复成功' };
  }

  @Put(':id/toggle-pin')
  async togglePin(@Param('id', ParseIntPipe) id: number) {
    const data = await this.postService.togglePin(id);
    return { success: true, data, message: data ? '操作成功' : '文章不存在' };
  }

  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePostDto) {
    const data = await this.postService.update(id, dto);
    return { success: true, data, message: '更新成功' };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.postService.remove(id);
    return { success: true, message: '删除成功' };
  }
}
