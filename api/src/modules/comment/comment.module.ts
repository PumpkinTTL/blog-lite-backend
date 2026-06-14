import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommentEntity } from './comment.entity';
import { PostEntity } from '../post/post.entity';
import { CommentService } from './comment.service';
import { CommentController } from './comment.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CommentEntity, PostEntity])],
  controllers: [CommentController],
  providers: [CommentService],
  exports: [CommentService],
})
export class CommentModule {}
