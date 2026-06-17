# AI 上下文（Context）长度计算说明

> 本文档说明 AI 写作助手中「上下文占用」与「累计消耗」的计算口径。
> 当出现"进度条数字不对""压缩没生效""上下文丢失"等问题时，先按本文档定位是哪套口径、哪个环节。

---

## 一、核心概念：两套口径（务必区分）

代码里维护两套 token 统计，**来源都是网关返回的真实 `usage`，不是估算**：

| 口径 | 字段 | 含义 | 用途 | 示例 |
|------|------|------|------|------|
| **最近一轮占用** | `lastPrompt` / `lastCompletion` | 最近一次 API 请求的真实 token | **进度条 / 防溢出预警** | 第5轮单次占用 = 6042 |
| **累计消耗** | `totalPrompt` / `totalCompletion` | 历次请求 token 累加 | **算钱 / 审计** | 5轮累计 = 17883 |

**这两个值不一样是正常的**，因为它们是不同的概念，不是 bug。

---

## 二、为什么会有两套口径？（LLM 无状态的本质）

Transformer 模型**没有长期记忆**。每次 API 请求，模型收到的是：

```
[系统提示 system prompt]
[全部历史对话 messages]      ← 每轮都重发！
[当前用户输入]
```

网关把这些**全部重新分词计费**，返回 `usage`：

```
usage = {
  prompt_tokens:      // 这次喂进去的全部内容（system + 全历史 + 当前输入）
  completion_tokens:  // 模型这次生成的回复
  total_tokens:       // = prompt_tokens + completion_tokens
}
```

### 多轮的 token 累积过程（关键！）

```
第1轮请求喂进去: [system + 文章 + 第1问]                    → prompt_tokens ≈ 3000
第2轮请求喂进去: [system + 文章 + 第1问 + AI答1 + 第2问]    → prompt_tokens ≈ 5000
第3轮请求喂进去: [system + 文章 + 全部2轮历史 + 第3问]      → prompt_tokens ≈ 7000
第4轮请求喂进去: [system + 文章 + 全部3轮历史 + 第4问]      → prompt_tokens ≈ 9000
```

可以看到：
- **每轮的 `prompt_tokens` 已经包含了前面所有历史**（因为每轮都重发历史）
- 所以 `prompt_tokens` 是**单调递增**的，不会减少（除非压缩）

### 由此推出两套口径的正确性

**进度条（最近一轮占用）= 最近一轮的 `prompt_tokens + completion_tokens`**
- 这就是"当前上下文占了模型窗口多少"，对齐模型 maxContextTokens（如 DeepSeek 200K）
- 拿第4轮的 9000，不是 3000+5000+7000+9000=24000（那样重复算了历史）

**累计消耗 = 每轮的代表值累加**
- 这是"总共烧了多少 token"（算钱）
- 3000+5000+7000+9000=24000

> 注意：累计消耗里历史被重复计算是**必然的**，因为每轮网关都重新计费了全历史。这不是统计错误，是真实的计费方式。

---

## 三、Agent 多步的特殊处理（commitRoundUsage）

一次用户输入（handleSend）里，agent 可能走多步（调工具→再生成）：

```
用户："润色文章"
  步骤1: AI 调 get_article → usage1.prompt=4000
  步骤2: AI 调 replace_content → usage2.prompt=5500
  步骤3: AI 总结回复 → usage3.prompt=6042
```

这 3 步的 prompt **高度重复**（都是同样的历史+工具结果），直接累加会把重复历史算多遍。

### commitRoundUsage 的处理

- **prompt 取最大步**：`roundMaxPrompt = max(4000, 5500, 6042) = 6042`
  - 因为最大那步包含了最全的历史，就是当前真实占用
- **completion 累加所有步**：`roundSumCompletion = sum(各步 completion)`
  - 因为每步生成的内容是独立的真实消耗
- **rounds 只 +1**：一轮多步算 1 轮（用户视角的"一轮"）

相关代码：`AgentPanel.vue` 的 `recordStepUsage()` + `commitRoundUsage()`。

---

## 四、压缩（Compaction）如何改变 token

业界标准做法（参考 Vercel AI SDK v5 / Microsoft Agent Framework / Zed `/compact`）：

### 压缩做了什么

把"压缩点之前的全部历史"交给 AI 总结成一段摘要，之后**发给网关的上下文变成**：

```
[system: POST_AGENT_SYSTEM_PROMPT + 文章context]   ← 后端注入
[system: 历史对话摘要]                              ← 压缩产生（前端注入）
[...压缩点之后的新对话]                            ← compactionMessages
```

完整原始对话（`messages`）**永不删除**，只是不再整段发给模型。用户看历史始终是完整的。

### 压缩后 token 如何变化

