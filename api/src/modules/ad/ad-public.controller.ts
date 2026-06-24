import {
  Controller,
  Get,
  Post,
  Body,
  Query,
} from '@nestjs/common';
import { AdService } from './ad.service';
import { TrackAdDto } from './ad.dto';
import { Public } from '../../common/decorators/public.decorator';

/**
 * 前台公开广告接口（@Public）。
 * 与 admin 的 AdController（@Roles('admin')）分离，避免类装饰器冲突。
 * - 列表：按 position 取投放中的广告（脱敏，无 adminNote）
 * - 埋点：曝光/点击计数 +1（fire-and-forget，前台不关心结果）
 *
 * 路由前缀用 /ads 而非 /ad：广告拦截器会拦截含 /ad 的请求路径，
 * 导致浏览器 ERR_BLOCKED_BY_CLIENT。复数 /ads 不触发拦截规则。
 */
@Controller('ads')
export class AdPublicController {
  constructor(private readonly service: AdService) {}

  /** 按位置取投放中的广告列表（前台展示） */
  @Public()
  @Get('public/list')
  async list(@Query('position') position?: string) {
    const data = await this.service.findPublic(position);
    return { success: true, data, message: 'ok' };
  }

  /** 埋点计数（曝光/点击） */
  @Public()
  @Post('public/track')
  async track(@Body() dto: TrackAdDto) {
    await this.service.track(dto.id, dto.type);
    return { success: true, message: 'ok' };
  }
}
