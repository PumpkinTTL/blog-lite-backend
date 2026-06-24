import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { AdService } from './ad.service';
import { CreateAdDto, UpdateAdDto, BatchIdsDto } from './ad.dto';
import { AdEntity } from './ad.entity';
import { Roles } from '../../common/decorators/roles.decorator';
import { parsePage, parsePageSize } from '../../common/utils/parse-pagination';

// 路由前缀用 /ads 而非 /ad：广告拦截器会拦含 /ad 的请求（ERR_BLOCKED_BY_CLIENT）。
@Controller('ads')
@Roles('admin')
export class AdController {
  constructor(private readonly service: AdService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('id') id?: string,
    @Query('keyword') keyword?: string,
    @Query('position') position?: string,
    @Query('status') status?: string,
  ) {
    const data = await this.service.findAll(
      parsePage(page),
      parsePageSize(pageSize),
      {
        id: id ? Number(id) || undefined : undefined,
        keyword: keyword || undefined,
        position: position || undefined,
        status: status || undefined,
      },
    );
    return { success: true, data, message: 'ok' };
  }

  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    const data = await this.service.findById(id);
    return { success: true, data, message: 'ok' };
  }

  @Post()
  async create(@Body() dto: CreateAdDto) {
    const data = await this.service.create(this.normalizeDto(dto));
    return { success: true, data, message: '创建成功' };
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdDto,
  ) {
    const data = await this.service.update(id, this.normalizeDto(dto));
    return { success: true, data, message: '更新成功' };
  }

  /**
   * DTO → Partial<AdEntity> 规范化：
   * DTO 的 startAt/endAt 是 string（class-validator IsDateString），
   * entity 是 Date | null，这里统一转换。空字符串也转 null。
   */
  private normalizeDto(dto: CreateAdDto | UpdateAdDto): Partial<AdEntity> {
    const out: Record<string, unknown> = { ...dto };
    if ('startAt' in out) {
      out.startAt = out.startAt ? new Date(out.startAt as string) : null;
    }
    if ('endAt' in out) {
      out.endAt = out.endAt ? new Date(out.endAt as string) : null;
    }
    return out as Partial<AdEntity>;
  }

  @Put(':id/toggle-status')
  async toggleStatus(@Param('id', ParseIntPipe) id: number) {
    const data = await this.service.toggleStatus(id);
    return { success: true, data, message: '更新成功' };
  }

  // 注意：batch 必须在 :id 之前，否则 /ad/batch 会被 :id 匹配（ParseIntPipe 报 400）
  @Delete('batch')
  async batchRemove(@Body() dto: BatchIdsDto) {
    await this.service.batchRemove(dto.ids);
    return { success: true, message: '批量删除成功' };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.service.remove(id);
    return { success: true, message: '删除成功' };
  }
}
