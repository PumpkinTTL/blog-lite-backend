import request from './request'

export interface AiConversation {
  id: number
  postId: number
  messages: unknown[]
  model: string | null
  createdAt: string
  updatedAt: string
}

/** 管理页分页列表（messages 字段较大，列表接口已排除/不展开） */
export function getAiConversations(params?: { id?: number; postId?: number; page?: number; pageSize?: number }) {
  return request.get('/ai-conversations', { params })
}

/** 按文章 ID 读取完整对话（AgentPanel 加载用） */
export function getConversationByPostId(postId: number) {
  return request.get(`/ai-conversations/post/${postId}`)
}

/** 保存/更新对话历史（upsert） */
export function saveConversation(data: { postId: number; messages: unknown[]; model?: string }) {
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
