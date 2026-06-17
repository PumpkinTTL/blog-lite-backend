import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiProviderEntity } from './ai-provider.entity';
import { AiProviderService } from './ai-provider.service';
import { AiProviderController } from './ai-provider.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AiProviderEntity])],
  controllers: [AiProviderController],
  providers: [AiProviderService],
  exports: [AiProviderService],
})
export class AiProviderModule {}