```
压缩前最近一轮占用 = 6042（含全部历史）
压缩后下一轮请求喂进去 = [system + 摘要 + 新对话] ≈ 1500
→ 网关返回 prompt_tokens ≈ 1500
→ 进度条从 6042 降到 1500 ✅ 自动反映释放效果
```

**不需要手动减**——下一轮真实请求的 usage 自然变小。

### 关键修复记录（2026-06）

**🔴 曾有的严重 bug**：后端 `buildAgentMessages` 用 `history.filter(m => m.role !== 'system')` 把压缩摘要（前端用 system 角色注入的）整个过滤掉了！导致压缩后 AI 完全不知道之前聊过什么。

**修复**：后端不再过滤 history 里的 system，保留原样（OpenAI 兼容协议允许多个 system 消息按顺序生效）。见 `ai.service.ts` 的 `buildAgentMessages()`。

---

## 五、字段持久化（数据库 ai_conversations 表）

| 列名 | 口径 | 说明 |
|------|------|------|
| `prompt_tokens` | total | 累计输入 token（审计） |
| `completion_tokens` | total | 累计输出 token（审计） |
| `last_prompt_tokens` | last | 最近一轮输入 token（进度条） |
| `last_completion_tokens` | last | 最近一轮输出 token（进度条） |
| `rounds` | - | 对话轮次（一轮多步算1轮） |
| `compaction_summary` | - | 最新压缩摘要（覆盖式，null=未压缩） |
| `compaction_messages` | - | 压缩点之后的新对话 JSON（发给模型用） |
| `compaction_tokens` | - | 最近一次压缩释放的 token |
| `compacted_at` | - | 最近一次压缩时间 |

前端通过 `loadHistory()` 恢复全部状态，`persistConversation()` 写回。两套口径都持久化，刷新不丢。

---

## 六、出问题怎么定位

### 症状：进度条数字虚高（比如显示几万）
- 检查：进度条是否误用了 `total`（累计）而非 `last`（最近一轮）
- 正确：`contextUsed = lastPrompt + lastCompletion`（见 `AgentPanel.vue` 的 `contextUsed` computed）

### 症状：进度条一直是 0
- 检查：网关是否真的返回了 usage 帧（流末尾）
- 流式模式下 usage 在 `stream_options.include_usage=true` 时返回，格式 `{usage:{prompt_tokens, completion_tokens, total_tokens}}`
- 有些 OpenAI 兼容网关的 usage 帧格式不标准，可能不带 `total_tokens`（代码有 `?? 0` 兜底，不会崩但会显示 0）
- 后端 `ai.controller.ts` 的 chat/compact 都转发 usage 事件，前端 `ai.ts` 的 streamChat/streamCompact 都捕获

### 症状：压缩后 AI 忘了之前内容
- 检查：后端 `buildAgentMessages` 是否又加了 `history.filter(system)` 过滤（曾有的 bug）
- 检查：前端 `buildGatewayMessages` 压缩后是否正确返回 `[system:摘要, ...compactionMessages]`

### 症状：刷新后 token 统计归零
- 检查：`loadHistory` 是否恢复了 `lastPromptTokens/lastCompletionTokens`（不只是 total）
- 检查：数据库列是否存在（生产环境需手动跑 ALTER TABLE，见 `AI_TOKEN_PERSISTENCE.md`）

### 症状：累计轮数虚高
- 检查：是否把 agent 内部多步当多轮计（应走 `commitRoundUsage`，一轮多步只 +1）

### 症状：斜杠命令菜单不弹出
- 检查：输入框值是否以 `/` 开头（`slashMatches` computed 只匹配 `/` 前缀）
- 检查：`slashCommands` 数组里是否有对应命令
- 检查：`onSlashMenuKeydown` 是否在 `onInputKeydown` 最前面调用（否则 Enter 会走发送而非选中）

### 症状：/model 弹窗跑到整页中心而非面板内
- 检查：弹窗 DOM 是否在 `.agent-panel` div 内部（不能在 `</transition>` 外，否则 absolute 定位失效变 fixed 效果）
- 检查：`.picker-mask` 是否 `position: absolute`（不是 fixed）+ `inset: 0` + `border-radius: 12px` 对齐面板圆角

### 症状：进度条数字与"累计"行一样（防溢出失效）
- 检查：`contextUsed` computed 是否误用 `totalPrompt + totalCompletion`（累计口径）
- 正确：`contextUsed = lastPrompt + lastCompletion`（最近一轮占用，对齐模型窗口）
- 见 `AgentPanel.vue` 的 `contextUsed` / `contextLimit` / `contextPercent` computed

---

## 七、关键代码位置索引

