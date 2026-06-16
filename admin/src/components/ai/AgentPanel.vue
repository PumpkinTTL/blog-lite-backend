<script setup lang="ts">
import { ref, reactive, nextTick, computed, onBeforeUnmount, watch } from 'vue'
import {
  NIcon, NInput, NSelect, useMessage,
} from 'naive-ui'
import {
  ChatbubbleEllipsesOutline, CloseOutline, RemoveOutline, ExpandOutline,
  PaperPlaneOutline, BulbOutline, ChevronDownOutline,
  SparklesOutline, PersonCircleOutline, TrashOutline,
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
const panelPos = reactive({ left: 0, top: 0 })
const panelSize = reactive({ expanded: false })

const form = computed<ArticleForm>(() =>
  props.formValue && 'value' in props.formValue ? props.formValue.value : (props.formValue as ArticleForm),
)

// === 对话状态 ===
const messages = ref<AiChatMessage[]>([])
const inputText = ref('')
const sending = ref(false)
const selectedModel = ref<string | null>(null)

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
  text?: string
  thinkText?: string
  replyText?: string
  streaming?: boolean
  toolCall?: AiToolCall
  toolStatus?: 'pending' | 'running' | 'success' | 'error'
  toolResult?: string
}
const renderItems = ref<RenderItem[]>([])
const scrollBody = ref<HTMLElement | null>(null)
const thinkExpanded = ref<Set<string>>(new Set())

let itemSeq = 0
const nextId = () => `m${++itemSeq}`

// === 工具边界值保护 ===
function toInt(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}
function toStr(v: unknown, maxLen: number): string {
  return (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, maxLen)
}
function sanitizeSlug(v: string): string {
  return toStr(v, 60)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}
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
      if (start > end) [start, end] = [end, start]
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

/**
 * 创建一个响应式渲染项并加入列表，返回其代理引用。
 *
 * ⚠️ 关键：必须用 reactive() 创建 item，使其本身就是代理对象。
 * 否则 push 到 ref 数组后，数组内部会代理化该元素，但我们持有的仍是原始引用，
 * 回调里改 assistantItem.replyText 不会触发响应式更新 —— 这正是
 * 「思考能渲染、正文不流式」的根因（思考靠 thinkExpanded.add 副作用顺带刷新）。
 */
function addRenderItem(item: RenderItem): RenderItem {
  const reactiveItem = reactive(item)
  renderItems.value.push(reactiveItem)
  return reactiveItem
}

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || sending.value) return
  inputText.value = ''
  sending.value = true

  // 1) 用户消息
  messages.value.push({ role: 'user', content: text })
  addRenderItem({ id: nextId(), kind: 'user', text })
  await scrollToBottom()

  let currentAssistantItem: RenderItem | null = null

  try {
    // 2) agent 循环（最多 MAX_LOOP 步）
    for (let step = 0; step < MAX_LOOP; step++) {
      // 准备 assistant 渲染项（流式）—— reactive 确保回调里的属性变更触发视图更新
      const assistantItem = addRenderItem({ id: nextId(), kind: 'assistant', text: '', streaming: true })
      currentAssistantItem = assistantItem
      await scrollToBottom()

      const result = await streamChat(
        messages.value,
        buildContext(),
        // token 回调：正式回复，直接渲染（真实流式）
        // 现在 assistantItem 是代理对象，赋值会触发响应式更新
        (tok) => {
          assistantItem.replyText = (assistantItem.replyText ?? '') + tok
          scrollToBottom()
        },
        // tool_calls 回调：先占位渲染（状态 pending）
        (calls) => {
          for (const c of calls) {
            addRenderItem({
              id: nextId(), kind: 'tool', toolCall: c, toolStatus: 'pending',
            })
          }
          scrollToBottom()
        },
        selectedModel.value ?? undefined,
        // thinking 回调：模型的思考过程（reasoning_content），实时渲染
        (think) => {
          assistantItem.thinkText = (assistantItem.thinkText ?? '') + think
          thinkExpanded.value.add(assistantItem.id)
          scrollToBottom()
        },
      )

      assistantItem.streaming = false
      currentAssistantItem = null
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
    if (currentAssistantItem) {
      currentAssistantItem.streaming = false
      if (!currentAssistantItem.text && !currentAssistantItem.replyText && !currentAssistantItem.thinkText) {
        renderItems.value = renderItems.value.filter((r) => r.id !== currentAssistantItem!.id)
      }
    }
    message.error(e instanceof Error ? e.message : 'AI 对话失败')
  } finally {
    sending.value = false
    await scrollToBottom()
  }
}

