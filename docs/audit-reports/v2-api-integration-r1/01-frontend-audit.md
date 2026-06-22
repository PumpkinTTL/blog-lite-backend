# R1 前端审查报告

> 审查方式：3 个 Explore agent 并行（API 层 / 页面组件层 / store+router 层）+ 人工逐条核验
> 状态标记：✅ 已修 / ⏸️ 未修（误报或范围外）/ ⚠️ 未修（真实问题但本轮跳过）

---

## 一、API 层（src/apis/）

### ✅ A1. redeemResource 发多余字段触发 400（高危）
- **位置**：`src/apis/resource.ts:113-115`
- **问题**：发 `{ resourceId, code }`，但后端 `RedeemResourceDto` 只有 `code`，配合 `forbidNonWhitelisted:true` 必触发 400 → 兑换功能瘫痪
- **核验**：backend `resource.dto.ts:157-160` 确认只有 `code`；backend `main.ts:30-33` 确认 `forbidNonWhitelisted:true`
- **修复**：改为只发 `{ code }`（commit `d74762c`）

### ✅ A2. updateProfile 字段不匹配触发 400（高危）
- **位置**：`src/apis/user.ts:432-446`
- **问题**：前端发 signature/gender，但后端 `UpdateProfileDto` 当时只声明 nickname/email/avatar
- **核验**：backend `user.dto.ts:80-95` 确认字段缺失；backend `UserEntity` 也缺 gender/signature/phone 列
- **修复**：后端补三列 + DTO 放开（commit `619ae6c`）；前端 UpdateProfileParams 补 email/phone（commit `5e9f6eb`）

### ✅ A3. adaptUserInfo 读不到 gender/signature/phone（中危）
- **位置**：`src/apis/user.ts:244-273`
- **问题**：后端 UserEntity 无这些列，adaptUserInfo 读全 undefined，资料页空白
- **修复**：后端补列（commit `619ae6c`），前端 adaptUserInfo 已读 camelCase

### ⏸️ A4. 后端多处对"无权访问/不存在"返回 HTTP 200 + success:false（设计问题，未修）
- **现象**：被 `request.ts` 拦截器统一 reject + notifyError，UI 无法区分"不存在"和"无权访问"
- **影响**：post/resource/code/comment 多个模块的错误提示体验
- **未修原因**：属于后端响应规范的整体设计问题，需统一规划，超出本轮范围

### ⏸️ A5. announcement.ts 缺 isPinned 字段（低危）
- **现象**：后端 announcement 实体可能有 isPinned，前端 interface 未声明
- **未修原因**：当前 UI 未消费该字段，无实际影响

---

## 二、页面/组件层（src/views/v2/ + src/components/v2/）

### ✅ P1. Home.vue 列表竞态（高危）
- **位置**：`src/views/v2/Home.vue:57-117`（loadPosts）
- **问题**：切分类/排序/搜索时旧请求可覆盖新结果；watch(activeCategory)/(activeSort) 立即触发无防抖；setHomeFirstPage 会污染全局 store
- **修复**：引入 loadVersion 版本号守卫，await 后校验 + finally 内 loading 条件化；补 onBeforeUnmount 清理 searchTimer（commit `cd6b1b8`）

### ✅ P2. ArticleDetail.vue 竞态 + 互动态跨污染（高危）
- **位置**：`src/views/v2/ArticleDetail.vue:121-202`
- **问题**：loadArticle 无取消机制；loadInteractionStatus 写回 liked/bookmarked 不校验 postId 是否仍是当前文章
- **修复**：loadVersion 共享版本号；三个 loader（loadArticle / loadInteractionStatus / loadNeighborsAndRelated）共享版本语义（commit `cd6b1b8`）

### ✅ P3. ResourceDetail.vue 同样竞态（高危）
- **位置**：`src/views/v2/ResourceDetail.vue:65-99`
- **修复**：loadResource 加版本号（commit `cd6b1b8`）

### ✅ P4. ArticleComments 切文章不刷新评论（高危）
- **位置**：`src/views/v2/ArticleDetail.vue:264` + `src/components/v2/detail/ArticleComments.vue`
- **问题**：`<ArticleComments v-if="rawPost" :post-id="rawPost.id" />` 无 `:key`，Vue 复用组件实例，但 ArticleComments 只 onMounted 一次，切文章评论不刷新
- **修复**：父组件加 `:key="rawPost.id"` 强制重建（commit `772b7fc`）

