import request from './request'

export type InteractionType = 'like' | 'favorite'
export type InteractionEntityType = 'post' | 'comment'

export interface Interaction {
  id: number
  userId: number
  entityType: InteractionEntityType
  entityId: number
  type: InteractionType
  createdAt: string
}

export interface InteractionListResult {
  list: Interaction[]
  total: number
}

export interface AdminInteractionUser {
  id: number
  nickname: string | null
  avatar: string | null
}

export interface AdminInteraction {
  id: number
  userId: number
  entityType: string
  entityId: number
  type: InteractionType
  createdAt: string
  user: AdminInteractionUser | null
  post: { id: number; title: string; slug: string } | null // 仅 entityType=post 时有
}

export interface AdminInteractionListResult {
  list: AdminInteraction[]
  total: number
}

/** 管理端列表（分页 + 筛选） */
export function getAdminInteractions(params: {
  type?: InteractionType
  entityType?: InteractionEntityType
  userId?: number
  entityId?: number
  keyword?: string
  page?: number
  pageSize?: number
}) {
  return request.get('/interaction/admin/list', { params })
}

/** 删除单条互动（admin） */
export function deleteInteraction(id: number) {
  return request.delete(`/interaction/admin/${id}`)
}

/** 批量删除（admin） */
export function batchDeleteInteractions(ids: number[]) {
  return request.delete('/interaction/admin/batch', { data: { ids } })
}
