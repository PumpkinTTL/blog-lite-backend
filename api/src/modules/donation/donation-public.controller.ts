import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { DonationService } from './donation.service';
import { PublicSubmitDonationDto } from './donation.dto';
import { Public } from '../../common/decorators/public.decorator';
import { parsePage, parsePageSize } from '../../common/utils/parse-pagination';
import { DONATION_STATUS } from '../../common/constants/status';
import { SettingService } from '../setting/setting.service';

/**
 * 前台公开捐赠接口（@Public）。
 * 与 admin 的 DonationController（@Roles('admin')）分离，避免类装饰器冲突。
 * - 提交登记：强制 pending + isVisible=0（待管理员审核确认）
 * - 捐赠墙：只返回 isVisible=1 && confirmed 的记录，脱敏
 * - 公开统计：仅累计金额 + 人数
 */
@Controller('donation')
export class DonationPublicController {
  constructor(
    private readonly service: DonationService,
    private readonly settingService: SettingService,
  ) {}

  /** 前台自助提交捐赠登记 */
  @Public()
  @Post('public/submit')
  async submit(@Body() dto: PublicSubmitDonationDto) {
    // 站点设置校验：donation.enabled 关闭时拒绝提交（前端已隐藏 UI，这里防绕过）
    const enabled = await this.settingService.findByKey('donation.enabled');
    const enabledVal = enabled?.value;
    if (enabledVal === 'false' || enabledVal === '0') {
      throw new BadRequestException('捐赠登记暂未开放');
    }
    // 强制管理字段：用户提交一律 pending + 不上墙，待管理员确认
    const data = await this.service.create({
      donorName: dto.donorName,
      donorEmail: dto.donorEmail || null,
      amount: dto.amount,
      currency: dto.currency || 'CNY',
      payMethod: dto.payMethod,
      cryptoNetwork: dto.cryptoNetwork || null,
      cryptoTxHash: dto.cryptoTxHash || null,
      message: dto.message || null,
      tradeNo: dto.tradeNo || null,
      status: DONATION_STATUS.PENDING,
      isVisible: 0,
    });
    return {
      success: true,
      data: { id: data.id },
      message: '捐赠登记已提交，我们会在确认到账后尽快处理',
    };
  }

  /** 捐赠墙（公开，脱敏） */
  @Public()
  @Get('public/wall')
  async wall(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const data = await this.service.findPublicWall(
      parsePage(page),
      parsePageSize(pageSize),
    );
    return { success: true, data, message: 'ok' };
  }

  /** 公开统计 */
  @Public()
  @Get('public/stats')
  async stats() {
    const data = await this.service.getPublicStats();
    return { success: true, data, message: 'ok' };
  }
}
