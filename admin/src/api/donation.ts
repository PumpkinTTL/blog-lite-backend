import request from './request'

// ── 类型定义 ──

export type PayMethod = 'wechat' | 'alipay' | 'crypto' | 'other'
export type CryptoNetwork = 'TRC20' | 'BSC' | 'POL'
export type DonationStatus = 'pending' | 'confirmed' | 'refunded'

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
  /** 捐赠答谢激活码 ID（null=未发码） */
  rewardCodeId: number | null
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

export function getDonationList(params?: { page?: number; pageSize?: number; id?: number; keyword?: string; status?: DonationStatus; payMethod?: string; cryptoNetwork?: string }) {
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

/**
 * 发送感谢（统一入口：纯感谢 / 带激活码感谢）
 */
export interface SendThanksParams {
  /** 可选激活码 ID（带则为发码感谢，不带为纯感谢） */
  codeId?: number | null
  /** 收件邮箱（缺省用捐赠记录的 donorEmail）；后端据此反查系统用户锁归属 */
  email?: string | null
  /** 可选管理员留言（浅琥珀底块） */
  message?: string
  /** 可选联系方式（不传则不显示"如有疑问"段） */
  contact?: string
  /** 可选平台名（默认 bitlesu） */
  platformName?: string
  /** 可选署名寄语（默认"每一篇文章都是生活与阅读的深度思考"） */
  tagline?: string
  /** 是否邮件通知（false 则只记录不发邮件） */
  sendEmail?: boolean
}

export interface SendThanksResult {
  /** 生成的激活码字符串（带码感谢时返回，纯感谢为 null） */
  code: string | null
  /** 后端按邮箱自动反查到的系统用户 ID（null=访客未锁） */
  claimedUserId: number | null
  /** 邮件是否发送成功 */
  isSent: boolean
  /** 通知记录 */
  notif: DonationNotification
}

export function sendThanks(id: number, data: SendThanksParams) {
  return request.post<any, { success: boolean; data: SendThanksResult; message: string }>(`/donation/${id}/send-thanks`, data)
}

/**
 * 捐赠通知记录（发码邮件 / 感谢邮件的发送历史）
 */
export interface DonationNotification {
  id: number
  donationId: number
  type: 'code' | 'thanks'
  recipientEmail: string
  codeId: number | null
  subject: string
  isSent: boolean
  errorMessage: string | null
  operatorId: number | null
  createdAt: string
}

/** 查询某笔捐赠的通知历史 */
export function getDonationNotifications(id: number) {
  return request.get<any, { success: boolean; data: DonationNotification[]; message: string }>(`/donation/${id}/notifications`)
}

export function deleteDonation(id: number) {
  return request.delete<any, { success: boolean; message: string }>(`/donation/${id}`)
}

export function batchDeleteDonations(ids: number[]) {
  return request.delete<any, { success: boolean; message: string }>('/donation/batch', { data: { ids } })
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
