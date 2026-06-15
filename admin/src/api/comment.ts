import request from './request'

export type CommentStatus = 'pending' | 'approved' | 'rejected'
export type CommentEntityType = 'post'

export interface CommentUser {
  id: number
  username: string
  nickname: string | null
  avatar: string | null
}

export interface Comment {
  id: number
  entityType: string
  entityId: number
  userId: number
  user?: CommentUser | null
  content: string
  parentId: number | null
  parent?: { id: number; content: string } | null
  replyToUserId: number | null
  replyToUser?: CommentUser | null
  status: CommentStatus
  createdAt: string
  updatedAt: string
}

export interface CommentListResult {
  list: Comment[]
  total: number
}

/** 管理端列表 */
export function getAdminComments(params: {
  entityType?: string
  entityId?: number
  status?: CommentStatus
  keyword?: string
  page?: number
  pageSize?: number
}) {
  return request.get('/comment/admin/list', { params })
}

/** 单条审核 */
export function moderateComment(id: number, status: 'approved' | 'rejected') {
  return request.patch(`/comment/${id}/moderate`, { status })
}

/** 批量审核 */
export function batchModerateComment(ids: number[], status: 'approved' | 'rejected') {
  return request.patch('/comment/admin/batch-moderate', { ids, status })
}

/** 删除（admin 可删任何） */
export function deleteComment(id: number) {
  return request.delete(`/comment/${id}`)
}

/** 批量删除 */
export function batchDeleteComments(ids: number[]) {
  return request.delete('/comment/admin/batch', { data: { ids } })
}
