<script setup lang="ts">
import { ref, reactive, nextTick, computed, onBeforeUnmount, watch } from 'vue'
import {
  NIcon, NInput, NButton, NSelect, useMessage,
} from 'naive-ui'
import {
  ChatbubbleEllipsesOutline, CloseOutline, RemoveOutline, ExpandOutline,
  PaperPlaneOutline, BulbOutline, ChevronDownOutline,
  SparklesOutline, PersonCircleOutline,
} from '@vicons/ionicons5'
import { streamChat } from '../../api/ai'
import type { AiChatMessage, AiToolCall, AiArticleContext } from '../../api/ai'
import { getConversationByPostId, saveConversation } from '../../api/ai-conversation'
import ToolCallCard from './ToolCallCard.vue'

/** 文章 formValue 的最小契约（避免和 PostEditView 强耦合） */
interface ArticleForm {
  title: string
  subtitle: string
  slug: string
  content: string
  summary: string
}

const props = defineProps<{
  formValue: { value: ArticleForm } | ArticleForm
  /** 当前编辑的文章 ID（新增文章时为 null，不持久化） */
  postId?: number | null
}>()

const message = useMessage()

// === 面板状态 ===
const open = ref(false)
const dragging = ref(false)
// 面板位置（默认右下）
const panelPos = reactive({ left: 0, top: 0 })
const panelSize = reactive({ expanded: false })

// 解包 formValue（可能是 ref 或裸对象）
const form = computed<ArticleForm>(() =>
  props.formValue && 'value' in props.formValue ? props.formValue.value : (props.formValue as ArticleForm),
)

// === 对话状态 ===
const messages = ref<AiChatMessage[]>([])
const inputText = ref('')
const sending = ref(false)
const selectedModel = ref<string | null>(null)

// 模型列表（与后端 .env 对齐，可按需增减）
const modelOptions = [
  { label: 'DeepSeek V4 Flash', value: 'cmc/deepseek/deepseek-v4-flash' },
  { label: 'DeepSeek V4 Pro', value: 'cmc/deepseek/deepseek-v4-pro' },
  { label: 'Qwen 3.6 Plus', value: 'cmc/Qwen/Qwen3.6-Plus' },
  { label: 'GLM-5', value: 'cmc/zai-org/GLM-5' },
  { label: 'Kimi K2.6', value: 'cmc/moonshotai/Kimi-K2.6' },
]

// 渲染用的消息列表（把 tool_call 独立成可渲染项）
interface RenderItem {
  id: string
  kind: 'user' | 'assistant' | 'tool'
  // user/assistant 的文本（原始，可能含 <think> 标签）
  text?: string
  // 拆分后的思考过程（<think> 标签内）
  thinkText?: string
  // 拆分后的正式回复（</think> 之后）
  replyText?: string
  // assistant 正在流式输出（逐字）
  streaming?: boolean
  // tool 相关
  toolCall?: AiToolCall
  toolStatus?: 'pending' | 'running' | 'success' | 'error'
  toolResult?: string
}
const renderItems = ref<RenderItem[]>([])
const scrollBody = ref<HTMLElement | null>(null)
// 展开 think 的 item id 集合（流式时自动展开，结束可手动折叠）
const thinkExpanded = ref<Set<string>>(new Set())

let itemSeq = 0
const nextId = () => `m${++itemSeq}`

// === 工具边界值保护工具 ===
/** 强制转为有限整数，非法值用 fallback */
function toInt(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}
/** clamp 到 [min, max] */
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}
/** 强制字符串 + 截断到 maxLen */
function toStr(v: unknown, maxLen: number): string {
  return (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, maxLen)
}
/** slug 清洗：小写、非法字符替换为连字符、去首尾连字符 */
function sanitizeSlug(v: string): string {
  return toStr(v, 60)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}
/** 错误结果快捷构造 */
const fail = (error: string) => JSON.stringify({ ok: false, error })

