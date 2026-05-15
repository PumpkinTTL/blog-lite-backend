import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostEntity } from '../post/entities/post.entity';
import { CategoryEntity } from '../category/entities/category.entity';
import { TagEntity } from '../tag/entities/tag.entity';
import { MediaEntity } from '../media/entities/media.entity';
import { DashboardService } from './services/dashboard.service';
import { DashboardController } from './controllers/dashboard.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PostEntity, CategoryEntity, TagEntity, MediaEntity])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
