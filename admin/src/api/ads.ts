import request from './request'

export type AdPosition = 'sidebar' | 'popup' | 'popup_toast'
export type AdStatus = 'active' | 'inactive'

export interface Ad {
  id: number
  title: string
  subtitle: string | null
  imageUrl: string | null
  buttonText: string
  href: string
  position: AdPosition
  type: string
  status: AdStatus
  startAt: string | null
  endAt: string | null
  sortOrder: number
  impressions: number
  clicks: number
  adminNote: string | null
  createdAt: string
  updatedAt: string
}

export function getAds(params?: {
  id?: number
  keyword?: string
  position?: string
  status?: string
  page?: number
  pageSize?: number
}) {
  return request.get('/ads', { params })
}

export function createAd(data: any) {
  return request.post('/ads', data)
}

export function updateAd(id: number, data: any) {
  return request.put(`/ads/${id}`, data)
}

export function deleteAd(id: number) {
  return request.delete(`/ads/${id}`)
}

export function batchDeleteAds(ids: number[]) {
  return request.delete('/ads/batch', { data: { ids } })
}

export function toggleAdStatus(id: number) {
  return request.put(`/ads/${id}/toggle-status`)
}
