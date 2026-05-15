import request from './request'

export interface Post {
  id: number
  title: string
  slug: string
  content: string
  summary: string
  coverImage: string | null
  status: 'draft' | 'published'
  categoryId: number | null
  createdAt: string
  updatedAt: string
}

export interface PostListParams {
  page?: number
  pageSize?: number
  status?: string
  keyword?: string
}

export function getPosts(params?: PostListParams) {
  return request.get('/post', { params })
}

export function getPost(id: number) {
  return request.get(`/post/${id}`)
}

export function createPost(data: Partial<Post>) {
  return request.post('/post', data)
}

export function updatePost(id: number, data: Partial<Post>) {
  return request.patch(`/post/${id}`, data)
}

export function deletePost(id: number) {
  return request.delete(`/post/${id}`)
}
