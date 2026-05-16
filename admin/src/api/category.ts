import request from './request'

export interface Category {
  id: number
  name: string
  slug: string
  description: string | null
  parentId: number | null
  createdAt: string
}

export function getCategories(params?: { id?: number; keyword?: string; page?: number; pageSize?: number }) {
  return request.get('/category', { params })
}

export function createCategory(data: Partial<Category>) {
  return request.post('/category', data)
}

export function updateCategory(id: number, data: Partial<Category>) {
  return request.put(`/category/${id}`, data)
}

export function deleteCategory(id: number) {
  return request.delete(`/category/${id}`)
}
