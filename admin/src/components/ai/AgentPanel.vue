<script setup lang="ts">
import { ref, reactive, nextTick, computed } from 'vue'
import {
  NIcon, NInput, NButton, NSelect, useMessage,
} from 'naive-ui'
import {
  ChatbubbleEllipsesOutline, CloseOutline, RemoveOutline, ExpandOutline,
  PaperPlaneOutline,
} from '@vicons/ionicons5'
import { streamChat } from '../../api/ai'
import type { AiChatMessage, AiToolCall, AiArticleContext } from '../../api/ai'
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
}>()

const message = useMessage()

// === 面板状态 ===
const open = ref(false)
const dragging = ref(false)
// 面板位置（默认右下）
const panelPos = reactive({ left: 0, top: 0 })
const panelSize = reactive({ expanded: false })
// 拖拽临时变量
let dragStart = { x: 0, y: 0, left: 0, top: 0 }

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
  // user/assistant 的文本
  text?: string
  // assistant 正在流式输出（逐字）
  streaming?: boolean
  // tool 相关
  toolCall?: AiToolCall
  toolStatus?: 'pending' | 'running' | 'success' | 'error'
  toolResult?: string
}
const renderItems = ref<RenderItem[]>([])
const scrollBody = ref<HTMLElement | null>(null)

let itemSeq = 0
const nextId = () => `m${++itemSeq}`

// === 工具执行器（前端执行，直接改文章 formValue） ===
function executeTool(call: AiToolCall): string {
  let args: any = {}
  try { args = JSON.parse(call.function.arguments || '{}') } catch { /* 空参数 */ }
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
      const start = Math.max(0, (args.startLine ?? 1) - 1)
      const end = Math.min(lines.length, args.endLine ?? lines.length)
      return JSON.stringify({ lines: lines.slice(start, end).join('\n'), totalLines: lines.length })
    }
    case 'update_title':
      f.title = String(args.title ?? '').slice(0, 200)
      return JSON.stringify({ ok: true, title: f.title })
    case 'update_subtitle':
      f.subtitle = String(args.subtitle ?? '').slice(0, 200)
      return JSON.stringify({ ok: true, subtitle: f.subtitle })
    case 'update_summary':
      f.summary = String(args.summary ?? '').slice(0, 500)
      return JSON.stringify({ ok: true, summary: f.summary })
    case 'update_slug':
      f.slug = String(args.slug ?? '').slice(0, 60)
      return JSON.stringify({ ok: true, slug: f.slug })
    case 'append_content':
      f.content += String(args.text ?? '')
      return JSON.stringify({ ok: true, appendedLength: String(args.text ?? '').length })
    case 'replace_content':
      f.content = String(args.content ?? '')
      return JSON.stringify({ ok: true, contentLength: f.content.length })
    case 'insert_content_at': {
      const lines = f.content.split('\n')
      const after = Math.max(0, Math.min(lines.length, args.afterLine ?? 0))
      lines.splice(after, 0, String(args.text ?? ''))
      f.content = lines.join('\n')
      return JSON.stringify({ ok: true, insertedAt: after })
    }
    default:
      return JSON.stringify({ ok: false, error: `未知工具: ${call.function.name}` })
  }
}

// === 拖拽 ===
function startDrag(e: MouseEvent) {
  dragging.value = true
  dragStart = { x: e.clientX, y: e.clientY, left: panelPos.left, top: panelPos.top }
  // 计算默认位置（首次打开）
  if (panelPos.left === 0 && panelPos.top === 0) {
    panelPos.left = window.innerWidth - 400
    panelPos.top = window.innerHeight - 580
    dragStart.left = panelPos.left
    dragStart.top = panelPos.top
  }
  e.preventDefault()
}
function onDragMove(e: MouseEvent) {
  if (!dragging.value) return
  panelPos.left = Math.max(0, Math.min(window.innerWidth - 380, dragStart.left + e.clientX - dragStart.x))
  panelPos.top = Math.max(0, Math.min(window.innerHeight - 100, dragStart.top + e.clientY - dragStart.y))
}
function stopDrag() { dragging.value = false }

function togglePanel() {
  open.value = !open.value
  if (open.value && panelPos.left === 0 && panelPos.top === 0) {
    panelPos.left = window.innerWidth - 400
    panelPos.top = window.innerHeight - 580
  }
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

  try {
    // 2) agent 循环（最多 MAX_LOOP 步）
    for (let step = 0; step < MAX_LOOP; step++) {
      // 准备 assistant 渲染项（流式）
      const assistantItem: RenderItem = { id: nextId(), kind: 'assistant', text: '', streaming: true }
      renderItems.value.push(assistantItem)
      await scrollToBottom()

      const result = await streamChat(
        messages.value,
        buildContext(),
        // token 回调：逐字更新渲染
        (tok) => {
          assistantItem.text = (assistantItem.text ?? '') + tok
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
      )

      assistantItem.streaming = false

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
    message.error(e instanceof Error ? e.message : 'AI 对话失败')
  } finally {
    sending.value = false
    await scrollToBottom()
  }
}

function handleClear() {
  messages.value = []
  renderItems.value = []
  itemSeq = 0
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

  <!-- 拖拽遮罩 -->
  <div v-if="dragging" class="drag-mask" @mousemove="onDragMove" @mouseup="stopDrag" />

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
            <div class="bubble bubble-user">{{ item.text }}</div>
          </div>
          <!-- AI 消息 -->
          <div v-else-if="item.kind === 'assistant'" class="msg msg-ai">
            <div class="bubble bubble-ai">
              {{ item.text }}
              <span v-if="item.streaming" class="cursor">▋</span>
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

.drag-mask {
  position: fixed;
  inset: 0;
  z-index: 10000;
  cursor: grabbing;
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

.bubble {
  max-width: 80%;
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
  transition: opacity 0.2s, transform 0.2s;
}
.panel-enter-from, .panel-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.96);
}
</style>
