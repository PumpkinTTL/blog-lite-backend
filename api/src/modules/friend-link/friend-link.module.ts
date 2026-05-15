import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FriendLinkEntity } from './friend-link.entity';
import { FriendLinkService } from './friend-link.service';
import { FriendLinkController } from './friend-link.controller';
import { PostEntity } from '../post/post.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FriendLinkEntity, PostEntity])],
  controllers: [FriendLinkController],
  providers: [FriendLinkService],
  exports: [FriendLinkService],
})
export class FriendLinkModule {}
