# R5 发现的问题清单

---

## 一、API 后端（backend/api）

### P0

**B1. ai-provider 路由顺序错误，批量删除失效**
`modules/ai-provider/ai-provider.controller.ts:92` `@Delete(':id')` 在 `@Delete('batch')`（:98）之前。`DELETE /ai-provider/batch` 命中 `:id`，`ParseIntPipe` 把 "batch" 解析失败 → 批量删除 500。对比 code.controller.ts 把 batch 放前面（正确）。

**B2. API Key 明文泄露在源码**
`modules/ai-provider/ai-provider.service.ts:13` SEED 对象明文 `apiKey: 'sk-a5192932229f5be4-6wmwyq-13a3121c'`。controller 返回时脱敏了，但密钥进了仓库历史。应改环境变量 + 轮换密钥。

**B3. 批量删用户不做级联清理**
`modules/user/user.service.ts:411` `batchRemove` 只 `userRepo.delete(ids)`，不像 `remove`（339-373）那样在事务里清 interactions/memberships/code_usage_logs 并回算文章计数。有文章的作者删除直接 FK 500；即使成功，孤儿数据导致计数虚高。

**B4. 兑换会员码消费与开通不原子**
`modules/membership/membership.controller.ts:177-201` `useCode`（消费码）和 `grant`（开通）是两个独立事务。grant 失败时码已消耗却没开通，无补偿回滚。应合并到同一事务。

### P1

**B5. getProfile 返回 registerIp/registerCodeId/bannedUntil 给普通用户**
`user.service.ts:777` 返回完整实体，含注册 IP、邀请码 ID、封禁时间等运营字段。终端用户可见属轻度信息泄露。应字段裁剪。

**B6. 软删除文章不清理 interactions 孤儿**
`post.service.ts:379` 软删除只 update deletedAt，不删该文章的 interactions。interactions 表残留指向已删文章的行，文章冗余计数仍是软删前值。

**B7. 密码/验证码 DTO 缺 @MaxLength**
`user.dto.ts:142/160` ResetPasswordDto.newPassword 只有 @MinLength(6) 无 @MaxLength。bcrypt 对 MB 级字符串消耗 CPU（DoS 面）。code 字段也无长度上限。

**B8. createCode 并发批量生成可能撞唯一键**
`code.service.ts:62-85` 查重后插入 + batchCreate 用 Promise.all，理论碰撞时 ER_DUP_ENTRY 导致整批 reject。应 INSERT IGNORE 或 catch 重生成。

**B9. code.batchRemove 不清理 usage_logs 和 assignedDonationId**
`code.service.ts:354` 直接 delete，code_usage_logs 残留，绑定的 donation.rewardCodeId 悬空。

### P2

**B10. 死代码：InteractionService.countOne 从未被调用**（interaction.service.ts:189）
**B11. email-code 用 console.error 绕过 Logger**（email-code.service.ts:73）

---

## 二、v2 客户端（src/）

### P0

**F1. PostCard 互动状态不随 props 更新**
`components/v2/home/PostCard.vue:41` `localLiked/localLikes/localFavorited` 初始化后无 watch props。列表重拉（切分类/登录态变化）时复用的卡片实例状态卡在旧值。ArticleFooter 已修过同类问题，PostCard/PostListItem 遗漏。

**F2. stores/user.ts storage 监听器永久泄漏**
`stores/user.ts:259-289` `window.addEventListener('storage')` 无 removeEventListener。HMR/测试会重复注册。

**F3. nprogress MutationObserver 永不 disconnect**
`utils/nprogress.ts:43` observer 监听 html class 变化，但 class 在该站频繁变动（Header 下拉、移动端），高频无谓回调。应改 themeStore watch。

### P1

**F4. getInitial 对 emoji 截断**（utils/format.ts:41）`slice(0,1)` 对代理对取半个码元，AvatarFallback 乱码。应 `[...name][0]`。
**F5. PostCard isNew 不会随时间更新**（:31）computed 内 new Date() 只在依赖变化时重算，8 天后仍显示 NEW。
**F6. ArticleComments 假 loading setTimeout 未清理**（:121）纯前端 slice 却 setTimeout 200ms，卸载时 timer 仍执行。
**F7. ResourcePanLinks 复制状态 setTimeout 未清理**（:22）卸载后 2s 内 timer 仍执行写 ref。
**F8. DonationDialog usdtAmount 无 NaN 兜底**（:103）`form.amount` 清空时 NaN，显示"≈ $NaN USDT"。
**F9. getProfile __membership 用 as any 绕过类型**（stores/user.ts:154）+ __userInfo 死字段。
**F10. applyMembership reduce 用 any + 日期比较无 NaN 兜底**（stores/user.ts:123）

### P2

**F11. 重复加载逻辑**：Home/ArticleDetail/ResourceDetail/Shop/Donation 的 onMounted+loading+竞态守卫模板高度重复，可抽 useAsyncResource。
**F12. 死代码**：checkUsername/checkEmail/getMembership/refreshToken/__userInfo/deleteAccount 均无调用方。

---

## 三、admin 后台（backend/admin/）

### P0

**A1. request.ts 续签用裸 axios，不带 X-Request-Id**
`api/request.ts:129` refresh 用裸 axios 绕过拦截器，续签失败时后端日志无法关联 requestId，排障困难。

**A2. isRedirecting 永不重置**
`api/request.ts:31` 置 true 后无重置。naive-ui 动态加载失败时 onAfterLeave 不触发，标志位永久锁死，后续 401 全静默吞掉。应加 finally 超时强跳。

**A3. redirectToLogin 硬刷新 vs SPA 路由冲突**
`api/request.ts:72` `window.location.href='/login'` 整页刷新，丢失运行时状态（进行中的上传、未保存编辑）。应改注入 router 跳转。

### P1

**A4. 列表翻页竞态（全站）**：useCrudList + 手写 load 无请求序号/AbortController，快速翻页慢请求覆盖新数据。
**A5. audit-log 绕过 API 层手拼 query string**（audit-log/IndexView.vue:58）+ 吞错误无提示。
**A6. donation 表单 status 数字/字符串契约混乱**（donation/IndexView.vue:338）`as unknown as` 强转掩盖类型不符。
**A7. user 视图封禁弹窗重入**（user/IndexView.vue:240）封禁走弹窗流程无 togglingId 保护，可重复打开覆盖 banningUser。
**A8. ai-provider 表单 any 滥用**（ai-provider/IndexView.vue:36/58）丢类型保护。
**A9. 403 分支丢弃 requestId**（request.ts:93）其余错误都带追踪号，403 单独处理不一致。
**A10. console 残留**：AgentPanel.vue:174 warn、ScrollTestView.vue:92 log（且路由暴露 requiresAuth:false）。

### P2

**A11. 分页样板代码 12+ view 重复**：page/pageSize/total/handleSearch/handlePageChange 逐字复制，应下沉 useCrudList。
**A12. resolveFileUrl 4 处重复**（post/media/PostEditView/resource）应抽 utils。
**A13. any 类型泛滥**（200 处）集中 useCrudList 和 api 层。
**A14. extractList 偷写 total 副作用**（useCrudList:61）违反单一职责。
**A15. ScrollTestView 测试页生产暴露**（router/index.ts:15）requiresAuth:false。
