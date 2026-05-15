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

export function getMediaList() {
  return request.get('/media')
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
