# 第八轮代码审计与优化（R8）

> 日期：2026-06-25
> 范围：前端逻辑 bug 深度扫描（v2 + admin，纯 script 逻辑，不动 UI）
> 重点：内存泄漏、未处理 Promise、引用污染、假成功、null 防御

---

## 文档结构

| 文件 | 内容 |
|------|------|
| `00-README.md` | 本文件，总览 |
| `01-frontend-logic.md` | 前端逻辑修复详情 |

## 扫描方法

双 agent 并行：
- Agent 1：v2 前端逻辑 bug（竞态/内存泄漏/状态管理/错误处理）
- Agent 2：admin 前端逻辑 bug（表单/分页/composable/错误处理）

## 本轮修复汇总（纯逻辑，0 UI 改动）

| # | 端 | 问题 | 严重度 |
|---|----|------|--------|
| 1 | v2 | fetchAds 未 catch（3处 Unhandled rejection） | 🟡中 |
| 2 | v2 | ArticleToc observer 50ms 窗口内卸载泄漏 | 🟡中 |
| 3 | v2 | Home 缓存写入用了过期 total（首次是0） | 🟡中 |
| 4 | v2 | null 防御不一致（UserCenter/Shop/Donation） | 🟢低 |
| 5 | admin | resource 编辑表单引用污染（取消编辑脏列表） | 🔴高 |
| 6 | admin | resource 可见性失败仍保存主体（半成功） | 🔴高 |
| 7 | admin | user 封禁失败仍关弹窗（假成功） | 🔴高 |
| 8 | admin | user 封禁按钮 loading 永不触发 | 🟡中 |

## 扫描确认无问题（不需改）

- 竞态守卫：Home/ArticleDetail/ResourceDetail 都有 loadVersion 版本号守卫
- 路由参数变化重载：ArticleDetail/ResourceDetail 都有 watch route + onMounted 初始加载
- ArticleComments 切文章：靠 :key 强制重建，无残留
- useCodeCooldown：onBeforeUnmount 自清定时器
- store reset：清掉所有 data + fetchedAt
- useCrudList openCreate：每次重置 editingId + formValue（编辑残留被兜住）
- useCrudList handleSave/handleDelete 失败：停留在编辑态让用户重试
- request.ts 401 刷新逻辑：rejectQueued/SessionExpiredError 都有 reject，isRefreshing catch 后复位

## 未修（评估后保留）

| 项 | 原因 |
|----|------|
| useCrudList page 越界不回退（通病） | 分页 ref 在各页面维护，改动面大；backup/audit-log 已单独修过。单独排期统一处理 |
| donation status 数字/字符串类型不一致 | 已知技术债，注释自承认，改动需前后端协同，单独排期 |
| code 页绕过 _handleSave | openCreate 兜底了 editingId 重置，非确认 bug |
