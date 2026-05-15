import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostEntity } from '../post/post.entity';
import { CategoryEntity } from '../category/category.entity';
import { TagEntity } from '../tag/tag.entity';
import { MediaEntity } from '../media/media.entity';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PostEntity, CategoryEntity, TagEntity, MediaEntity])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
