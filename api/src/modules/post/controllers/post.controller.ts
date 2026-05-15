import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { PostService } from '../services/post.service';
import { PostEntity } from '../entities/post.entity';

@Controller('post')
export class PostController {
  constructor(private readonly postService: PostService) {}

  @Get()
  async list(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const data = await this.postService.findAll(
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

  @Post()
  async create(@Body() body: Partial<PostEntity>) {
    const data = await this.postService.create(body);
    return { success: true, data, message: '创建成功' };
  }

  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<PostEntity>) {
    const data = await this.postService.update(id, body);
    return { success: true, data, message: '更新成功' };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.postService.remove(id);
    return { success: true, message: '删除成功' };
  }
}
