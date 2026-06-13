import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostEntity } from './post.entity';
import { PostViewEntity } from './post-view.entity';
import { TagEntity } from '../tag/tag.entity';
import { PostService } from './post.service';
import { PostController } from './post.controller';
import { EntityVisibilityModule } from '../entity-visibility/entity-visibility.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PostEntity, PostViewEntity, TagEntity]),
    EntityVisibilityModule,
  ],
  controllers: [PostController],
  providers: [PostService],
  exports: [PostService],
})
export class PostModule {}
