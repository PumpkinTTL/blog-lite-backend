import request from './request'
import type { Plan } from './plan'
import type { User } from './user'

export type MembershipStatus = 'active' | 'expired' | 'cancelled'
export type MembershipSource = 'admin' | 'code' | 'payment'

export interface Membership {
  id: number
  userId: number
  user?: Pick<User, 'id' | 'username' | 'nickname'>
  planId: number
  plan?: Plan
  startedAt: string
  expiresAt: string | null
  status: MembershipStatus
  source: MembershipSource
  sourceId: number | null
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface MembershipListParams {
  page?: number
  pageSize?: number
  userId?: number
  planId?: number
  status?: MembershipStatus
  source?: MembershipSource
}

export interface MembershipListResult {
  list: Membership[]
  total: number
  page: number
  pageSize: number
}

export interface GrantMembershipParams {
  userId: number
  planId: number
  /** 自定义开通天数（不传=用套餐 durationDays；0=终身；正整数=按天） */
  days?: number
  source?: MembershipSource
  sourceId?: number
  note?: string
}

export interface UpdateMembershipParams {
  status?: MembershipStatus
  expiresAt?: string
  note?: string
}

export function getMemberships(params?: MembershipListParams) {
  return request.get('/membership', { params })
}

export function getMembership(id: number) {
  return request.get(`/membership/${id}`)
}

export function grantMembership(data: GrantMembershipParams) {
  return request.post('/membership/grant', data)
}

export function updateMembership(id: number, data: UpdateMembershipParams) {
  return request.put(`/membership/${id}`, data)
}

export function deleteMembership(id: number) {
  return request.delete(`/membership/${id}`)
}

export function batchDeleteMemberships(ids: number[]) {
  return request.delete('/membership/batch', { data: { ids } })
}

export function redeemMembership(code: string) {
  return request.post('/membership/redeem', { code })
}

export function getMyMembershipStatus() {
  return request.get('/membership/me/status')
}
