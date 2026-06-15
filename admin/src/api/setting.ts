import request from './request'

export interface SettingItem {
  id: number
  key: string
  value: string
  description: string | null
  group: string
}

export function getSettings() {
  return request.get('/setting')
}

export function getSettingsByGroup(group: string) {
  return request.get(`/setting/group/${group}`)
}

export function batchUpdateByGroup(group: string, items: Record<string, string>) {
  return request.put(`/setting/group/${group}`, { items })
}

export function createSetting(data: any) {
  return request.post('/setting', data)
}

export function updateSetting(id: number, data: any) {
  return request.put(`/setting/${id}`, data)
}

export function deleteSetting(id: number) {
  return request.delete(`/setting/${id}`)
}
