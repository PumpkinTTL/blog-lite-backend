import { Module, Global } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TurnstileGuard } from './turnstile.guard';

/**
 * Turnstile 模块。
 *
 * 必须 @Global：TurnstileGuard 作为 APP_GUARD 注册在 AppModule，其依赖必须
 * 在 AppModule 的注入上下文里全局可见。HttpModule 在这里 import 后，
 * 通过 @Global + exports.HttpModule 让 HttpService 对 AppModule 可注入。
 * （参考 RateLimitModule 同样标 @Global 的做法）
 *
 * 其余依赖：
 * - SettingService：SettingModule 已 @Global，可直接注入
 * - Reflector：@nestjs/core 内置，无需声明
 */
@Global()
@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
    }),
  ],
  providers: [TurnstileGuard],
  exports: [TurnstileGuard, HttpModule],
})
export class TurnstileModule {}