// === 工具执行器（前端执行，直接改文章 formValue） ===
function executeTool(call: AiToolCall): string {
  let args: any = {}
  try { args = JSON.parse(call.function.arguments || '{}') } catch {
    return fail(`参数不是合法 JSON: ${call.function.arguments.slice(0, 100)}`)
  }
  const f = form.value

  switch (call.function.name) {
    case 'get_article':
      return JSON.stringify({
        title: f.title, subtitle: f.subtitle, summary: f.summary, slug: f.slug,
        contentLength: f.content.length,
        contentPreview: f.content.slice(0, 2000),
      })

    case 'get_content_section': {
      const lines = f.content.split('\n')
      const total = lines.length
      let start = clamp(toInt(args.startLine, 1), 1, total)
      let end = clamp(toInt(args.endLine, total), 1, total)
      // start > end：反转，避免返回空
      if (start > end) [start, end] = [end, start]
      // 限制单次返回最多 200 行，防止 token 撑爆
      const maxReturn = 200
      if (end - start + 1 > maxReturn) end = start + maxReturn - 1
      return JSON.stringify({
        lines: lines.slice(start - 1, end).join('\n'),
        returnedRange: `${start}-${end}`,
        totalLines: total,
        truncated: total > end,
      })
    }

    case 'update_title': {
      const v = toStr(args.title, 200)
      if (!v.trim()) return fail('title 不能为空')
      f.title = v
      return JSON.stringify({ ok: true, title: f.title })
    }
    case 'update_subtitle':
      f.subtitle = toStr(args.subtitle, 200)
      return JSON.stringify({ ok: true, subtitle: f.subtitle })
    case 'update_summary':
      f.summary = toStr(args.summary, 500)
      return JSON.stringify({ ok: true, summary: f.summary })
    case 'update_slug': {
      const raw = toStr(args.slug, 60)
      if (!raw.trim()) return fail('slug 不能为空')
      const cleaned = sanitizeSlug(raw)
      f.slug = cleaned || `post-${Date.now()}`
      return JSON.stringify({ ok: true, slug: f.slug })
    }

    case 'append_content': {
      const v = toStr(args.text, 100000)
      if (!v) return fail('text 不能为空')
      f.content += v
      return JSON.stringify({ ok: true, appendedLength: v.length })
    }
    case 'replace_content': {
      const v = toStr(args.content, 500000)
      if (!v.trim()) return fail('content 不能为空（拒绝清空正文）')
      f.content = v
      return JSON.stringify({ ok: true, contentLength: f.content.length })
    }
    case 'insert_content_at': {
      const v = toStr(args.text, 100000)
      if (!v) return fail('text 不能为空')
      const lines = f.content.split('\n')
      const total = lines.length
      // afterLine: 0 表示插到最前；负数兜底为 0；超过总行数兜底为末尾
      const after = clamp(toInt(args.afterLine, 0), 0, total)
      lines.splice(after, 0, v)
      f.content = lines.join('\n')
      return JSON.stringify({ ok: true, insertedAfterLine: after, insertedLength: v.length })
    }

    default:
      return fail(`未知工具: ${call.function.name}`)
  }
}

// === 拖拽（全局 document 监听，松开鼠标立刻停止） ===
let dragStart = { x: 0, y: 0, left: 0, top: 0 }

function ensureDefaultPos() {
  if (panelPos.left === 0 && panelPos.top === 0) {
    panelPos.left = window.innerWidth - 400
    panelPos.top = window.innerHeight - 580
  }
}

function onDragMove(e: MouseEvent) {
  panelPos.left = Math.max(0, Math.min(window.innerWidth - 380, dragStart.left + e.clientX - dragStart.x))
  panelPos.top = Math.max(0, Math.min(window.innerHeight - 60, dragStart.top + e.clientY - dragStart.y))
}

function stopDrag() {
  dragging.value = false
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', stopDrag)
}

function startDrag(e: MouseEvent) {
  ensureDefaultPos()
  dragging.value = true
  document.body.style.userSelect = 'none'
  dragStart = { x: e.clientX, y: e.clientY, left: panelPos.left, top: panelPos.top }
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', stopDrag)
  e.preventDefault()
}

function togglePanel() {
  open.value = !open.value
  if (open.value) ensureDefaultPos()
}

// === 上下文快照 ===
function buildContext(): AiArticleContext {
  const f = form.value
  return { title: f.title, subtitle: f.subtitle, summary: f.summary, slug: f.slug, content: f.content }
}

