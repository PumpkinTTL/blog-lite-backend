import request from './request'
import type { Role } from './role'

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

export interface User {
  id: number
  username: string
  nickname: string
  email: string | null
  avatar: string | null
  status: number
  roles: Role[]
  createdAt: string
  updatedAt: string
}

export function getUsers(params?: { page?: number; pageSize?: number; id?: number; keyword?: string; status?: number }) {
  return request.get('/user', { params })
}

export function getUser(id: number) {
  return request.get(`/user/${id}`)
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
