import {
  IsString,
  IsOptional,
  IsArray,
  IsIn,
  MaxLength,
} from 'class-validator';

/** AI 可生成的字段类型 */
export type AiGenerateField = 'subtitle' | 'summary' | 'slug';

export const AI_GENERATE_FIELDS: readonly AiGenerateField[] = [
  'subtitle',
  'summary',
  'slug',
];

/**
 * 统一 AI 生成入参
 * - title / content 作为上下文（均可空，但至少传一个）
 * - fields 指定本次要生成哪些内容（复选框语义）
 * - model 可覆盖默认模型
 */
export class AiGenerateDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsArray()
  @IsIn(AI_GENERATE_FIELDS as readonly string[], { each: true })
  fields: AiGenerateField[];

  @IsString()
  @IsOptional()
  model?: string;
}

/* ============ Agent 对话相关类型（OpenAI 兼容） ============ */

/** model 返回的工具调用（已聚合，非流式分片） */
export interface AiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/** 对话消息联合类型：system / user / assistant（可含 tool_calls）/ tool（结果回传） */
export type AiChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: AiToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

/** 文章上下文快照（前端每轮注入，让 AI 知道当前内容） */
export class AiArticleContext {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  subtitle?: string;

  @IsString()
  @IsOptional()
  summary?: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  content?: string;
}

/**
 * Agent 对话入参（POST /ai/chat）。
 * - messages：完整对话历史（前端维护，含工具调用与结果）。
 *   不对消息内部做严格校验（联合类型 + OpenAI 协议结构复杂，
 *   且 forbidNonWhitelisted 会误杀合法字段），仅验是否为数组。
 * - context：当前文章快照（后端拼到 system 提示词里）
 * - model：可覆盖默认模型
 */
export class AiChatDto {
  @IsArray()
  messages: AiChatMessage[];

  @IsOptional()
  context?: AiArticleContext;

  @IsString()
  @IsOptional()
  model?: string;
}
