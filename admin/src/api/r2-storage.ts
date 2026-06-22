import request from './request'

/**
 * Cloudflare R2 存储独立 API
 *
 * 复用后端 /media 接口，固定 storageType='oss' + ossPlatform='cloudflare'
 */

/** R2 文件信息（复用 Media 类型） */
export interface R2Media {
  id: number
  filename: string
  originalName: string
  mimeType: string
  size: number
  hash: string
  url: string
  storageType: 'oss'
  ossPlatform: 'cloudflare'
  uploaderId: number
  uploader?: { id: number; username: string; nickname: string }
  note: string | null
  createdAt: string
}

/** R2 文件列表响应 */
export interface R2ListResponse {
  list: R2Media[]
  total: number
  page: number
  pageSize: number
}

/**
 * 获取文件列表（全部，通过 ossPlatform 列区分 R2 文件）
 */
export function getR2MediaList(params?: { page?: number; pageSize?: number; id?: number; keyword?: string; mimeType?: string }) {
  return request.get<R2ListResponse>('/media', { params })
}

/**
 * 删除 R2 文件
 */
export function deleteR2Media(id: number) {
  return request.delete(`/media/${id}`)
}

/**
 * 批量删除 R2 文件
 */
export function batchDeleteR2Media(ids: number[]) {
  return request.delete('/media/batch', { data: { ids } })
}
