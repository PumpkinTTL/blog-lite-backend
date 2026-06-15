import request from './request'

export interface AuditLog {
  id: number
  targetType: string
  targetId: number
  field: string
  oldValue: string | null
  newValue: string | null
  operatorId: number | null
  operatorName: string | null
  targetName: string | null
  note: string | null
  createdAt: string
}

export interface AuditLogList {
  list: AuditLog[]
  total: number
  page: number
  pageSize: number
}

export function getAuditLogs(type: string, id: number, params?: { page?: number; pageSize?: number }) {
  return request.get<AuditLogList>(`/audit-log/${type}/${id}`, { params })
}
