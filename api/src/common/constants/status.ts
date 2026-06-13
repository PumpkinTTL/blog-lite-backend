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
