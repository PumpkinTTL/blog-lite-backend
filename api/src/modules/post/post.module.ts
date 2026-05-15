import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostEntity } from './entities/post.entity';
import { TagEntity } from '../tag/entities/tag.entity';
import { PostService } from './services/post.service';
import { PostController } from './controllers/post.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PostEntity, TagEntity])],
  controllers: [PostController],
  providers: [PostService],
  exports: [PostService],
})
export class PostModule {}
