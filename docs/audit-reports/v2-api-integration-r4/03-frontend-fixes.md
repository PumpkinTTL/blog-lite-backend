# R4 前端体验修复

> 错误态 + 倒计时复用 + 防重复 + bundle 优化

---

## P0 前端体验

### F-P0-1 ArticleDetail 加载失败永久卡骨架屏
- **问题**：loadArticle 失败（404/无权/网络）时 `article.value = null`，模板兜底 `<ArticleDetailSkeleton v-else />` 继续显示骨架屏 → 用户永远看不到错误，无返回入口
- **修复**：
  - 新增 `loadError` ref 区分"加载中"vs"失败"
  - 模板加错误态分支：FileQuestion 图标 + "文章不存在或已删除" + 返回首页按钮
  - loadArticle 开头 reset loadError，catch 里设 loadError
  - 非 loading 且 loadError 时显示错误态，不再永久骨架屏
- **文件**：ArticleDetail.vue（script + template）

---

## P1 前端体验

### F-P1-1 LoginModal 迁移到 useCodeCooldown
- **问题**：LoginModal 仍用手写 setInterval 倒计时（startCooldown + cooldownTimer + forgotCooldownTimer），与 R1 抽出的 useCodeCooldown 重复
- **修复**：
  - 两个 useCodeCooldown 实例（codeCooldown/forgotCooldown）替换手写逻辑
  - sendCode/sendForgotCode 改用 `codeSend(fn)` / `forgotSend(fn)`
  - 删 startCooldown 函数 + cooldownTimer/forgotCooldownTimer 变量 + onBeforeUnmount（hook 内部自管）
  - 修忘记密码面板 disabled/loading 错用 isSendingCode（应 isForgotSending）
- **文件**：LoginModal.vue

### F-P1-2 UserCenter 移动端改密确认按钮缺 disabled
- **问题**：PC 端改密确认按钮有 `:disabled="savingPwd"` + loading，移动端漏了（提交中可重复点击）
- **修复**：移动端确认按钮补 `:disabled="savingPwd"` + Loader2 loading + "保存中..."文案
- **文件**：UserCenter.vue 移动端改密模板

---

## 前端 bundle 优化

### F-Opt-1 Font Awesome 条件加载
- **问题**：v2 不用 Font Awesome，但 main.ts 无条件注册 ~120 个图标进 bundle
- **修复**：抽到 `src/setup/fontawesome.ts`，main.ts 按 `VITE_THEME_VERSION === 'v1'` 条件动态 import
- **文件**：src/setup/fontawesome.ts（新建）+ main.ts

### F-Opt-2 UserCenter/cropperjs 异步加载
- **问题**：UserCenter 静态 import cropperjs（~50KB），进首屏 chunk
- **修复**：App.vue 改 `defineAsyncComponent`
- **文件**：App.vue

---

## 确认良好的前端实践（无需修改）

### 监听器清理 ✓
Header/MobileBottomTab/NotificationCenter/ArticleToc/ArticleDetail 的 addEventListener/setInterval 都在 onBeforeUnmount 正确清理（R1 已修 + R4 确认）

### 竞态守卫 ✓
Home/ArticleDetail/ResourceDetail 的 loadVersion 版本号守卫完整（R1 修的，R4 确认）

### 评论切文章刷新 ✓
ArticleComments 的 `:key="rawPost.id"` 正确（R1 修的，R4 确认）

### 图片懒加载 ✓
大部分 img 有 loading="lazy"，遗漏仅在 UserCenter 收藏列表封面（小范围）