### ✅ P5. ArticleComments 无 loading/错误态（高危）
- **位置**：`src/components/v2/detail/ArticleComments.vue:80-92`
- **问题**：comments 初始 []，loadComments 失败静默，模板 v-if="comments.length" → 用户分不清"真的没评论"和"加载失败"
- **修复**：引入 loadingComments + loadCommentsError 三态，失败态提供重试入口（commit `772b7fc`）

### ⏸️ P6. ArticleComments loadReplies L99 非响应式（误报）
- **位置**：`src/components/v2/detail/ArticleComments.vue:99`
- **声明**：`comment.replies = ...` 直接给数组元素赋值
- **核验结论**：**误报**。Vue 3 中 `ref<T[]>([])` 的 `.value` 是深层 reactive Proxy，数组元素也是 Proxy，给已声明可选属性（`replies?: CommentItem[]`）赋值能正常触发更新。这与 Vue 2 的 `$set` 痛点不同
- **未修原因**：不是 bug

### ⚠️ P7. ArticleComments loadReplies 并发去重失效（低危，未修）
- **位置**：`src/components/v2/detail/ArticleComments.vue:96-103`
- **问题**：`repliesLoaded.add` 在 await 之后，快速双击会穿透 guard 触发两次请求
- **未修原因**：结果幂等（同评论回复），影响很小

### ⚠️ P8. UserCenter.vue 移动端改密表单字段错乱（中危，未修）
- **位置**：`src/components/v2/user/UserCenter.vue:822-839`（移动端模板）
- **问题**：移动端绑 `pwdForm.current`（"当前密码"输入框），但 pwdForm 类型定义和 savePwd 都不含 current，且 resetPasswordByCode 不传 current。移动端用户填了"当前密码"无用，且缺验证码输入框，提交必失败
- **未修原因**：属于表单重构（PC/移动端字段对齐），超出本轮"接口对接逻辑"范围

### ⚠️ P9. ArticleFooter 点赞/收藏乐观更新在登录态变化时计数会错（中危，未修）
- **位置**：`src/components/v2/detail/ArticleFooter.vue:77-120`
- **问题**：togglingLike=true 期间 watch 不同步 likes；若此时登录态变化触发 loadInteractionStatus 回填新 likes 值，会被忽略，本地 likes 停在乐观值
- **未修原因**：边界场景较窄（点赞期间恰好登录态变化），本轮聚焦接口对接

### ⚠️ P10. ArticleToc.vue setupObserver 用 setTimeout(50) 硬编码等待（中危，未修）
- **位置**：`src/components/v2/detail/ArticleToc.vue:48-83`
- **问题**：慢设备/大文章 50ms 可能不够，heading 还没渲染导致 TOC 高亮失效
- **未修原因**：体验优化，非接口对接问题

### ⚠️ P11. ResourceSection.vue 懒加载失败永久卡死（中危，未修）
- **位置**：`src/components/v2/home/ResourceSection.vue:14-31`
- **问题**：loaded=true 在请求前置位，首次失败后 observer disconnect，无重试入口，资源区永远不显示
- **未修原因**：本轮未触及，留 R2

### ⚠️ P12. DonationDialog.vue 提交成功后不重置表单（中危，未修）
- **位置**：`src/components/v2/donation/DonationDialog.vue:64-75, 179-208`
- **问题**：watch(open) 重置 step/donationId/copied 但未重置 form，留言/txHash 残留
- **未修原因**：体验细节，留 R2

### ⏸️ P13~P28. 低危项汇总（未修）
- NotificationCenter relativeTime 不定时刷新（P15）
- LoginModal registerForm 类型与赋值不符（P18）
- Shop/Donation 一次拉 50 条无分页（P19）
- Shop 分类徽标计数模板内联 filter 重算（P20）
- ArticleDetail/ResourceDetail id 解析对科学计数法不严谨（P21）
- Home localStorage 读取视图模式无 try-catch（P22）
- ResourcePanLinks 用数组 index 作 key（P25）
- NotificationCenter 无 Esc 关闭（P26）
- UserCenter 头像上传 base64 撑内存（P27）
- BackToTop onScroll 无节流（P28）

