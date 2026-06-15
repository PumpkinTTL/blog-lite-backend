import request from './request'

export interface PanLink {
  name: string
  url: string
  code?: string | null
}

export interface Resource {
  id: number
  title: string
  description: string | null
  cover: string | null
  category: string | null
  content: string | null
  panLinks: PanLink[] | null
  priceCents: number
  status: 'draft' | 'published' | 'login' | 'private'
  minMemberLevel: 'plus' | 'pro' | 'max' | null
  viewCount: number
  sortOrder: number
  // admin 列表注入（仅 private 资源）
  allowedUserIds?: number[]
  allowedRoleIds?: number[]
  createdAt: string
  updatedAt: string
}

export function getResources(params?: {
  id?: number
  keyword?: string
  status?: string
  category?: string
  page?: number
  pageSize?: number
}) {
  return request.get('/resource', { params })
}

export function getResource(id: number) {
  return request.get(`/resource/${id}`)
}

export function createResource(data: any) {
  return request.post('/resource', data)
}

export function updateResource(id: number, data: any) {
  return request.put(`/resource/${id}`, data)
}

export function updateResourceVisibility(
  id: number,
  data: { allowedUserIds: number[]; allowedRoleIds: number[] },
) {
  return request.put(`/resource/${id}/visibility`, data)
}

export function toggleResourceStatus(id: number) {
  return request.put(`/resource/${id}/toggle-status`)
}

export function deleteResource(id: number) {
  return request.delete(`/resource/${id}`)
}

export function batchDeleteResources(ids: number[]) {
  return request.delete('/resource/batch', { data: { ids } })
}
