import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModelEntity } from './ai-model.entity';
import { AiProviderEntity } from '../ai-provider/ai-provider.entity';
import { AiModelService } from './ai-model.service';
import { AiModelController } from './ai-model.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AiModelEntity, AiProviderEntity])],
  controllers: [AiModelController],
  providers: [AiModelService],
  exports: [AiModelService],
})
export class AiModelModule {}
