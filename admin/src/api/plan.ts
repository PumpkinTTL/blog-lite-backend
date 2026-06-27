import request from './request'

export type PlanLevel = 'plus' | 'pro' | 'max'

export interface Plan {
  id: number
  name: string
  slug: string
  level: PlanLevel
  durationDays: number
  priceCents: number
  benefits: string[] | null
  /** 兑换该套餐时自动授予的角色组 ID（null=不绑定） */
  roleId: number | null
  description: string | null
  isActive: boolean
  sort: number
  createdAt: string
  updatedAt: string
}

export interface PlanListResult {
  list: Plan[]
  total: number
}

export function getPlans() {
  return request.get('/plan')
}

export function createPlan(data: Partial<Plan>) {
  return request.post('/plan', data)
}

export function updatePlan(id: number, data: Partial<Plan>) {
  return request.put(`/plan/${id}`, data)
}

export function deletePlan(id: number) {
  return request.delete(`/plan/${id}`)
}

export function batchDeletePlans(ids: number[]) {
  return request.delete('/plan/batch', { data: { ids } })
}
