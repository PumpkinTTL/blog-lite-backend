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
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { MembershipService } from './membership.service';
import {
  GrantMembershipDto,
  UpdateMembershipDto,
  RedeemMembershipDto,
  BatchIdsDto,
} from './membership.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { parsePage, parsePageSize } from '../../common/utils/parse-pagination';
import { CodeService } from '../code/code.service';
import { PlanService } from '../plan/plan.service';

@Controller('membership')
export class MembershipController {
  constructor(
    private readonly memberService: MembershipService,
    private readonly codeService: CodeService,
    private readonly planService: PlanService,
  ) {}

  // ===== admin：会员记录管理 =====

  @Get()
  @Roles('admin')
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('userId') userId?: string,
    @Query('planId') planId?: string,
    @Query('status') status?: string,
    @Query('source') source?: string,
  ) {
    const data = await this.memberService.findAll(
      parsePage(page),
      parsePageSize(pageSize),
      {
        userId: userId ? parseInt(userId) : undefined,
        planId: planId ? parseInt(planId) : undefined,
        status,
        source,
      },
    );
    return { success: true, data, message: 'ok' };
  }

  @Get(':id')
  @Roles('admin')
  async detail(@Param('id', ParseIntPipe) id: number) {
    const m = await this.memberService.findById(id);
    return { success: true, data: m, message: 'ok' };
  }

  /**
   * 管理员手动开通 / 续期
   */
  @Post('grant')
  @Roles('admin')
  async grant(@Body() dto: GrantMembershipDto) {
    const m = await this.memberService.grant({
      ...dto,
      source: dto.source ?? 'admin',
    });
    return { success: true, data: m, message: '开通成功' };
  }

  @Put(':id')
  @Roles('admin')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMembershipDto,
  ) {
    const m = await this.memberService.update(id, dto);
    return { success: true, data: m, message: '更新成功' };
  }

  @Delete('batch')
  @Roles('admin')
  async batchRemove(@Body() dto: BatchIdsDto) {
    await this.memberService.batchRemove(dto.ids);
    return { success: true, message: '批量删除成功' };
  }

  @Delete(':id')
  @Roles('admin')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.memberService.remove(id);
    return { success: true, message: '删除成功' };
  }

  // ===== 用户端：兑换码兑换会员 =====

  /**
   * 用户输入会员码 → 自动开通
   */
  @Public()
  @Post('redeem')
  async redeem(@Body() dto: RedeemMembershipDto, @Req() req: Request) {
    const user = (req as any)?.user;
    const userId: number | null = user?.sub ? Number(user.sub) : null;
    if (!userId) {
      return { success: false, message: '请先登录', data: null };
    }

    const ip =
      req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';

    // 1. 验证码（限定 type=membership）
    const verify = await this.codeService.verifyCode({
      code: dto.code,
      type: 'membership',
    });
    if (!verify.valid) {
      return {
        success: false,
        message: verify.message || '兑换码无效',
        data: null,
      };
    }

    const code = verify.code!;
    const planId = (code.metadata as any)?.planId;
    if (!planId) {
      return { success: false, message: '兑换码未关联套餐', data: null };
    }

    // 2. 校验套餐存在且上架
    const plan = await this.planService.findById(planId);
    if (!plan.isActive) {
      return {
        success: false,
        message: `套餐「${plan.name}」已下架`,
        data: null,
      };
    }

    // 3. 使用码（事务扣减 usedCount，插日志）
    try {
      await this.codeService.useCode(dto.code, userId, ip, {
        action: 'redeem_membership',
        planId,
      });
    } catch (e: any) {
      return {
        success: false,
        message: e.message || '兑换码使用失败',
        data: null,
      };
    }

    // 4. 开通会员 —— 时长由套餐 plan.durationDays 决定
    const membership = await this.memberService.grant({
      userId,
      planId,
      source: 'code',
      sourceId: code.id,
      note: `兑换码 ${code.code}`,
    });

    return {
      success: true,
      data: membership,
      message: `已开通「${plan.name}」`,
    };
  }

  // ===== 用户端：查自己的会员状态 =====

  /**
   * 获取当前登录用户的会员等级 + 活跃订阅
   */
  @Public()
  @Get('me/status')
  async myStatus(@Req() req: Request) {
    const user = (req as any)?.user;
    const userId: number | null = user?.sub ? Number(user.sub) : null;
    if (!userId) {
      return {
        success: true,
        data: { level: null, memberships: [] },
        message: 'ok',
      };
    }
    const [level, memberships] = await Promise.all([
      this.memberService.getActiveLevel(userId),
      this.memberService.getUserActiveMemberships(userId),
    ]);
    return { success: true, data: { level, memberships }, message: 'ok' };
  }
}
