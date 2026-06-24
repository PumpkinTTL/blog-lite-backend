import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { BackupLogEntity } from './backup-log.entity';
import { BackupService } from './backup.service';
import { BackupScheduleService } from './backup-schedule.service';
import { BackupController } from './backup.controller';
import { SettingModule } from '../setting/setting.module';

@Module({
  // ScheduleModule 在 app.module 全局 forRoot 注册，
  // 这里只依赖 SettingModule（定时器配置持久化）
  imports: [
    TypeOrmModule.forFeature([BackupLogEntity]),
    SettingModule,
  ],
  controllers: [BackupController],
  providers: [BackupService, BackupScheduleService],
  exports: [BackupService, BackupScheduleService],
})
export class BackupModule {}
