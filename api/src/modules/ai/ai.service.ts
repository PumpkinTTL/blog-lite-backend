import { Injectable, Logger, BadGatewayException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type { AxiosError } from 'axios';
import type { Readable } from 'stream';
import type { AiGenerateField, AiChatMessage, AiToolCall } from './ai.dto';
import { POST_AGENT_SYSTEM_PROMPT, POST_AGENT_TOOLS, CONVERSATION_COMPACT_SYSTEM_PROMPT } from './ai.prompts';
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
 * 网关 SSE 流内下发的错误。
 * 网关不返回 HTTP 500，而是作为流的一帧 `data: {"error":{...}}` 发出。
 * 用专门的 Error 子类，便于上层 catch 区分（不能被 aggregateStream 的 JSON.parse catch 吞掉）。
 */
class GatewayStreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayStreamError';
  }
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

  /**
   * 安全描述 axios 错误响应体。
   * stream 模式下 err.response.data 是未消费的 Readable（含 TLSSocket/ClientRequest 引用），
   * 直接 JSON.stringify 会触发 "Converting circular structure to JSON" 并逃出 catch，
   * 导致本应返回 BadGatewayException 的地方变成 500 + 循环引用报错。
   */
  private describeErrBody(data: unknown): string {
    if (data == null) return '(no body)';
    if (typeof data === 'string') return data.slice(0, 500);
    if (Buffer.isBuffer(data)) return `(buffer ${data.length}B)`;
    try {
      return JSON.stringify(data).slice(0, 500);
    } catch {
      const name = (data as any)?.constructor?.name ?? 'stream';
      return `(不可序列化的 ${name})`;
    }
  }

  /**
   * 从网关返回的 SSE error chunk 里提取人类可读的错误信息。
   *
   * 网关报错时（如 "zero-length empty document"），不返回 HTTP 500，
   * 而是作为 SSE 流的一帧 `data: {"error":{"code":"500","message":"..."}}` 发出。
   * 不同网关字段嵌套层级不一，这里按优先级逐层尝试提取 message：
   *   {error:{message}} / {error:{error}} / {message} / 原样 stringify
   *
   * public：controller 的流式转发循环也要用同一套逻辑识别错误帧。
   */
  extractGatewayError(json: unknown): string | null {
    if (!json || typeof json !== 'object') return null;
    const j = json as Record<string, unknown>;
    const err = j.error as Record<string, unknown> | undefined;
    if (err) {
      if (typeof err.message === 'string' && err.message) {
        // message 可能本身又是一层 JSON 字符串（如 DeepSeek："{\"error\":\"...\"}"）
        return this.tryUnwrapJsonMessage(err.message);
      }
      if (typeof err.error === 'string' && err.error) return err.error;
    }
    if (typeof j.message === 'string' && j.message) return j.message;
    return null;
  }

  /** 尝试把可能是 JSON 字符串的 message 再解一层，提取最内层 message */
  private tryUnwrapJsonMessage(msg: string): string {
    const trimmed = msg.trim();
    if (!trimmed.startsWith('{')) return msg;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        const p = parsed as Record<string, unknown>;
        if (typeof p.message === 'string') return p.message;
        if (typeof p.error === 'string') return p.error;
      }
    } catch {
      /* 不是合法 JSON，原样返回 */
    }
    return msg;
  }

  /**
   * 规范化发给网关的 messages，避免网关对 "empty document" / "zero-length content" 报 500。
   *
   * OpenAI 兼容协议里 assistant 带 tool_calls 时 content 应为 null（不是空串），
   * 但前端历史或不同网关返回的可能是 '' 或 undefined。部分国产网关对空 content 严格校验，
   * 直接抛 "Input is a zero-length, empty document"。
   *
   * 处理：
   * 1. assistant 带 tool_calls 且 content 为空 → content 设为 null（协议规范）
   * 2. assistant 无 tool_calls 且 content 为空 → 丢弃（无效消息，无文本无工具）
   * 3. system/user/tool 的 content 为空 → 丢弃（空 system/user 会让某些网关报错）
   */
  private sanitizeMessages(messages: AiChatMessage[]): AiChatMessage[] {
    const out: AiChatMessage[] = [];
    for (const m of messages) {
      if (m.role === 'assistant') {
        const hasTools = Array.isArray(m.tool_calls) && m.tool_calls.length > 0;
        const content = m.content ?? '';
        if (hasTools) {
          // 带工具调用的 assistant：content 规范化为 null（OpenAI 标准）
          out.push({ ...m, content: content.trim() ? content : null });
        } else if (content.trim()) {
          // 无工具但有文本：保留
          out.push(m);
        }
        // 无工具且无文本：丢弃
        continue;
      }
      // system / user / tool：content 必须非空才保留
      const c = m.content ?? '';
      if (c.trim()) out.push(m);
    }
    return out;
  }

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
   * 构造压缩用的消息数组（system prompt + 可读化的历史 transcript）。
   * 抽出来供 summarizeHistory（非流式）和 controller 的流式压缩共用，
   * 保证两者用同一套 prompt 与 transcript 格式。
   */
  buildCompactMessages(
    history: AiChatMessage[],
  ): Array<{ role: 'system' | 'user'; content: string }> {
    const transcript = history
      .map((m) => {
        if (m.role === 'tool') return `[工具结果 ${m.tool_call_id}]: ${m.content}`;
        if (m.role === 'assistant' && m.tool_calls?.length) {
          return `[助手-调用工具]: ${m.tool_calls.map((t) => t.function.name).join(', ')}`;
        }
        return `[${m.role}]: ${m.content ?? ''}`;
      })
      .join('\n\n');

    return [
      { role: 'system', content: CONVERSATION_COMPACT_SYSTEM_PROMPT },
      { role: 'user', content: `请压缩以下对话历史：\n\n${transcript}` },
    ];
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
    const summarizeMessages = this.buildCompactMessages(history);
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
      // 网关在 SSE 流里下发的错误：透传真实 message，而不是泛化的"调用失败"
      // 让前端能看到诸如 "Input is a zero-length, empty document" 这样的根因
      if (e instanceof GatewayStreamError) {
        this.logger.error(`AI 网关返回错误 url=${url} model=${usedModel} msg=${e.message}`);
        throw new BadGatewayException(`AI 网关错误：${e.message}`);
      }
      const err = e as AxiosError;
      const status = err.response?.status;
      this.logger.error(
        `AI 调用失败 url=${url} model=${usedModel} status=${status} body=${this.describeErrBody(err.response?.data)}`,
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
    /**
     * 是否携带 Agent 工具声明。默认 true（对话用）。
     * 压缩历史是纯文本生成，不需要工具，传 false 避免模型在压缩时调用工具。
     */
    withTools = true,
  ): Promise<Readable> {
    const cfg = await this.getConfig();
    const url = `${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const usedModel = model ?? cfg.defaultModel;
    // 规范化：assistant 带 tool_calls 时 content 设 null，过滤空内容消息。
    // 否则部分网关会报 "Input is a zero-length, empty document" 500。
    const sanitized = this.sanitizeMessages(messages);
    if (sanitized.length === 0) {
      throw new GatewayStreamError('消息内容为空，无法调用 AI');
    }
    const body: Record<string, unknown> = {
      model: usedModel,
      messages: sanitized,
      stream: true,
      // 请求网关在流末尾返回 usage（prompt/completion/total tokens）
      stream_options: { include_usage: true },
    };
    if (withTools) {
      body.tools = POST_AGENT_TOOLS;
      body.tool_choice = 'auto';
    }
    const { data } = await firstValueFrom(
      this.httpService.post<Readable>(url, body, {
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json',
        },
        responseType: 'stream',
      }),
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
    // 在最前加自己的 system prompt（身份+文章context），保留 history 原样。
    // 注意：history 里可能含压缩后的 system 摘要（前端 buildGatewayMessages 注入），
    // 不能过滤掉它，否则压缩摘要会丢失、模型完全不知道之前聊过什么。
    // OpenAI 兼容协议允许多个 system 消息，按顺序生效。
    return [systemMsg, ...history];
  }

  /**
   * 聚合 OpenAI 兼容 SSE 流，返回拼接后的完整文本。
   * 解析形如 `data: {...}\n\n` 的事件，累加 choices[0].delta.content。
   *
   * 若流中出现网关错误帧 `data: {"error":{...}}`，抛 GatewayStreamError
   * （携带提取后的人类可读 message），由上层 catch 透传给前端，
   * 而不是吞掉变成 "AI 返回内容为空"。
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
          // 网关错误帧：流内以 error 字段下发，不返回 HTTP 500
          const errMsg = this.extractGatewayError(json);
          if (errMsg) {
            throw new GatewayStreamError(errMsg);
          }
          const delta = json.choices?.[0]?.delta?.content;
          if (typeof delta === 'string') full += delta;
        } catch (e) {
          // GatewayStreamError 必须向上抛，不能被这里吞掉
          if (e instanceof GatewayStreamError) throw e;
          // 单行解析失败时跳过，不中断整条流
        }
      }
    }
    return full.trim();
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