// === 发送 + agent 循环 ===
const MAX_LOOP = 8

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || sending.value) return
  inputText.value = ''
  sending.value = true

  // 1) 用户消息
  messages.value.push({ role: 'user', content: text })
  renderItems.value.push({ id: nextId(), kind: 'user', text })
  await scrollToBottom()

  // 当前正在流式输出的 assistant 项（提到外层，便于 catch 清理）
  let currentAssistantItem: RenderItem | null = null

  try {
    // 2) agent 循环（最多 MAX_LOOP 步）
    for (let step = 0; step < MAX_LOOP; step++) {
      // 准备 assistant 渲染项（流式）
      const assistantItem: RenderItem = { id: nextId(), kind: 'assistant', text: '', streaming: true }
      currentAssistantItem = assistantItem
      renderItems.value.push(assistantItem)
      await scrollToBottom()

      const result = await streamChat(
        messages.value,
        buildContext(),
        // token 回调：正式回复，直接渲染（真实流式）
        (tok) => {
          assistantItem.replyText = (assistantItem.replyText ?? '') + tok
          scrollToBottom()
        },
        // tool_calls 回调：先占位渲染（状态 pending）
        (calls) => {
          for (const c of calls) {
            renderItems.value.push({
              id: nextId(), kind: 'tool', toolCall: c, toolStatus: 'pending',
            })
          }
          scrollToBottom()
        },
        selectedModel.value ?? undefined,
        // thinking 回调：模型的思考过程（reasoning_content），实时渲染
        (think) => {
          assistantItem.thinkText = (assistantItem.thinkText ?? '') + think
          // 思考阶段自动展开，让用户看到思考过程
          thinkExpanded.value.add(assistantItem.id)
          scrollToBottom()
        },
      )

      assistantItem.streaming = false
      currentAssistantItem = null
      // 流式结束：think 默认折叠（用户可点击展开回顾）
      thinkExpanded.value.delete(assistantItem.id)

      // 3) 把 assistant 消息记录到历史（含 tool_calls）
      messages.value.push({
        role: 'assistant',
        content: result.content || '',
        ...(result.toolCalls.length > 0 ? { tool_calls: result.toolCalls } : {}),
      })

      // 4) 若无工具调用 → 本轮对话结束
      if (result.toolCalls.length === 0) {
        break
      }

      // 5) 执行所有工具，更新渲染状态 + 历史回传
      for (const call of result.toolCalls) {
        const item = renderItems.value.find((r) => r.toolCall?.id === call.id)
        if (item) item.toolStatus = 'running'
        await nextTick()
        let output: string
        try {
          output = executeTool(call)
          if (item) { item.toolStatus = 'success'; item.toolResult = output }
          message.success(`已执行：${call.function.name}`)
        } catch (e) {
          output = JSON.stringify({ ok: false, error: e instanceof Error ? e.message : '执行失败' })
          if (item) { item.toolStatus = 'error'; item.toolResult = output }
          message.error(`工具执行失败：${call.function.name}`)
        }
        messages.value.push({ role: 'tool', tool_call_id: call.id, content: output })
      }
      // 继续下一轮，让 AI 看到工具结果后继续
    }
  } catch (e) {
    // 调用失败：停止当前 assistant 的流式闪烁状态
    if (currentAssistantItem) {
      currentAssistantItem.streaming = false
      // 若该 assistant 项还没收到任何 token，移除空气泡，避免残留
      if (!currentAssistantItem.text && !currentAssistantItem.replyText && !currentAssistantItem.thinkText) {
        renderItems.value = renderItems.value.filter((r) => r.id !== currentAssistantItem!.id)
      }
    }
    message.error(e instanceof Error ? e.message : 'AI 对话失败')
  } finally {
    sending.value = false
    await scrollToBottom()
    // 不在此自动保存：对话历史只在文章保存成功时才落库（见 persistConversation）
  }
}

function handleClear() {
  // 只清内存：文章未保存前，对话不落库；保存时以最终内存状态为准
  messages.value = []
  renderItems.value = []
  thinkExpanded.value.clear()
  itemSeq = 0
}

// === 历史对话持久化（按 postId 加载/保存） ===
const historyLoaded = ref(false)

/**
 * 从 DB 加载历史对话（postId 变化或首次打开时触发）。
 * 仅编辑已有文章时加载；新增文章无 postId 不加载。
 */
