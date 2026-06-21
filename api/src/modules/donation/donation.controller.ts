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
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DonationService } from './donation.service';
import {
  CreateDonationDto,
  UpdateDonationDto,
  BatchIdsDto,
  SendThanksDto,
} from './donation.dto';
import { DonationStatus } from './donation.entity';
import { Roles } from '../../common/decorators/roles.decorator';
import { parsePage, parsePageSize } from '../../common/utils/parse-pagination';

@Controller('donation')
@Roles('admin')
export class DonationController {
  constructor(private readonly service: DonationService) {}

  @Get('stats')
  async stats() {
    const data = await this.service.getStats();
    return { success: true, data, message: 'ok' };
  }

  @Get('export')
  async export(@Res() res: Response) {
    const csv = await this.service.exportCsv();
    const filename = `donations_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(filename)}"`,
    );
    res.send('\uFEFF' + csv);
  }

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('id') id?: string,
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('payMethod') payMethod?: string,
    @Query('cryptoNetwork') cryptoNetwork?: string,
  ) {
    const p = parsePage(page);
    const ps = parsePageSize(pageSize);
    const data = await this.service.findAll(p, ps, {
      id: id ? Number(id) || undefined : undefined,
      keyword: keyword || undefined,
      status: (status as DonationStatus) || undefined,
      payMethod: payMethod || undefined,
      cryptoNetwork: cryptoNetwork || undefined,
    });
    return { success: true, data, message: 'ok' };
  }

  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    const data = await this.service.findById(id);
    return { success: true, data, message: 'ok' };
  }

  @Post()
  async create(@Body() dto: CreateDonationDto) {
    const data = await this.service.create(dto);
    return { success: true, data, message: '创建成功' };
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDonationDto,
  ) {
    const data = await this.service.update(id, dto);
    return { success: true, data, message: '更新成功' };
  }

  @Put(':id/toggle-status')
  async toggleStatus(@Param('id', ParseIntPipe) id: number) {
    const data = await this.service.toggleStatus(id);
    return { success: true, data, message: '更新成功' };
  }

  @Put(':id/toggle-visible')
  async toggleVisible(@Param('id', ParseIntPipe) id: number) {
    const data = await this.service.toggleVisible(id);
    return { success: true, data, message: '更新成功' };
  }

  /**
   * 发送感谢（统一入口）
   * - 带 codeId：感谢 + 激活码（关联码、锁归属、移出码池）
   * - 不带 codeId：纯感谢邮件
   * 按邮箱自动反查系统用户锁归属；无论成败都写通知记录。
   */
  @Post(':id/send-thanks')
  async sendThanks(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendThanksDto,
    @Req() req: Request,
  ) {
    const operatorId = (req as any).user?.sub
      ? Number((req as any).user.sub)
      : undefined;
    const result = await this.service.sendThanks(
      id,
      {
        email: dto.email,
        codeId: dto.codeId,
        message: dto.message,
        contact: dto.contact,
        platformName: dto.platformName,
        tagline: dto.tagline,
        sendEmail: dto.sendEmail,
      },
      operatorId,
    );

    // 组装提示信息
    const parts: string[] = [];
    if (result.code) {
      parts.push('激活码已发放');
      parts.push(result.claimedUserId ? `已锁定用户#${result.claimedUserId}` : '访客未锁归属');
    } else {
      parts.push('感谢已发送');
    }
    if (dto.sendEmail) {
      parts.push(result.isSent ? '邮件已送达' : '邮件发送失败（已记录，可重发）');
    } else {
      parts.push('未发邮件');
    }
    return { success: true, data: result, message: parts.join('，') };
  }

  /**
   * 查询某笔捐赠的通知历史（发码邮件 + 感谢邮件）
   */
  @Get(':id/notifications')
  async getNotifications(@Param('id', ParseIntPipe) id: number) {
    const data = await this.service.getNotifications(id);
    return { success: true, data, message: 'OK' };
  }

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
