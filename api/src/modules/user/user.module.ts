import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './user.entity';
import { RoleEntity } from './role.entity';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { RoleService } from './role.service';
import { RoleController } from './role.controller';
import { CodeModule } from '../code/code.module';
import { EmailCodeModule } from '../email-code/email-code.module';
import { MembershipModule } from '../membership/membership.module';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, RoleEntity]), CodeModule, EmailCodeModule, MembershipModule],
  controllers: [UserController, RoleController],
  providers: [UserService, RoleService],
  exports: [UserService, RoleService],
})
export class UserModule {}
