import { request } from './request'

export interface RequestLog {
  id: number
  requestId: string
  method: string
  path: string
  status: number
  durationMs: number
  ip: string
  userId: number | null
  errorMessage: string | null
  createdAt: string
}

export interface RequestLogQuery {
  page?: number
  pageSize?: number
  requestId?: string
  ip?: string
  status?: number
  method?: string
  userId?: number
  startTime?: string
  endTime?: string
}

/** 查询请求日志列表 */
export function getRequestLogs(params: RequestLogQuery) {
  return request.get<any, { data: { list: RequestLog[]; total: number; page: number; pageSize: number } }>(
    '/request-log/list',
    { params },
  )
}

/** 按 requestId 精确查（用户报错追溯主入口） */
export function getRequestLogByRequestId(requestId: string) {
  return request.get<any, { data: RequestLog | null }>(`/request-log/${requestId}`)
}

/** 清理过期日志 */
export function cleanRequestLogs(retainDays = 30) {
  return request.post<any, { data: { success: boolean; message: string } }>(
    '/request-log/clean',
    null,
    { params: { retainDays } },
  )
}
