import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CodeService } from './code.service';
import { CreateCodeDto, UpdateCodeDto, VerifyCodeDto, BatchCreateCodeDto, BatchIdsDto } from './code.dto';
import { Public } from '../../common/decorators/public.decorator';

@Controller('code')
export class CodeController {
  constructor(private readonly codeService: CodeService) {}

  /**
   * 验证码是否可用（公开接口）
   */
  @Public()
  @Post('verify')
  async verify(@Body() dto: VerifyCodeDto) {
    const result = await this.codeService.verifyCode(dto);
    return {
      success: result.valid,
      data: result.code,
      message: result.message,
    };
  }

  /**
   * 获取码列表
   */
  @Get()
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
  ) {
    const data = await this.codeService.findAll(
      Math.max(parseInt(page || '1'), 1),
      Math.min(parseInt(pageSize || '20'), 100),
      {
        type: type as any,
        status: status as any,
        keyword,
      },
    );
    return { success: true, data, message: 'ok' };
  }

  /**
   * 获取所有使用日志（分页）
   */
  @Get('usage-logs')
  async allUsageLogs(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
  ) {
    const data = await this.codeService.findAllUsageLogs(
      Math.max(parseInt(page || '1'), 1),
      Math.min(parseInt(pageSize || '20'), 100),
      keyword,
    );
    return { success: true, data, message: 'ok' };
  }

  /**
   * 获取码详情
   */
  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    const data = await this.codeService.findById(id);
    return { success: true, data, message: 'ok' };
  }

  /**
   * 创建码
   */
  @Post()
  async create(@Body() dto: CreateCodeDto, @Req() req: Request) {
    const creatorId = (req as any).user?.id;
    const data = await this.codeService.createCode(dto, creatorId);
    return { success: true, data, message: '创建成功' };
  }

  /**
   * 批量生成码
   */
  @Post('batch')
  async batchCreate(@Body() dto: BatchCreateCodeDto, @Req() req: Request) {
    const creatorId = (req as any).user?.id;
    const data = await this.codeService.batchCreate(dto, creatorId);
    return { success: true, data, message: '批量生成成功' };
  }

  /**
   * 批量禁用码
   */
  @Put('batch/disable')
  async batchDisable(@Body() dto: BatchIdsDto) {
    await this.codeService.batchDisable(dto.ids);
    return { success: true, message: '批量禁用成功' };
  }

  /**
   * 批量删除码
   */
  @Delete('batch')
  async batchRemove(@Body() dto: BatchIdsDto) {
    await this.codeService.batchRemove(dto.ids);
    return { success: true, message: '批量删除成功' };
  }

  /**
   * 更新码
   */
  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCodeDto) {
    const data = await this.codeService.update(id, dto);
    return { success: true, data, message: '更新成功' };
  }

  /**
   * 删除码
   */
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.codeService.remove(id);
    return { success: true, message: '删除成功' };
  }

  /**
   * 获取码的使用记录
   */
  @Get(':id/usage-logs')
  async usageLogs(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const data = await this.codeService.findUsageLogs(
      id,
      Math.max(parseInt(page || '1'), 1),
      Math.min(parseInt(pageSize || '20'), 100),
    );
    return { success: true, data, message: 'ok' };
  }
}