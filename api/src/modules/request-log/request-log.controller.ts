import {
  Controller,
  Get,
  Query,
  Post,
  Param,
  UseInterceptors,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { RequestLogService } from './request-log.service';
import { parsePage, parsePageSize } from '../../common/utils/parse-pagination';
import { Roles } from '../../common/decorators/roles.decorator';

/**
 * 请求日志查询（仅 admin）。
 *
 * admin 后台「请求日志」tab 用这些接口：
 * - GET /request-log/list：分页列表 + 多条件搜索（requestId/IP/status/method/userId/时间范围）
 * - GET /request-log/:requestId：按追踪号精确查一条（用户报错追溯主入口）
 * - POST /request-log/clean?retainDays=30：清理过期日志
 */
@Controller('request-log')
@UseInterceptors(ClassSerializerInterceptor)
@Roles('admin')
export class RequestLogController {
  constructor(private readonly requestLogService: RequestLogService) {}

  @Get('list')
  async findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('requestId') requestId?: string,
    @Query('ip') ip?: string,
    @Query('status') status?: string,
    @Query('method') method?: string,
    @Query('userId') userId?: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
  ) {
    return this.requestLogService.findAll({
      page: parsePage(page),
      pageSize: parsePageSize(pageSize),
      requestId: requestId?.trim() || undefined,
      ip: ip?.trim() || undefined,
      status: status ? Number(status) : undefined,
      method: method?.trim().toUpperCase() || undefined,
      userId: userId ? Number(userId) : undefined,
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
    });
  }

  /** 按 requestId 精确查（用户报错追溯主入口） */
  @Get(':requestId')
  async findByRequestId(@Param('requestId') requestId: string) {
    const log = await this.requestLogService.findByRequestId(requestId);
    return { success: true, data: log };
  }

  /** 清理过期日志（默认保留 30 天） */
  @Post('clean')
  async clean(@Query('retainDays') retainDays?: string) {
    const days = retainDays ? Number(retainDays) : 30;
    const deleted = await this.requestLogService.cleanExpired(days);
    return { success: true, message: `已清理 ${deleted} 条过期日志（保留 ${days} 天）` };
  }
}
