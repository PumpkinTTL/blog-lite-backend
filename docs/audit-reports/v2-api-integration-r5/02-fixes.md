# R5 修复记录

---

## P0 修复（功能 bug / 安全 / 内存泄漏）

### 1. ai-provider 路由顺序：批量删除失效 → 修复
`ai-provider.controller.ts`：`@Delete('batch')` 移到 `@Delete(':id')` 之前。
原 `:id` 在前导致 `DELETE /ai-provider/batch` 命中 `:id`，ParseIntPipe 解析 "batch" 失败 → 批量删除 500。
（注：code.controller.ts 经核实 batch 已在前，无需改，报告 B1 误报已剔除。）

### 2. API Key 明文泄露 → 改环境变量
`ai-provider.service.ts` SEED 的 `apiKey` 从硬编码改为 `process.env.AI_DEFAULT_API_KEY || ''`。
⚠️ 历史仓库已泄露 `sk-a519...`，需在 9router 后台轮换密钥 + 在 .env 配置 AI_DEFAULT_API_KEY。

### 3. PostCard/PostListItem 互动状态不随 props 更新 → 加 watch
两个卡片组件加 `watch(() => props.post.isLiked/isFavorited/likeCount, ...)` 同步本地副本。
修复列表重拉/切分类时复用卡片实例状态卡在旧值的问题（与 ArticleFooter 已修过的同类问题一致）。

### 4. nprogress MutationObserver 永不 disconnect → 删除
`utils/nprogress.ts` 删除 MutationObserver。它监听 html class 变化却读 localStorage，逻辑不匹配且
class 频繁变动导致高频无谓回调。主题色改由 `progressStart` 时的 `applyColor()` 即时刷新兜底。

---

## P1 修复（边界值 / 类型 / 数据一致性）

### 后端

**getProfile 字段裁剪**：`user.service.ts` 返回前剔除 `registerIp/registerCodeId/bannedUntil/password`，
避免运营/审计字段泄露给终端用户。

**DTO MaxLength**：ResetPasswordDto/ResetPasswordByCodeDto/LoginByCodeDto 的 `newPassword` 加 `@MaxLength(100)`、
`code` 加 `@MaxLength(32)`，防 bcrypt 处理超长字符串的 DoS 面 + Redis 存超长 code。

**email-code console.error → Logger**：`email-code.service.ts` 邮件发送失败从 `console.error` 改为
`this.logger.error`，纳入 NestJS 日志管道（生产日志聚合才能捕获）。

### 前端 v2

**getInitial emoji 截断**：`utils/format.ts` 从 `name.slice(0,1)` 改为 `[...name][0]`，
按码点切分避免 emoji 代理对被截成半个码元导致 AvatarFallback 乱码。

**DonationDialog usdtAmount NaN**：`computed` 加 `Number.isFinite` 兜底，
用户清空金额时不再显示"≈ $NaN USDT"。

**ArticleComments 假 loading**：删除 `setTimeout(200ms)` 假延迟 + `loadingMore` ref/常量/模板引用。
纯前端 slice 不需要假 loading，且原 timer 卸载时不清理有泄漏风险。

**死代码清理**：
- 删 `apis/user.ts` 的 `getMembership` 函数（无调用方，membership 已由 profile 联查）
- 删 `getProfile` 返回的 `__userInfo` 死字段
- store 取 `__membership` 去掉 `as any`，用声明好的类型

### admin

**isRedirecting 永不重置**：`request.ts` redirectToLogin 加 2.5s 超时强跳兜底 + 各出口重置标志。
原 naive-ui 动态加载失败时 onAfterLeave 不触发，标志位永久锁死后续 401 全静默。

**ScrollTestView 生产暴露**：`router/index.ts` 用 `import.meta.env.DEV` 守卫，
测试页仅开发环境可访问，生产构建不注册路由。

---

## 未修（评估后保留，附理由）

| 项 | 理由 |
|----|------|
| stores/user.ts storage 监听器（F2）| 单实例生产只注册一次，clearLocalAuth/fetchProfile 幂等；HMR 重复注册仅开发期，风险可控 |
| ResourcePanLinks 复制 setTimeout（F7）| 2 秒短定时器，卸载时写已销毁 ref 无害（Vue ref 写值不报错），不值得引入复杂度 |
| 批量删用户级联清理（B3）| 改动大且涉及事务，单独排期做更稳妥，本轮不赶 |
| 兑换码 useCode+grant 原子性（B4）| 同上，涉及事务重构，需单独设计补偿回滚 |
| admin useCrudList 分页下沉（A11）| 重构 12+ view，工作量大，单独排期 |
| checkUsername/checkEmail/refreshToken/deleteAccount | 占位/语义函数，删 store 导出会动类型，留着不碍事 |
| F5 isNew/relativeTime 不随时间更新 | 全站共性，7天阈值宽松可接受，需全局 nowTick 改动大 |
