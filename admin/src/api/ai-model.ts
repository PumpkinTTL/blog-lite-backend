import request from './request'

export interface AiModel {
  id: number
  providerId: number
  modelId: string
  displayName: string
  maxContextTokens: number
  maxOutputTokens: number
  supportsTools: number
  supportsThinking: number
  status: number
  provider?: { id: number; name: string } | null
  createdAt: string
  updatedAt: string
}

export function getAiModels(params?: { id?: number; keyword?: string; status?: number; providerId?: number; page?: number; pageSize?: number }) {
  return request.get('/ai-models', { params })
}

export function createAiModel(data: Partial<AiModel>) {
  return request.post('/ai-models', data)
}

export function updateAiModel(id: number, data: Partial<AiModel>) {
  return request.put(`/ai-models/${id}`, data)
}

export function deleteAiModel(id: number) {
  return request.delete(`/ai-models/${id}`)
}

export function batchDeleteAiModels(ids: number[]) {
  return request.delete('/ai-models/batch', { data: { ids } })
}
