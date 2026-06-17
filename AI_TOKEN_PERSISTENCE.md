# AI 对话 / Token 持久化修复

修复两个问题：

## 问题 1：token 与对话轮次不持久化 → 上下文溢出风险

**现象**：每次重新打开写作助手，对话轮次和 token 消耗从 0 开始重新计算，
但历史的 `messages` 是原样带上去发给模型网关的。如果之前已累加 199w（模型上限 200w），
这次进入时前端显示 0，无法预警，下一次请求网关直接上下文溢出报错。

**根因**：`ai_conversations` 表只有 `messages` / `model`，没有 token 字段；
`AgentPanel.vue` 的 `tokenStats` 是纯前端内存，`loadHistory` 时 `resetTokenStats()` 清零。

**修复**：
- entity 新增 `prompt_tokens` / `completion_tokens` / `rounds` 三列
- 保存/读取时持久化这些字段
- `AgentPanel.loadHistory` 恢复累计值（不再清零）
- 每轮对话结束、压缩后都自动落库（不只依赖"保存文章"按钮）

## 问题 2：AI 对话历史查看 — 消息数恒为 0，详情显示成单字符 JSON

**现象**：
- 列表"消息数"列永远是 0
- 点"查看"，详情里每条消息显示成 `[`、`"`、`r`、`o`、`l`、`e`…… 单字符

**根因**：entity 的 `messages` 是 `longtext` JSON 字符串。
- 列表接口 `findAll` 直接返回原始字符串，前端 `Array.isArray()` 判断为 false → 消息数 0
- 详情抽屉对**字符串**做 `v-for`，Vue 按字符迭代 → 每个字符当一条消息

**修复**：
- 列表接口不再返回整串 `messages`，改为返回解析后的 `messageCount`（轻量 + 不再 0）
- 新增 `GET /ai-conversations/:id` 单条接口，返回已 parse 的 `messages`
- 前端详情"查看"改走单条接口，杜绝对字符串 v-for

---

## 改动文件清单

后端（Nest）：
- `src/modules/ai-conversation/ai-conversation.entity.ts` — 新增 3 列
- `src/modules/ai-conversation/ai-conversation.dto.ts` — DTO 加可选 token 字段
- `src/modules/ai-conversation/ai-conversation.service.ts` — findAll 折叠 messageCount；save 持久化 token
- `src/modules/ai-conversation/ai-conversation.controller.ts` — 新增 findOne；findByPostId 返回 token

前端（admin）：
- `src/api/ai-conversation.ts` — 类型对齐；新增 getAiConversationById
- `src/views/ai-conversation/IndexView.vue` — 消息数用 messageCount；详情走单条接口；加 token/轮次列
- `src/components/ai/AgentPanel.vue` — loadHistory 恢复 token；每轮/压缩后自动落库

---

## 生产环境数据库迁移

> 开发环境 `DB_SYNCHRONIZE=true && NODE_ENV!=production` 时 TypeORM 会自动建列。
> **生产环境 `synchronize` 被禁用**，需手动执行以下 DDL：

```sql
ALTER TABLE ai_conversations
  ADD COLUMN prompt_tokens INT NOT NULL DEFAULT 0 COMMENT '累计输入 token',
  ADD COLUMN completion_tokens INT NOT NULL DEFAULT 0 COMMENT '累计输出 token',
  ADD COLUMN rounds INT NOT NULL DEFAULT 0 COMMENT '对话轮次',
  ADD COLUMN compaction_summary LONGTEXT NULL COMMENT '最新历史压缩摘要(覆盖式)',
  ADD COLUMN compaction_messages LONGTEXT NULL COMMENT '压缩点之后的新对话JSON',
  ADD COLUMN compaction_tokens INT NOT NULL DEFAULT 0 COMMENT '最近一次压缩释放的token',
  ADD COLUMN compacted_at DATETIME NULL COMMENT '最近一次压缩时间';
```

历史数据默认 0，下次该文章再对话时会被前端的全量累计值覆盖写回，无需回填。

---

## 问题 3：上下文压缩机制（业界标准实现）

**现象**：长对话累积导致上下文逼近模型上限，无预警、无释放手段。

**业界标准做法**（LangChain / Claude memory / LangGraph checkpoint 同款思路）：
- **完整原始对话永久保留**（`messages` 列），供用户回看历史，永不删除
- **压缩只生成"摘要视图"给模型用**：压缩时把已有对话总结成一段摘要存 `compaction_summary`，
  此后发给模型网关的上下文 = `[system:摘要] + 压缩点之后的新对话`（`compaction_messages`），
  不再把历史全文发出去 → 释放 token
- **多轮压缩**：再次压缩时，把 `旧摘要 + 压缩点后新对话` 一起总结，覆盖 `compaction_summary`，
  `compaction_messages` 清空重新累积。摘要永远只有最新一条。

**进度条**：AgentPanel 底部显示 `当前累计 token / 模型 maxContextTokens`，
达 80% 变红提示 `/compact`。token 用网关返回的真实值（已持久化），非估算。

**关键**：去看 AI 对话历史管理页，看到的永远是完整 user/assistant 往返，
摘要只是后台省 token 的手段，不破坏历史可见性。

