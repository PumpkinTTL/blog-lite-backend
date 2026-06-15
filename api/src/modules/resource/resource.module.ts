import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceEntity } from './resource.entity';
import { ResourceService } from './resource.service';
import { ResourceController } from './resource.controller';
import { EntityVisibilityModule } from '../entity-visibility/entity-visibility.module';
import { CodeModule } from '../code/code.module';
import { MembershipModule } from '../membership/membership.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResourceEntity]),
    EntityVisibilityModule,
    CodeModule,
    MembershipModule,
  ],
  controllers: [ResourceController],
  providers: [ResourceService],
  exports: [ResourceService],
})
export class ResourceModule {}
