import request from './request'
import type { Tag } from './tag'
import type { Category } from './category'

export interface PostAuthor {
  id: number
  username: string
  nickname: string | null
  avatar: string | null
}

export interface Post {
  id: number
  title: string
  slug: string
  content: string
  summary: string | null
  coverImage: string | null
  status: string
  authorId: number
  author?: PostAuthor | null
  categoryId: number | null
  category: Category | null
  tags: Tag[]
  tagIds?: number[]
  viewCount?: number
  likeCount?: number
  favoriteCount?: number
  commentCount?: number
  isPinned?: boolean
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

export function deletePost(id: number, force = false) {
  return request.delete(`/post/${id}${force ? '?force=1' : ''}`)
}

export function batchDeletePosts(ids: number[], force = false) {
  return request.post('/post/batch/delete', { ids, force })
}
