import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntityVisibilityEntity } from './entity-visibility.entity';
import { EntityVisibilityService } from './entity-visibility.service';

@Module({
  imports: [TypeOrmModule.forFeature([EntityVisibilityEntity])],
  providers: [EntityVisibilityService],
  exports: [EntityVisibilityService],
})
export class EntityVisibilityModule {}
