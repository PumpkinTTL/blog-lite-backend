import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PostService } from './post.service';
import { CreatePostDto, UpdatePostDto } from './post.dto';

@Controller('post')
export class PostController {
  constructor(private readonly postService: PostService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('id') id?: string,
    @Query('keyword') keyword?: string,
    @Query('categoryId') categoryId?: string,
    @Query('tagId') tagId?: string,
  ) {
    const data = await this.postService.findAll(
      Math.max(parseInt(page || '1'), 1),
      Math.min(parseInt(pageSize || '20'), 100),
      {
        id: id !== undefined ? parseInt(id) : undefined,
        keyword,
        status: status !== undefined ? parseInt(status) : undefined,
        categoryId: categoryId !== undefined ? parseInt(categoryId) : undefined,
        tagId: tagId !== undefined ? parseInt(tagId) : undefined,
      },
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

  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    const data = await this.postService.findById(id);
    return { success: true, data, message: 'ok' };
  }

  @Post(':id/view')
  async recordView(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const ip = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
    const ua = req.headers['user-agent'] || '';
    await this.postService.recordView(id, ip, ua);
    return { success: true, message: 'ok' };
  }

  @Post('batch/publish')
  async batchPublish(@Body() body: { ids: number[] }) {
    await this.postService.batchUpdateStatus(body.ids, 1);
    return { success: true, message: '批量发布成功' };
  }

  @Post('batch/unpublish')
  async batchUnpublish(@Body() body: { ids: number[] }) {
    await this.postService.batchUpdateStatus(body.ids, 2);
    return { success: true, message: '批量下架成功' };
  }

  @Post('batch/delete')
  async batchDelete(@Body() body: { ids: number[] }) {
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
