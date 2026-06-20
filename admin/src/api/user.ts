import request from './request'
import type { Role } from './role'
import type { PlanLevel } from './plan'

export interface LoginParams {
  username: string
  password: string
  fingerprint?: string
}

export interface LoginResult {
  accessToken: string
  refreshToken: string
  expiresIn: number
  tokenType: string
  deviceId: string
}

export interface ApiResponse<T> {
  success: boolean
  data: T
  message: string
}

export function loginApi(params: LoginParams): Promise<ApiResponse<LoginResult>> {
  return request.post('/user/login', params)
}

export function refreshTokenApi(refreshToken: string, deviceId: string): Promise<ApiResponse<LoginResult>> {
  return request.post('/user/refresh', { refreshToken, deviceId })
}

/**
 * 登出：调后端 /user/logout（后端负责调鉴权中心吊销 refreshToken）。
 * 不直接调鉴权中心，避免跨域且不暴露鉴权中心地址给前端。
 */
export function logoutApi(refreshToken: string): Promise<ApiResponse<null>> {
  return request.post('/user/logout', { refreshToken })
}

export interface UserMembership {
  level: PlanLevel
  expiresAt: string | null // null = 终身
  planName: string
}

export interface User {
  id: number
  username: string
  nickname: string
  email: string | null
  avatar: string | null
  status: string
  /** 封禁截止时间（null=未封禁或永久封禁） */
  bannedUntil: string | null
  roles: Role[]
  membership: UserMembership | null
  createdAt: string
  updatedAt: string
}

export function getUsers(params?: { page?: number; pageSize?: number; id?: number; keyword?: string; status?: string }) {
  return request.get('/user', { params })
}

export function createUser(data: any) {
  return request.post('/user', data)
}

export function updateUser(id: number, data: any) {
  return request.put(`/user/${id}`, data)
}

export function deleteUser(id: number) {
  return request.delete(`/user/${id}`)
}

export function batchDeleteUsers(ids: number[]) {
  return request.delete('/user/batch', { data: { ids } })
}

/**
 * 封禁/解封用户
 * @param data.reason 封禁原因（封禁时填写，记录到审计日志）
 * @param data.bannedUntil 封禁截止时间 ISO 字符串。null/不传=永久封禁
 */
export function toggleUserStatus(id: number, data?: { reason?: string; bannedUntil?: string | null }) {
  return request.put(`/user/${id}/toggle-status`, data || {})
}
