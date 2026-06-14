import request from './request'

export interface TopPost {
  id: number
  title: string
  slug: string
  viewCount: number
  likeCount: number
}

export interface RecentUser {
  id: number
  username: string
  nickname: string | null
  avatar: string | null
  createdAt: string
}

export interface PostStatusDist {
  name: string
  value: number
}

export interface InteractionTrendItem {
  date: string
  likeCount: number
  favoriteCount: number
}

export interface DonationAmountItem {
  currency: string
  amount: number
  count: number
}

export interface DonationTrendItem {
  date: string
  count: number
  amount: number
}

export interface DashboardStats {
  // 计数类（卡片）
  postCount: number
  publishedCount: number
  draftCount: number
  categoryCount: number
  tagCount: number
  mediaCount: number
  userCount: number
  pendingCommentCount: number
  likeCount: number
  favoriteCount: number
  totalViews: number
  // 捐赠
  donationCount: number
  donationTotalAmount: DonationAmountItem[]
  donationStatusDist: PostStatusDist[]
  donationPayMethodDist: PostStatusDist[]
  donationTrend: DonationTrendItem[]
  // 内容区块
  topPosts: TopPost[]
  recentUsers: RecentUser[]
  // 图表
  postStatusDist: PostStatusDist[]
  interactionTrend: InteractionTrendItem[]
}

export function getDashboardStats() {
  return request.get('/dashboard/stats')
}
