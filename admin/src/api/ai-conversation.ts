import request from './request'

/** 管理页列表项（messages 已折叠为 messageCount，不带整串 JSON） */
export interface AiConversation {
  id: number
  postId: number
  /** 消息条数（列表接口已解析，前端不再自己 Array.isArray 判断） */
  messageCount?: number
  model: string | null
  /** 累计输入 token（审计用） */
  promptTokens?: number
  /** 累计输出 token */
  completionTokens?: number
  /** 最近一轮输入 token（进度条/当前占用用，对齐模型上下文窗口） */
  lastPromptTokens?: number
  /** 最近一轮输出 token */
  lastCompletionTokens?: number
  /** 对话轮次 */
  rounds?: number
  createdAt: string
  updatedAt: string
}

/** 单条对话（getConversationByPostId 返回），messages 已 parse 为数组 */
export interface AiConversationDetail extends AiConversation {
  messages: unknown[]
  /** 最新历史压缩摘要（null 表示从未压缩） */
  compactionSummary?: string | null
  /** 压缩点之后的新对话（发给模型用），未压缩时为 null */
  compactionMessages?: unknown[] | null
  /** 最近一次压缩释放的 token */
  compactionTokens?: number
  /** 最近一次压缩时间 */
  compactedAt?: string | null
  /** 是否压缩过 */
  hasCompaction?: boolean
}

/** 管理页分页列表（列表项已折叠 messages，轻量） */
export function getAiConversations(params?: { id?: number; postId?: number; page?: number; pageSize?: number }) {
  return request.get('/ai-conversations', { params })
}

/** 按文章 ID 读取完整对话（AgentPanel 加载 / 详情查看用，messages 已 parse） */
export function getConversationByPostId(postId: number) {
  return request.get(`/ai-conversations/post/${postId}`)
}

/** 按主键读取单条对话（详情查看用，messages 已 parse） */
export function getAiConversationById(id: number) {
  return request.get(`/ai-conversations/${id}`)
}

/** 保存/更新对话历史（upsert），同时持久化 token 累计、轮次与压缩状态 */
export function saveConversation(data: {
  postId: number
  messages: unknown[]
  model?: string
  promptTokens?: number
  completionTokens?: number
  lastPromptTokens?: number
  lastCompletionTokens?: number
  rounds?: number
  compactionSummary?: string | null
  compactionMessages?: unknown[]
  compactionTokens?: number
}) {
  return request.post('/ai-conversations/save', data)
}

export function deleteAiConversation(id: number) {
  return request.delete(`/ai-conversations/${id}`)
}

/** 清空某文章的对话历史 */
export function deleteConversationByPostId(postId: number) {
  return request.delete(`/ai-conversations/post/${postId}`)
}

export function batchDeleteAiConversations(ids: number[]) {
  return request.delete('/ai-conversations/batch', { data: { ids } })
}
