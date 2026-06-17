import request from './request'

/** AI 可生成的字段类型 */
export type AiGenerateField = 'subtitle' | 'summary' | 'slug'

/** 统一 AI 生成入参（对应后端 AiGenerateDto） */
export interface AiGeneratePayload {
  /** 文章标题（上下文，可空但至少传 title 或 content 之一） */
  title?: string
  /** 文章正文（上下文） */
  content?: string
  /** 本次要生成哪些内容（复选框语义） */
  fields: AiGenerateField[]
  /** 可选：覆盖默认模型 */
  model?: string
}

/** 统一 AI 生成返回：只有被请求的字段才会有值 */
export interface AiGenerateResult {
  subtitle?: string
  summary?: string
  slug?: string
}

/** 后端统一返回体（响应拦截器已解包 axios response.data） */
export interface AiApiResponse<T> {
  success: boolean
  data: T
  message: string
}

/**
 * 调用后端 /ai/generate 生成文章辅助内容。
 * 一次请求可同时生成副标题 / 摘要 / slug 中的多项。
 * 注意：request 拦截器返回的是后端 body（{success,data,message}），不是 axios response。
 */
export function generateByAi(data: AiGeneratePayload) {
  return request.post<AiApiResponse<AiGenerateResult>, AiApiResponse<AiGenerateResult>>(
    '/ai/generate',
    data,
  )
}

/* ============ 历史压缩（SSE 流式） ============ */

/** 压缩历史返回 */
export interface AiCompactResult {
  summary: string
}

/**
 * 流式压缩对话历史：POST /ai/compact，消费 SSE。
 * 把多轮历史交给后端 AI 总结成结构化摘要，边生成边回调 token，
 * 前端能实时看到压缩进度（与 streamChat 体验一致）。
 *
 * 用原生 fetch（axios 不便处理 SSE 逐字流，且会受全局 10s 超时影响）。
 *
 * @param onToken 每个摘要 token 片段回调（实时）
 * @param onThinking 可选：思考过程回调
 * @returns 完整摘要文本
 */
export async function streamCompact(
  messages: AiChatMessage[],
  model: string | undefined,
  onToken: (text: string) => void,
  onThinking?: (text: string) => void,
): Promise<string> {
  const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken')
  const baseURL = import.meta.env.VITE_API_BASE_URL

  const resp = await fetch(`${baseURL}/ai/compact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages, model }),
  })

  if (!resp.ok || !resp.body) {
    const errText = await resp.text().catch(() => '')
    throw new Error(`压缩请求失败 (${resp.status}): ${errText.slice(0, 200)}`)
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let summary = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const s = line.trim()
      if (!s.startsWith('data:')) continue
      const payload = s.slice(5).trim()
      if (!payload) continue
      try {
        const evt = JSON.parse(payload)
        if (evt.type === 'thinking' && typeof evt.data?.text === 'string') {
          onThinking?.(evt.data.text)
        } else if (evt.type === 'token' && typeof evt.data?.text === 'string') {
          summary += evt.data.text
          onToken(evt.data.text)
        } else if (evt.type === 'done' && typeof evt.data?.summary === 'string') {
          // 网关结束时的完整摘要，作为权威值（覆盖本地拼接，避免丢末尾）
          summary = evt.data.summary
        } else if (evt.type === 'error') {
          throw new Error(evt.data?.message || '压缩服务错误')
        }
      } catch (e) {
        if (e instanceof Error && e.message && !e.message.includes('JSON')) throw e
      }
    }
  }

  return summary
}

/**
 * @deprecated 已被 streamCompact 取代（流式版）。保留仅为兼容。
 * 压缩对话历史：把多轮历史交给后端 AI 总结成摘要。
 */
export function compactHistory(data: { messages: AiChatMessage[]; model?: string }) {
  return request.post<AiApiResponse<AiCompactResult>, AiApiResponse<AiCompactResult>>(
    '/ai/compact',
    data,
    { timeout: 180000 },
  )
}

/* ============ Agent 对话（SSE 流式） ============ */

/** 工具调用（已聚合） */
export interface AiToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/** 对话消息联合类型（与后端 AiChatMessage 对齐） */
export type AiChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: AiToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

/** 文章上下文快照（每轮注入 system 提示词） */
export interface AiArticleContext {
  title?: string
  subtitle?: string
  summary?: string
  slug?: string
  content?: string
}

/** 单步 token 用量（来自网关 usage，精确值） */
export interface AiUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

/** streamChat 单步返回：本步是否产生工具调用 */
export interface StreamChatResult {
  content: string
  toolCalls: AiToolCall[]
  finishReason: string
  /** 本步 token 用量（网关在流末尾返回，若无则为 null） */
  usage: AiUsage | null
}

/**
 * 流式对话：调 POST /ai/chat，消费 SSE。
 * 用原生 fetch（axios 不便处理 SSE 逐字流）。
 *
 * @param onToken 每个 token 片段回调（实时）
 * @param onToolCalls 本步产生工具调用时回调（流末尾）
 * @param model 可选：覆盖默认模型
 * @param onThinking 可选：思考过程回调（reasoning_content）
 * @param onUsage 可选：本步 token 用量回调（流末尾，来自网关 usage）
 * @returns 本步聚合结果
 */
export async function streamChat(
  messages: AiChatMessage[],
  context: AiArticleContext | undefined,
  onToken: (text: string) => void,
  onToolCalls: (calls: AiToolCall[]) => void,
  model?: string,
  onThinking?: (text: string) => void,
  onUsage?: (usage: AiUsage) => void,
): Promise<StreamChatResult> {
  const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken')
  const baseURL = import.meta.env.VITE_API_BASE_URL

  const resp = await fetch(`${baseURL}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages, context, model }),
  })

  if (!resp.ok || !resp.body) {
    const errText = await resp.text().catch(() => '')
    throw new Error(`AI 对话请求失败 (${resp.status}): ${errText.slice(0, 200)}`)
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  const toolCalls: AiToolCall[] = []
  let finishReason = 'stop'
  let usage: AiUsage | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const s = line.trim()
      if (!s.startsWith('data:')) continue
      const payload = s.slice(5).trim()
      if (!payload) continue
      try {
        const evt = JSON.parse(payload)
        if (evt.type === 'thinking' && typeof evt.data?.text === 'string') {
          onThinking?.(evt.data.text)
        } else if (evt.type === 'token' && typeof evt.data?.text === 'string') {
          content += evt.data.text
          onToken(evt.data.text)
        } else if (evt.type === 'tool_calls' && Array.isArray(evt.data?.calls)) {
          toolCalls.push(...evt.data.calls)
          onToolCalls(evt.data.calls)
        } else if (evt.type === 'usage' && evt.data?.totalTokens != null) {
          usage = {
            promptTokens: evt.data.promptTokens ?? 0,
            completionTokens: evt.data.completionTokens ?? 0,
            totalTokens: evt.data.totalTokens ?? 0,
          }
          onUsage?.(usage)
        } else if (evt.type === 'done') {
          finishReason = evt.data?.finishReason ?? 'stop'
        } else if (evt.type === 'error') {
          throw new Error(evt.data?.message || 'AI 服务错误')
        }
      } catch (e) {
        // error 类型已抛出；JSON 解析失败则跳过
        if (e instanceof Error && e.message && !e.message.includes('JSON')) throw e
      }
    }
  }

  return { content, toolCalls, finishReason, usage }
}
