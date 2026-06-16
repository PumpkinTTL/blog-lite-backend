import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { AiModelService } from './ai-model.service';
import { CreateAiModelDto, UpdateAiModelDto, BatchIdsDto } from './ai-model.dto';
import { parsePagination } from '../../common/utils/parse-pagination';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('ai-models')
@Roles('admin')
export class AiModelController {
  constructor(private readonly service: AiModelService) {}

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('id') id?: string,
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('providerId') providerId?: string,
  ) {
    const { page: p, pageSize: ps } = parsePagination({ page, pageSize });
    const data = await this.service.findAll(p, ps, {
      id: id ? Number(id) : undefined,
      keyword,
      status: status !== undefined && status !== '' ? Number(status) : undefined,
      providerId: providerId ? Number(providerId) : undefined,
    });
    return { success: true, data, message: '查询成功' };
  }

  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    const data = await this.service.findById(id);
    return { success: true, data, message: '查询成功' };
  }

  @Post()
  async create(@Body() dto: CreateAiModelDto) {
    const data = await this.service.create(dto);
    return { success: true, data, message: '创建成功' };
  }

  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAiModelDto) {
    const data = await this.service.update(id, dto);
    return { success: true, data, message: '更新成功' };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    const data = await this.service.remove(id);
    return { success: true, data, message: '删除成功' };
  }

  @Delete('batch')
  async batchRemove(@Body() dto: BatchIdsDto) {
    const data = await this.service.batchRemove(dto.ids);
    return { success: true, data, message: '批量删除成功' };
  }
}
