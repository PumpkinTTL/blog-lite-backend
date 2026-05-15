import request from './request'

export interface Announcement {
  id: number
  title: string
  content: string
  status: number
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export function getAnnouncements(params?: { id?: number; keyword?: string; status?: number }) {
  return request.get('/announcement', { params })
}

export function createAnnouncement(data: any) {
  return request.post('/announcement', data)
}

export function updateAnnouncement(id: number, data: any) {
  return request.put(`/announcement/${id}`, data)
}

export function deleteAnnouncement(id: number) {
  return request.delete(`/announcement/${id}`)
}
