import { Injectable, Logger, BadGatewayException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type { AxiosError } from 'axios';
import type { Readable } from 'stream';
import type { AiGenerateField, AiChatMessage, AiToolCall } from './ai.dto';
import { POST_AGENT_SYSTEM_PROMPT, POST_AGENT_TOOLS } from './ai.prompts';
import { AiProviderService } from '../ai-provider/ai-provider.service';

/** 统一生成返回结构：只有被请求的字段才会有值 */
export interface AiGenerateResult {
  subtitle?: string;
  summary?: string;
  slug?: string;
}

interface AiConfig {
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  source: 'db' | 'env';
}

/**
 * AI 模块核心服务：封装 OpenAI 兼容协议调用。
 *
 * 设计目标：独立、可被任意模块注入复用。
 * - 底层 chat() 私有通用方法：发一次 /chat/completions，返回纯文本
 * - 对外暴露 generateSummary / generateSubtitle / generateSlug 三个语义方法
 * - 对外暴露 generate()：按 fields 数组一次生成多项，供统一面板复用
 *
 * 配置来源：从 DB（ai_providers + ai_models）读取启用的 provider/model，
 *         表为空时兜底回退到环境变量（迁移过渡期不崩）。
 *         带 30s 内存缓存，避免每次调用查库；改配置后最多 30s 生效。
 *
 * 网关特性：强制 stream:true，内部聚合 SSE。
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private cachedConfig: AiConfig | null = null;
  private cacheAt = 0;
  private static readonly CACHE_TTL = 30_000; // 30s

  constructor(
    private readonly providerService: AiProviderService,
    private readonly httpService: HttpService,
  ) {}

  /** 取当前启用的 provider 配置（带缓存） */
  private async getConfig(): Promise<AiConfig> {
    const now = Date.now();
    if (this.cachedConfig && now - this.cacheAt < AiService.CACHE_TTL) {
      return this.cachedConfig;
    }
    const cfg = await this.providerService.getActiveConfig();
    this.cachedConfig = cfg;
    this.cacheAt = now;
    return cfg;
  }

  /** 主动清缓存（配置变更后可调用，目前管理页改配置走自动过期即可） */
  invalidateConfigCache() {
    this.cachedConfig = null;
  }

  /**
   * 压缩对话历史：让 AI 把多轮历史总结成一段摘要。
   * 前端收到摘要后，用 [system:摘要] 替换掉旧历史，释放上下文 token。
   *
   * 入参 history 是扁平的对话记录（user/assistant/tool），会原样喂给 AI。
   * 返回摘要文本（纯文本，可直接作为 system 消息）。
   */
  async summarizeHistory(
    history: AiChatMessage[],
    model?: string,
  ): Promise<string> {
    // 把历史拼成可读文本，让 AI 总结
    const transcript = history
      .map((m) => {
        if (m.role === 'tool') return `[工具结果 ${m.tool_call_id}]: ${m.content}`;
        if (m.role === 'assistant' && m.tool_calls?.length) {
          return `[助手-调用工具]: ${m.tool_calls.map((t) => t.function.name).join(', ')}`;
        }
        return `[${m.role}]: ${m.content ?? ''}`;
      })
      .join('\n\n');

    const summarizeMessages: Array<{
      role: 'system' | 'user';
      content: string;
    }> = [
      {
        role: 'system',
        content:
          '你是对话压缩器。把下面的多轮对话历史总结成一段紧凑的摘要，' +
          '保留关键决策、已执行的操作、文章的当前状态和待办事项。' +
          '用第二人称（"你"）描述。只输出摘要正文，不要多余解释。',
      },
      {
        role: 'user',
        content: `请压缩以下对话历史：\n\n${transcript}`,
      },
    ];

    return this.chat(summarizeMessages, model);
  }

  /**
   * 底层通用调用：OpenAI 兼容 /chat/completions。
   *
   * 以 stream:true 发起（网关要求），内部聚合 SSE 流，
   * 对外返回完整纯文本（已 trim）。失败抛 BadGatewayException。
   */
  private async chat(
    messages: Array<{ role: 'system' | 'user'; content: string }>,
    model?: string,
  ): Promise<string> {
    const cfg = await this.getConfig();
    const url = `${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const usedModel = model ?? cfg.defaultModel;
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<Readable>(
          url,
          {
            model: usedModel,
            messages,
            stream: true,
          },
          {
            headers: {
              Authorization: `Bearer ${cfg.apiKey}`,
              'Content-Type': 'application/json',
            },
            responseType: 'stream',
            // 压缩历史时整段对话发给网关总结，响应慢；给 300s 上限避免无限挂起，
            // 真正的超时由前端 compactHistory 的 180s 把控。
            timeout: 300000,
          },
        ),
      );

      // 聚合 SSE 流，拼出完整文本
      const text = await this.aggregateStream(data);
      if (!text) {
        throw new BadGatewayException('AI 返回内容为空');
      }
      return text;
    } catch (e) {
      if (e instanceof BadGatewayException) throw e;
      const err = e as AxiosError;
      const status = err.response?.status;
      const respBody = err.response?.data;
      this.logger.error(
        `AI 调用失败 url=${url} model=${usedModel} status=${status} body=${JSON.stringify(respBody)}`,
      );
      throw new BadGatewayException('AI 服务调用失败，请稍后重试');
    }
  }

  /**
   * Agent 单步调用：聚合 content 与 tool_calls（按 index 聚合分片增量）。
   * 返回 { content, toolCalls, finishReason }，供前端判断是出文本还是执行工具。
   * 仅供 /ai/chat 的 agent 流程使用，不影响现有 generate* 方法。
   */
  async chatOnce(
    messages: AiChatMessage[],
    options?: { tools?: boolean; model?: string },
  ): Promise<{
    content: string;
    toolCalls: AiToolCall[];
    finishReason: string;
  }> {
    const cfg = await this.getConfig();
    const url = `${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const usedModel = options?.model ?? cfg.defaultModel;
    const useTools = options?.tools ?? true;
    const body: Record<string, unknown> = {
      model: usedModel,
      messages,
      stream: true,
    };
    if (useTools) {
      body.tools = POST_AGENT_TOOLS;
      body.tool_choice = 'auto';
    }
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<Readable>(url, body, {
          headers: {
            Authorization: `Bearer ${cfg.apiKey}`,
            'Content-Type': 'application/json',
          },
          responseType: 'stream',
        }),
      );
      return await this.aggregateStreamWithTools(data);
    } catch (e) {
      if (e instanceof BadGatewayException) throw e;
      const err = e as AxiosError;
      this.logger.error(
        `AI agent 调用失败 model=${usedModel} status=${err.response?.status} body=${JSON.stringify(err.response?.data)}`,
      );
      throw new BadGatewayException('AI 服务调用失败，请稍后重试');
    }
  }

  /**
   * 获取原始 SSE 流（供 controller 直接流式转发给前端）。
   * 返回 Readable，上层自行解析 delta.content。
   * 仅供 /ai/chat 的流式 token 输出使用。
   */
  async openStream(
    messages: AiChatMessage[],
    model?: string,
  ): Promise<Readable> {
    const cfg = await this.getConfig();
    const url = `${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const usedModel = model ?? cfg.defaultModel;
    const { data } = await firstValueFrom(
      this.httpService.post<Readable>(
        url,
        {
          model: usedModel,
          messages,
          stream: true,
          // 请求网关在流末尾返回 usage（prompt/completion/total tokens）
          stream_options: { include_usage: true },
          tools: POST_AGENT_TOOLS,
          tool_choice: 'auto',
        },
        {
          headers: {
            Authorization: `Bearer ${cfg.apiKey}`,
            'Content-Type': 'application/json',
          },
          responseType: 'stream',
        },
      ),
    );
    return data;
  }

  /** 拼接 agent system prompt + 当前文章上下文 */
  buildAgentMessages(
    history: AiChatMessage[],
    context?: Record<string, unknown>,
  ): AiChatMessage[] {
    const ctxText = context
      ? `\n\n<context>\n${Object.entries(context)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => {
            if (k === 'content') {
              const c = String(v);
              return `${k}: ${c.length} 字\n预览: ${c.slice(0, 500)}`;
            }
            return `${k}: ${v}`;
          })
          .join('\n')}\n</context>`
      : '';
    const systemMsg: AiChatMessage = {
      role: 'system',
      content: POST_AGENT_SYSTEM_PROMPT + ctxText,
    };
    // system 永远放最前，history 其余按原序
    return [systemMsg, ...history.filter((m) => m.role !== 'system')];
  }

  /**
   * 聚合 OpenAI 兼容 SSE 流，返回拼接后的完整文本。
   * 解析形如 `data: {...}\n\n` 的事件，累加 choices[0].delta.content。
   */
  private async aggregateStream(stream: Readable): Promise<string> {
    let buffer = '';
    let full = '';
    for await (const chunk of stream) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      // 最后一行可能不完整，保留到下次
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith('data:')) continue;
        const payload = s.slice(5).trim();
        if (payload === '[DONE]' || payload === '') continue;
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content;
          if (typeof delta === 'string') full += delta;
        } catch {
          // 单行解析失败时跳过，不中断整条流
        }
      }
    }
    return full.trim();
  }

  /**
   * 双通道聚合 SSE 流：同时累加 content 与按 index 聚合 tool_calls 分片增量。
   * OpenAI 流式 tool_calls 是分片返回的（每个 chunk 只给 arguments 的一截），
   * 需按 delta.tool_calls[].index 拼接，最终解析出完整工具调用列表。
   */
  private async aggregateStreamWithTools(stream: Readable): Promise<{
    content: string;
    toolCalls: AiToolCall[];
    finishReason: string;
  }> {
    let buffer = '';
    let full = '';
    let finishReason = 'stop';
    // 按 index 聚合 tool_call 分片
    const slots: Record<number, AiToolCall> = {};

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

          // 1) 文本通道
          if (typeof delta?.content === 'string') full += delta.content;

          // 2) 工具调用通道：按 index 聚合分片
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
              if (tc.function?.arguments) slot.function.arguments += tc.function.arguments;
            }
          }
        } catch {
          // 单行解析失败时跳过
        }
      }
    }

    const toolCalls = Object.keys(slots)
      .map((k) => Number(k))
      .sort((a, b) => a - b)
      .map((k) => slots[k])
      .filter((tc) => tc.function.name); // 过滤掉无名空槽

    return {
      content: full.trim(),
      toolCalls,
      finishReason,
    };
  }

  /** 生成一句话副标题（≤ 50 字） */
  async generateSubtitle(
    title: string,
    content: string,
    model?: string,
  ): Promise<string> {
    const text = await this.chat(
      [
        {
          role: 'system',
          content:
            '你是一名中文博客编辑。根据用户提供的文章标题和正文，生成一句话副标题。要求：简明扼要、有吸引力、不超过 50 个汉字、不要使用引号或标点结尾的感叹号堆叠。只输出副标题本身，不要任何解释。',
        },
        {
          role: 'user',
          content: `标题：${title || '(无)'}\n\n正文：${this.truncate(content, 4000)}`,
        },
      ],
      model,
    );
    return this.clean(text).slice(0, 200);
  }

  /** 生成摘要（≤ 500 字） */
  async generateSummary(
    title: string,
    content: string,
    model?: string,
  ): Promise<string> {
    const text = await this.chat(
      [
        {
          role: 'system',
          content:
            '你是一名中文博客编辑。根据用户提供的文章标题和正文，生成一段文章摘要。要求：客观概括核心内容、不超过 500 个汉字、可读性强、不要使用 markdown 格式、不要使用引号。只输出摘要本身，不要任何解释。',
        },
        {
          role: 'user',
          content: `标题：${title || '(无)'}\n\n正文：${this.truncate(content, 8000)}`,
        },
      ],
      model,
    );
    return this.clean(text).slice(0, 500);
  }

  /** 生成 URL slug（kebab-case，英文/拼音友好） */
  async generateSlug(
    title: string,
    content: string,
    model?: string,
  ): Promise<string> {
    const text = await this.chat(
      [
        {
          role: 'system',
          content:
            'You are a URL slug generator. Based on the article title (and context from content if title is not English), generate a short URL-friendly slug. Rules: lowercase, words separated by single hyphen, only a-z 0-9 and hyphens, no leading/trailing hyphens, max 60 chars. Output ONLY the slug, nothing else.',
        },
        {
          role: 'user',
          content: `Title: ${title || '(none)'}\n\nContent: ${this.truncate(content, 1000)}`,
        },
      ],
      model,
    );
    // 兜底清洗：去引号、空白，转小写，非法字符替换为连字符
    const slug = this.clean(text)
      .toLowerCase()
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    return slug || `post-${Date.now()}`;
  }

  /**
   * 统一生成入口：按 fields 并发生成多项。
   * 供 AiController 的 /ai/generate 调用，前端一次勾选多个字段。
   */
  async generate(
    title: string,
    content: string,
    fields: AiGenerateField[],
    model?: string,
  ): Promise<AiGenerateResult> {
    const tasks: Array<Promise<void>> = [];
    const result: AiGenerateResult = {};

    if (fields.includes('subtitle')) {
      tasks.push(
        this.generateSubtitle(title, content, model).then((v) => {
          result.subtitle = v;
        }),
      );
    }
    if (fields.includes('summary')) {
      tasks.push(
        this.generateSummary(title, content, model).then((v) => {
          result.summary = v;
        }),
      );
    }
    if (fields.includes('slug')) {
      tasks.push(
        this.generateSlug(title, content, model).then((v) => {
          result.slug = v;
        }),
      );
    }

    await Promise.all(tasks);
    return result;
  }

  /** 去除模型常见的多余包裹（引号、换行） */
  private clean(text: string): string {
    return text.replace(/^["'`\s]+|["'`\s]+$/g, '').trim();
  }

  /** 截断超长内容，避免 token 超限 */
  private truncate(text: string, max: number): string {
    if (!text) return '';
    return text.length > max ? text.slice(0, max) : text;
  }
}