---

## 三、Store + Router + 全局副作用

### ✅ S1. user store refreshTokenAction 用错 token 误登出（高危）
- **位置**：`src/stores/user.ts:243-254`
- **问题**：`refreshTokenApi({ token: token.value })` 把 accessToken 当 refreshToken 传后端，必失败 → catch → logout() 误登出
- **修复**：删除 refreshTokenAction + expireTime 字段（全项目无人消费）；token 生命周期交给 tokenStorage + request.ts（commit `5fddf86`）

### ✅ S2. site store 缓存跨用户泄漏（中危）
- **位置**：`src/stores/site.ts` + `src/stores/user.ts:205-215`（clearLocalAuth）
- **问题**：登出/切用户时不清 site store，homeFirstPage 含 liked/bookmarked 字段，5 分钟 TTL 内仍有效，A 登出后 B 同 tab 登录会读到 A 的互动态
- **修复**：site store 暴露 reset()；clearLocalAuth 动态 import 调用（commit `5fddf86`）

### ✅ S3. request.ts isPublicPath 用 includes 误判（中危）
- **位置**：`src/utils/request.ts:77-80`
- **问题**：`url.includes(p)` 过于宽松，`/post` 误匹配 `/repost`、`/comment` 误匹配 `/user-comment`，误判为公开的接口 401 不续签
- **修复**：精确前缀匹配 `path === p || path.startsWith(p + '/')`（commit `5fddf86`）

### ✅ S4. UserCenter loadFavorites TTL 时机（中危）
- **位置**：`src/components/v2/user/UserCenter.vue:107-140`
- **问题**：favoritesLoadedAt 写在 await 前，失败也占用 30s TTL 窗口，失败后无法重试
- **修复**：TTL 时间戳下移到成功后；profile/membership 改 allSettled 任一失败重置时间戳（commit `5fddf86`）

### ✅ S5. 全局错误兜底缺失（低危）
- **位置**：`src/main.ts`
- **问题**：无 app.config.errorHandler、无 unhandledrejection 监听，多处 `.catch(()=>{})` 静默吞错
- **修复**：main.ts 注册 errorHandler + unhandledrejection（SessionExpiredError 不重复 notify）（commit `5fddf86`）

### ⏸️ S6. 路由守卫无 requiresAuth / 会员等级校验（设计选择）
- **位置**：`src/router/index.ts:90-101`
- **现象**：beforeEach 只 progressStart + title，无任何鉴权重定向
- **判断**：当前所有业务路由都是公开页 + 弹窗式登录，设计上不需要路由级鉴权。会员门槛在组件级（ResourceCard/ResourceDetail/ResourceLock）。未来加受保护页才需补
- **未修原因**：非 bug，符合当前产品形态

### ⚠️ S7. 多 tab 同步 userInfo 可能半登录态（低危，已部分修）
- **位置**：`src/stores/user.ts:291-296`
- **修复**：已在 userInfo 同步时加 `token.value` 判断（commit `5fddf86`）。但 saveToStorage 仍只写 'token' 不写 'accessToken'，跨 tab 场景仍有边界，留 R2

### ⚠️ S8. redirectToLogin 无防抖，续签成功后重试再 401 可连续弹窗（中危，未修）
- **位置**：`src/utils/request.ts:126-140`
- **问题**：无 isRedirecting 标志，新 token 也被后端拒时会连续弹多次登录窗
- **未修原因**：边界场景，留 R2

---

## 未修项汇总（留给 R2 扫描）

按优先级：
1. **中危**：P8（UserCenter 移动端改密表单）、P9（ArticleFooter 乐观更新计数）、P11（ResourceSection 失败卡死）、P12（DonationDialog 表单不重置）、S8（redirectToLogin 防抖）
2. **低危**：P7（loadReplies 并发去重）、P10（ArticleToc setTimeout）、P13~P28（一批小瑕疵）、S7（多 tab 半登录态边界）

明确误报（不要重审）：
- P6（ArticleComments loadReplies 响应式）—— Vue 3 Proxy 机制验证为正常
