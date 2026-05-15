import request from './request'

export interface Tag {
  id: number
  name: string
  slug: string
  createdAt: string
  updatedAt: string
}

export function getTags(params?: { id?: number; keyword?: string }) {
  return request.get('/tag', { params })
}

export function getTag(id: number) {
  return request.get(`/tag/${id}`)
}

export function createTag(data: Partial<Tag>) {
  return request.post('/tag', data)
}

export function updateTag(id: number, data: Partial<Tag>) {
  return request.patch(`/tag/${id}`, data)
}

export function deleteTag(id: number) {
  return request.delete(`/tag/${id}`)
}
