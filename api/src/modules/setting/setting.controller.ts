import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { SettingService } from './setting.service';
import { CreateSettingDto, UpdateSettingDto } from './setting.dto';

@Controller('setting')
export class SettingController {
  constructor(private readonly service: SettingService) {}

  @Get()
  async list() {
    const data = await this.service.findAll();
    return { success: true, data, message: 'ok' };
  }

  @Get(':key')
  async getByKey(@Param('key') key: string) {
    const data = await this.service.findByKey(key);
    return { success: true, data, message: 'ok' };
  }

  @Post()
  async create(@Body() dto: CreateSettingDto) {
    const data = await this.service.create(dto);
    return { success: true, data, message: '创建成功' };
  }

  @Put('batch')
  async batchUpdate(@Body() items: Record<string, string>) {
    const data = await this.service.batchUpdate(items);
    return { success: true, data, message: '更新成功' };
  }

  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSettingDto) {
    const data = await this.service.updateById(id, dto);
    return { success: true, data, message: '更新成功' };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.service.remove(id);
    return { success: true, message: '删除成功' };
  }
}
