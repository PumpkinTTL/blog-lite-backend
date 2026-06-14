import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipEntity } from './membership.entity';
import { MembershipService } from './membership.service';
import { MembershipController } from './membership.controller';
import { PlanModule } from '../plan/plan.module';
import { CodeModule } from '../code/code.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MembershipEntity]),
    PlanModule,
    CodeModule,
  ],
  controllers: [MembershipController],
  providers: [MembershipService],
  exports: [MembershipService],
})
export class MembershipModule {}
