import request from './request'

export interface Blacklist {
  id: number
  type: string
  value: string
  reason: string | null
  status: string
  expiresAt: string | null
  creatorId: number | null
  createdAt: string
  updatedAt: string
}

export function getBlacklists(params?: {
  id?: number
  keyword?: string
  type?: string
  status?: string
  page?: number
  pageSize?: number
}) {
  return request.get('/blacklist', { params })
}

export function createBlacklist(data: {
  type: string
  value: string
  reason?: string
  expiresAt?: string
}) {
  return request.post('/blacklist', data)
}

export function updateBlacklist(id: number, data: {
  reason?: string
  status?: string
  expiresAt?: string
}) {
  return request.put(`/blacklist/${id}`, data)
}

export function deleteBlacklist(id: number) {
  return request.delete(`/blacklist/${id}`)
}

export function batchDeleteBlacklists(ids: number[]) {
  return request.delete('/blacklist/batch', { data: { ids } })
}
