import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, Query } from '@nestjs/common';
import { RoleService } from './role.service';
import { CreateRoleDto, UpdateRoleDto } from './role.dto';

@Controller('role')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  async list(
    @Query('id') id?: string,
    @Query('keyword') keyword?: string,
  ) {
    const data = await this.roleService.findAll({
      id: id !== undefined ? parseInt(id) : undefined,
      keyword,
    });
    return { success: true, data, message: 'ok' };
  }

  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    const data = await this.roleService.findById(id);
    return { success: true, data, message: 'ok' };
  }

  @Post()
  async create(@Body() dto: CreateRoleDto) {
    const data = await this.roleService.create(dto);
    return { success: true, data, message: '创建成功' };
  }

  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
    const data = await this.roleService.update(id, dto);
    return { success: true, data, message: '更新成功' };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.roleService.remove(id);
    return { success: true, message: '删除成功' };
  }
}
