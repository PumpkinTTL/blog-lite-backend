import { Module, Global } from '@nestjs/common';
import { RateLimitConfigService } from './rate-limit-config.service';
import { RateLimitController } from './rate-limit.controller';

/**
 * @Global：RateLimitConfigService 需被 RateLimitGuard（注册在 AppModule）注入，
 * 设全局避免循环依赖。
 */
@Global()
@Module({
  controllers: [RateLimitController],
  providers: [RateLimitConfigService],
  exports: [RateLimitConfigService],
})
export class RateLimitModule {}
