import request from './request'
import type { Tag } from './tag'
import type { Category } from './category'

export interface Post {
  id: number
  title: string
  slug: string
  content: string
  summary: string | null
  coverImage: string | null
  status: string
  authorId: number
  categoryId: number | null
  category: Category | null
  tags: Tag[]
  tagIds?: number[]
  // private 文章可见性（来自 entity_visibility 表）
  allowedUserIds?: number[]
  allowedRoleIds?: number[]
  createdAt: string
  updatedAt: string
  publishedAt: string | null
}

export interface PostListParams {
  page?: number
  pageSize?: number
  id?: number
  keyword?: string
  status?: string
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

export function batchDeletePosts(ids: number[]) {
  return request.post('/post/batch/delete', { ids })
}
