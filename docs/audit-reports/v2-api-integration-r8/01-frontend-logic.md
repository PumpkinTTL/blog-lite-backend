# R8 前端逻辑修复详情

## v2 前端

### 1. fetchAds 未 catch（3 处 Unhandled rejection）

**文件**：Sidebar.vue:28、AdPopup.vue:68、AdToast.vue:51

**问题**：`siteStore.fetchAds()` 失败时（网络错误/5xx），ensure() 内 await 抛错，fetchAds reject，
调用方既不 await 也不 .catch → 控制台 Unhandled promise rejection。
对比 App.vue/NotificationCenter.vue 都正确带了 .catch，唯独这三处漏了。

**修复**：三处补 `.catch(() => {})`（广告非关键数据，request.ts 已统一 toast）。

### 2. ArticleToc observer 泄漏

**文件**：ArticleToc.vue setupObserver()

**问题**：setupObserver 内 `await new Promise(r => setTimeout(r, 50))`，50ms 后才创建 IntersectionObserver。
若这 50ms 窗口内组件被卸载（切路由），onBeforeUnmount 时 observer 还是 null 无法清理，
随后 setTimeout 回调创建的 observer 永远不会被 disconnect（泄漏 + observe 已移除的 DOM）。

**修复**：
- 加 `disposed` 标志，setupObserver await 后检查 `if (disposed) return`
- 加 `setupTimer` 追踪 setTimeout，onBeforeUnmount 和 setupObserver 入口都清理
- onBeforeUnmount 置 `disposed = true`

### 3. Home 缓存写入用了过期 total

**文件**：Home.vue:99

**问题**：`setHomeFirstPage(list, total.value)` 在 `total.value = res.data?.total ?? 0` 之前调用，
写入 site store 的 total 用的是旧值（首次加载时是 0）。

**修复**：把 total 更新移到 setHomeFirstPage 调用之前。

### 4. null 防御不一致（3 处）

**文件**：UserCenter.vue:120、Shop.vue:25、Donation.vue:29-30

**问题**：访问 `res.data.list` / `res.data.stats` 没有可选链，同仓库其他消费点都用了 `?.`。
若后端在 success 分支返回 data:null，会抛 TypeError。

**修复**：统一改 `res.data?.list || []`、`res.data?.stats || 默认值`。

---

## admin 前端

### 5. resource 编辑表单引用污染（🔴 数据脏）

**文件**：resource/IndexView.vue:604-614

**问题**：openEdit 的 formMapper 里 panLinks/allowedUserIds/allowedRoleIds 直接赋值原数组引用。
在 n-dynamic-input 里改网盘链接然后点取消（不保存），列表里那行的 panLinks 也被改了（同一引用）。

**修复**：深拷贝——panLinks 用 `.map(p => ({...p}))`，allowedUserIds/allowedRoleIds 用 `[...arr]`。

### 6. resource 可见性失败仍保存主体（🔴 数据不一致）

**文件**：resource/IndexView.vue:474-483

**问题**：可见性接口 updateResourceVisibility 失败时只 toast，没 return，接着调 _handleSave 保存主体。
结果：资源标题/状态更新了，可见性没更新，用户以为整体失败实际半成功。

**修复**：可见性 catch 里 `return false`（阻止 _handleSave，弹窗保持打开让用户重试）。

### 7. user 封禁失败仍关弹窗（🔴 假成功）

**文件**：user/IndexView.vue:252-262, 264-277

**问题**：doToggle 失败时只 toast 不抛错，confirmBan 不知道失败，照样关弹窗 + 清 banningUser。
用户以为封禁成功，实际用户状态没变。

**修复**：doToggle 返回 `Promise<boolean>`（成功 true/失败 false），confirmBan 据此决定是否关弹窗。

### 8. user 封禁按钮 loading 永不触发

**文件**：user/IndexView.vue:39

**问题**：`banning` ref 声明了但 confirmBan 从未置 true，模板 `:loading="banning"` 永远 false。
doToggle 期间按钮一直可点（虽有 togglingId 防重入，但 UI 无反馈）。

**修复**：confirmBan 里 doToggle 前置 `banning.value = true`，后置 `false`。
