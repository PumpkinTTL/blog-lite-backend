import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CodeEntity } from './code.entity';
import { CodeUsageLogEntity } from './code-usage-log.entity';
import { UserEntity } from '../user/user.entity';
import { CodeService } from './code.service';
import { CodeController } from './code.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CodeEntity, CodeUsageLogEntity, UserEntity])],
  controllers: [CodeController],
  providers: [CodeService],
  exports: [CodeService],
})
export class CodeModule {}