import request from './request'

export interface Media {
  id: number
  name: string
  url: string
  type: string
  size: number
  createdAt: string
  updatedAt: string
}

export function getMediaList(params?: { page?: number; pageSize?: number; id?: number; keyword?: string; mimeType?: string }) {
  return request.get('/media', { params })
}

export function uploadMedia(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return request.post('/media/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function deleteMedia(id: number) {
  return request.delete(`/media/${id}`)
}
