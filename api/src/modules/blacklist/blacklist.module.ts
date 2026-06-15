import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlacklistEntity } from './blacklist.entity';
import { BlacklistService } from './blacklist.service';
import { BlacklistController } from './blacklist.controller';

/**
 * @Global：BlacklistService 需被 BlacklistGuard（注册在 AppModule providers）注入，
 * 设为全局模块避免 AppModule 显式 import BlacklistModule 的循环依赖。
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([BlacklistEntity])],
  controllers: [BlacklistController],
  providers: [BlacklistService],
  exports: [BlacklistService],
})
export class BlacklistModule {}
