import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, Query } from '@nestjs/common';
import { CategoryService } from './category.service';
import { CategoryEntity } from './category.entity';

@Controller('category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  async list(
    @Query('id') id?: string,
    @Query('keyword') keyword?: string,
  ) {
    const data = await this.categoryService.findAll({
      id: id !== undefined ? parseInt(id) : undefined,
      keyword,
    });
    return { success: true, data, message: 'ok' };
  }

  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    const data = await this.categoryService.findById(id);
    return { success: true, data, message: 'ok' };
  }

  @Post()
  async create(@Body() body: Partial<CategoryEntity>) {
    const data = await this.categoryService.create(body);
    return { success: true, data, message: '创建成功' };
  }

  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<CategoryEntity>) {
    const data = await this.categoryService.update(id, body);
    return { success: true, data, message: '更新成功' };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.categoryService.remove(id);
    return { success: true, message: '删除成功' };
  }
}
