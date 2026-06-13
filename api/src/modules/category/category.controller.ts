import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, Query } from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryDto, UpdateCategoryDto } from './category.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('category')
@Roles('admin')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Public()
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

  @Public()
  @Get('tree')
  async tree() {
    const data = await this.categoryService.findTree();
    return { success: true, data, message: 'ok' };
  }

  @Public()
  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    const data = await this.categoryService.findById(id);
    return { success: true, data, message: 'ok' };
  }

  @Post()
  async create(@Body() dto: CreateCategoryDto) {
    const data = await this.categoryService.create(dto);
    return { success: true, data, message: '创建成功' };
  }

  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto) {
    const data = await this.categoryService.update(id, dto);
    return { success: true, data, message: '更新成功' };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.categoryService.remove(id);
    return { success: true, message: '删除成功' };
  }
}