| 功能 | 文件 | 位置 |
|------|------|------|
| token 两套口径定义 | `AgentPanel.vue` | `tokenStats` reactive 对象 |
| 单步 usage 暂存 | `AgentPanel.vue` | `recordStepUsage()` |
| 一轮提交（防虚高） | `AgentPanel.vue` | `commitRoundUsage()` |
| 进度条占用计算 | `AgentPanel.vue` | `contextUsed` computed |
| 进度条上限 | `AgentPanel.vue` | `contextLimit` computed（取模型 maxContextTokens） |
| 进度条百分比/预警 | `AgentPanel.vue` | `contextPercent` / `contextWarn`（80% 变红） |
| 发网关的上下文 | `AgentPanel.vue` | `buildGatewayMessages()` |
| 压缩触发 | `AgentPanel.vue` | `handleCompact()`（流式，边压缩边显示） |
| 斜杠命令菜单 | `AgentPanel.vue` | `slashCommands` / `slashMatches` / `onSlashMenuKeydown` |
| 持久化/恢复 | `AgentPanel.vue` | `persistConversation()` / `loadHistory()` |
| 卸载前保存 | `AgentPanel.vue` | `onBeforeUnmount` 调 `persistConversation()` |
| get_article 工具 | `AgentPanel.vue` | `executeTool()` 的 get_article 分支（只返元数据，正文按需分段读） |
| 后端发网关 | `ai.service.ts` | `openStream()` / `buildAgentMessages()` |
| 后端 SSE 转发 | `ai.controller.ts` | `chat()` / `compact()`（都带 usage 帧） |
| 后端压缩 prompt | `ai.prompts.ts` | `CONVERSATION_COMPACT_SYSTEM_PROMPT`（结构化摘要） |
| 数据库实体 | `ai-conversation.entity.ts` | AiConversationEntity |

---

## 八、UI 显示口径速查（底部统计区）

AgentPanel 底部显示两块，**口径不同，别搞混**：

```
13轮 · 累计 ↑87085 ↓8003 = 95088          ← 累计消耗（算钱，跨轮累加）
上下文 ████░░░░ 1500 / 200000 (1%)         ← 当前占用（防溢出，最近一轮单次值）
```

| 显示项 | 数据来源 | 含义 | 满了怎样 |
|--------|----------|------|----------|
| 累计 ↑↓= | `totalPrompt` / `totalCompletion` | 历次请求烧的总量 | 不触发任何动作（纯审计） |
| 上下文 X / Y (Z%) | `lastPrompt+lastCompletion` / `contextLimit` | 当前请求占模型窗口多少 | 80% 变红，提示 `/compact` |

**进度条满了（接近 100%）的后果**：下一次请求喂进去的 `prompt_tokens + completion_tokens` 超过模型 `maxContextTokens`，网关报错（context length exceeded）。所以进度条到 80% 就该压缩。

---

## 九、压缩（Compaction）流程详解

### 何时触发
- **手动**：输入框打 `/` 选 `/compact`，或直接输 `/compact` 回车，或点"压缩"快捷按钮
- **预警**：进度条到 80% 变红，提示用户压缩（不自动执行，避免打断）

### 压缩做了什么（流式可见）
1. 收集待压缩内容 = 压缩点之后的所有对话（首次压缩就是全量 messages）
2. 调 `POST /ai/compact`（SSE 流式），后端用 `CONVERSATION_COMPACT_SYSTEM_PROMPT` 让 AI 总结成结构化摘要（目标/已完成/进行中/受阻/关键决策/下一步/关键上下文）
3. 前端边收 token 边实时显示压缩生成过程（不再是黑盒等待）
4. 完成后：`compactionSummary` = 新摘要，`compactionMessages` 清空重新累积
5. **完整原始对话（messages）永不删除**，只是不再整段发给模型

### 压缩后发网关的上下文变化
```
压缩前：[system:提示+文章] + [全部 N 轮历史]           → 占用大
压缩后：[system:提示+文章] + [system:摘要] + [新对话]   → 占用小
```
下一轮真实请求的 `usage.prompt_tokens` 自动变小 → 进度条下降。**无需手动减**。

### 多次压缩
第二次压缩时，输入 = `[旧摘要 + 压缩点后新对话]`，AI 重新总结覆盖 `compactionSummary`。摘要永远只有最新一条。

### 关键修复记录
- **🔴 system 过滤 bug**：后端曾用 `history.filter(m => m.role !== 'system')` 把压缩摘要删了，导致压缩后 AI 失忆。已修：保留 history 原样（OpenAI 兼容允许多 system）。
- **🔴 循环引用 bug**：catch 块曾 `JSON.stringify(stream response)` 导致 "Converting circular structure to JSON"。已修：`describeErrBody()` 安全描述。
| 数据库实体 | `ai-conversation.entity.ts` | AiConversationEntity |
