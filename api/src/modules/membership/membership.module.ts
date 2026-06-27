import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipEntity } from './membership.entity';
import { MembershipService } from './membership.service';
import { MembershipController } from './membership.controller';
import { PlanModule } from '../plan/plan.module';
import { CodeModule } from '../code/code.module';
import { UserEntity } from '../user/user.entity';
import { RoleEntity } from '../user/role.entity';

@Module({
  imports: [
    // 只注册 UserEntity/RoleEntity（不 import UserModule），避免 User↔Membership 循环依赖。
    // grant()/sweepExpired() 需直接读写 user_roles，故需这两个 repository。
    TypeOrmModule.forFeature([MembershipEntity, UserEntity, RoleEntity]),
    PlanModule,
    CodeModule,
  ],
  controllers: [MembershipController],
  providers: [MembershipService],
  exports: [MembershipService],
})
export class MembershipModule {}
