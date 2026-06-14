import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { PlanService } from './plan.service';
import { CreatePlanDto, UpdatePlanDto } from './plan.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('plan')
@Roles('admin')
export class PlanController {
  constructor(private readonly planService: PlanService) {}

  /**
   * 公开查询已上架套餐（定价页用）
   */
  @Public()
  @Get('public')
  async listPublic() {
    const list = await this.planService.findAll(true);
    return { success: true, data: list, message: 'ok' };
  }

  @Get()
  async list() {
    const list = await this.planService.findAll(false);
    return { success: true, data: list, message: 'ok' };
  }

  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    const plan = await this.planService.findById(id);
    return { success: true, data: plan, message: 'ok' };
  }

  @Post()
  async create(@Body() dto: CreatePlanDto) {
    const plan = await this.planService.create(dto);
    return { success: true, data: plan, message: '创建成功' };
  }

  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePlanDto) {
    const plan = await this.planService.update(id, dto);
    return { success: true, data: plan, message: '更新成功' };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.planService.remove(id);
    return { success: true, message: '删除成功' };
  }
}
