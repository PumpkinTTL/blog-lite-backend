import { Controller, Get, Put, Body } from '@nestjs/common';
import { RateLimitConfigService } from './rate-limit-config.service';
import { UpdateRateLimitConfigDto } from './rate-limit.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('rate-limit')
@Roles('admin')
export class RateLimitController {
  constructor(private readonly configService: RateLimitConfigService) {}

  /** 读取当前限流配置（内存中的，含全局默认 + 敏感接口列表） */
  @Get('config')
  async getConfig() {
    const data = this.configService.getConfig();
    return { success: true, data, message: 'ok' };
  }

  /** 保存配置（写 settings 表 + 热刷新内存，立即生效） */
  @Put('config')
  async updateConfig(@Body() dto: UpdateRateLimitConfigDto) {
    await this.configService.saveConfig(
      { limit: dto.defaultLimit, ttl: dto.defaultTtl },
      dto.rules.map((r) => ({
        routeKey: r.routeKey,
        label: r.label,
        limit: r.limit,
        ttl: r.ttl,
      })),
    );
    return { success: true, message: '配置已保存并即时生效' };
  }
}
