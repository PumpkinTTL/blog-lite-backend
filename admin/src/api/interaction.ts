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

/**
 * 切换当前用户对实体的互动状态
 * @returns { active: boolean } active=true 表示已新增，false 表示已取消
 */
export function toggleInteraction(params: {
  entityType: InteractionEntityType
  entityId: number
  type: InteractionType
}) {
  return request.post('/interaction/toggle', params)
}

/**
 * 批量查当前用户在某组实体上的互动状态
 * @returns Record<entityId, boolean>
 */
export function getInteractionStatus(params: {
  entityType: InteractionEntityType
  type: InteractionType
  entityIds: number[]
}) {
  const qs = new URLSearchParams({
    entityType: params.entityType,
    type: params.type,
    entityIds: params.entityIds.join(','),
  }).toString()
  return request.get(`/interaction/status?${qs}`)
}

/**
 * 批量查多个实体的互动计数
 * @returns Record<entityId, { likeCount, favoriteCount }>
 */
export function getInteractionCounts(params: {
  entityType: InteractionEntityType
  entityIds: number[]
}) {
  return request.post('/interaction/count', params)
}

/**
 * 当前用户的互动列表（点赞/收藏，分页）
 */
export function getMyInteractions(params: {
  type: InteractionType
  entityType?: InteractionEntityType
  page?: number
  pageSize?: number
}) {
  return request.get('/interaction/me', { params })
}

// ===== 管理端 =====

export interface AdminInteractionUser {
  id: number
  username: string
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
