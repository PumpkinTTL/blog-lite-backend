import request from './request'

export interface Category {
  id: number
  name: string
  slug: string
  description: string | null
  parentId: number | null
  createdAt: string
  updatedAt: string
}

export function getCategories() {
  return request.get('/category')
}

export function getCategory(id: number) {
  return request.get(`/category/${id}`)
}

export function createCategory(data: Partial<Category>) {
  return request.post('/category', data)
}

export function updateCategory(id: number, data: Partial<Category>) {
  return request.patch(`/category/${id}`, data)
}

export function deleteCategory(id: number) {
  return request.delete(`/category/${id}`)
}
