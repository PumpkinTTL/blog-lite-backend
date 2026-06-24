import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Res,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { BackupService } from './backup.service';
import { BackupScheduleService } from './backup-schedule.service';
import { CreateScheduleDto, UpdateScheduleDto } from './backup.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { parsePage, parsePageSize } from '../../common/utils/parse-pagination';

@Controller('backup')
@Roles('admin')
export class BackupController {
  constructor(
    private readonly backupService: BackupService,
    private readonly scheduleService: BackupScheduleService,
  ) {}

  // ──────────────── 备份历史 ────────────────

  @Get('logs')
  async logs(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const data = await this.backupService.findLogs(
      parsePage(page),
      parsePageSize(pageSize),
    );
    return { success: true, data, message: 'ok' };
  }

  /** 手动触发一次备份 */
  @Post('run')
  async run() {
    // 手动备份不阻塞请求，立即返回记录（status=running），后台执行
    const data = await this.backupService.runBackup('manual');
    return { success: true, data, message: '备份已触发' };
  }

  /** 重新校验备份是否在 R2 存在 */
  @Post('logs/:id/verify')
  async verify(@Param('id') id: string) {
    const data = await this.backupService.verifyBackup(Number(id));
    // 校验失败时抛 HTTP 错误（前端走 catch 分支显示 error toast），
    // 不能用 success:true 包裹失败消息（否则前端把"校验失败"放进绿色 success toast）。
    if (!data.verified) {
      throw new BadRequestException('校验失败：R2 文件不存在');
    }
    return { success: true, data, message: '校验通过' };
  }

  /** 下载备份（生成 presigned URL → 302 跳转） */
  @Get('logs/:id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const log = await this.backupService.findLogById(Number(id));
    if (!log || !log.r2Key) {
      res.status(HttpStatus.NOT_FOUND).json({ message: '备份文件不存在' });
      return;
    }
    const url = await this.backupService.getDownloadUrl(log.r2Key);
    res.redirect(HttpStatus.FOUND, url);
  }

  /** 删除备份记录（同时删 R2 文件） */
  @Delete('logs/:id')
  async deleteLog(@Param('id') id: string) {
    await this.backupService.deleteLog(Number(id), true);
    return { success: true, message: '已删除' };
  }

  // ──────────────── 定时器管理 ────────────────

  /** 列出所有定时器 */
  @Get('schedules')
  async listSchedules() {
    const data = await this.scheduleService.list();
    return { success: true, data, message: 'ok' };
  }

  /** 新建定时器 */
  @Post('schedules')
  async createSchedule(@Body() dto: CreateScheduleDto) {
    const data = await this.scheduleService.create(dto);
    return { success: true, data, message: '定时器已创建' };
  }

  /** 更新定时器（含启停） */
  @Put('schedules/:id')
  async updateSchedule(
    @Param('id') id: string,
    @Body() dto: UpdateScheduleDto,
  ) {
    const data = await this.scheduleService.update(id, dto);
    return { success: true, data, message: '已更新' };
  }

  /** 删除定时器 */
  @Delete('schedules/:id')
  async removeSchedule(@Param('id') id: string) {
    await this.scheduleService.remove(id);
    return { success: true, message: '已删除' };
  }

  /** 立即按某定时器配置执行一次 */
  @Post('schedules/:id/run')
  async runBySchedule(@Param('id') id: string) {
    const cfg = await this.scheduleService.getById(id);
    const data = await this.backupService.runBackup('schedule', cfg.name);
    return { success: true, data, message: '已触发' };
  }
}