function handleClear() {
  messages.value = []
  renderItems.value = []
  thinkExpanded.value.clear()
  itemSeq = 0
}

// === 历史对话持久化（按 postId 加载/保存） ===
const historyLoaded = ref(false)

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

function rebuildRenderFromHistory() {
  renderItems.value = []
  thinkExpanded.value.clear()
  for (const m of messages.value) {
    if (m.role === 'user') {
      addRenderItem({ id: nextId(), kind: 'user', text: m.content })
    } else if (m.role === 'assistant') {
      addRenderItem({
        id: nextId(), kind: 'assistant',
        replyText: m.content || '',
        streaming: false,
      })
    }
  }
}

async function persistConversation(newPostId?: number): Promise<void> {
  const pid = newPostId ?? props.postId
  if (!pid) return
  if (messages.value.length === 0) return
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

defineExpose({ persistConversation })

watch(() => props.postId, () => {
  historyLoaded.value = false
  loadHistory()
}, { immediate: true })

onBeforeUnmount(() => {
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
    <n-icon :size="24"><ChatbubbleEllipsesOutline /></n-icon>
    <span v-if="!open && !sending" class="robot-pulse" />
    <span v-if="sending" class="robot-badge" />
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
          <div class="head-logo">
            <n-icon :size="15"><SparklesOutline /></n-icon>
          </div>
          <div class="head-text">
            <span class="head-name">写作助手</span>
            <span class="head-sub">AI Agent</span>
          </div>
        </div>
        <div class="head-actions">
          <button class="head-btn" @click.stop="panelSize.expanded = !panelSize.expanded" :title="panelSize.expanded ? '收起' : '展开'">
            <n-icon :size="15"><ExpandOutline v-if="!panelSize.expanded" /><RemoveOutline v-else /></n-icon>
          </button>
          <button class="head-btn" @click.stop="handleClear" :disabled="sending" title="清空对话">
            <n-icon :size="15"><TrashOutline /></n-icon>
          </button>
          <button class="head-btn" @click.stop="open = false" title="关闭">
            <n-icon :size="15"><CloseOutline /></n-icon>
          </button>
        </div>
      </div>

      <!-- 工具栏 -->
      <div class="panel-toolbar">
        <n-select
          v-model:value="selectedModel"
          :options="modelOptions"
          size="small"
          placeholder="默认模型"
          clearable
          class="model-select"
        />
      </div>

      <!-- 消息流 -->
      <div ref="scrollBody" class="panel-body">
        <div v-if="renderItems.length === 0" class="empty-hint">
          <div class="empty-icon">
            <n-icon :size="36"><SparklesOutline /></n-icon>
          </div>
          <p class="empty-title">AI 写作助手</p>
          <p class="empty-desc">它能读取、修改你的文章</p>
          <div class="empty-tips">
            <span class="tip-chip">✦ 改标题</span>
            <span class="tip-chip">✦ 写摘要</span>
            <span class="tip-chip">✦ 润色正文</span>
          </div>
        </div>
        <template v-for="item in renderItems" :key="item.id">
          <!-- 用户消息 -->
          <div v-if="item.kind === 'user'" class="msg msg-user">
            <div class="bubble-wrap">
              <div class="bubble bubble-user">{{ item.text }}</div>
              <div class="avatar avatar-user">
                <n-icon :size="13"><PersonCircleOutline /></n-icon>
              </div>
            </div>
          </div>
          <!-- AI 消息 -->
          <div v-else-if="item.kind === 'assistant'" class="msg msg-ai">
            <div class="bubble-wrap">
              <div class="avatar avatar-ai" :class="{ thinking: item.streaming }">
                <n-icon :size="13"><SparklesOutline /></n-icon>
              </div>
              <div class="ai-content">
                <!-- 思考过程（折叠块） -->
                <div
                  v-if="item.thinkText"
                  class="think-block"
                  :class="{ expanded: thinkExpanded.has(item.id) }"
                >
                  <div class="think-head" @click="!item.streaming && toggleThink(item.id)">
                    <n-icon :size="12" class="think-icon"><BulbOutline /></n-icon>
                    <span class="think-label">思考过程</span>
                    <n-icon
                      v-if="!item.streaming"
                      :size="11"
                      class="think-chevron"
                      :class="{ rotated: thinkExpanded.has(item.id) }"
                    ><ChevronDownOutline /></n-icon>
                    <span v-if="item.streaming" class="think-streaming">思考中</span>
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
                <!-- 占位加载点（既无 think 也无 reply 且正在流式） -->
                <div v-else-if="item.streaming && !item.thinkText" class="typing-dots">
                  <span></span><span></span><span></span>
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
          placeholder="输入指令，Enter 发送"
          :disabled="sending"
          @keydown="onInputKeydown"
        />
        <button
          class="send-btn"
          :class="{ disabled: !inputText.trim() || sending }"
          :disabled="!inputText.trim() || sending"
          @click="handleSend"
        >
          <n-icon :size="16"><PaperPlaneOutline /></n-icon>
        </button>
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
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.45), 0 0 0 0 rgba(99, 102, 241, 0.4);
  z-index: 9999;
  transition: transform 0.2s, box-shadow 0.2s;
}
.robot-trigger:hover {
  transform: scale(1.08);
  box-shadow: 0 8px 28px rgba(99, 102, 241, 0.6), 0 0 0 0 rgba(99, 102, 241, 0.4);
}
.robot-trigger.active { background: linear-gradient(135deg, #64748b, #475569); }

.robot-pulse {
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 2px solid #818cf8;
  animation: robot-ring 2s ease-out infinite;
}
@keyframes robot-ring {
  0% { transform: scale(1); opacity: 0.7; }
  100% { transform: scale(1.5); opacity: 0; }
}

/* 发送中红点 */
.robot-badge {
  position: absolute;
  top: -2px; right: -2px;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: #ef4444;
  border: 2px solid #fff;
  animation: badge-blink 1s ease-in-out infinite;
}
@keyframes badge-blink { 50% { opacity: 0.4; } }

/* === 面板 === */
.agent-panel {
  position: fixed;
  width: 384px;
  height: 540px;
  z-index: 10001;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.22), 0 0 0 1px rgba(99, 102, 241, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.agent-panel.expanded { width: 480px; height: 660px; }

/* 头部 */
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  cursor: grab;
  user-select: none;
}
.panel-head:active { cursor: grabbing; }
.head-title { display: inline-flex; align-items: center; gap: 9px; }
.head-logo {
  width: 28px; height: 28px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.2);
  display: flex; align-items: center; justify-content: center;
  color: #fff;
  backdrop-filter: blur(4px);
}
.head-text { display: flex; flex-direction: column; line-height: 1.15; }
.head-name { font-size: 14px; font-weight: 600; color: #fff; }
.head-sub { font-size: 10px; color: rgba(255, 255, 255, 0.7); letter-spacing: 0.5px; }

.head-actions { display: flex; gap: 2px; }
.head-btn {
  width: 26px; height: 26px;
  border: none; background: transparent;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.head-btn:hover { background: rgba(255, 255, 255, 0.18); color: #fff; }
.head-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* 工具栏 */
.panel-toolbar {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid #f1f5f9;
  align-items: center;
  background: #fafbff;
}
.model-select { flex: 1; }

/* 消息流 */
.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: linear-gradient(180deg, #fcfcff 0%, #f8f9ff 100%);
}
.panel-body::-webkit-scrollbar { width: 6px; }
.panel-body::-webkit-scrollbar-thumb { background: #d1d5e8; border-radius: 3px; }
.panel-body::-webkit-scrollbar-track { background: transparent; }

/* 空状态 */
.empty-hint { margin: auto; text-align: center; }
.empty-icon {
  width: 64px; height: 64px;
  margin: 0 auto 14px;
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1));
  display: flex; align-items: center; justify-content: center;
  color: #6366f1;
}
.empty-title { margin: 0; font-size: 15px; font-weight: 600; color: #334155; }
.empty-desc { margin: 4px 0 14px; font-size: 12px; color: #94a3b8; }
.empty-tips { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.tip-chip {
  font-size: 11px;
  padding: 3px 9px;
  border-radius: 12px;
  background: rgba(99, 102, 241, 0.08);
  color: #6366f1;
}

.msg { display: flex; }
.msg-user { justify-content: flex-end; }
.msg-ai { justify-content: flex-start; }
.msg-tool { justify-content: stretch; }

/* 头像 + 气泡 容器 */
.bubble-wrap {
  display: flex;
  align-items: flex-end;
  gap: 7px;
  max-width: 88%;
}
.msg-user .bubble-wrap { flex-direction: row-reverse; }

.avatar {
  flex-shrink: 0;
  width: 26px; height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}
.avatar-ai {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
}
.avatar-ai.thinking { animation: avatar-pulse 1.4s ease-in-out infinite; }
@keyframes avatar-pulse {
  0%, 100% { box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4); }
  50% { box-shadow: 0 2px 16px rgba(99, 102, 241, 0.8); }
}
.avatar-user { background: #cbd5e1; }

.msg-ai .ai-content { flex: 1; min-width: 0; }

.bubble {
  padding: 9px 13px;
  border-radius: 14px;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
  white-space: pre-wrap;
}
.bubble-user {
  background: linear-gradient(135deg, #6366f1, #7c3aed);
  color: #fff;
  border-bottom-right-radius: 5px;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
}
.bubble-ai {
  background: #ffffff;
  color: #334155;
  border-bottom-left-radius: 5px;
  display: inline-block;
  border: 1px solid #ececf5;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
}

/* 思考过程折叠块 */
.think-block {
  width: 100%;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(139, 92, 246, 0.04));
  border: 1px solid rgba(99, 102, 241, 0.14);
  overflow: hidden;
  margin-bottom: 5px;
}
.think-head {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  cursor: pointer;
  user-select: none;
  font-size: 11px;
  color: #8b5cf6;
}
.think-icon { color: #a78bfa; }
.think-label { font-weight: 500; }
.think-chevron { margin-left: auto; transition: transform 0.25s; color: #c4b5fd; }
.think-chevron.rotated { transform: rotate(180deg); }
.think-streaming {
  margin-left: auto;
  color: #a78bfa;
  font-size: 10px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.think-streaming::after {
  content: '';
  width: 4px; height: 4px;
  border-radius: 50%;
  background: #a78bfa;
  animation: think-dot 1s ease-in-out infinite;
}
@keyframes think-dot {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}
.think-body {
  padding: 0 10px 9px;
  font-size: 11.5px;
  line-height: 1.65;
  color: #94a3b8;
  white-space: pre-wrap;
  word-break: break-word;
  font-style: italic;
  border-top: 1px dashed rgba(139, 92, 246, 0.12);
  padding-top: 7px;
}
.think-enter-active, .think-leave-active {
  transition: opacity 0.2s, max-height 0.25s ease;
  max-height: 300px;
  overflow: hidden;
}
.think-enter-from, .think-leave-to { opacity: 0; max-height: 0; }

/* 加载三点动画（首字未到时） */
.typing-dots {
  display: inline-flex;
  gap: 4px;
  padding: 12px 14px;
  background: #ffffff;
  border: 1px solid #ececf5;
  border-radius: 14px;
  border-bottom-left-radius: 5px;
}
.typing-dots span {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #c4b5fd;
  animation: typing 1.2s ease-in-out infinite;
}
.typing-dots span:nth-child(2) { animation-delay: 0.2s; }
.typing-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes typing {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-5px); opacity: 1; }
}

.cursor {
  display: inline-block;
  color: #6366f1;
  margin-left: 1px;
  animation: blink 0.9s steps(2) infinite;
}
@keyframes blink { 50% { opacity: 0; } }

/* 输入区 */
.panel-input {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid #f1f5f9;
  background: #ffffff;
  align-items: flex-end;
}
.send-btn {
  flex-shrink: 0;
  width: 34px; height: 34px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #6366f1, #7c3aed);
  color: #fff;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.35);
}
.send-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99, 102, 241, 0.5); }
.send-btn.disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; transform: none; }

/* 面板展开/收起过渡 */
.panel-enter-active, .panel-leave-active {
  transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.panel-enter-from, .panel-leave-to {
  opacity: 0;
  transform: translateY(16px) scale(0.94);
}

/* 消息项入场动画 */
.msg { animation: msg-in 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes msg-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
