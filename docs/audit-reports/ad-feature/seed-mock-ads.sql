-- 广告推广 - 测试虚拟数据
-- 用法：在数据库里执行此 SQL（MySQL）
-- 插入 3 条广告覆盖三种位置：sidebar / popup / popup_toast
-- 状态均为 active，排期不限（立即生效、长期有效）

INSERT INTO `ads` (
  `title`, `subtitle`, `image_url`, `button_text`, `href`,
  `position`, `type`, `status`, `start_at`, `end_at`,
  `sort_order`, `impressions`, `clicks`, `admin_note`,
  `created_at`, `updated_at`
) VALUES
-- 1. 侧边栏卡片广告
(
  'Vue 3 企业级实战',
  '从零搭建完整项目，涵盖 TypeScript、Pinia、Router 等核心技术栈。',
  'https://picsum.photos/seed/vue3-ad/600/300',
  '立即学习',
  'https://cn.vuejs.org',
  'sidebar', 'card', 'active', NULL, NULL,
  0, 0, 0, '合作方：某教育平台｜CPS 分成 30%｜2026 Q3 投放',
  NOW(), NOW()
),
-- 2. 首页 Modal 弹窗广告
(
  '限时优惠 · 全场资源 8 折',
  '慢成长会员限时特惠，解锁全部精选网盘资源，仅限本周！',
  'https://picsum.photos/seed/popup-promo/800/400',
  '立即开通',
  'https://bitle.cc.cd/membership',
  'popup', 'card', 'active', NULL, NULL,
  0, 0, 0, '内部促销｜无外部分成｜目标转化率 5%',
  NOW(), NOW()
),
-- 3. 右下角浮窗广告
(
  'TypeScript 进阶手册',
  '深入类型系统，掌握工程化 TS 开发实践。',
  'https://picsum.photos/seed/ts-book/400/200',
  '免费阅读',
  'https://www.typescriptlang.org',
  'popup_toast', 'card', 'active', NULL, NULL,
  0, 0, 0, '友情推广｜无收益｜帮朋友引流',
  NOW(), NOW()
);
