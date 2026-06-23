# R2 冗余清理与逻辑优化

> 本轮清理的死代码 + 逻辑优化，不涉及 bug 修复（bug 见 01-bugs-fixed.md）

---

## 一、死代码清理

### 1. ArticleComments 点赞死 UI（已删）
- **位置**：src/components/v2/detail/ArticleComments.vue
- **清理**：
  - toggleLike 函数（只弹"即将上线"，永不实现）
  - PC 端 + 移动端的点赞按钮 UI
  - CommentItem 接口的 likes/liked 字段
  - adaptComment 里的 likes/liked 赋值
  - 未使用的 import：ThumbsUp、notifyInfo
- **理由**：评论点赞走 interaction 模块，当前未接。保留死 UI 会误导用户（点了无反应），删除后未来接入时再加

### 2. UserCenter onBeforeUnmount 残留（已删）
- **位置**：src/components/v2/user/UserCenter.vue:558-561
- **清理**：迁移到 useCodeCooldown 后残留的 `if (pwdCooldownTimer) { clearInterval... }`（引用未声明变量，运行时 ReferenceError）
- **理由**：定时器已由 useCodeCooldown 内部 onBeforeUnmount 自管，这段是迁移遗留

### 3. LoginByCodeDto.invitationCode 死字段（已删）
- **位置**：backend/api/src/modules/user/user.dto.ts
- **清理**：invitationCode 字段（声明了"未注册自动注册"，但 service 未注册直接抛错，字段是误导）
- **理由**：注册必须走专门接口，DTO 字段误导调用方

---

## 二、逻辑优化（非 bug，但可改进）

### 1. About.vue 假延迟（已删）
- **位置**：src/views/v2/About.vue:10-14
- **优化**：静态页用 `await new Promise(r => setTimeout(r, 300))` 假装加载，无意义
- **改法**：直接 loading=false（下一帧即关闭骨架屏）

### 2. plan 等级映射重复定义（已统一）
- **位置**：ResourceLock.vue + Shop.vue + utils/plan.ts（3 处重复）
- **优化**：ResourceLock 和 Shop 各自内联 `{plus:'Plus',pro:'Pro',max:'Max'}`，与 utils/plan.ts 的 levelToPlan 重复
- **改法**：统一用 `levelToPlan(lvl)`，消除 3 处重复

### 3. issueLoginToken 抽取（已做）
- **位置**：backend/api/src/modules/user/user.service.ts
- **优化**：login 和 loginByCode 各自调用 authService.issueToken（重复代码 + 都缺 try/catch）
- **改法**：抽 `issueLoginToken` 私有方法，两处共用，消除重复 + 统一错误处理

### 4. admin code 状态文案对齐（已做）
- **位置**：backend/admin/src/views/code/IndexView.vue
- **优化**：原"有效/已用/过期/禁用"与后端 codeStatusToMessage 的"可用/已使用/已过期/已停用"不一致
- **改法**：统一为"可用/已使用/已过期/已停用"（statusLabelMap + statusOptions + editStatusOptions 三处）

---

## 三、保守保留（不破坏功能）

以下虽是"冗余"，但删除有风险或需产品决策，本轮保留：

| 项 | 位置 | 保留原因 |
|---|---|---|
| v1 全套代码树 | src/views/v1 + src/components/v1 + data/mockData.ts + articleMock.ts | v1 是 themeVersion 可切换的备选，路由动态 import。删了就无法切回 v1 |
| DonationDialog CARD_PURCHASE_URL='' | DonationDialog.vue:52 | 占位常量，填真实地址是产品决策 |
| DonationDialog useToast | DonationDialog.vue | 改 notify 风险大于收益（两套通知并存不影响功能） |
| admin ScrollTestView | admin/views/ScrollTestView.vue | 调试页，可能后续还要用 |
| UserCenter 桌面/移动端双模板 | UserCenter.vue:693-1227（约 530 行） | 抽公共 schema 改动面大，留后续 |
| admin statusTagMap 重复 | code/comment/donation/membership 各自 | 抽通用 StatusTag 组件收益中等，工作量较大，留后续 |

---

## 四、性能相关（本轮未修，记录供后续）

| 项 | 位置 | 问题 | 严重度 |
|---|---|---|---|
| resource findAll N+1 | resource.service.ts:94-116 | Promise.all N 次单查 visibility，应用 getVisibilityBatch | 中 |
| setting batchUpdate 串行 | setting.service.ts:124-160 | N 个 key 各 findOne+save，可批量 upsert | 低 |
| dashboard 20 查询无缓存 | dashboard.service.ts:43-86 | 每次刷新 20 聚合查询，应加 Redis 缓存 | 低 |
| ai-conversation findAll parse | ai-conversation.service.ts:31-57 | 逐条 JSON.parse messages，应用 JSON_LENGTH | 低 |
| CSV export 全量加载 | donation.service.ts:316-348 | 一次 take 10000 拼 CSV，应流式 | 低 |
