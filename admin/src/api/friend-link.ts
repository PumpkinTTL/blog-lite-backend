import request from './request'

export interface FriendLink {
  id: number
  name: string
  url: string
  logo: string | null
  description: string | null
  sortOrder: number
  status: number
  postId: number | null
  post?: { id: number; title: string } | null
  createdAt: string
  updatedAt: string
}

export function getFriendLinks() {
  return request.get('/friend-link')
}

export function createFriendLink(data: any) {
  return request.post('/friend-link', data)
}

export function updateFriendLink(id: number, data: any) {
  return request.put(`/friend-link/${id}`, data)
}

export function deleteFriendLink(id: number) {
  return request.delete(`/friend-link/${id}`)
}
