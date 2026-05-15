import request from './request'

export interface DashboardStats {
  postCount: number
  categoryCount: number
  tagCount: number
  mediaCount: number
}

export function getDashboardStats() {
  return request.get('/dashboard/stats')
}
