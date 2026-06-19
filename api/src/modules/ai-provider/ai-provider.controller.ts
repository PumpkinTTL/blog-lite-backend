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
import { AiProviderService } from './ai-provider.service';
import { CreateAiProviderDto, UpdateAiProviderDto, BatchIdsDto } from './ai-provider.dto';
import { parsePagination } from '../../common/utils/parse-pagination';
import { Roles } from '../../common/decorators/roles.decorator';

/** 脱敏 API Key：只保留前缀和末4位，中间用 **** 代替。
 *  对外接口（列表/详情/active）一律不返回完整 key，防止 admin 面板日志/浏览器内存泄漏。 */
function maskApiKey(key?: string | null): string {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

/** 递归脱敏：单个 entity 或数组里的 apiKey 字段 */
function maskEntity<T extends { apiKey?: string | null }>(data: T): T {
  if (data && typeof data === 'object' && 'apiKey' in data) {
    return { ...data, apiKey: maskApiKey(data.apiKey) };
  }
  return data;
}
function maskList<T extends { apiKey?: string | null }>(list: T[]): T[] {
  return list.map(maskEntity);
}

@Controller('ai-providers')
@Roles('admin')
export class AiProviderController {
  constructor(private readonly service: AiProviderService) {}

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('id') id?: string,
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
  ) {
    const { page: p, pageSize: ps } = parsePagination({ page, pageSize });
    const result = await this.service.findAll(p, ps, {
      id: id ? Number(id) : undefined,
      keyword,
      status: status !== undefined && status !== '' ? Number(status) : undefined,
    });
    // 脱敏 apiKey 后返回
    return {
      success: true,
      data: { ...result, list: maskList(result.list) },
      message: '查询成功',
    };
  }

  @Get('active')
  async findActive() {
    const data = await this.service.findActive();
    return { success: true, data: maskList(data), message: '查询成功' };
  }

  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    const data = await this.service.findById(id);
    return { success: true, data: maskEntity(data), message: '查询成功' };
  }

  @Post()
  async create(@Body() dto: CreateAiProviderDto) {
    const data = await this.service.create(dto);
    return { success: true, data: maskEntity(data), message: '创建成功' };
  }

  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAiProviderDto) {
    // 防护：前端回显的 apiKey 是脱敏值（含 ****），若原样提交会覆盖真实 key。
    // 检测到脱敏值则从 dto 剔除，不更新 apiKey 字段（保留 DB 里的真实 key）。
    if (dto.apiKey && dto.apiKey.includes('****')) {
      delete dto.apiKey;
    }
    const data = await this.service.update(id, dto);
    return { success: true, data: maskEntity(data), message: '更新成功' };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    const data = await this.service.remove(id);
    return { success: true, data: maskEntity(data), message: '删除成功' };
  }

  @Delete('batch')
  async batchRemove(@Body() dto: BatchIdsDto) {
    const data = await this.service.batchRemove(dto.ids);
    return { success: true, data: maskList(data), message: '批量删除成功' };
  }
}
