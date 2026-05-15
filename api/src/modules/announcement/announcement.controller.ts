import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { AnnouncementService } from './announcement.service';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './announcement.dto';

@Controller('announcement')
export class AnnouncementController {
  constructor(private readonly service: AnnouncementService) {}

  @Get()
  async list() {
    const data = await this.service.findAll();
    return { success: true, data, message: 'ok' };
  }

  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    const data = await this.service.findById(id);
    return { success: true, data, message: 'ok' };
  }

  @Post()
  async create(@Body() dto: CreateAnnouncementDto) {
    const data = await this.service.create(dto);
    return { success: true, data, message: '创建成功' };
  }

  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAnnouncementDto) {
    const data = await this.service.update(id, dto);
    return { success: true, data, message: '更新成功' };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.service.remove(id);
    return { success: true, message: '删除成功' };
  }
}