async function loadHistory() {
  if (!props.postId) {
    messages.value = []
    renderItems.value = []
    thinkExpanded.value.clear()
    historyLoaded.value = true
    return
  }
  try {
    const res = await getConversationByPostId(props.postId)
    const data = res.data
    if (data && Array.isArray(data.messages) && data.messages.length > 0) {
      messages.value = data.messages as AiChatMessage[]
      rebuildRenderFromHistory()
    }
  } catch {
    // 加载失败静默，允许重新对话
  } finally {
    historyLoaded.value = true
  }
}

/** 把 messages 历史重建为渲染项（历史对话不重放工具执行，仅展示文本） */
function rebuildRenderFromHistory() {
  renderItems.value = []
  thinkExpanded.value.clear()
  for (const m of messages.value) {
    if (m.role === 'user') {
      renderItems.value.push({ id: nextId(), kind: 'user', text: m.content })
    } else if (m.role === 'assistant') {
      renderItems.value.push({
        id: nextId(), kind: 'assistant',
        replyText: m.content || '',
        streaming: false,
      })
    }
    // tool 角色消息是工具结果回传，历史展示时跳过（避免噪音）
  }
}

/**
 * 持久化当前对话到 DB（供父组件在文章保存成功后调用）。
 * 设计：对话历史与文章生命周期绑定——只有文章保存了，对话才值得留。
 *   - 有 postId 且有对话内容 → upsert 到 DB
 *   - 新建文章刚保存拿到 id 的情况：父组件传入 newPostId 后再调
 */
async function persistConversation(newPostId?: number): Promise<void> {
  const pid = newPostId ?? props.postId
  if (!pid) return // 仍无 postId（理论上不会，因为文章已保存）
  if (messages.value.length === 0) return // 没用 AI 就不存，避免空记录
  try {
    await saveConversation({
      postId: pid,
      messages: messages.value,
      model: selectedModel.value ?? undefined,
    })
  } catch {
    // 持久化失败不阻断文章保存流程
  }
}

// 暴露给父组件：文章保存成功后持久化对话
defineExpose({ persistConversation })

// postId 变化时重新加载历史
watch(() => props.postId, () => {
  historyLoaded.value = false
  loadHistory()
}, { immediate: true })

onBeforeUnmount(() => {
  // 不再在卸载时保存：用户放弃文章（没点保存）则对话随之丢弃
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', stopDrag)
})

function toggleThink(id: string) {
  if (thinkExpanded.value.has(id)) thinkExpanded.value.delete(id)
  else thinkExpanded.value.add(id)
}

async function scrollToBottom() {
  await nextTick()
  if (scrollBody.value) {
    scrollBody.value.scrollTop = scrollBody.value.scrollHeight
  }
}

function onInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <!-- 悬浮触发器 -->
  <div class="robot-trigger" :class="{ active: open }" @click="togglePanel">
    <n-icon :size="26"><ChatbubbleEllipsesOutline /></n-icon>
    <span v-if="!open" class="robot-pulse" />
  </div>

  <!-- 聊天面板 -->
  <transition name="panel">
    <div
      v-if="open"
      class="agent-panel"
      :class="{ expanded: panelSize.expanded }"
      :style="{ left: panelPos.left + 'px', top: panelPos.top + 'px' }"
    >
      <!-- 头部（可拖拽） -->
      <div class="panel-head" @mousedown="startDrag">
        <div class="head-title">
          <n-icon :size="15" class="head-icon"><ChatbubbleEllipsesOutline /></n-icon>
          <span>AI 写作助手</span>
        </div>
        <div class="head-actions">
          <n-icon :size="16" class="head-btn" @click.stop="panelSize.expanded = !panelSize.expanded">
            <ExpandOutline v-if="!panelSize.expanded" />
            <RemoveOutline v-else />
          </n-icon>
          <n-icon :size="16" class="head-btn" @click.stop="open = false"><CloseOutline /></n-icon>
        </div>
      </div>

      <!-- 工具栏 -->
      <div class="panel-toolbar">
        <n-select
          v-model:value="selectedModel"
          :options="modelOptions"
          size="tiny"
          placeholder="默认模型"
          clearable
          class="model-select"
        />
        <n-button size="tiny" quaternary @click="handleClear" :disabled="sending">清空</n-button>
      </div>

      <!-- 消息流 -->
      <div ref="scrollBody" class="panel-body">
        <div v-if="renderItems.length === 0" class="empty-hint">
          <n-icon :size="32"><ChatbubbleEllipsesOutline /></n-icon>
          <p>和 AI 讨论当前文章</p>
          <p class="hint-sub">它能读取、修改标题/正文/摘要等</p>
        </div>
        <template v-for="item in renderItems" :key="item.id">
          <!-- 用户消息 -->
          <div v-if="item.kind === 'user'" class="msg msg-user">
            <div class="bubble-wrap">
              <div class="bubble bubble-user">{{ item.text }}</div>
              <div class="avatar avatar-user">
                <n-icon :size="14"><PersonCircleOutline /></n-icon>
              </div>
            </div>
          </div>
          <!-- AI 消息 -->
          <div v-else-if="item.kind === 'assistant'" class="msg msg-ai">
            <div class="bubble-wrap">
              <div class="avatar avatar-ai" :class="{ thinking: item.streaming }">
                <n-icon :size="14"><SparklesOutline /></n-icon>
              </div>
              <div class="ai-content">
                <!-- 思考过程（折叠块） -->
                <div
                  v-if="item.thinkText"
                  class="think-block"
                  :class="{ expanded: thinkExpanded.has(item.id) }"
                >
                  <div class="think-head" @click="!item.streaming && toggleThink(item.id)">
                    <n-icon :size="13" class="think-icon"><BulbOutline /></n-icon>
                    <span class="think-label">思考过程</span>
                    <n-icon
                      v-if="!item.streaming"
                      :size="12"
                      class="think-chevron"
                      :class="{ rotated: thinkExpanded.has(item.id) }"
                    ><ChevronDownOutline /></n-icon>
                    <span v-if="item.streaming" class="think-streaming">思考中…</span>
                  </div>
                  <transition name="think">
                    <div v-if="thinkExpanded.has(item.id) || item.streaming" class="think-body">
                      {{ item.thinkText }}
                    </div>
                  </transition>
                </div>
                <!-- 正式回复 -->
                <div v-if="item.replyText" class="bubble bubble-ai">
                  {{ item.replyText }}
                  <span v-if="item.streaming" class="cursor">▋</span>
                </div>
              </div>
            </div>
          </div>
          <!-- 工具调用 -->
          <div v-else class="msg msg-tool">
            <ToolCallCard
              :call="item.toolCall!"
              :status="item.toolStatus || 'pending'"
              :result="item.toolResult"
            />
          </div>
        </template>
      </div>

      <!-- 输入区 -->
      <div class="panel-input">
        <n-input
          v-model:value="inputText"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 4 }"
          placeholder="输入指令，Enter 发送 / Shift+Enter 换行"
          :disabled="sending"
          @keydown="onInputKeydown"
        />
        <n-button
          class="send-btn"
          type="primary"
          circle
          :loading="sending"
          :disabled="!inputText.trim()"
          @click="handleSend"
        >
          <template #icon><n-icon><PaperPlaneOutline /></n-icon></template>
        </n-button>
      </div>
    </div>
  </transition>
</template>

