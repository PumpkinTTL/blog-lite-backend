import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { TagService } from '../services/tag.service';
import { TagEntity } from '../entities/tag.entity';

@Controller('tag')
export class TagController {
  constructor(private readonly tagService: TagService) {}

  @Get()
  async list() {
    const data = await this.tagService.findAll();
    return { success: true, data, message: 'ok' };
  }

  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    const data = await this.tagService.findById(id);
    return { success: true, data, message: 'ok' };
  }

  @Post()
  async create(@Body() body: Partial<TagEntity>) {
    const data = await this.tagService.create(body);
    return { success: true, data, message: '创建成功' };
  }

  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<TagEntity>) {
    const data = await this.tagService.update(id, body);
    return { success: true, data, message: '更新成功' };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.tagService.remove(id);
    return { success: true, message: '删除成功' };
  }
}
