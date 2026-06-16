import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiProviderModule } from '../ai-provider/ai-provider.module';

/**
 * AI 模块：封装 OpenAI 兼容协议调用，对外暴露可复用的 AiService。
 *
 * - 局部注册 HttpModule（LLM 调用慢，给 30s 超时）
 * - 导入 AiProviderModule，从 DB 读 provider/model 配置（不再硬编码 .env）
 * - 导出 AiService，任意模块 Import 后即可注入复用
 */
@Module({
  imports: [HttpModule.register({ timeout: 30000 }), AiProviderModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
