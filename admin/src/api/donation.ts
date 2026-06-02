import request from './request'

// ── 类型定义 ──

export type PayMethod = 'wechat' | 'alipay' | 'crypto' | 'other'
export type CryptoNetwork = 'TRC20' | 'BSC' | 'POL'
export type DonationStatus = 0 | 1 | 2

export interface Donation {
  id: number
  donorName: string
  donorAvatar: string | null
  donorEmail: string | null
  amount: number
  currency: string
  payMethod: PayMethod
  cryptoNetwork: CryptoNetwork | null
  cryptoTxHash: string | null
  cryptoFrom: string | null
  cryptoTo: string | null
  message: string | null
  tradeNo: string | null
  status: DonationStatus
  isVisible: number
  sortOrder: number
  remark: string | null
  createdAt: string
  updatedAt: string
}

export interface DonationListResponse {
  list: Donation[]
  total: number
  page: number
  pageSize: number
}

export interface DonationStats {
  total: number
  confirmed: number
  pending: number
  totalAmount: number
  byMethod: { payMethod: string; count: number; totalAmount: number }[]
  byCrypto: { cryptoNetwork: string; count: number; totalAmount: number }[]
}

export interface CreateDonationData {
  donorName: string
  donorAvatar?: string
  donorEmail?: string
  amount: number
  currency?: string
  payMethod: PayMethod
  cryptoNetwork?: CryptoNetwork
  cryptoTxHash?: string
  cryptoFrom?: string
  cryptoTo?: string
  message?: string
  tradeNo?: string
  status?: DonationStatus
  isVisible?: number
  sortOrder?: number
  remark?: string
}

export type UpdateDonationData = Partial<CreateDonationData>

// ── API ──

export function getDonationList(params?: { page?: number; pageSize?: number; id?: number; keyword?: string; status?: number; payMethod?: string; cryptoNetwork?: string }) {
  return request.get<any, { success: boolean; data: DonationListResponse; message: string }>('/donation', { params })
}

export function getDonationStats() {
  return request.get<any, { success: boolean; data: DonationStats; message: string }>('/donation/stats')
}

export function getDonationDetail(id: number) {
  return request.get<any, { success: boolean; data: Donation; message: string }>(`/donation/${id}`)
}

export function createDonation(data: CreateDonationData) {
  return request.post<any, { success: boolean; data: Donation; message: string }>('/donation', data)
}

export function updateDonation(id: number, data: UpdateDonationData) {
  return request.put<any, { success: boolean; data: Donation; message: string }>(`/donation/${id}`, data)
}

export function toggleDonationStatus(id: number) {
  return request.put<any, { success: boolean; data: Donation; message: string }>(`/donation/${id}/toggle-status`)
}

export function toggleDonationVisible(id: number) {
  return request.put<any, { success: boolean; data: Donation; message: string }>(`/donation/${id}/toggle-visible`)
}

export function deleteDonation(id: number) {
  return request.delete<any, { success: boolean; message: string }>(`/donation/${id}`)
}

export function exportDonations() {
  const token = localStorage.getItem('accessToken')
  const base = import.meta.env.VITE_API_BASE_URL || ''
  const url = `${base}/donation/export`
  // 使用原生链接触发下载（带 token）
  const link = document.createElement('a')
  // 通过 fetch 下载（需要 Authorization header）
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((res) => res.blob())
    .then((blob) => {
      const blobUrl = URL.createObjectURL(blob)
      link.href = blobUrl
      link.download = `donations_${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(blobUrl)
    })
}
