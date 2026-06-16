import { Injectable, Logger, BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type { AxiosError } from 'axios';
import type { Readable } from 'stream';
import type { AiGenerateField } from './ai.dto';

/** 统一生成返回结构：只有被请求的字段才会有值 */
export interface AiGenerateResult {
  subtitle?: string;
  summary?: string;
  slug?: string;
}

/**
 * AI 模块核心服务：封装 OpenAI 兼容协议调用。
 *
 * 设计目标：独立、可被任意模块注入复用。
 * - 底层 chat() 私有通用方法：发一次 /chat/completions，返回纯文本
 * - 对外暴露 generateSummary / generateSubtitle / generateSlug 三个语义方法
 * - 对外暴露 generate()：按 fields 数组一次生成多项，供统一面板复用
 *
 * 网关特性：当前所用网关（OpenAI 兼容）强制要求 stream:true，
 * 非流式请求一律 400。因此底层始终以 stream:true 发起，在内部聚合
 * SSE 流后对外返回完整文本——业务侧无感知、无需处理流。
 *
 * 配置走环境变量：AI_BASE_URL / AI_API_KEY / AI_DEFAULT_MODEL
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultModel: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.baseUrl = this.configService.getOrThrow<string>('AI_BASE_URL');
    this.apiKey = this.configService.getOrThrow<string>('AI_API_KEY');
    this.defaultModel = this.configService.get<string>(
      'AI_DEFAULT_MODEL',
      'cmc/deepseek/deepseek-v4-flash',
    );
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
    const url = `${this.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const usedModel = model ?? this.defaultModel;
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
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            responseType: 'stream',
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
