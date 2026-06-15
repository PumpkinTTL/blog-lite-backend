/**
 * 各模块 status 常量（字符串枚举，直观可读）
 */

// ── 文章可见性 ──
export const POST_STATUS = {
  DRAFT: 'draft', // 草稿
  PUBLISHED: 'published', // 公开
  LOGIN: 'login', // 登录可见
  PRIVATE: 'private', // 指定用户可见
} as const;

// ── 公告状态 ──
export const ANNOUNCEMENT_STATUS = {
  HIDDEN: 'hidden', // 隐藏
  VISIBLE: 'visible', // 显示
} as const;

// ── 友链状态 ──
export const FRIEND_LINK_STATUS = {
  HIDDEN: 'hidden', // 隐藏
  VISIBLE: 'visible', // 显示
} as const;

// ── 捐赠状态 ──
export const DONATION_STATUS = {
  PENDING: 'pending', // 待确认
  CONFIRMED: 'confirmed', // 已确认
  REFUNDED: 'refunded', // 已退款
} as const;

// ── 用户状态 ──
export const USER_STATUS = {
  DISABLED: 'disabled', // 禁用
  ACTIVE: 'active', // 正常
} as const;

// ── 会员订阅状态 ──
export const MEMBERSHIP_STATUS = {
  ACTIVE: 'active', // 生效中
  EXPIRED: 'expired', // 已过期
  CANCELLED: 'cancelled', // 已取消（管理员手动撤销）
} as const;

// ── 会员开通来源 ──
export const MEMBERSHIP_SOURCE = {
  ADMIN: 'admin', // 管理员手动开通
  CODE: 'code', // 兑换码开通
  PAYMENT: 'payment', // 支付订单（未实现）
} as const;

// ── 套餐等级 ──
export const PLAN_LEVEL = {
  PLUS: 'plus', // Plus（基础会员）
  PRO: 'pro', // Pro（专业版）
  MAX: 'max', // Max（旗舰版，最高级）
} as const;

// ── 评论状态 ──
export const COMMENT_STATUS = {
  PENDING: 'pending', // 待审核（默认）
  APPROVED: 'approved', // 已通过
  REJECTED: 'rejected', // 已拒绝
} as const;

// ── 互动类型（点赞/收藏/未来扩展如踩） ──
export const INTERACTION_TYPE = {
  LIKE: 'like', // 点赞
  FAVORITE: 'favorite', // 收藏
} as const;

// ── 互动目标实体类型（多态） ──
export const INTERACTION_ENTITY = {
  POST: 'post', // 文章
  COMMENT: 'comment', // 评论
} as const;

// ── 资源可见性（同 POST_STATUS 四档语义） ──
export const RESOURCE_STATUS = {
  DRAFT: 'draft', // 草稿（仅 admin 可见）
  PUBLISHED: 'published', // 公开（任何人可见）
  LOGIN: 'login', // 登录可见
  PRIVATE: 'private', // 指定用户/角色可见（需 entity_visibility 授权）
} as const;

// ── 资源解锁来源 ──
export const RESOURCE_UNLOCK_SOURCE = {
  ADMIN: 'admin', // 管理员直接授权（entity_visibility）
  CODE: 'code', // 兑换码兑换
  PAYMENT: 'payment', // 单次购买（支付未实现，预留）
} as const;
