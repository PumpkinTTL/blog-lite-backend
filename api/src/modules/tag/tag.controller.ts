import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, Query } from '@nestjs/common';
import { TagService } from './tag.service';
import { CreateTagDto, UpdateTagDto } from './tag.dto';

@Controller('tag')
export class TagController {
  constructor(private readonly tagService: TagService) {}

  @Get()
  async list(
    @Query('id') id?: string,
    @Query('keyword') keyword?: string,
  ) {
    const data = await this.tagService.findAll({
      id: id !== undefined ? parseInt(id) : undefined,
      keyword,
    });
    return { success: true, data, message: 'ok' };
  }

  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    const data = await this.tagService.findById(id);
    return { success: true, data, message: 'ok' };
  }

  @Post()
  async create(@Body() dto: CreateTagDto) {
    const data = await this.tagService.create(dto);
    return { success: true, data, message: '创建成功' };
  }

  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTagDto) {
    const data = await this.tagService.update(id, dto);
    return { success: true, data, message: '更新成功' };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.tagService.remove(id);
    return { success: true, message: '删除成功' };
  }
}
