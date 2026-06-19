import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InteractionEntity } from './interaction.entity';
import { UserEntity } from '../user/user.entity';
import { PostEntity } from '../post/post.entity';
import { InteractionService } from './interaction.service';
import { InteractionController } from './interaction.controller';

@Module({
  imports: [
    // UserEntity 供 queryBuilder.leftJoin(UserEntity) 用（非 repo 注入）
    TypeOrmModule.forFeature([InteractionEntity, UserEntity, PostEntity]),
  ],
  controllers: [InteractionController],
  providers: [InteractionService],
  exports: [InteractionService],
})
export class InteractionModule {}
