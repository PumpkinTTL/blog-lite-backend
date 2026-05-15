import request from './request'

export interface Role {
  id: number
  name: string
  displayName: string
  description: string | null
  createdAt: string
}

export function getRoles() {
  return request.get('/role')
}

export function getRole(id: number) {
  return request.get(`/role/${id}`)
}

export function createRole(data: Partial<Role>) {
  return request.post('/role', data)
}

export function updateRole(id: number, data: Partial<Role>) {
  return request.put(`/role/${id}`, data)
}

export function deleteRole(id: number) {
  return request.delete(`/role/${id}`)
}
