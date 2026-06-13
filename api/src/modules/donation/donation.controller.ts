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
  Res,
  DefaultValuePipe,
  ParseBoolPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { DonationService } from './donation.service';
import { CreateDonationDto, UpdateDonationDto } from './donation.dto';
import { DonationStatus } from './donation.entity';

@Controller('donation')
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
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
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
    const p = Math.max(Number(page) || 1, 1);
    const ps = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    const data = await this.service.findAll(p, ps, {
      id: id ? (Number(id) || undefined) : undefined,
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
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDonationDto) {
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

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.service.remove(id);
    return { success: true, message: '删除成功' };
  }
}
