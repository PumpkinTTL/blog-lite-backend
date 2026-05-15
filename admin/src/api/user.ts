import request from './request'

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
