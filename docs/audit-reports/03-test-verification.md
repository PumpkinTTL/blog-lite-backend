# 多模块测试验证报告

> 日期：2026-06-19
> 范围：本次优化的所有改动（AI 面板 + backend api 5 个修复）
> 方法：编译验证 + 逻辑路径分析（项目无既有测试基础设施，未新增 e2e）

## 编译验证

| 项目 | 命令 | 结果 |
|------|------|------|
| admin 前端 | `vue-tsc --noEmit` | ✓ 通过（仅历史 TS6133 警告） |
| admin 前端 | `vite build` | ✓ 1.46s |
| api 后端 | `tsc --noEmit -p tsconfig.json` | ✓ 通过 |
| api 后端 | `nest build` | ✓ exit 0 |

## 测试基础设施现状

项目配置了 Jest（`package.json` 有 test 脚本），但 **src 下无任何 .spec.ts/.test.ts 文件**。
本次未新增测试文件（避免从零搭建测试框架超出任务范围）。
验证以逻辑路径分析 + 编译保证为主。

---

## 逻辑路径验证

### 1. AI 面板 shallowReactive（阶段1）

| 场景 | 预期 | 验证 |
|------|------|------|
| 流式输出时 item.replyText 赋值 | 顶层属性变化触发重渲染 | shallowReactive 顶层响应式，赋值触发 ✓ |
| 历史消息加载（rebuildRenderFromHistory） | 新 item 浅代理，渲染正常 | shallowReactive 对象可正常被模板读取 ✓ |
| toolCall 深层对象访问 | 不触发不必要的深层代理 | shallowReactive 不代理深层 ✓ |

### 2. AI 面板 v-memo（阶段1）

| 场景 | 预期 | 验证 |
|------|------|------|
| 滚动时按钮状态变化 | 历史消息项不重渲染（memo 命中） | memo 依赖数组值不变 → 跳过 patch ✓ |
| 流式消息 replyText 变化 | 该项重渲染 | replyText 在 memo 数组中 → 变化时重渲染 ✓ |
| 点击折叠 think-block | 对应项重渲染 | thinkExpanded.has(id) 在 memo 数组中 ✓ |
| 主题切换 isDark | 所有 AI 消息项重渲染 | isDark 在 memo 数组中 ✓ |
| display:contents 布局 | .msg 仍是 panel-body 直接 flex 子项 | contents 不产生盒模型 ✓ |

### 3. P1-1 getVisibilityMap 真批量（post）

| 场景 | 预期 | 验证 |
|------|------|------|
| 50 篇文章列表 + withVisibility | 1 次 DB 查询（原 50 次） | getVisibilityBatch 用 WHERE IN ✓ |
| 无 private 文章 | privateIds 为空，不查询 | `if (privateIds.length)` 守卫 ✓ |
| 文章无可见性配置 | 不在 Map 中，不注入 allowedUserIds | `visMap.has(p.id)` 判断 ✓ |

### 4. P1-2/3 register 重构（user）

| 场景 | 预期 | 验证 |
|------|------|------|
| 正常注册 | 用户创建 + 邀请码消费 + token 签发 | 事务内 DB 操作，事务外 issueToken ✓ |
| 邀请码并发（最后名额） | 只有一个成功，其他抛异常 | WHERE usedCount < maxUses 条件更新 ✓ |
| 邀请码用完 | 抛「已被使用完毕」 | affected===0 检查 ✓ |
| issueToken 失败 | 用户已创建，提示重新登录 | try-catch 返回明确错误 ✓ |
| maxUses=0（不限次） | 总是可消费 | WHERE 1=1 分支 ✓ |

### 5. P1-5 batchRemove 并行（media）

| 场景 | 预期 | 验证 |
|------|------|------|
| 批量删除 10 个文件 | 并行删除（原串行 10 次往返） | Promise.all ✓ |
| 某个文件删除失败 | 不影响其他文件，记录警告 | .catch 记录 warn ✓ |
| DB 记录删除 | 全部删除（不受存储删除失败影响） | delete(ids) 在 Promise.all 后 ✓ |

### 6. P1-6 batchUpdateStatus 批量（post）

| 场景 | 预期 | 验证 |
|------|------|------|
| 批量发布 10 篇 | status 批量更新 + 无 publishedAt 的补上 | 2 次 SQL（原 10 次）✓ |
| 批量转草稿 | status + publishedAt=null 批量 | 1 次 SQL ✓ |
| ids 为空 | 直接返回 | `if (ids.length === 0) return` ✓ |

---

## 回归风险评估

| 改动 | 回归风险 | 缓解 |
|------|----------|------|
| shallowReactive | 流式更新不触发？ | 顶层赋值兼容，已验证 |
| v-memo + display:contents | 布局变化？ | contents 不影响 flex 子项，diff 验证无样式改动 |
| register 重构 | 注册流程异常？ | 事务保证 DB 一致性，issueToken 失败有兜底 |
| getVisibilityMap | 返回结构变化？ | Map 结构不变，只是查询方式变 |
| batchRemove 并行 | 删除顺序变化？ | 存储删除无序依赖 |

## 待运行时验证（需用户测试）

以下场景需实际运行确认（热重载后用户测试）：
1. AI 面板：加载多个对话记录后滚动是否流畅
2. AI 面板：消息显示/折叠/流式输出是否正常
3. 注册流程：邀请码注册是否正常
4. 文章列表：可见性配置是否正确显示
5. 媒体批量删除：是否正常
