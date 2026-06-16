import request from './request'

export interface AiProvider {
  id: number
  name: string
  baseUrl: string
  apiKey: string
  protocol: string
  remark: string | null
  status: number
  createdAt: string
  updatedAt: string
}

export function getAiProviders(params?: { id?: number; keyword?: string; status?: number; page?: number; pageSize?: number }) {
  return request.get('/ai-providers', { params })
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
