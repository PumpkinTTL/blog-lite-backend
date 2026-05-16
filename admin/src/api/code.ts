import request from './request'

export interface CodeDiscount {
  type: 'percentage' | 'threshold' | 'fixed'
  value: number
  threshold?: number
}

export interface Code {
  id: number
  code: string
  type: 'invitation' | 'activation' | 'discount'
  status: 'active' | 'used' | 'expired' | 'disabled'
  maxUses: number
  usedCount: number
  expiresAt: string | null
  creatorId: number | null
  discount: CodeDiscount | null
  createdAt: string
  updatedAt: string
}

export interface CodeUsageLog {
  id: number
  codeId: number
  userId: number | null
  usedAt: string
  clientIp: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  code?: Code
}

export function getCodes(params?: { id?: number; keyword?: string; status?: string; type?: string; page?: number; pageSize?: number }) {
  return request.get('/code', { params })
}

export function createCode(data: any) {
  return request.post('/code', data)
}

export function batchCreateCodes(data: { count: number; type: string; maxUses?: number; expiresAt?: string; discount?: CodeDiscount }) {
  return request.post('/code/batch', data)
}

export function updateCode(id: number, data: any) {
  return request.put(`/code/${id}`, data)
}

export function batchDisableCodes(ids: number[]) {
  return request.put('/code/batch/disable', { ids })
}

export function deleteCode(id: number) {
  return request.delete(`/code/${id}`)
}

export function batchDeleteCodes(ids: number[]) {
  return request.delete('/code/batch', { data: { ids } })
}

export function getAllUsageLogs(params?: { page?: number; pageSize?: number; keyword?: string }) {
  return request.get('/code/usage-logs', { params })
}

export function getCodeUsageLogs(id: number, params?: { page?: number; pageSize?: number }) {
  return request.get(`/code/${id}/usage-logs`, { params })
}

export function verifyCode(data: { code: string; type?: string }) {
  return request.post('/code/verify', data)
}
