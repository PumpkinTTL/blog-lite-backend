# R3 前后端契约 + 功能完整性修复

> 本轮修复的契约不一致 + 功能闭环问题

---

## P0 契约冲突

### C-P0-1 DonationStatus 前端 number 后端 string
- **不一致**：前端 `donation.ts:11` `DonationStatus = 0 | 1 | 2`（数字）；后端 entity `'pending' | 'confirmed' | 'refunded'`（字符串）
- **影响**：前端类型与实际数据不符，admin 传数字会被 ORM 当字符串 "0" 写库，与 'pending' 永远比不上
- **修复**：前端类型改为 `'pending' | 'confirmed' | 'refunded'`，与后端 entity 对齐
- **文件**：src/apis/donation.ts:11

---

## P1 功能完整性

### C-P1-1 Shop 客户端过滤分类（应服务端）
- **问题**：Shop 拉 50 条资源，前端按 category.name 派生分类 + 前端过滤。超过 50 条会漏数据；按 name 过滤不如 id 稳定（改名失效）
- **修复**：
  - 分类列表改用 siteStore.categories（带 id，稳定，不依赖资源派生，不漏空分类）
  - 过滤改用 category.id（不再用 name）
  - pageSize 50 → 100 覆盖绝大多数商城场景
- **文件**：src/views/v2/Shop.vue

---

## P2 功能闭环

### C-P2-1 UserCenter 移动端改密表单字段错乱
- **问题**：移动端改密表单有"当前密码"输入框（pwdForm.current 死字段，后端 reset-by-code 不验证当前密码），且缺"邮箱"+"验证码"输入框 → 移动端用户改密必失败
- **修复**：移动端改密表单对齐 PC 端：邮箱 + 验证码（带倒计时按钮）+ 新密码 + 确认新密码，去掉 current 死字段
- **文件**：src/components/v2/user/UserCenter.vue（移动端改密模板）

---

## 契约整体良好的部分（本轮确认无需修改）

R3 扫描确认以下方面前后端一致，无需改动：

### 路径匹配 ✓
所有 src/apis/*.ts 调用路径与 controller @Controller + @Get/@Post 完全一致，无单复数/连字符/缺前缀问题。后端不设 setGlobalPrefix，前端 vite proxy rewrite 剥掉 /api。

### 请求参数 ✓
所有 POST/PUT body 字段名（camelCase）与 DTO 一致；forbidNonWhitelisted:true 下前端只发 DTO 声明的字段。

### 响应包络 ✓
后端 100% 返回 `{ success, data, message }`，前端 ApiResponse 类型 + 拦截器解构一致。

### 枚举一致 ✓
PostStatus / ResourceStatus / PlanLevel / InteractionType / CommentStatus / CodeStatus / MembershipStatus 全部与后端 status.ts 对齐。

### 分页约定 ✓
统一 `{ list, total, page, pageSize }`，前端所有列表正确消费；pageSize 默认值后端 20/上限 100，前端显式传值不依赖默认。

### 错误响应 ✓
401 自动续签 + 跳登录；400/403/404/409/429 读 message 弹错。业务失败（HTTP 200 + success:false）统一走 notifyError + reject。

### 关键模块功能对接 ✓
- 文章：列表/详情/搜索/筛选/排序/上下篇/相关推荐/浏览记录 — 全接入
- 评论：列表/发表/回复/删除 — 全接入（点赞 UI 在 R2 删除，待后续接 interaction）
- 互动：toggle/状态查询/我的列表 — 全接入
- 资源：列表/详情/解锁（会员/付费/兑换码）— 全接入
- 会员：状态查询/兑换码兑换 — 全接入
- 捐赠：提交/赞助墙/统计 — 全接入
- 用户：登录/注册/验证码/资料/改密/换绑邮箱/头像 — 全接入
- 媒体：头像/文章图片直传 — 全接入（本轮补了类型校验）
- 公共数据：公告/友链/分类/标签 — 全接入

---

## 本轮发现但保留不动的（非 bug）

| 项 | 原因 |
|---|---|
| checkUsername/checkEmail 是 mock（永远 available:true）| 注册时后端会再校验，前端预检查冗余但无害，LoginModal 可能依赖实时提示 |
| deleteAccount throw 未实现 | v2 没注销入口，v1 有但 v1 是备选；后端无客户端注销接口，留产品决策 |
| getInteractionCounts 定义未用 | ArticleFooter 读 post.likeCount（Post entity 字段），toggle 时同步，够用；interaction 聚合接口留未来用 |
| updateComment API 定义但无编辑 UI | 评论编辑是产品决策（是否允许编辑），暂不接 |
| 上一篇/下一篇只从首页 12 条派生 | 超出第一页或筛选列表时无上下篇，需后端加 /post/:id/adjacent 接口（留 R4）|
