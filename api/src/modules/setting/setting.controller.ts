import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { SettingService } from './setting.service';
import {
  CreateSettingDto,
  UpdateSettingDto,
  BatchUpdateSettingDto,
} from './setting.dto';
import { Roles } from '../../common/decorators/roles.decorator';

/** 从 req.user 提取操作者信息（审计用） */
function getOperator(req: Request) {
  const user = (req as any)?.user;
  return {
    id: user?.sub ? Number(user.sub) : undefined,
    name: user?.nickname,
  };
}

@Controller('setting')
@Roles('admin')
export class SettingController {
  constructor(private readonly service: SettingService) {}

  @Get()
  async list() {
    const data = await this.service.findAll();
    return { success: true, data, message: 'ok' };
  }

  @Get('group/:group')
  async getByGroup(@Param('group') group: string) {
    const data = await this.service.findByGroup(group);
    return { success: true, data, message: 'ok' };
  }

  @Put('group/:group')
  async batchUpdateByGroup(
    @Param('group') group: string,
    @Body() dto: BatchUpdateSettingDto,
    @Req() req: Request,
  ) {
    const data = await this.service.batchUpdateByGroup(
      group,
      dto.items,
      getOperator(req),
    );
    return { success: true, data, message: '更新成功' };
  }

  @Get(':key')
  async getByKey(@Param('key') key: string) {
    const data = await this.service.findByKey(key);
    return { success: true, data, message: 'ok' };
  }

  @Post()
  async create(@Body() dto: CreateSettingDto, @Req() req: Request) {
    const data = await this.service.create(dto, getOperator(req));
    return { success: true, data, message: '创建成功' };
  }

  @Put('batch')
  async batchUpdate(@Body() dto: BatchUpdateSettingDto, @Req() req: Request) {
    const data = await this.service.batchUpdate(dto.items, getOperator(req));
    return { success: true, data, message: '更新成功' };
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSettingDto,
    @Req() req: Request,
  ) {
    const data = await this.service.updateById(id, dto, getOperator(req));
    return { success: true, data, message: '更新成功' };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    await this.service.remove(id, getOperator(req));
    return { success: true, message: '删除成功' };
  }
}
