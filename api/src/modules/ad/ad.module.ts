import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdEntity } from './ad.entity';
import { AdService } from './ad.service';
import { AdController } from './ad.controller';
import { AdPublicController } from './ad-public.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AdEntity])],
  // AdController 是 @Roles('admin')；AdPublicController 是 @Public（前台）
  // 两者同前缀 /ad，靠路径 public/list|track 区分，互不冲突
  controllers: [AdController, AdPublicController],
  providers: [AdService],
  exports: [AdService],
})
export class AdModule {}
