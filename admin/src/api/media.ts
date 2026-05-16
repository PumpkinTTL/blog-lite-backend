import request from './request'

export interface Media {
  id: number
  filename: string
  originalName: string
  mimeType: string
  size: number
  url: string
  storageType: 'local' | 'oss'
  ossPlatform: 'aliyun' | 'tencent' | 'cloudflare' | 'backblaze' | null
  uploaderId: number
  uploader?: { id: number; username: string; nickname: string }
  createdAt: string
}

export function getMediaList(params?: { page?: number; pageSize?: number; id?: number; keyword?: string; mimeType?: string }) {
  return request.get('/media', { params })
}

export function uploadMedia(file: File, options?: { storageType?: 'local' | 'oss'; ossPlatform?: Media['ossPlatform'] }) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('storageType', options?.storageType || 'local')
  if (options?.ossPlatform) formData.append('ossPlatform', options.ossPlatform)
  return request.post('/media/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function uploadMediaMany(files: File[], options?: { storageType?: 'local' | 'oss'; ossPlatform?: Media['ossPlatform'] }) {
  const formData = new FormData()
  files.forEach((f) => formData.append('files', f))
  formData.append('storageType', options?.storageType || 'local')
  if (options?.ossPlatform) formData.append('ossPlatform', options.ossPlatform)
  return request.post('/media/upload-many', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function deleteMedia(id: number) {
  return request.delete(`/media/${id}`)
}

export function batchDeleteMedia(ids: number[]) {
  return request.delete('/media/batch', { data: { ids } })
}

export function updateMedia(id: number, data: { originalName?: string }) {
  return request.put(`/media/${id}`, data)
}
