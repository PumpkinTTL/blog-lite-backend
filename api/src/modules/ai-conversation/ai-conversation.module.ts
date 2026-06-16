import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiConversationEntity } from './ai-conversation.entity';
import { AiConversationService } from './ai-conversation.service';
import { AiConversationController } from './ai-conversation.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AiConversationEntity])],
  controllers: [AiConversationController],
  providers: [AiConversationService],
  exports: [AiConversationService],
})
export class AiConversationModule {}
