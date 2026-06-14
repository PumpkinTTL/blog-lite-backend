/**
 * 各模块 status 常量（字符串枚举，直观可读）
 */

// ── 文章可见性 ──
export const POST_STATUS = {
  DRAFT: 'draft',       // 草稿
  PUBLISHED: 'published', // 公开
  LOGIN: 'login',       // 登录可见
  PRIVATE: 'private',   // 指定用户可见
} as const;

// ── 公告状态 ──
export const ANNOUNCEMENT_STATUS = {
  HIDDEN: 'hidden',   // 隐藏
  VISIBLE: 'visible', // 显示
} as const;

// ── 友链状态 ──
export const FRIEND_LINK_STATUS = {
  HIDDEN: 'hidden',   // 隐藏
  VISIBLE: 'visible', // 显示
} as const;

// ── 捐赠状态 ──
export const DONATION_STATUS = {
  PENDING: 'pending',     // 待确认
  CONFIRMED: 'confirmed', // 已确认
  REFUNDED: 'refunded',   // 已退款
} as const;

// ── 用户状态 ──
export const USER_STATUS = {
  DISABLED: 'disabled', // 禁用
  ACTIVE: 'active',     // 正常
} as const;

// ── 会员订阅状态 ──
export const MEMBERSHIP_STATUS = {
  ACTIVE: 'active',       // 生效中
  EXPIRED: 'expired',     // 已过期
  CANCELLED: 'cancelled', // 已取消（管理员手动撤销）
} as const;

// ── 会员开通来源 ──
export const MEMBERSHIP_SOURCE = {
  ADMIN: 'admin',     // 管理员手动开通
  CODE: 'code',       // 兑换码开通
  PAYMENT: 'payment', // 支付订单（未实现）
} as const;

// ── 套餐等级 ──
export const PLAN_LEVEL = {
  PLUS: 'plus',   // Plus（基础会员）
  PRO: 'pro',     // Pro（专业版）
  MAX: 'max',     // Max（旗舰版，最高级）
} as const;
