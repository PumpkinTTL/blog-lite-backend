import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

/**
 * AI 模块：封装 OpenAI 兼容协议调用，对外暴露可复用的 AiService。
 *
 * - 局部注册 HttpModule（LLM 调用慢，给 30s 超时）
 * - 导出 AiService，任意模块 import AiModule 后即可注入复用
 */
@Module({
  imports: [HttpModule.register({ timeout: 30000 })],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
