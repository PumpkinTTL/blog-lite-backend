import request from './request'

export interface ResourceCategory {
  id: number
  name: string
  description: string | null
  sortOrder: number
  createdAt: string
}

export function getResourceCategories(params?: {
  id?: number
  keyword?: string
  page?: number
  pageSize?: number
}) {
  return request.get('/resource-category', { params })
}

export function createResourceCategory(data: Partial<ResourceCategory>) {
  return request.post('/resource-category', data)
}

export function updateResourceCategory(id: number, data: Partial<ResourceCategory>) {
  return request.put(`/resource-category/${id}`, data)
}

export function deleteResourceCategory(id: number) {
  return request.delete(`/resource-category/${id}`)
}

export function batchDeleteResourceCategories(ids: number[]) {
  return request.delete('/resource-category/batch', { data: { ids } })
}
