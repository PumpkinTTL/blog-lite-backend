import {
  Controller,
  Post,
  Body,
  Res,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AiService } from './ai.service';
import { AiGenerateDto, AiChatDto } from './ai.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AiToolCall } from './ai.dto';

/**
 * AI 能力接口（仅 admin 可调用）。
 * 通过 AiModule 局部注册，鉴权走全局 AuthGuard + RolesGuard。
 */
@Controller('ai')
@Roles('admin')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /**
   * 统一生成接口：根据文章标题+正文，生成勾选的内容（副标题/摘要/slug）。
   * POST /ai/generate（非流式）
   */
  @Post('generate')
  async generate(@Body() dto: AiGenerateDto) {
    if (!dto.title && !dto.content) {
      throw new BadRequestException('标题和正文不能同时为空');
    }
    if (!dto.fields || dto.fields.length === 0) {
      throw new BadRequestException('请至少选择一项要生成的内容');
    }
    const data = await this.aiService.generate(
      dto.title ?? '',
      dto.content ?? '',
      dto.fields,
      dto.model,
    );
    return { success: true, data, message: 'AI 生成完成' };
  }

  /**
   * Agent 对话接口（SSE 流式，真正逐字输出）。
   * POST /ai/chat
   *
   * agent 循环由前端驱动，后端无状态、每次请求处理一步：
   * 1. 拼 system prompt（含文章 context）+ 历史消息 → 调 AI
   * 2. 边读 AI 的 SSE 边转发 token：每个 delta.content → event: token（实时）
   * 3. 流末尾聚合 tool_calls 分片 → 若有 → event: tool_calls
   * 4. event: done
   *
   * 前端收到 tool_calls 后执行工具，把结果作为 role:'tool' 追加到 messages，
   * 再次 POST /ai/chat 推进下一步，直到 done 且无 tool_calls。
   */
  @Post('chat')
  async chat(@Body() dto: AiChatDto, @Res() res: Response) {
    if (!dto.messages || dto.messages.length === 0) {
      throw new BadRequestException('消息不能为空');
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 禁用 nginx 缓冲，确保实时流
    res.flushHeaders?.();

    const writeEvent = (type: string, data: unknown) => {
      res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
    };

    try {
      const agentMessages = this.aiService.buildAgentMessages(
        dto.messages,
        dto.context as Record<string, unknown> | undefined,
      );

      // 拿到 AI 的原始 SSE 流，边读边转发 + 聚合 tool_calls
      const stream = await this.aiService.openStream(agentMessages, dto.model);

      // tool_calls 按 index 聚合分片
      const slots: Record<number, AiToolCall> = {};
      let finishReason = 'stop';
      let buffer = '';

      for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const s = line.trim();
          if (!s.startsWith('data:')) continue;
          const payload = s.slice(5).trim();
          if (payload === '[DONE]' || payload === '') continue;
          try {
            const json = JSON.parse(payload);
            const choice = json.choices?.[0];
            if (!choice) continue;
            if (choice.finish_reason) finishReason = choice.finish_reason;
            const delta = choice.delta;

            // 实时转发思考过程（reasoning_content，网关原生字段）
            if (typeof delta?.reasoning_content === 'string' && delta.reasoning_content) {
              writeEvent('thinking', { text: delta.reasoning_content });
            }

            // 实时转发正式回复 token（content）
            if (typeof delta?.content === 'string' && delta.content) {
              writeEvent('token', { text: delta.content });
            }

            // 聚合 tool_call 分片
            const tcs = delta?.tool_calls;
            if (Array.isArray(tcs)) {
              for (const tc of tcs) {
                const idx = typeof tc.index === 'number' ? tc.index : 0;
                const slot = (slots[idx] ??= {
                  id: '',
                  type: 'function' as const,
                  function: { name: '', arguments: '' },
                });
                if (tc.id) slot.id = tc.id;
                if (tc.function?.name) slot.function.name += tc.function.name;
                if (tc.function?.arguments)
                  slot.function.arguments += tc.function.arguments;
              }
            }
          } catch {
            // 单行解析失败跳过
          }
        }
      }

      // 流结束：下发 tool_calls（若有）
      const toolCalls = Object.keys(slots)
        .map((k) => Number(k))
        .sort((a, b) => a - b)
        .map((k) => slots[k])
        .filter((tc) => tc.function.name);

      if (toolCalls.length > 0) {
        writeEvent('tool_calls', { calls: toolCalls });
      }
      writeEvent('done', {
        finishReason,
        hasToolCalls: toolCalls.length > 0,
      });
    } catch (e) {
      writeEvent('error', {
        message: e instanceof Error ? e.message : 'AI 调用失败',
      });
    } finally {
      res.end();
    }
  }
}
