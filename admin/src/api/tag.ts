import request from './request'

export interface Tag {
  id: number
  name: string
  slug: string
  createdAt: string
}

export function getTags(params?: { id?: number; keyword?: string; page?: number; pageSize?: number }) {
  return request.get('/tag', { params })
}

export function createTag(data: Partial<Tag>) {
  return request.post('/tag', data)
}

export function updateTag(id: number, data: Partial<Tag>) {
  return request.put(`/tag/${id}`, data)
}

export function deleteTag(id: number) {
  return request.delete(`/tag/${id}`)
}
