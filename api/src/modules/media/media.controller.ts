import { Controller, Get, Post, Delete, Body, Param, ParseIntPipe, Query } from '@nestjs/common';
import { MediaService } from './media.service';
import { MediaEntity } from './media.entity';

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('id') id?: string,
    @Query('keyword') keyword?: string,
  ) {
    const data = await this.mediaService.findAll(
      Math.max(parseInt(page || '1'), 1),
      Math.min(parseInt(pageSize || '20'), 100),
      {
        id: id !== undefined ? parseInt(id) : undefined,
        keyword,
      },
    );
    return { success: true, data, message: 'ok' };
  }

  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    const data = await this.mediaService.findById(id);
    return { success: true, data, message: 'ok' };
  }

  @Post()
  async create(@Body() body: Partial<MediaEntity>) {
    const data = await this.mediaService.create(body);
    return { success: true, data, message: '上传成功' };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.mediaService.remove(id);
    return { success: true, message: '删除成功' };
  }
}