<style scoped>
/* === 悬浮触发器 === */
.robot-trigger {
  position: fixed;
  right: 24px;
  bottom: 24px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #38bdf8);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.4);
  z-index: 9999;
  transition: transform 0.2s, box-shadow 0.2s;
}
.robot-trigger:hover { transform: scale(1.08); box-shadow: 0 8px 28px rgba(99, 102, 241, 0.55); }
.robot-trigger.active { background: linear-gradient(135deg, #475569, #64748b); }

.robot-pulse {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid #6366f1;
  animation: robot-ring 2s ease-out infinite;
}
@keyframes robot-ring {
  0% { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(1.6); opacity: 0; }
}

/* === 面板 === */
.agent-panel {
  position: fixed;
  width: 380px;
  height: 520px;
  z-index: 10001;
  background: #ffffff;
  border-radius: 14px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.15), 0 0 0 1px rgba(99,102,241,0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.agent-panel.expanded { width: 480px; height: 640px; }

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: linear-gradient(135deg, rgba(99,102,241,0.06), rgba(56,189,248,0.04));
  border-bottom: 1px solid rgba(99,102,241,0.12);
  cursor: grab;
  user-select: none;
}
.panel-head:active { cursor: grabbing; }
.head-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}
.head-icon { color: #6366f1; }
.head-actions { display: flex; gap: 4px; }
.head-btn {
  color: #94a3b8;
  cursor: pointer;
  padding: 3px;
  border-radius: 4px;
  transition: color 0.15s, background 0.15s;
}
.head-btn:hover { color: #475569; background: rgba(0,0,0,0.05); }

.panel-toolbar {
  display: flex;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid #f1f5f9;
  align-items: center;
}
.model-select { flex: 1; }

.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.empty-hint {
  margin: auto;
  text-align: center;
  color: #cbd5e1;
}
.empty-hint p { margin: 8px 0 0; font-size: 13px; color: #94a3b8; }
.empty-hint .hint-sub { font-size: 11px; color: #cbd5e1; }

.msg { display: flex; }
.msg-user { justify-content: flex-end; }
.msg-ai { justify-content: flex-start; }
.msg-tool { justify-content: stretch; }

/* 头像 + 气泡 容器 */
.bubble-wrap {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  max-width: 88%;
}
.msg-user .bubble-wrap { flex-direction: row-reverse; }

.avatar {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}
.avatar-ai {
  background: linear-gradient(135deg, #6366f1, #38bdf8);
  box-shadow: 0 2px 6px rgba(99, 102, 241, 0.35);
}
.avatar-ai.thinking {
  animation: avatar-pulse 1.4s ease-in-out infinite;
}
@keyframes avatar-pulse {
  0%, 100% { box-shadow: 0 2px 6px rgba(99, 102, 241, 0.35); }
  50% { box-shadow: 0 2px 14px rgba(99, 102, 241, 0.7); }
}
.avatar-user {
  background: #94a3b8;
}

/* AI 内容容器（含 think + reply），让气泡自适应宽度 */
.msg-ai .ai-content { flex: 1; min-width: 0; }

.bubble {
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.55;
  word-break: break-word;
  white-space: pre-wrap;
}
.bubble-user {
  background: #6366f1;
  color: #fff;
  border-bottom-right-radius: 4px;
}
.bubble-ai {
  background: #f1f5f9;
  color: #334155;
  border-bottom-left-radius: 4px;
  display: inline-block;
}

/* === 思考过程折叠块 === */
.think-block {
  width: 100%;
  border-radius: 8px;
  background: rgba(99, 102, 241, 0.04);
  border: 1px solid rgba(99, 102, 241, 0.12);
  overflow: hidden;
  margin-bottom: 2px;
}
.think-head {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 9px;
  cursor: pointer;
  user-select: none;
  font-size: 11px;
  color: #94a3b8;
}
.think-icon { color: #a78bfa; }
.think-label { font-weight: 500; }
.think-chevron { margin-left: auto; transition: transform 0.25s; color: #cbd5e1; }
.think-chevron.rotated { transform: rotate(180deg); }
.think-streaming {
  margin-left: auto;
  color: #a78bfa;
  font-size: 10px;
}
.think-streaming::after {
  content: '';
  display: inline-block;
  width: 4px; height: 4px;
  margin-left: 3px;
  border-radius: 50%;
  background: #a78bfa;
  animation: think-dot 1s ease-in-out infinite;
}
@keyframes think-dot {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}
.think-body {
  padding: 0 9px 8px;
  font-size: 11.5px;
  line-height: 1.6;
  color: #94a3b8;
  white-space: pre-wrap;
  word-break: break-word;
  font-style: italic;
  border-top: 1px dashed rgba(99, 102, 241, 0.1);
  padding-top: 6px;
}
.think-enter-active, .think-leave-active {
  transition: opacity 0.2s, max-height 0.25s ease;
  max-height: 300px;
  overflow: hidden;
}
.think-enter-from, .think-leave-to {
  opacity: 0;
  max-height: 0;
}
.cursor {
  display: inline-block;
  color: #6366f1;
  animation: blink 0.9s steps(2) infinite;
}
@keyframes blink { 50% { opacity: 0; } }

.panel-input {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid #f1f5f9;
  align-items: flex-end;
}
.send-btn { flex-shrink: 0; }

/* 面板展开/收起过渡 */
.panel-enter-active, .panel-leave-active {
  transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.panel-enter-from, .panel-leave-to {
  opacity: 0;
  transform: translateY(16px) scale(0.94);
}

/* 消息项入场动画 */
.msg {
  animation: msg-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes msg-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
