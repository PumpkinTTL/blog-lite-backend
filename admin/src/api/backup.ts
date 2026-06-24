import request from './request'

/** 备份状态 */
export type BackupStatus = 'running' | 'success' | 'failed'

/** 备份历史记录 */
export interface BackupLog {
  id: number
  trigger: 'schedule' | 'manual'
  scheduleName: string | null
  r2Key: string | null
  size: number | null
  status: BackupStatus
  errorMessage: string | null
  durationMs: number | null
  r2Verified: boolean
  createdAt: string
}

/** 定时器配置 */
export interface BackupSchedule {
  id: string
  name: string
  enabled: boolean
  type: 'interval' | 'daily' | 'weekly'
  intervalMinutes?: number
  hour?: number
  minute?: number
  dayOfWeek?: number
  retainDays: number
}

// ── 历史记录 ──

export function getBackupLogs(params?: { page?: number; pageSize?: number }) {
  return request.get('/backup/logs', { params })
}

/** 手动触发一次备份 */
export function runBackup() {
  return request.post('/backup/run')
}

/** 重新校验备份在 R2 是否存在 */
export function verifyBackup(id: number) {
  return request.post(`/backup/logs/${id}/verify`)
}

/** 下载备份（返回的 URL 直接 window.open，后端会 302 跳转 R2） */
export function downloadBackupUrl(id: number): string {
  // 用完整 URL 直接打开（带 admin token 的 cookie/header 需走同源）
  const base = (import.meta as any).env?.VITE_API_BASE_URL || ''
  return `${base}/backup/logs/${id}/download`
}

export function deleteBackupLog(id: number) {
  return request.delete(`/backup/logs/${id}`)
}

// ── 定时器管理 ──

export function getSchedules() {
  return request.get('/backup/schedules')
}

export function createSchedule(data: any) {
  return request.post('/backup/schedules', data)
}

export function updateSchedule(id: string, data: any) {
  return request.put(`/backup/schedules/${id}`, data)
}

export function deleteSchedule(id: string) {
  return request.delete(`/backup/schedules/${id}`)
}

/** 立即按某定时器配置执行一次 */
export function runBySchedule(id: string) {
  return request.post(`/backup/schedules/${id}/run`)
}
