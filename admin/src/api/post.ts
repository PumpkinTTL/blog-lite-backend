import request from './request'

export interface Tag {
  id: number
  name: string
  slug: string
}

export interface Category {
  id: number
  name: string
  slug: string
}

export interface Post {
  id: number
  title: string
  slug: string
  content: string
  summary: string | null
  coverImage: string | null
  status: number
  authorId: number
  categoryId: number | null
  category: Category | null
  tags: Tag[]
  tagIds?: number[]
  createdAt: string
  updatedAt: string
  publishedAt: string | null
}

export interface PostListParams {
  page?: number
  pageSize?: number
  id?: number
  keyword?: string
  status?: number | string
  categoryId?: number
  tagId?: number
}

export interface PostListResult {
  list: Post[]
  total: number
  page: number
  pageSize: number
}

export function getPosts(params?: PostListParams) {
  return request.get('/post', { params })
}

export function getPost(id: number) {
  return request.get(`/post/${id}`)
}

export function createPost(data: any) {
  return request.post('/post', data)
}

export function updatePost(id: number, data: any) {
  return request.put(`/post/${id}`, data)
}

export function deletePost(id: number) {
  return request.delete(`/post/${id}`)
}
