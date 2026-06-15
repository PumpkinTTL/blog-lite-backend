import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('audit-log')
@Roles('admin')
export class AuditLogController {
  constructor(private readonly service: AuditLogService) {}

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const data = await this.service.findAll(
      Math.max(parseInt(page || '1'), 1),
      Math.min(parseInt(pageSize || '20'), 100));
    return { success: true, data, message: 'ok' };
  }

  @Get(':type/:id')
  async findByTarget(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const data = await this.service.findByTarget(type as any, id,
      Math.max(parseInt(page || '1'), 1),
      Math.min(parseInt(pageSize || '20'), 100));
    return { success: true, data, message: 'ok' };
  }
}
