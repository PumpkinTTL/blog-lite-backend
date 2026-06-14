import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlanEntity } from './plan.entity';
import { PlanService } from './plan.service';
import { PlanController } from './plan.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PlanEntity])],
  controllers: [PlanController],
  providers: [PlanService],
  exports: [PlanService],
})
export class PlanModule {}
