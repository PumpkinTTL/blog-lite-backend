import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceCategoryEntity } from './resource-category.entity';
import { ResourceCategoryService } from './resource-category.service';
import { ResourceCategoryController } from './resource-category.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ResourceCategoryEntity])],
  controllers: [ResourceCategoryController],
  providers: [ResourceCategoryService],
  exports: [ResourceCategoryService],
})
export class ResourceCategoryModule {}
