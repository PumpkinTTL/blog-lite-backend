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

export function toggleUserStatus(id: number) {
  return request.put(`/user/${id}/toggle-status`)
}
