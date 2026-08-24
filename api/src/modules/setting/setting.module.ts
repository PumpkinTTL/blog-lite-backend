import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingEntity } from './setting.entity';
import { SettingService } from './setting.service';
import { SettingController } from './setting.controller';
import { SettingPublicController } from './setting-public.controller';
import { MailerModule } from '../mailer/mailer.module';

/**
 * @Global：让全局 Guard（如 TurnstileGuard，注册在 app.module 的 APP_GUARD）
 * 能直接注入 SettingService，无需每个模块显式 import。
 * 参考 rate-limit.module.ts 同样标 @Global 的做法。
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SettingEntity]), MailerModule],
  // admin（@Roles('admin')）与 public（@Public）分离，避免类装饰器冲突
  controllers: [SettingController, SettingPublicController],
  providers: [SettingService],
  exports: [SettingService],
})
export class SettingModule {}
