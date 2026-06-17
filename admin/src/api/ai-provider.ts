import request from './request'

/** 单个模型（嵌入 provider.models 数组） */
export interface AiProviderModel {
  modelId: string
  displayName: string
  maxContextTokens?: number
  maxOutputTokens?: number
  supportsTools?: boolean
  supportsThinking?: boolean
}

export interface AiProvider {
  id: number
  name: string
  baseUrl: string
  apiKey: string
  protocol: string
  models: AiProviderModel[]
  remark: string | null
  status: number
  createdAt: string
  updatedAt: string
}

export function getAiProviders(params?: { id?: number; keyword?: string; status?: number; page?: number; pageSize?: number }) {
  return request.get('/ai-providers', { params })
}

/** 取所有启用的 provider（含 models），供写作面板联动选择 */
export function getActiveAiProviders() {
  return request.get('/ai-providers/active')
}

export function createAiProvider(data: Partial<AiProvider>) {
  return request.post('/ai-providers', data)
}

export function updateAiProvider(id: number, data: Partial<AiProvider>) {
  return request.put(`/ai-providers/${id}`, data)
}

export function deleteAiProvider(id: number) {
  return request.delete(`/ai-providers/${id}`)
}

export function batchDeleteAiProviders(ids: number[]) {
  return request.delete('/ai-providers/batch', { data: { ids } })
}
