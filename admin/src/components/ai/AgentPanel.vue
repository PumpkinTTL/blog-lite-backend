<script setup lang="ts">
import { ref, reactive, nextTick, computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useMessage } from 'naive-ui'
import {
  RemoveOutline,
  BulbOutline, ChevronDownOutline,
  SparklesOutline, ContractOutline, HappyOutline, ColorPaletteOutline, CubeOutline,
  StopOutline, ArrowUpSharp, ArrowUpOutline, ArrowDownOutline, SyncOutline,
  LayersOutline, DocumentTextOutline,
} from '@vicons/ionicons5'
import { streamChat, streamCompact, streamWebSearch } from '../../api/ai'
import type { AiChatMessage, AiToolCall, AiArticleContext, AiUsage } from '../../api/ai'
import { getConversationByPostId, saveConversation } from '../../api/ai-conversation'
import { getActiveAiProviders } from '../../api/ai-provider'
import type { AiProvider } from '../../api/ai-provider'
import { isDark } from '../../theme'
import ToolCallCard from './ToolCallCard.vue'

/** 文章 formValue 的最小契约（避免和 PostEditView 强耦合） */
interface ArticleForm {
  title: string
  subtitle: string
  slug: string
  content: string
  summary: string
}

const props = withDefaults(defineProps<{
  formValue: { value: ArticleForm } | ArticleForm
  /** 当前编辑的文章 ID（新增文章时为 null，不持久化） */
  postId?: number | null
  /** 面板标题（复用时可覆盖，默认"写作助手"） */
  title?: string
  /** 空状态副标题（复用时可覆盖） */
  subtitle?: string
  /** 空状态能力标签（复用时可覆盖） */
  tips?: string[]
}>(), {
  postId: null,
  title: '写作助手',
  subtitle: '帮你阅读、修改、润色当前文章',
  tips: () => ['改标题', '润色正文', '查找替换'],
})

const message = useMessage()

// === 面板状态 ===
const open = ref(false)
const dragging = ref(false)
const panelPos = reactive({ left: 0, top: 0 })

const form = computed<ArticleForm>(() =>
  props.formValue && 'value' in props.formValue ? props.formValue.value : (props.formValue as ArticleForm),
)

// === 对话状态 ===
const messages = ref<AiChatMessage[]>([])
const inputText = ref('')
const inputFocused = ref(false)
const sending = ref(false)
const compacting = ref(false)
/** 对话中断控制器：sending 期间用户点"停止"时 abort，终止 streamChat fetch */
let abortController: AbortController | null = null
const selectedProviderId = ref<number | null>(null)
const selectedModel = ref<string | null>(null)
const providers = ref<AiProvider[]>([])
const provDropdownOpen = ref(false)
const modelDropdownOpen = ref(false)

// provider/model 本地持久化：刷新后仍保留用户上次选择，而不是回退到第一个。
const LS_PROVIDER_KEY = 'agentPanel.providerId'
const LS_MODEL_KEY = 'agentPanel.modelId'
function readLsNumber(key: string): number | null {
  const raw = localStorage.getItem(key) || sessionStorage.getItem(key)
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}
function readLsStr(key: string): string | null {
  return localStorage.getItem(key) || sessionStorage.getItem(key) || null
}
function persistSelection() {
  const store = localStorage  // 统一写 localStorage（跨会话保留）
  if (selectedProviderId.value != null) store.setItem(LS_PROVIDER_KEY, String(selectedProviderId.value))
  if (selectedModel.value) store.setItem(LS_MODEL_KEY, selectedModel.value)
}

const activeProvider = computed(() =>
  providers.value.find(p => p.id === selectedProviderId.value)
)
const modelOptions = computed(() => {
  if (!activeProvider.value) return []
  return (activeProvider.value.models || []).map(m => ({ label: m.displayName || m.modelId, value: m.modelId }))
})
const activeModelLabel = computed(() => {
  const m = modelOptions.value.find(o => o.value === selectedModel.value)
  return m?.label ?? null
})

// === 上下文占用（进度条用）===
// 上限 = 当前模型的 maxContextTokens；当前占用 = 累计 prompt+completion token（后端真实值）
const contextLimit = computed(() => {
  const p = activeProvider.value
  if (!p || !selectedModel.value) return 0
  return p.models?.find(m => m.modelId === selectedModel.value)?.maxContextTokens ?? 0
})
// === 上下文占用（进度条用）===
// 当前占用 = 最近一轮单次的 prompt+completion（= 网关 usage.total_tokens 语义）。
// 这才是对齐模型上下文窗口(如 DeepSeek 200K)的口径：单次请求喂进去的全部 + 本轮输出。
// 注意：不是累计！累计会把每轮重复发送的历史反复计入，数字虚高且不反映当前窗口占用。
const contextUsed = computed(() => tokenStats.lastPrompt + tokenStats.lastCompletion)
const contextPercent = computed(() => {
  if (contextLimit.value <= 0) return 0
  return Math.min(100, Math.round((contextUsed.value / contextLimit.value) * 100))
})
// 80% 起预警，建议压缩
const contextWarn = computed(() => contextLimit.value > 0 && contextPercent.value >= 80)

/** token 数格式化为 K 单位（与 picker-model-ctx 一致）：1234 → 1.2K，<1000 原样 */
function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(n)
}
/** ISO 时间 → 相对时间（如「3分钟前」），失败回落为日期 */
function formatCompactTime(iso: string | null): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const diff = Date.now() - t
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return Math.floor(diff / 60_000) + '分钟前'
  if (diff < 86_400_000) return Math.floor(diff / 3600_000) + '小时前'
  return Math.floor(diff / 86_400_000) + '天前'
}

function selectProvider(id: number) {
  selectedProviderId.value = id
  selectedModel.value = providers.value.find(p => p.id === id)?.models?.[0]?.modelId ?? null
  provDropdownOpen.value = false
  persistSelection()
}
function selectModel(modelId: string) {
  selectedModel.value = modelId
  modelDropdownOpen.value = false
  persistSelection()
}

/** 模型选择弹窗里选一个模型（自动切到它所属的 provider） */
function pickModelFromDialog(providerId: number, modelId: string) {
  selectedProviderId.value = providerId
  selectedModel.value = modelId
  modelPickerOpen.value = false
  persistSelection()
  message.success(`已切换到 ${activeModelLabel.value || modelId}`)
}

async function loadProviders() {
  try {
    const res: any = await getActiveAiProviders()
    const list = Array.isArray(res) ? res : (res?.data ?? [])
    providers.value = list
    if (!selectedProviderId.value && list.length > 0) {
      // 优先恢复本地持久化的选择；校验 provider/model 仍存在于当前可用列表中，避免选了已下架的
      const savedPid = readLsNumber(LS_PROVIDER_KEY)
      const savedMid = readLsStr(LS_MODEL_KEY)
      const matched = savedPid != null ? list.find((p: any) => p.id === savedPid) : null
      if (matched) {
        selectedProviderId.value = matched.id
        const hasModel = (matched.models || []).some((m: any) => m.modelId === savedMid)
        selectedModel.value = hasModel ? savedMid : (matched.models?.[0]?.modelId ?? null)
      } else {
        selectedProviderId.value = list[0].id
        selectedModel.value = list[0].models?.[0]?.modelId ?? null
      }
    }
    console.log('[AgentPanel] 加载供应商:', list.length, '个')
  } catch (e: any) {
    console.warn('[AgentPanel] 加载供应商失败:', e.message)
  }
}

// 当前登录用户名首字（用户头像）
const userInitial = computed(() => {
  const raw = localStorage.getItem('userInfo') || sessionStorage.getItem('userInfo')
  if (raw) {
    try {
      const info = JSON.parse(raw)
      const name = info.username || info.name || info.nickname
      if (name) return name.charAt(0).toUpperCase()
    } catch { /* ignore */ }
  }
  return 'U'
})

// === Token 统计 ===
// 会话级 token 统计（两套口径，全部来自网关返回的真实 usage）：
// - lastPrompt / lastCompletion：最近一轮网关返回值。进度条用这个对齐模型 maxContextTokens，
//   不会虚高（累加会把每轮重复发送的历史反复计入）。压缩后下一轮的 lastPrompt 自动反映
//   摘要化后的新基线，无需手动减。
// - totalPrompt / totalCompletion：历史累加，供"累计消耗"展示与审计。
const tokenStats = reactive({
  lastPrompt: 0,
  lastCompletion: 0,
  totalPrompt: 0,
  totalCompletion: 0,
  rounds: 0,
})
// 单轮 token（按 renderItem id 记录，消息下方显示）
const itemUsage = ref<Record<string, AiUsage>>({})
function resetTokenStats() {
  tokenStats.lastPrompt = 0
  tokenStats.lastCompletion = 0
  tokenStats.totalPrompt = 0
  tokenStats.totalCompletion = 0
  tokenStats.rounds = 0
  itemUsage.value = {}
}

/** 一轮 agent 内多步的 usage 缓冲 */
let roundMaxPrompt = 0
let roundSumCompletion = 0

/**
 * 记录单步网关 usage（agent 一轮内可能多步：调工具→再生成）。
 * 只暂存到本轮缓冲 + itemUsage，不直接动 total/rounds。
 * - prompt 取最大步：那步包含了最全的历史（上下文占用就用它，对齐模型窗口）
 * - completion 累加所有步：每步生成的内容是独立的真实消耗
 */
function recordStepUsage(itemKey: string, usage: AiUsage) {
  itemUsage.value[itemKey] = usage
  if (usage.promptTokens > roundMaxPrompt) roundMaxPrompt = usage.promptTokens
  roundSumCompletion += usage.completionTokens
}

/**
 * 一轮对话结束（或压缩结束）时提交本轮代表 usage：
 * - last 用本轮最大 prompt（最全上下文，进度条对齐模型窗口）
 * - total 只累加本轮代表值一次（避免多步重复历史虚高）
 * - rounds +1（一轮多步算 1 轮）
 */
function commitRoundUsage() {
  if (roundMaxPrompt === 0 && roundSumCompletion === 0) return
  tokenStats.lastPrompt = roundMaxPrompt
  tokenStats.lastCompletion = roundSumCompletion
  tokenStats.totalPrompt += roundMaxPrompt
  tokenStats.totalCompletion += roundSumCompletion
  tokenStats.rounds += 1
  roundMaxPrompt = 0
  roundSumCompletion = 0
}

// === 压缩状态（业界标准：摘要替换发网关的上下文，完整对话保留供回看）===
// compactionSummary 非空表示已压缩过；之后发网关 = [system:摘要] + compactionMessages
// 完整原始对话始终存在 messages.value 里，只用于渲染/回看，不再整段发给模型。
const compactionSummary = ref<string | null>(null)
const compactionMessages = ref<AiChatMessage[]>([])
const compactionTokens = ref(0)
const compactionReleasedAt = ref<string | null>(null)

/** 发给网关的上下文：未压缩用全量 messages；压缩过用 [system:摘要] + 压缩点后新对话 */
function buildGatewayMessages(): AiChatMessage[] {
  if (compactionSummary.value) {
    return [
      { role: 'system', content: `[历史对话摘要]\n${compactionSummary.value}` },
      ...compactionMessages.value,
    ]
  }
  return messages.value
}

/** 计算压缩释放了多少 token（压缩前最近一轮占用 - 压缩后最近一轮占用） */
function calcReleasedTokens(beforePrompt: number): number {
  const after = tokenStats.lastPrompt
  return beforePrompt > after ? beforePrompt - after : 0
}

// 渲染用的消息列表
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
  /** 流式工具的进度文本（如 web_search 的"正在搜索…"），仅 running 期间显示 */
  toolProgress?: string
}
const renderItems = ref<RenderItem[]>([])
// column-reverse 布局下，DOM 第一个元素显示在视觉底部。
// 为保持"旧消息在上、新消息在下"，渲染顺序需反转：最新的（数组末尾）放在 DOM 最前。
const reversedRenderItems = computed(() => [...renderItems.value].reverse())
const scrollBody = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)
const thinkExpanded = ref<Set<string>>(new Set())

/**
 * 输入框自适应高度：替代 naive-ui n-input 的 autosize。
 * minRows=1 对应单行最小高度（min-height:34px），maxRows=4 超过则出现滚动条。
 * 通过 scrollHeight 重置高度实现，v-model 变化时也触发。
 * overflow 默认 hidden 避免单行时出现 1px 滚动条，达到 max-height 才切 auto。
 */
function autoResizeInput() {
  const el = inputRef.value
  if (!el) return
  el.style.height = 'auto'
  const max = 96
  const h = Math.min(el.scrollHeight, max)
  el.style.height = h + 'px'
  // 内容超出 max-height 时才启用滚动条
  el.classList.toggle('has-scroll', el.scrollHeight > max)
}
watch(inputText, () => nextTick(autoResizeInput))

let itemSeq = 0
const nextId = () => `m${++itemSeq}`

// === 快捷指令 ===
interface QuickCmd { label: string; icon: any; insert: string; desc: string }
const quickCmds: QuickCmd[] = [
  { label: '压缩', icon: ContractOutline, insert: '/compact', desc: '压缩对话历史，释放 token' },
  { label: '润色', icon: SparklesOutline, insert: '帮我润色当前正文', desc: '优化正文表达' },
]

// === 斜杠命令菜单（业界标准：输入 / 弹出内置命令，方向键选择，回车执行）===
interface SlashCommand { name: string; desc: string; icon: any; insert?: string }
const slashCommands: SlashCommand[] = [
  { name: '/compact', desc: '压缩对话历史，释放上下文 token', icon: ContractOutline },
  { name: '/model', desc: '切换 AI 模型', icon: CubeOutline },
  { name: '/encourage', desc: '生成一段鼓励的话，给写作打打气', icon: HappyOutline, insert: '写一段鼓励创作者的话，温暖、真诚、有力量，3-4 句即可，中文' },
  { name: '/idea', desc: '基于当前文章生成几个延展选题/灵感', icon: ColorPaletteOutline, insert: '基于当前文章的主题和内容，给我 5 个延展创作灵感或相关选题，每个一句话简述，适合做系列文章' },
]
// 模型选择弹窗
const modelPickerOpen = ref(false)
// 弹窗键盘导航：把所有 provider 的模型拍平成 [providerId, modelId, label] 列表
const flatModels = computed(() => {
  const out: { providerId: number; modelId: string; label: string }[] = []
  for (const p of providers.value) {
    for (const m of p.models || []) {
      out.push({ providerId: p.id, modelId: m.modelId, label: m.displayName || m.modelId })
    }
  }
  return out
})
const modelPickerIndex = ref(0)
// 当前选中的扁平索引（根据已选 provider+model 反查）
watch([modelPickerOpen, selectedProviderId, selectedModel], () => {
  if (!modelPickerOpen.value) return
  const idx = flatModels.value.findIndex(
    f => f.providerId === selectedProviderId.value && f.modelId === selectedModel.value,
  )
  modelPickerIndex.value = idx >= 0 ? idx : 0
})
/** 由 (providerId, modelId) 算出在扁平列表里的索引，用于模板 active 判断 */
function pickerFlatIndex(providerId: number, modelId: string): number {
  return flatModels.value.findIndex(
    f => f.providerId === providerId && f.modelId === modelId,
  )
}
// 模型项 DOM 引用，用于键盘选中时自动滚动可见
const pickerModelEls = ref<HTMLElement[]>([])
watch(modelPickerIndex, async () => {
  await nextTick()
  const el = pickerModelEls.value[modelPickerIndex.value]
  el?.scrollIntoView({ block: 'nearest' })
})
function onModelPickerKeydown(e: KeyboardEvent) {
  if (!modelPickerOpen.value) return
  const list = flatModels.value
  if (e.key === 'Escape') {
    e.preventDefault()
    modelPickerOpen.value = false
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    modelPickerIndex.value = (modelPickerIndex.value + 1) % Math.max(1, list.length)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    modelPickerIndex.value = (modelPickerIndex.value - 1 + list.length) % Math.max(1, list.length)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const target = list[modelPickerIndex.value]
    if (target) pickModelFromDialog(target.providerId, target.modelId)
  }
}
const slashMenuOpen = ref(false)
const slashMenuIndex = ref(0)
const slashMatches = computed(() => {
  const v = inputText.value.trim()
  if (!v.startsWith('/')) return []
  // 输入 /xxx 时按前缀过滤
  return slashCommands.filter(c => c.name.startsWith(v))
})
// 监听输入值，自动开关菜单
watch(() => inputText.value, (v) => {
  if (v.startsWith('/') && slashMatches.value.length > 0) {
    slashMenuOpen.value = true
    slashMenuIndex.value = 0
  } else {
    slashMenuOpen.value = false
  }
})
function selectSlashCommand(cmd: SlashCommand) {
  slashMenuOpen.value = false
  inputText.value = ''
  // /compact 是特殊操作（压缩历史），直接执行
  if (cmd.name === '/compact') {
    handleCompact()
    return
  }
  // /model 弹出模型选择弹窗
  if (cmd.name === '/model') {
    modelPickerOpen.value = true
    return
  }
  // 其他命令：填入预设 prompt，用户可直接回车发送或自己修改
  inputText.value = cmd.insert ?? (cmd.name + ' ')
  inputRef.value?.focus?.()
}
function onSlashMenuKeydown(e: KeyboardEvent): boolean {
  // 返回 true 表示已处理（调用方不再走默认 Enter 发送逻辑）
  if (!slashMenuOpen.value) return false
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    slashMenuIndex.value = (slashMenuIndex.value + 1) % slashMatches.value.length
    return true
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    slashMenuIndex.value = (slashMenuIndex.value - 1 + slashMatches.value.length) % slashMatches.value.length
    return true
  }
  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault()
    const cmd = slashMatches.value[slashMenuIndex.value]
    if (cmd) selectSlashCommand(cmd)
    return true
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    slashMenuOpen.value = false
    return true
  }
  return false
}

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

// === 工具执行器 ===
/**
 * 工具执行器。
 * 异步：web_search 需要发网络请求（流式 SSE），其他工具仍同步 return（在 async 里天然兼容）。
 * @param onProgress 流式进度回调（web_search 用），更新工具卡片的进度文本
 */
async function executeTool(
  call: AiToolCall,
  onProgress?: (msg: string) => void,
  /** 可选：AbortSignal，转发给流式工具（如 web_search）以支持停止 */
  signal?: AbortSignal,
): Promise<string> {
  let args: any = {}
  try { args = JSON.parse(call.function.arguments || '{}') } catch {
    return fail(`参数不是合法 JSON: ${call.function.arguments.slice(0, 100)}`)
  }
  const f = form.value

  switch (call.function.name) {
    case 'get_article':
      // 只返回元数据 + 字数，不预览正文。
      // 正文通过 get_content_section 按需分段读取，避免每次 get_article 都把 2000 字
      // （~2800 token）塞进历史且每轮重发，造成 token 浪费。
      return JSON.stringify({
        title: f.title,
        subtitle: f.subtitle,
        summary: f.summary,
        slug: f.slug,
        contentLength: f.content.length,
        contentLines: f.content.split('\n').length,
        hint: '正文较长，需要查看/修改正文请用 get_content_section 按行范围读取',
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
    case 'read_section_by_heading': {
      // 按标题定位读取一节：从匹配标题行到下一个同级或更高级标题（或文末）
      const heading = toStr(args.heading, 200).trim()
      if (!heading) return fail('heading 不能为空')
      const lines = f.content.split('\n')
      // 找到标题所在行（匹配 # 后的文本，忽略大小写和首尾空格）
      const target = heading.toLowerCase()
      let headIdx = -1
      let headLevel = 0
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^(#{1,6})\s+(.*)$/)
        if (m && m[2].trim().toLowerCase() === target) {
          headIdx = i
          headLevel = m[1].length
          break
        }
      }
      if (headIdx === -1) return fail(`未找到标题: ${heading}`)
      // 找下一个同级或更高级标题
      let endIdx = lines.length
      for (let i = headIdx + 1; i < lines.length; i++) {
        const m = lines[i].match(/^(#{1,6})\s+/)
        if (m && m[1].length <= headLevel) { endIdx = i; break }
      }
      const section = lines.slice(headIdx, endIdx).join('\n')
      return JSON.stringify({
        heading: lines[headIdx],
        level: headLevel,
        startLine: headIdx + 1,
        endLine: endIdx,
        content: section,
        lineCount: endIdx - headIdx,
      })
    }
    case 'get_outline': {
      // 提取所有标题层级 + 行号，数据量小，让 AI 先看结构再决定改哪
      const lines = f.content.split('\n')
      const outline: { level: number; text: string; line: number }[] = []
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^(#{1,6})\s+(.*)$/)
        if (m) outline.push({ level: m[1].length, text: m[2].trim(), line: i + 1 })
      }
      return JSON.stringify({
        outline,
        totalHeadings: outline.length,
        totalLines: lines.length,
        hint: outline.length === 0 ? '正文无标题，考虑用 Markdown 标题组织结构' : undefined,
      })
    }
    case 'insert_after_heading': {
      // 在指定标题所在节的末尾插入内容
      const heading = toStr(args.heading, 200).trim()
      const text = toStr(args.text, 100000)
      if (!heading) return fail('heading 不能为空')
      if (!text) return fail('text 不能为空')
      const lines = f.content.split('\n')
      const target = heading.toLowerCase()
      let headIdx = -1
      let headLevel = 0
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^(#{1,6})\s+(.*)$/)
        if (m && m[2].trim().toLowerCase() === target) {
          headIdx = i
          headLevel = m[1].length
          break
        }
      }
      if (headIdx === -1) return fail(`未找到标题: ${heading}`)
      // 节末尾 = 下一个同级或更高级标题前，或文末
      let endIdx = lines.length
      for (let i = headIdx + 1; i < lines.length; i++) {
        const m = lines[i].match(/^(#{1,6})\s+/)
        if (m && m[1].length <= headLevel) { endIdx = i; break }
      }
      lines.splice(endIdx, 0, text)
      f.content = lines.join('\n')
      return JSON.stringify({ ok: true, insertedAfterLine: endIdx, heading: lines[headIdx] })
    }
    case 'move_lines': {
      // 移动行范围到新位置：切出 → 插入
      const lines = f.content.split('\n')
      const total = lines.length
      if (total === 0) return fail('正文为空')
      let fromStart = clamp(toInt(args.fromStart, 1), 1, total)
      let fromEnd = clamp(toInt(args.fromEnd, fromStart), 1, total)
      if (fromStart > fromEnd) [fromStart, fromEnd] = [fromEnd, fromStart]
      // 目标行号要基于"删除后"的行号语义：先 clamp 原始值，删除后修正
      let toAfter = clamp(toInt(args.toAfterLine, 0), 0, total)
      // 切出要移动的行
      const moved = lines.splice(fromStart - 1, fromEnd - fromStart + 1)
      // 修正插入位置：原 toAfter 若在移动范围之后，需减去移动的行数
      if (toAfter >= fromEnd) toAfter -= moved.length
      toAfter = clamp(toAfter, 0, lines.length)
      lines.splice(toAfter, 0, ...moved)
      f.content = lines.join('\n')
      return JSON.stringify({
        ok: true,
        movedLines: moved.length,
        fromRange: `${fromStart}-${fromEnd}`,
        insertedAfterLine: toAfter,
      })
    }
    case 'wrap_text': {
      // 给正文中已有文本包裹标记，等价于 find(text) → replace(text → marker+text+marker)
      const text = toStr(args.text, 10000)
      const marker = toStr(args.marker, 10)
      if (!text) return fail('text 不能为空')
      if (!marker) return fail('marker 不能为空')
      const idx = f.content.indexOf(text)
      if (idx === -1) return fail(`正文中未找到文本: ${text.slice(0, 50)}`)
      const wrapped = marker + text + marker
      f.content = f.content.slice(0, idx) + wrapped + f.content.slice(idx + text.length)
      return JSON.stringify({ ok: true, wrapped: 1, marker })
    }
    case 'deduplicate_lines': {
      // 合并连续空行为单个，去除行尾空格
      const lines = f.content.split('\n').map((l) => l.replace(/\s+$/, ''))
      const result: string[] = []
      let prevBlank = false
      let mergedBlanks = 0
      for (const l of lines) {
        const isBlank = l.trim() === ''
        if (isBlank) {
          if (prevBlank) { mergedBlanks++; continue }
          prevBlank = true
        } else {
          prevBlank = false
        }
        result.push(l)
      }
      // 去除开头/结尾多余空行
      while (result.length && result[0].trim() === '') result.shift()
      while (result.length && result[result.length - 1].trim() === '') result.pop()
      f.content = result.join('\n')
      return JSON.stringify({ ok: true, mergedBlankLines: mergedBlanks })
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
    case 'find_and_replace': {
      const findText = toStr(args.findText, 10000)
      const replaceText = toStr(args.replaceText, 10000)
      if (!findText) return fail('findText 不能为空')
      const scope = toStr(args.scope, 20) || 'content'
      // occurrence: 0=全部(默认), 正数=第n个, -1=最后一个
      const occurrence = toInt(args.occurrence, 0)
      let target = ''
      let setter: ((v: string) => void) | null = null
      if (scope === 'content') { target = f.content; setter = (v) => { f.content = v } }
      else if (scope === 'title') { target = f.title; setter = (v) => { f.title = v } }
      else if (scope === 'subtitle') { target = f.subtitle; setter = (v) => { f.subtitle = v } }
      else if (scope === 'summary') { target = f.summary; setter = (v) => { f.summary = v } }
      else return fail(`未知 scope: ${scope}`)
      // 收集所有匹配位置
      const positions: number[] = []
      let from = 0
      while (true) {
        const idx = target.indexOf(findText, from)
        if (idx === -1) break
        positions.push(idx)
        from = idx + findText.length
      }
      if (positions.length === 0) return JSON.stringify({ ok: true, scope, replaced: 0, message: '未找到匹配文本' })
      // 决定要替换哪些位置
      let targets: number[]
      if (occurrence === 0) {
        targets = positions // 全部
      } else if (occurrence > 0) {
        targets = occurrence <= positions.length ? [positions[occurrence - 1]] : []
      } else {
        // 负数：-1 是最后一个
        const i = positions.length + occurrence
        targets = i >= 0 ? [positions[i]] : []
      }
      if (targets.length === 0) return JSON.stringify({ ok: true, scope, replaced: 0, message: `只有 ${positions.length} 处匹配，无第 ${occurrence} 处` })
      // 从后往前替换，避免位置偏移
      targets.sort((a, b) => b - a)
      let result = target
      for (const pos of targets) {
        result = result.slice(0, pos) + replaceText + result.slice(pos + findText.length)
      }
      setter(result)
      return JSON.stringify({ ok: true, scope, replaced: targets.length, totalMatches: positions.length })
    }
    case 'delete_lines': {
      const lines = f.content.split('\n')
      const total = lines.length
      if (total === 0) return fail('正文为空，无可删除行')
      let start = clamp(toInt(args.startLine, 1), 1, total)
      let end = clamp(toInt(args.endLine, total), 1, total)
      if (start > end) [start, end] = [end, start]
      lines.splice(start - 1, end - start + 1)
      f.content = lines.join('\n')
      return JSON.stringify({ ok: true, deletedLines: end - start + 1, range: `${start}-${end}`, remainingLines: lines.length })
    }
    case 'get_word_count': {
      const content = f.content
      const plain = content
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`[^`]*`/g, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[[^\]]*\]\([^)]*\)/g, '$1')
        .replace(/[#>*_~\-]/g, '')
        .trim()
      const cjk = (plain.match(/[\u4e00-\u9fa5]/g) || []).length
      const words = (plain.match(/[a-zA-Z]+/g) || []).length
      const numbers = (plain.match(/\d+/g) || []).length
      return JSON.stringify({
        contentChars: content.length,
        contentLines: content.split('\n').length,
        cjkChars: cjk,
        englishWords: words,
        numbers,
        estimatedWordCount: cjk + words + numbers,
        titleLength: f.title.length,
        subtitleLength: f.subtitle.length,
        summaryLength: f.summary.length,
      })
    }
    case 'web_search': {
      const query = toStr(args.query, 400)
      if (!query.trim()) return fail('query 不能为空')
      const maxResults = clamp(toInt(args.max_results ?? args.maxResults, 5), 1, 10)
      // 流式搜索：onProgress 多次触发更新工具卡片进度
      // 精简结果再返回，避免把过长的 content 全塞进 messages 浪费后续 token
      const res = await streamWebSearch(
        query.trim(),
        (p) => {
          const extra = p.responseTime != null ? ` · ${p.responseTime.toFixed(1)}s` : ''
          onProgress?.(`${p.message}${extra}`)
        },
        maxResults,
        signal,
      )
      // 精简：每条 content 截断到 500 字，避免历史膨胀
      const slim = {
        query: res.query,
        answer: res.answer,
        results: res.results.map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content.length > 500 ? r.content.slice(0, 500) + '…' : r.content,
          score: r.score,
        })),
        responseTime: Number(res.responseTime.toFixed(2)),
      }
      return JSON.stringify(slim)
    }
    default:
      return fail(`未知工具: ${call.function.name}`)
  }
}

// === 拖拽 ===
let dragStart = { x: 0, y: 0, left: 0, top: 0 }
const PANEL_W = 480
const PANEL_H = 660
let posInited = false
function ensureDefaultPos() {
  if (posInited) return
  posInited = true
  // 默认右下角，留 24px 边距
  panelPos.left = window.innerWidth - PANEL_W - 24
  panelPos.top = window.innerHeight - PANEL_H - 24
}
function onDragMove(e: MouseEvent) {
  panelPos.left = Math.max(0, Math.min(window.innerWidth - PANEL_W, dragStart.left + e.clientX - dragStart.x))
  panelPos.top = Math.max(0, Math.min(window.innerHeight - 48, dragStart.top + e.clientY - dragStart.y))
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
async function togglePanel() {
  open.value = !open.value
  if (open.value) {
    ensureDefaultPos()
    // column-reverse 布局：DOM 挂载即 scrollTop=0（视觉底部=最新消息），
    // 无需任何滚动校正，彻底消除跳变闪烁。
    await nextTick()
    if (scrollBody.value) scrollBody.value.scrollTop = 0
  }
}

// === 上下文快照 ===
function buildContext(): AiArticleContext {
  const f = form.value
  return { title: f.title, subtitle: f.subtitle, summary: f.summary, slug: f.slug, content: f.content }
}

// === 响应式渲染项（reactive 确保流式更新生效） ===
function addRenderItem(item: RenderItem): RenderItem {
  const reactiveItem = reactive(item)
  renderItems.value.push(reactiveItem)
  return reactiveItem
}

const MAX_LOOP = 8

// === /compact 压缩历史 ===
async function handleCompact() {
  if (compacting.value || sending.value) return
  // 待压缩内容 = 压缩点之后的所有新对话（首次压缩就是全量 messages）
  const toCompress = compactionSummary.value
    ? [
        { role: 'system' as const, content: `[历史对话摘要]\n${compactionSummary.value}` },
        ...compactionMessages.value,
      ]
    : messages.value
  const userTurns = toCompress.filter((m) => m.role === 'user' || m.role === 'assistant')
  if (userTurns.length < 2) {
    message.warning('对话太短，无需压缩')
    return
  }
  const promptBefore = tokenStats.lastPrompt
  compacting.value = true

  // 流式压缩：用一条临时 assistant 项实时显示摘要生成过程（业界标准，压缩可见）
  const compactItem = addRenderItem({
    id: nextId(), kind: 'assistant', text: '', replyText: '', thinkText: '',
    streaming: true,
  })
  await scrollToBottom()

  try {
    const { summary, usage } = await streamCompact(
      toCompress as AiChatMessage[],
      selectedModel.value ?? undefined,
      (tok) => {
        compactItem.replyText = (compactItem.replyText ?? '') + tok
        scrollToBottom()
      },
      (think) => {
        compactItem.thinkText = (compactItem.thinkText ?? '') + think
        thinkExpanded.value.add(compactItem.id)
        scrollToBottom()
      },
    )
    compactItem.streaming = false
    thinkExpanded.value.delete(compactItem.id)

    if (!summary.trim()) {
      // 没生成出内容，移除临时项
      renderItems.value = renderItems.value.filter((r) => r.id !== compactItem.id)
      message.error('压缩失败：未返回摘要')
      return
    }

    // 业界标准：摘要覆盖旧摘要，压缩点之后的新对话从空开始累积。
    // 完整原始 messages 不删（供回看），只是不再整段发给模型。
    compactionSummary.value = summary
    compactionMessages.value = []

    // 释放量计算：压缩这次调用 usage.promptTokens = 被压缩的历史体积，
    // summary 本身的体积 ≈ usage.completionTokens。
    // 释放 = 被压缩历史体积 - 摘要体积（这就是上下文省下来的 token）。
    if (usage) {
      const released = Math.max(0, usage.promptTokens - usage.completionTokens)
      compactionTokens.value = released
      // 压缩是真实 token 消耗，计 1 轮，total 累加（审计用）
      itemUsage.value[compactItem.id] = usage
      tokenStats.totalPrompt += usage.promptTokens
      tokenStats.totalCompletion += usage.completionTokens
      tokenStats.rounds += 1
      // 压缩后真实占用变小（下次对话只发 摘要+新对话），
      // 用摘要体积作为 lastPrompt 的乐观估计，让进度条立刻反映释放效果。
      // 下次真实对话的 usage 会用真实值覆盖它。
      tokenStats.lastPrompt = usage.completionTokens
      tokenStats.lastCompletion = 0
    } else {
      compactionTokens.value = calcReleasedTokens(promptBefore)
    }
    compactionReleasedAt.value = new Date().toISOString()
    // 临时项保留为压缩摘要展示
    compactItem.replyText = `✅ 已压缩历史（释放约 ${compactionTokens.value} token）\n\n${summary}`
    message.success(`对话已压缩，释放约 ${compactionTokens.value} token`)
    await scrollToBottom()
    void persistConversation()
  } catch (e) {
    compactItem.streaming = false
    thinkExpanded.value.delete(compactItem.id)
    if (!compactItem.replyText && !compactItem.thinkText) {
      renderItems.value = renderItems.value.filter((r) => r.id !== compactItem.id)
    }
    message.error(e instanceof Error ? e.message : '压缩失败')
  } finally {
    compacting.value = false
    await nextTick()
    inputRef.value?.focus?.()
  }
}

/** 主动终止正在进行的 AI 流式回复（用户点"停止"按钮时调用） */
function stopGeneration() {
  if (!sending.value) return
  abortController?.abort()
  abortController = null
}

// === 发送 ===
async function handleSend() {
  let text = inputText.value.trim()
  if (!text || sending.value || compacting.value) return

  // 指令拦截：/compact
  if (text === '/compact') {
    inputText.value = ''
    await handleCompact()
    return
  }

  inputText.value = ''
  sending.value = true
  abortController = new AbortController()
  // 捕获本次对话的 signal 引用：stopGeneration 会把 abortController 置 null，
  // 但这个局部 signal 引用始终有效，循环里靠它判断是否已停止。
  const signal = abortController.signal

  // 1) 用户消息：完整历史(messages)永远追加用于渲染/回看；
  //    已压缩时同步追加到 compactionMessages（发网关用）。
  const userMsg: AiChatMessage = { role: 'user', content: text }
  messages.value.push(userMsg)
  if (compactionSummary.value) compactionMessages.value.push(userMsg)
  const userItem = addRenderItem({ id: nextId(), kind: 'user', text })
  await scrollToBottom()

  let currentAssistantItem: RenderItem | null = null

  try {
    for (let step = 0; step < MAX_LOOP; step++) {
      // 用户已点停止：直接跳出，不再开新一轮 AI 推理
      if (signal.aborted) break
      const assistantItem = addRenderItem({ id: nextId(), kind: 'assistant', text: '', streaming: true })
      currentAssistantItem = assistantItem
      await scrollToBottom()

      // 卡片在实际执行到该工具时才创建（见下方执行循环），避免 AI 一次并行规划
      // 多个搜索时出现一排"等待中"卡片——用户永远只看到当前正在执行的那一个。
      const result = await streamChat(
        buildGatewayMessages(),
        buildContext(),
        (tok) => {
          assistantItem.replyText = (assistantItem.replyText ?? '') + tok
          scrollToBottom()
        },
        () => {
          // 收到 tool_calls 事件时不创建卡片，留到执行循环按序创建
        },
        selectedModel.value ?? undefined,
        (think) => {
          assistantItem.thinkText = (assistantItem.thinkText ?? '') + think
          thinkExpanded.value.add(assistantItem.id)
          scrollToBottom()
        },
        (usage: AiUsage) => {
          // 记录单步真实 usage（agent 一轮可能多步，循环结束才提交本轮）
          recordStepUsage(assistantItem.id, usage)
        },
        signal,
      )

      assistantItem.streaming = false
      currentAssistantItem = null
      thinkExpanded.value.delete(assistantItem.id)

      const assistantMsg: AiChatMessage = {
        role: 'assistant',
        // OpenAI 协议规范：assistant 带 tool_calls 时 content 应为 null，不是空串。
        // 部分国产网关对空 content 严格校验，发 '' 会报 "zero-length empty document" 500。
        content: result.content || null,
        ...(result.toolCalls.length > 0 ? { tool_calls: result.toolCalls } : {}),
      }
      messages.value.push(assistantMsg)
      if (compactionSummary.value) compactionMessages.value.push(assistantMsg)

      if (result.toolCalls.length === 0) break
      // 用户已点停止：不再执行后续工具，跳出循环
      if (signal.aborted) break

      for (const call of result.toolCalls) {
        // 执行到该工具时才创建卡片并立即设为 running，避免提前渲染一排"等待中"
        const item = addRenderItem({ id: nextId(), kind: 'tool', toolCall: call, toolStatus: 'running' })
        await nextTick()
        scrollToBottom()
        let output: string
        try {
          output = await executeTool(
            call,
            (msg) => {
              // 流式工具（web_search）的进度回调：更新当前工具卡片
              item.toolProgress = msg
            },
            signal,
          )
          item.toolStatus = 'success'; item.toolResult = output; item.toolProgress = undefined
          message.success(`已执行：${call.function.name}`)
        } catch (e) {
          // 用户停止导致的 AbortError：把卡片置为已中断，跳出工具循环
          if (e instanceof DOMException && e.name === 'AbortError') {
            item.toolStatus = 'error'; item.toolResult = '已停止'; item.toolProgress = undefined
            break
          }
          output = JSON.stringify({ ok: false, error: e instanceof Error ? e.message : '执行失败' })
          item.toolStatus = 'error'; item.toolResult = output; item.toolProgress = undefined
          message.error(`工具执行失败：${call.function.name}`)
        }
        const toolMsg: AiChatMessage = { role: 'tool', tool_call_id: call.id, content: output } as AiChatMessage
        messages.value.push(toolMsg)
        if (compactionSummary.value) compactionMessages.value.push(toolMsg)
      }
    }
  } catch (e) {
    // 用户主动停止：保留已生成的部分回复（落库，下次继续聊 AI 还能看到），不报错
    const isAborted = e instanceof DOMException && e.name === 'AbortError'
    if (currentAssistantItem) {
      currentAssistantItem.streaming = false
      if (isAborted && currentAssistantItem.replyText && currentAssistantItem.replyText.trim()) {
        // 中断时 streamChat 抛异常、不会走到下面的 push；这里补 push 已生成的部分回复
        const partial: AiChatMessage = { role: 'assistant', content: currentAssistantItem.replyText }
        messages.value.push(partial)
        if (compactionSummary.value) compactionMessages.value.push(partial)
      } else if (!currentAssistantItem.text && !currentAssistantItem.replyText && !currentAssistantItem.thinkText) {
        renderItems.value = renderItems.value.filter((r) => r.id !== currentAssistantItem!.id)
      }
    }
    if (!isAborted) {
      message.error(e instanceof Error ? e.message : 'AI 对话失败')
    } else {
      message.info('已停止生成')
    }
  } finally {
    sending.value = false
    abortController = null
    // 一轮对话结束（不管 agent 内部走了几步），统一用本轮最大 prompt 步提交。
    // 避免多步重复历史被累加导致 total 虚高、rounds 虚高。
    commitRoundUsage()
    await scrollToBottom()
    await nextTick()
    inputRef.value?.focus?.()
    void persistConversation()
  }
  void userItem
}

// 点击快捷指令：填入输入框（/compact 直接执行）
function applyQuickCmd(cmd: QuickCmd) {
  if (cmd.insert === '/compact') {
    handleCompact()
    return
  }
  inputText.value = cmd.insert
}

// === 历史持久化 ===
const historyLoaded = ref(false)
const historyLoading = ref(false)
async function loadHistory() {
  if (!props.postId) {
    messages.value = []
    renderItems.value = []
    thinkExpanded.value.clear()
    resetTokenStats()
    historyLoaded.value = true
    return
  }
  historyLoading.value = true
  try {
    const res = await getConversationByPostId(props.postId)
    const data = res.data
    if (data && Array.isArray(data.messages) && data.messages.length > 0) {
      messages.value = data.messages as AiChatMessage[]
      rebuildRenderFromHistory()
      // 恢复两套 token 口径 + 轮次：
      // - total（审计）/ last（进度条当前占用），全部来自网关真实值。
      // 避免重开后统计清零、却把历史原样带上网关，导致上下文实际已逼近上限而无预警。
      tokenStats.totalPrompt = Number(data.promptTokens ?? 0) || 0
      tokenStats.totalCompletion = Number(data.completionTokens ?? 0) || 0
      tokenStats.lastPrompt = Number(data.lastPromptTokens ?? 0) || 0
      tokenStats.lastCompletion = Number(data.lastCompletionTokens ?? 0) || 0
      tokenStats.rounds = Number(data.rounds ?? 0) || 0
      // 恢复压缩状态：摘要 + 压缩点之后的新对话（发网关用）
      compactionSummary.value = data.compactionSummary ?? null
      compactionMessages.value = Array.isArray(data.compactionMessages)
        ? (data.compactionMessages as AiChatMessage[])
        : []
      compactionTokens.value = Number(data.compactionTokens ?? 0) || 0
      compactionReleasedAt.value = data.compactedAt ?? null
    }
  } catch { /* 静默 */ }
  finally {
    historyLoaded.value = true
    historyLoading.value = false
    // 面板未打开时 scrollBody 为 null（column-reverse 下打开即 scrollTop=0 在底部，无需滚动）。
    // 仅在面板恰好已打开、新加载了历史时滚一下。
    if (open.value) await scrollToBottom()
  }
}

function rebuildRenderFromHistory() {
  renderItems.value = []
  thinkExpanded.value.clear()
  const toolResults = new Map<string, string>()
  for (const m of messages.value) {
    if (m.role === 'tool' && m.tool_call_id) toolResults.set(m.tool_call_id, m.content)
  }
  for (const m of messages.value) {
    if (m.role === 'user') {
      addRenderItem({ id: nextId(), kind: 'user', text: m.content })
    } else if (m.role === 'assistant') {
      // 纯工具调用轮（content 为空）：不渲染空 assistant 占位，否则留出空头像行导致工具卡片失去对齐参照
      const hasText = !!(m.content && m.content.trim())
      if (hasText) addRenderItem({ id: nextId(), kind: 'assistant', replyText: m.content || '', streaming: false })
      if (m.tool_calls) {
        for (const tc of m.tool_calls) {
          const result = toolResults.get(tc.id)
          addRenderItem({ id: nextId(), kind: 'tool', toolCall: tc, toolStatus: result ? 'success' : 'pending', toolResult: result })
        }
      }
    }
  }
}

async function persistConversation(newPostId?: number): Promise<void> {
  const pid = newPostId ?? props.postId
  if (!pid) return
  if (messages.value.length === 0) return
  try {
    // 一并落库两套 token 口径、轮次与压缩状态。
    // total（审计）/ last（进度条当前占用）都来自网关真实值。
    await saveConversation({
      postId: pid,
      messages: messages.value,
      model: selectedModel.value ?? undefined,
      promptTokens: tokenStats.totalPrompt,
      completionTokens: tokenStats.totalCompletion,
      lastPromptTokens: tokenStats.lastPrompt,
      lastCompletionTokens: tokenStats.lastCompletion,
      rounds: tokenStats.rounds,
      ...(compactionSummary.value
        ? {
            compactionSummary: compactionSummary.value,
            compactionMessages: compactionMessages.value,
            compactionTokens: compactionTokens.value,
          }
        : {}),
    })
  } catch { /* 静默 */ }
}

defineExpose({ persistConversation })

onMounted(() => { loadProviders(); document.addEventListener('click', closeDropdowns) })
watch(() => props.postId, () => { historyLoaded.value = false; loadHistory() }, { immediate: true })
onBeforeUnmount(() => {
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', stopDrag)
  document.removeEventListener('click', closeDropdowns)
  // 离开页面/卸载前把当前对话落库，避免未点"保存文章"就关闭导致丢失
  void persistConversation()
})
function closeDropdowns() { provDropdownOpen.value = false; modelDropdownOpen.value = false; slashMenuOpen.value = false }

function toggleThink(id: string) {
  if (thinkExpanded.value.has(id)) thinkExpanded.value.delete(id)
  else thinkExpanded.value.add(id)
}
async function scrollToBottom() {
  await nextTick()
  if (!scrollBody.value) return
  // column-reverse 布局下，scrollTop=0 即"最新消息处（视觉底部）"。
  // 新消息追加后默认就在底部，这里只需把用户拉回最新位置。
  scrollBody.value.scrollTop = 0
}

// 双向浮动按钮：根据用户滚动方向，自动切换"回顶部"/"回底部"
// 注意：panel-body 用 column-reverse，Chromium 下 scrollTop 语义为：
//   scrollTop = 0      → 视觉底部（最新消息）
//   scrollTop 为负数   → 向上看历史（越负越靠上）
// 视觉滚动方向与 scrollTop 变化：
//   视觉向下滚（看更新）= scrollTop 变大（趋向 0）
//   视觉向上滚（看历史）= scrollTop 变小（更负）
// 按钮箭头跟随用户滚动方向（直觉），点击则回到相反端。
const showBackBtn = ref(false)
// arrowDown 表示箭头朝向，跟随用户视觉滚动方向，点击行为也按此方向
const arrowDown = ref(true)
let lastScrollTop = 0
function onScroll() {
  if (!scrollBody.value) return
  const el = scrollBody.value
  const top = el.scrollTop
  const max = el.scrollHeight - el.clientHeight
  const nearBottom = top > -60            // 靠近最新
  const nearTop = top <= -(max - 60)      // 靠近最旧
  const scrollingUp = top < lastScrollTop // 视觉向上滚
  lastScrollTop = top
  if (max <= 0) { showBackBtn.value = false; return }
  if (nearBottom) { showBackBtn.value = false; return }
  if (nearTop && scrollingUp) { showBackBtn.value = false; return }
  // 视觉向下滚 → 箭头朝下（点击回最新）；视觉向上滚 → 箭头朝上（点击回顶部）
  arrowDown.value = !scrollingUp
  showBackBtn.value = true
}
function onBackBtnClick() {
  if (!scrollBody.value) return
  // 点击行为 = 箭头方向：向下箭头→滚向最新(0)；向上箭头→滚向最旧(-max)
  if (arrowDown.value) {
    scrollBody.value.scrollTo({ top: 0, behavior: 'smooth' })
  } else {
    scrollBody.value.scrollTo({ top: -scrollBody.value.scrollHeight, behavior: 'smooth' })
  }
}
function onInputKeydown(e: KeyboardEvent) {
  // 斜杠菜单打开时优先处理（方向键/回车/Tab/Esc），拦截默认 Enter 发送
  if (onSlashMenuKeydown(e)) return
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
}
</script>

<template>
  <!-- 悬浮触发器 -->
  <div class="robot-trigger" :class="{ active: open, dark: isDark }" @click="togglePanel">
    <i class="ico" :style="{ fontSize: 22 + 'px' }"><SparklesOutline /></i>
    <span v-if="!open && !sending" class="robot-pulse" />
    <span v-if="sending || compacting" class="robot-badge" />
  </div>

  <transition name="panel">
    <div
      v-if="open"
      class="agent-panel"
      :class="{ dark: isDark }"
      :style="{ left: panelPos.left + 'px', top: panelPos.top + 'px' }"
    >
      <!-- 头部 -->
      <div class="panel-head" @mousedown="startDrag">
        <div class="head-title">
          <i class="ico head-icon" :style="{ fontSize: 16 + 'px' }"><SparklesOutline /></i>
          <span class="head-name">{{ title }}</span>
          <span v-if="tokenStats.rounds > 0" class="head-mini-info">{{ tokenStats.rounds }}轮</span>
        </div>
        <div class="head-actions">
          <button class="head-btn" @click.stop="open = false" title="收起">
            <i class="ico" :style="{ fontSize: 15 + 'px' }"><RemoveOutline /></i>
          </button>
        </div>
      </div>

      <!-- 消息流 -->
      <div ref="scrollBody" class="panel-body" @scroll="onScroll">
        <!-- 历史加载中 -->
        <div v-if="historyLoading" class="history-loading">
          <i class="ico spin" :style="{ fontSize: 18 + 'px' }"><SyncOutline /></i>
          <span>加载历史对话…</span>
        </div>
        <div v-else-if="renderItems.length === 0" class="empty-hint">
          <div class="empty-icon"><i class="ico" :style="{ fontSize: 22 + 'px' }"><SparklesOutline /></i></div>
          <p class="empty-title">{{ title }}</p>
          <p class="empty-desc">{{ subtitle }}</p>
          <div class="empty-tips">
            <span v-for="tip in tips" :key="tip" class="tip-chip">{{ tip }}</span>
          </div>
        </div>

        <template v-for="item in reversedRenderItems" :key="item.id">
          <!-- 用户消息：靠右，头像在气泡右边 -->
          <div v-if="item.kind === 'user'" class="msg msg-user">
            <div class="bubble-wrap">
              <div class="bubble bubble-user">{{ item.text }}</div>
            </div>
            <div class="avatar avatar-user">{{ userInitial }}</div>
          </div>

          <!-- AI 消息：靠左，头像在气泡左边 -->
          <div v-else-if="item.kind === 'assistant'" class="msg msg-ai">
            <div class="avatar avatar-ai" :class="{ thinking: item.streaming }">
              <i class="ico" :style="{ fontSize: 13 + 'px' }"><SparklesOutline /></i>
            </div>
            <div class="bubble-wrap ai-bubble-wrap">
              <div class="ai-content">
                <!-- 思考折叠块 -->
                <div v-if="item.thinkText" class="think-block" :class="{ expanded: thinkExpanded.has(item.id) || item.streaming }">
                  <div class="think-head" @click="!item.streaming && toggleThink(item.id)">
                    <i class="ico think-icon" :style="{ fontSize: 12 + 'px' }"><BulbOutline /></i>
                    <span class="think-label">思考过程</span>
                    <i v-if="!item.streaming" class="ico think-chevron" :class="{ rotated: thinkExpanded.has(item.id) }" :style="{ fontSize: 11 + 'px' }"><ChevronDownOutline /></i>
                    <span v-if="item.streaming" class="think-streaming">思考中</span>
                  </div>
                  <div class="think-collapse">
                    <div class="think-body">{{ item.thinkText }}</div>
                  </div>
                </div>
                <!-- 正式回复 -->
                <div v-if="item.replyText" class="bubble bubble-ai">
                  {{ item.replyText }}
                  <span v-if="item.streaming" class="cursor">▋</span>
                </div>
                <!-- 加载动画：claude code 风像素流——方块大小固定，横向位置/亮度不规则变化，像数据流在流动 -->
                <div v-else-if="item.streaming && !item.thinkText" class="pixel-loader">
                  <i></i><i></i><i></i><i></i><i></i><i></i>
                </div>
                <!-- 单轮 token（消息下方小字） -->
                <div v-if="itemUsage[item.id] && !item.streaming" class="item-usage">
                  ↑{{ itemUsage[item.id].promptTokens }} · ↓{{ itemUsage[item.id].completionTokens }}
                </div>
              </div>
            </div>
          </div>

          <!-- 工具调用：带头像，与 AI 文本气泡结构一致（avatar + content） -->
          <div v-else class="msg msg-tool">
            <div class="avatar avatar-ai avatar-tool">
              <i class="ico" :style="{ fontSize: 13 + 'px' }"><SparklesOutline /></i>
            </div>
            <div class="tool-card-wrap">
              <ToolCallCard :call="item.toolCall!" :status="item.toolStatus || 'pending'" :result="item.toolResult" :progress="item.toolProgress" />
            </div>
          </div>
        </template>
      </div>

      <!-- 双向浮动按钮：放在 panel-body 外，用 absolute 定位，不受 column-reverse 影响 -->
      <transition name="back-top">
        <button
          v-if="showBackBtn"
          class="back-top-btn"
          :title="arrowDown ? '回到最新' : '回到顶部'"
          @click="onBackBtnClick"
        >
          <i class="ico" :style="{ fontSize: 16 + 'px' }"><ArrowDownOutline v-if="arrowDown" /><ArrowUpOutline v-else /></i>
        </button>
      </transition>

      <!-- 底部：快捷指令 + token统计 + 输入 -->
      <div class="panel-footer">
        <!-- 快捷指令按钮 + 模型选择下拉（同一行） -->
        <div class="quick-cmds">
          <button
            v-for="cmd in quickCmds"
            :key="cmd.label"
            class="quick-btn"
            :disabled="sending || compacting"
            :title="cmd.desc"
            @click="applyQuickCmd(cmd)"
          >
            <i class="ico" :style="{ fontSize: 13 + 'px' }"><component :is="cmd.icon" /></i>
            <span>{{ cmd.label }}</span>
          </button>
          <!-- 提供商下拉 -->
          <div class="custom-select" @click.stop="provDropdownOpen = !provDropdownOpen">
            <div class="cs-trigger">
              <span class="cs-text">{{ activeProvider?.name || '提供商' }}</span>
              <i class="ico" :style="{ fontSize: 12 + 'px' }"><ChevronDownOutline /></i>
            </div>
            <div v-if="provDropdownOpen" class="cs-menu" @click.stop>
              <div
                v-for="p in providers" :key="p.id"
                class="cs-option"
                :class="{ active: selectedProviderId === p.id }"
                @click.stop="selectProvider(p.id)"
              >{{ p.name }}</div>
            </div>
          </div>
          <!-- 模型下拉 -->
          <div class="custom-select model-select" @click.stop="modelDropdownOpen = !modelDropdownOpen">
            <div class="cs-trigger">
              <span class="cs-text">{{ activeModelLabel || '模型' }}</span>
              <i class="ico" :style="{ fontSize: 12 + 'px' }"><ChevronDownOutline /></i>
            </div>
            <div v-if="modelDropdownOpen" class="cs-menu" @click.stop>
              <div
                v-for="m in modelOptions" :key="m.value"
                class="cs-option"
                :class="{ active: selectedModel === m.value }"
                @click.stop="selectModel(m.value)"
              >{{ m.label }}</div>
              <div v-if="modelOptions.length === 0" class="cs-option disabled">无可用模型</div>
            </div>
          </div>
        </div>

        <div class="panel-input">
          <!-- 斜杠命令菜单（输入 / 触发，绝对定位于输入框上方） -->
          <div v-if="slashMenuOpen && slashMatches.length > 0" class="slash-menu" @click.stop>
            <div
              v-for="(cmd, i) in slashMatches" :key="cmd.name"
              class="slash-item" :class="{ active: i === slashMenuIndex }"
              @click="selectSlashCommand(cmd)" @mouseenter="slashMenuIndex = i"
            >
              <i class="ico slash-icon" :style="{ fontSize: 13 + 'px' }"><component :is="cmd.icon" /></i>
              <span class="slash-name">{{ cmd.name }}</span>
              <span class="slash-desc">{{ cmd.desc }}</span>
            </div>
          </div>
          <!-- 输入框 + 发送按钮一体化容器：共享边框和圆角，彻底消除对齐问题 -->
          <div class="input-composer" :class="{ focused: inputFocused }">
            <textarea
              ref="inputRef"
              v-model="inputText"
              class="chat-input"
              rows="1"
              :placeholder="compacting ? '正在压缩历史…' : '输入指令，/ 查看命令，Enter 发送'"
              :disabled="sending || compacting"
              @keydown.capture="onInputKeydown"
              @input="autoResizeInput"
              @focus="inputFocused = true"
              @blur="inputFocused = false"
            ></textarea>
            <!-- 发送 / 停止 按钮：ChatGPT 风圆形上箭头，嵌在输入容器右下角 -->
            <button
              v-if="sending"
              class="send-btn stop-btn"
              title="停止生成"
              @click="stopGeneration"
            >
              <i class="ico" :style="{ fontSize: 14 + 'px' }"><StopOutline /></i>
            </button>
            <button
              v-else
              class="send-btn"
              :class="{ disabled: !inputText.trim() || compacting }"
              :disabled="!inputText.trim() || compacting"
              @click="handleSend"
            >
              <i class="ico" :style="{ fontSize: 15 + 'px' }"><ArrowUpSharp /></i>
            </button>
          </div>
        </div>

        <!-- 会话级 token 统计 + 上下文占用进度条 -->
        <div v-if="tokenStats.rounds > 0" class="ctx-foot">
          <!-- 第一行：累计消耗（算钱用）+ 摘要胶囊 -->
          <span class="ctx-stat">
            <span class="ctx-rounds">
              <i class="ico" :style="{ fontSize: 11 + 'px' }"><LayersOutline /></i>
              {{ tokenStats.rounds }}轮
            </span>
            <!-- 摘要胶囊：和轮次同属元信息，放一起 -->
            <span
              v-if="compactionSummary"
              class="ctx-pill-compacted"
              :title="`历史已摘要化（释放约 ${formatTokens(compactionTokens)} token）${compactionReleasedAt ? ' · ' + formatCompactTime(compactionReleasedAt) : ''}`"
            >
              <i class="ico" :style="{ fontSize: 11 + 'px' }"><DocumentTextOutline /></i>
              摘要-{{ formatTokens(compactionTokens) }}
            </span>
            <span class="ctx-divider">·</span>
            <span class="ctx-tokens">
              <span class="ctx-tok-up">↑{{ formatTokens(tokenStats.totalPrompt) }}</span>
              <span class="ctx-tok-down">↓{{ formatTokens(tokenStats.totalCompletion) }}</span>
            </span>
          </span>
          <!-- 第二行：上下文占用进度条（防溢出用，对齐模型 maxContextTokens） -->
          <div v-if="contextLimit > 0" class="ctx-progress" :class="{ warn: contextWarn }">
            <span class="ctx-progress-label">上下文</span>
            <div class="ctx-progress-bar">
              <div class="ctx-progress-fill" :style="{ width: contextPercent + '%' }"></div>
            </div>
            <span class="ctx-progress-text"><span class="used">{{ formatTokens(contextUsed) }}</span> / {{ formatTokens(contextLimit) }}</span>
            <span class="ctx-progress-pct">{{ contextPercent }}%</span>
          </div>
        </div>
      </div>

      <!-- /model 模型选择弹窗（面板内部，绝对定位覆盖面板区域） -->
      <transition name="picker">
        <div
          v-if="modelPickerOpen"
          class="picker-mask"
          tabindex="-1"
          @click.self="modelPickerOpen = false"
          @keydown="onModelPickerKeydown"
          @vue:mounted="($event as any).el?.focus?.()"
        >
          <div class="picker-dialog">
            <div class="picker-head">
              <span class="picker-title">选择模型</span>
              <span class="picker-hint">↑↓ 选择 · Enter 确认 · Esc 关闭</span>
              <button class="picker-close" @click="modelPickerOpen = false"><i class="ico" :style="{ fontSize: 16 + 'px' }"><RemoveOutline /></i></button>
            </div>
            <div class="picker-body">
              <div v-for="p in providers" :key="p.id" class="picker-group">
                <div class="picker-group-name">{{ p.name }}</div>
                <div
                  v-for="m in (p.models || [])" :key="p.id + '-' + m.modelId"
                  ref="pickerModelEls"
                  class="picker-model"
                  :class="{ active: pickerFlatIndex(p.id, m.modelId) === modelPickerIndex }"
                  @click="pickModelFromDialog(p.id, m.modelId)"
                  @mouseenter="modelPickerIndex = pickerFlatIndex(p.id, m.modelId)"
                >
                  <div class="picker-model-name">
                    {{ m.displayName || m.modelId }}
                    <span v-if="m.maxContextTokens" class="picker-model-ctx">{{ m.maxContextTokens >= 1000 ? (m.maxContextTokens / 1000) + 'K' : m.maxContextTokens }}</span>
                  </div>
                  <div class="picker-model-id">{{ m.modelId }}</div>
                </div>
              </div>
              <div v-if="providers.length === 0" class="picker-empty">暂无可用模型</div>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </transition>
</template>

<style scoped>
/* ===== Claude 风：暖灰米色 + 土橙强调 ===== */
/* 通用图标容器：替代 naive-ui 的 n-icon。
   用 font-size 驱动 svg 尺寸（vicons 图标 viewBox 自适应），
   line-height:0 消除 SVG 基线偏移，flex 行内对齐更稳。 */
.ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
  font-style: normal;
  vertical-align: middle;
  flex-shrink: 0;
}
.ico :deep(svg) {
  width: 1em;
  height: 1em;
  display: block;
}
/* 色彩令牌系统：浅色（Claude 米色家族）为默认基线，.dark 覆盖为深色家族。
   每个令牌语义明确：bg/surface/border/text-strong/text/text-muted/accent/warn */
.agent-panel {
  --bg:           #fafaf9;  /* 面板/消息流/页脚主背景 */
  --surface:      #ffffff;  /* AI气泡、输入框、弹窗、quick-btn 背景 */
  --surface-2:    #f0eeec;  /* 头部背景 */
  --surface-3:    #f5f5f4;  /* 次级悬停背景、think-block、tip-chip */
  --surface-4:    #e7e5e4;  /* user 气泡背景、head-mini-info */
  --border:       #e7e5e4;  /* 主分隔线/边框 */
  --border-soft:  rgba(28,25,23,0.08); /* 进度条槽、阴影描边 */
  --text:         #1c1917;  /* 主文字 */
  --text-2:       #44403c;  /* user avatar、次要强调 */
  --text-3:       #57534e;  /* quick-btn、摘要胶囊、ctx 用量 */
  --text-4:       #78716c;  /* head-btn、ctx-tok-up、hint 文字 */
  --text-5:       #a8a29e;  /* ctx-stat、placeholder、muted */
  --text-6:       #d6d3d1;  /* 分隔点、scrollbar */
  --accent:       #c15f3c;  /* 土橙主色 */
  --accent-2:     #d4724e;  /* 渐变起点 */
  --accent-hover: #a84d2e;  /* send-btn hover */
  --accent-soft:  rgba(193,95,60,0.08);
  --accent-soft-2:rgba(193,95,60,0.12);
  --accent-border:rgba(193,95,60,0.22);
  --warn:         #dc2626;
  --warn-2:       #f87171;
  --warn-soft:    rgba(220,38,38,0.1);
  --success:      #16a34a;
  --error-bg:     #fef9f9;
  --accent-bg:    #fefcfb;
  --shadow-card: 0 0 0 1px rgba(28,25,23,0.08), 0 4px 12px rgba(28,25,23,0.08), 0 24px 56px rgba(28,25,23,0.16);
  --shadow-pop:  0 8px 24px rgba(28,25,23,0.12);
  --shadow-mask: rgba(28,25,23,0.32);
}
.agent-panel.dark {
  /* Claude 深色：保留暖调，避免冷冰冰的纯黑。背景 stone-900 系列。 */
  --bg:           #1c1917;
  --surface:      #292524;
  --surface-2:    #232120;
  --surface-3:    #2c2826;
  --surface-4:    #34302e;
  --border:       #3a3532;
  --border-soft:  rgba(255,255,255,0.06);
  --text:         #f5f5f4;
  --text-2:       #e7e5e4;
  --text-3:       #d6d3d1;
  --text-4:       #a8a29e;
  --text-5:       #78716c;
  --text-6:       #57534e;
  --accent:       #e08362;
  --accent-2:     #d4724e;
  --accent-hover: #c97555;
  --accent-soft:  rgba(224,131,98,0.12);
  --accent-soft-2:rgba(224,131,98,0.18);
  --accent-border:rgba(224,131,98,0.3);
  --warn:         #f87171;
  --warn-2:       #fca5a5;
  --warn-soft:    rgba(248,113,113,0.15);
  --success:      #4ade80;
  --error-bg:     rgba(248,113,113,0.08);
  --accent-bg:    rgba(224,131,98,0.06);
  --shadow-card: 0 0 0 1px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.4), 0 24px 56px rgba(0,0,0,0.6);
  --shadow-pop:  0 8px 24px rgba(0,0,0,0.5);
  --shadow-mask: rgba(0,0,0,0.5);
}
.robot-trigger {
  /* robot 在 panel 外，独立定义变量 */
  --robot-bg: #1a1a1a;
  --robot-fg: #fafaf9;
  --robot-active: #78716c;
  --robot-ring: #d6d3d1;
  --robot-badge-border: #fafaf9;
  position: fixed; right: 24px; bottom: 24px;
  width: 48px; height: 48px; border-radius: 50%;
  background: var(--robot-bg); color: var(--robot-fg);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,0.18);
  z-index: 9999; transition: transform 0.2s, box-shadow 0.2s, background 0.2s;
}
.robot-trigger.dark {
  --robot-bg: #e7e5e4;
  --robot-fg: #1c1917;
  --robot-active: #a8a29e;
  --robot-ring: #57534e;
  --robot-badge-border: #1c1917;
}
.robot-trigger:hover { transform: scale(1.06); box-shadow: 0 6px 20px rgba(0,0,0,0.24); }
.robot-trigger.active { background: var(--robot-active); }
.robot-pulse { position: absolute; inset: -3px; border-radius: 50%; border: 2px solid var(--robot-ring); animation: robot-ring 2s ease-out infinite; }
@keyframes robot-ring { 0% { transform: scale(1); opacity: 0.7; } 100% { transform: scale(1.5); opacity: 0; } }
.robot-badge { position: absolute; top: -2px; right: -2px; width: 11px; height: 11px; border-radius: 50%; background: #c15f3c; border: 2px solid var(--robot-badge-border); animation: badge-blink 1s ease-in-out infinite; }
@keyframes badge-blink { 50% { opacity: 0.4; } }

.agent-panel {
  position: fixed; width: 480px; height: 660px; z-index: 10001;
  background: var(--bg); border-radius: 16px;
  box-shadow: var(--shadow-card);
  display: flex; flex-direction: column; overflow: visible;
}
.head-mini-info { font-size: 10.5px; color: var(--text-5); font-weight: 500; margin-left: 4px; padding: 1px 6px; background: var(--surface-4); border-radius: 4px; }

.panel-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: var(--surface-2); border-bottom: 1px solid var(--border); border-radius: 16px 16px 0 0; cursor: grab; user-select: none; }
.panel-head:active { cursor: grabbing; }
.head-title { display: inline-flex; align-items: center; gap: 9px; }
/* 图标容器：淡土橙底色圆角块，像 Claude logo 容器，比裸图标更有质感 */
.head-icon {
  width: 26px; height: 26px; border-radius: 8px;
  background: var(--accent-soft-2); color: var(--accent);
  display: flex; align-items: center; justify-content: center;
}
.head-name { font-size: 14px; font-weight: 700; color: var(--text); letter-spacing: -0.01em; }
.head-actions { display: flex; gap: 2px; }
.head-btn { width: 28px; height: 28px; border: none; background: transparent; color: var(--text-4); cursor: pointer; border-radius: 7px; display: flex; align-items: center; justify-content: center; transition: background 0.15s, color 0.15s; }
.head-btn:hover { background: var(--surface-4); color: var(--text); }
.head-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* 自定义下拉（现在位于快捷键行末尾，和按键并排） */
.custom-select { position: relative; min-width: 0; flex-shrink: 0; }
/* 供应商：宽度自适应内容，给个上下限避免太短/太长 */
.custom-select:not(.model-select) { width: auto; min-width: 72px; max-width: 110px; }
/* 模型：flex:1 撑到行尾，吸收剩余空间 */
.custom-select.model-select { flex: 1; }
.cs-trigger { min-width: 0;
  display: flex; align-items: center; gap: 3px;
  padding: 3px 7px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 12px; color: var(--text-3);
  line-height: 1.4;
  white-space: nowrap; overflow: hidden;
  height: 26px; box-sizing: border-box;
  transition: background 0.15s, color 0.15s;
}
.cs-trigger:hover { background: var(--surface-3); color: var(--text); }
/* 展开状态下保持 hover 态,避免点开菜单后触发器"消失" */
.custom-select:has(.cs-menu) .cs-trigger { min-width: 0; background: var(--surface-3); color: var(--text); }
.cs-text { overflow: hidden; text-overflow: ellipsis; }
.cs-menu { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; box-shadow: var(--shadow-pop); z-index: 10010; max-height: 200px; overflow-y: auto; }
.cs-option { padding: 7px 12px; font-size: 12px; color: var(--text); cursor: pointer; transition: background 0.12s; }
.cs-option:hover { background: var(--surface-3); }
.cs-option.active { color: var(--accent); background: var(--accent-soft); }
.cs-option.disabled { color: var(--text-5); cursor: default; }

.panel-body { position: relative; flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto; padding: 14px; display: flex; flex-direction: column-reverse; gap: 10px; background: var(--bg); }
.panel-body::-webkit-scrollbar { width: 6px; }
.panel-body::-webkit-scrollbar-thumb { background: var(--text-6); border-radius: 3px; transition: background 0.15s; }
.panel-body::-webkit-scrollbar-thumb:hover { background: var(--text-5); }
.panel-body::-webkit-scrollbar-track { background: transparent; }
/* 历史加载占位 */
.history-loading { margin: auto; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 24px 0; color: var(--text-5); font-size: 12px; }
.history-loading .spin { animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
/* 双向浮动按钮：absolute 定位浮在 panel-body 右下角（footer 上方），
   不放在 panel-body 内，避免受 column-reverse 布局影响 */
.back-top-btn {
  position: absolute; right: 14px; bottom: 150px;
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--border); border-radius: 50%;
  background: var(--surface); color: var(--text-2); cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
  z-index: 10;
}
.back-top-btn:hover { background: var(--accent); color: #fff; box-shadow: 0 2px 10px rgba(193,95,60,0.35); }
.back-top-enter-active, .back-top-leave-active { transition: opacity 0.2s, transform 0.2s; }
.back-top-enter-from, .back-top-leave-to { opacity: 0; transform: translateY(6px); }

.empty-hint { margin: auto; text-align: center; }
.empty-icon { width: 44px; height: 44px; margin: 0 auto 10px; border-radius: 12px; background: var(--surface-3); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; color: var(--accent); }
.empty-title { margin: 0; font-size: 14px; font-weight: 600; color: var(--text); }
.empty-desc { margin: 3px 0 10px; font-size: 11.5px; color: var(--text-4); }
.empty-tips { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.tip-chip { font-size: 11px; padding: 3px 9px; border-radius: 6px; background: var(--surface-3); border: 1px solid var(--border); color: var(--text-3); }

.msg { display: flex; gap: 7px; max-width: 100%; align-items: flex-start; }
/* 用户消息靠右 */
.msg-user { justify-content: flex-end; }
/* AI 消息靠左 */
.msg-ai { justify-content: flex-start; }
/* 工具调用：和 AI 消息一样 avatar + content 左对齐，不再用 padding-left 硬缩进 */
.msg-tool { justify-content: flex-start; }
.tool-card-wrap { flex: 1; min-width: 0; }

.bubble-wrap { display: flex; align-items: flex-end; max-width: 80%; }
.ai-bubble-wrap { flex-direction: column; align-items: flex-start; }
.msg-ai .ai-content { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; }

.avatar { flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: #fff; width: 28px; height: 28px; border-radius: 50%; }
/* AI 头像：土橙微渐变，更立体，不破坏 Claude 暖色调 */
.avatar-ai { background: linear-gradient(135deg, var(--accent-2) 0%, var(--accent) 100%); box-shadow: 0 1px 3px rgba(193,95,60,0.3); }
.avatar-ai.thinking { animation: avatar-pulse 1.4s ease-in-out infinite; }
@keyframes avatar-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(193,95,60,0.4); } 50% { box-shadow: 0 0 0 6px rgba(193,95,60,0); } }
.avatar-user { background: var(--text-2); font-size: 12px; font-weight: 600; }

.bubble { padding: 9px 13px; border-radius: 12px; font-size: 13px; line-height: 1.6; word-break: break-word; white-space: pre-wrap; }
.bubble-user { background: var(--surface-4); color: var(--text); border-top-right-radius: 4px; }
.bubble-ai { background: var(--surface); color: var(--text); border: 1px solid var(--border); border-top-left-radius: 4px; display: inline-block; }

/* 单轮 token 小字 */
.item-usage { font-size: 10.5px; color: var(--text-5); margin-top: 3px; padding: 0 4px; font-family: 'SF Mono', 'Menlo', 'Consolas', monospace; }

/* 思考折叠块 */
.think-block { width: 100%; border-radius: 8px; border-top-left-radius: 4px; background: var(--surface-3); border: 1px solid var(--border); overflow: hidden; margin-bottom: 5px; }
.think-head { display: flex; align-items: center; gap: 5px; padding: 6px 10px; cursor: pointer; user-select: none; font-size: 11px; color: var(--text-4); }
.think-icon { color: var(--accent); }
.think-label { font-weight: 500; }
.think-chevron { margin-left: auto; transition: transform 0.25s; color: var(--text-5); }
.think-chevron.rotated { transform: rotate(180deg); }
.think-streaming { margin-left: auto; color: var(--accent); font-size: 10px; display: inline-flex; align-items: center; gap: 3px; }
.think-streaming::after { content: ''; width: 4px; height: 4px; border-radius: 50%; background: var(--accent); animation: think-dot 1s ease-in-out infinite; }
@keyframes think-dot { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
/* 思考正文：padding 和 border 也参与过渡，折叠时归零，彻底消除残留高度 */
.think-body {
  padding: 0 10px;
  border-top: 0px solid transparent;
  font-size: 11.5px; line-height: 1.65; color: var(--text-4);
  white-space: pre-wrap; word-break: break-word;
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  transition: max-height 0.28s cubic-bezier(0.16, 1, 0.3, 1),
              opacity 0.2s ease,
              padding 0.28s cubic-bezier(0.16, 1, 0.3, 1),
              border-top-width 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}
.think-block.expanded .think-body {
  padding: 7px 10px 8px;
  border-top-width: 1px;
  border-top-style: dashed;
  border-top-color: var(--border);
  max-height: 400px;
  opacity: 1;
}

/* claude code 风像素流：6 个固定大小方块，各自横向位置 + 亮度不规则跳变。
   不是转圈、不是直线扫描，而是像素在游走、聚散，像数据流在涌动。
   每个方块独立 keyframes + 不同时长，避免整齐划一的机械感。 */
.pixel-loader {
  display: inline-flex; align-items: center;
  height: 12px;                   /* 固定容器高度，方块垂直居中，永不撑大气泡 */
  padding: 13px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px; border-top-left-radius: 4px;
  overflow: hidden;
}
.pixel-loader i {
  width: 4px; height: 4px;        /* 方块大小永远不变 */
  background: var(--accent);
  border-radius: 1px;
  margin: 0 1px;
  flex-shrink: 0;
  opacity: 0.15;
  animation: px-drift 1.4s infinite;
}
/* 每个方块用不同时长 + 负延迟，让它们各自独立游走，形成不规则的像素流 */
.pixel-loader i:nth-child(1) { animation-duration: 1.1s; animation-delay: 0s; }
.pixel-loader i:nth-child(2) { animation-duration: 0.9s; animation-delay: -0.3s; }
.pixel-loader i:nth-child(3) { animation-duration: 1.3s; animation-delay: -0.6s; }
.pixel-loader i:nth-child(4) { animation-duration: 1.0s; animation-delay: -0.15s; }
.pixel-loader i:nth-child(5) { animation-duration: 1.2s; animation-delay: -0.45s; }
.pixel-loader i:nth-child(6) { animation-duration: 0.95s; animation-delay: -0.75s; }
/* transform: translateX 让方块在 ±2px 范围内游走，配合 opacity 闪烁，
   视觉上像素在聚散流动，像贪吃蛇身体时短时长 */
@keyframes px-drift {
  0%   { opacity: 0.15; transform: translateX(0); }
  25%  { opacity: 1;    transform: translateX(2px); }
  50%  { opacity: 0.4;  transform: translateX(-1px); }
  75%  { opacity: 0.9;  transform: translateX(1px); }
  100% { opacity: 0.15; transform: translateX(0); }
}

.cursor { display: inline-block; color: var(--accent); margin-left: 1px; animation: blink 0.9s steps(2) infinite; }
@keyframes blink { 50% { opacity: 0; } }

/* 底部 */
.panel-footer { border-top: 1px solid var(--border); background: var(--bg); border-radius: 0 0 16px 16px; }
.quick-cmds { display: flex; gap: 6px; padding: 8px 12px 0; align-items: center; min-width: 0; overflow: hidden; }
.quick-btn { display: inline-flex; align-items: center; gap: 4px; padding: 4px 9px; border: 1px solid var(--border); background: var(--surface); color: var(--text-3); font-size: 11px; border-radius: 6px; cursor: pointer; transition: all 0.15s; flex-shrink: 0; height: 26px; box-sizing: border-box; }
.quick-btn:hover { background: var(--surface-3); border-color: var(--text-6); color: var(--text); }
.quick-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.panel-input {
  padding: 8px 12px; position: relative;
}
/* 一体化输入容器：textarea 和发送按钮共享同一外框/圆角/背景，
   彻底解决两者独立圆角导致的高度/对齐错位。聚焦光环作用于整个容器。 */
.input-composer {
  display: flex; align-items: flex-end; gap: 4px;
  padding: 5px 5px 5px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.input-composer.focused {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft-2);
}
/* textarea 无独立边框，由 .input-composer 统一提供。
   overflow 默认 hidden 避免单行 1px 滚动条，has-scroll 满 4 行后切 auto。 */
.chat-input {
  flex: 1; min-width: 0;
  padding: 6px 0;
  border: none; background: transparent;
  color: var(--text);
  font-size: 13px; line-height: 1.5;
  font-family: inherit;
  resize: none; outline: none;
  min-height: 24px;        /* 单行内容高度 */
  max-height: 96px;        /* maxRows≈4 行 */
  overflow-y: hidden;
}
.chat-input.has-scroll { overflow-y: auto; }
.chat-input::placeholder { color: var(--text-5); }
.chat-input:disabled { opacity: 0.6; cursor: not-allowed; }

/* 斜杠命令菜单 */
.slash-menu { position: absolute; bottom: calc(100% + 4px); left: 12px; right: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; box-shadow: var(--shadow-pop); z-index: 10010; overflow: hidden; }
.slash-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; transition: background 0.12s; border-left: 2px solid transparent; }
.slash-item:hover { background: var(--surface-3); }
.slash-item.active { background: var(--accent-soft); color: var(--accent); border-left-color: var(--accent); }
.slash-icon { flex-shrink: 0; color: var(--text-4); }
.slash-item.active .slash-icon { color: var(--accent); }
.slash-name { font-size: 12px; font-weight: 600; color: var(--text); white-space: nowrap; }
.slash-desc { font-size: 11px; color: var(--text-5); margin-left: auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* ChatGPT 风圆形发送按钮：嵌在 input-composer 右下角，上箭头暗示"发送"。
   圆形 + 实心强调色，输入为空时降透明度。 */
.send-btn {
  flex-shrink: 0;
  width: 30px; height: 30px;
  margin-bottom: 2px;
  border: none; border-radius: 50%;
  background: var(--accent); color: #fff;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, opacity 0.15s, transform 0.1s;
}
.send-btn:hover:not(.disabled) { background: var(--accent-hover); }
.send-btn:active:not(.disabled) { transform: scale(0.9); }
.send-btn.disabled { opacity: 0.3; cursor: not-allowed; }
/* 停止按钮：sending 期间替代发送按钮，红色 + 呼吸感，明确可点击终止 */
.send-btn.stop-btn { background: var(--warn); animation: stop-breath 1.4s ease-in-out infinite; }
.send-btn.stop-btn:hover { background: var(--warn); filter: brightness(0.88); }
@keyframes stop-breath {
  0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); }
  50%      { box-shadow: 0 0 0 4px rgba(220, 38, 38, 0.2); }
}

/* 底部 token 统计 + 上下文进度条 */
.ctx-foot { padding: 4px 14px 9px; display: flex; flex-direction: column; gap: 5px; }
.ctx-stat { display: flex; align-items: center; gap: 6px; font-size: 10.5px; color: var(--text-5); font-family: 'SF Mono', 'Menlo', 'Consolas', monospace; }
/* 统一胶囊规范：固定高度 18px，圆角 5px，inline-flex 居中。
   内部 .ico 已内置 line-height:0，无需额外覆盖。 */
.ctx-rounds, .ctx-pill-compacted {
  display: inline-flex; align-items: center; gap: 3px;
  height: 18px; padding: 0 7px; box-sizing: border-box;
  border-radius: 5px; font-size: 10px; font-weight: 600; line-height: 1;
  white-space: nowrap; flex-shrink: 0;
  border: 1px solid transparent;
}
/* 轮次：土橙主色家族 */
.ctx-rounds {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: var(--accent-border);
}
/* 摘要：暖琥珀次色家族，与轮次区分但同属暖色系 */
.ctx-pill-compacted {
  background: var(--border-soft);
  color: var(--text-3);
  border-color: var(--border);
  font-weight: 500;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  cursor: help;
}
.ctx-divider { color: var(--text-6); }
.ctx-tokens { display: inline-flex; gap: 6px; }
.ctx-tok-up { color: var(--text-4); }
.ctx-tok-down { color: var(--text-5); }
/* 上下文进度条：单行紧凑，无底色，进度条 flex 自适应。
   结构：标签 | 进度条…… | 当前/上限 | 百分比胶囊 */
.ctx-progress { display: flex; align-items: center; gap: 8px; }
.ctx-progress-label {
  font-size: 10.5px; color: var(--text-5); font-weight: 600; flex-shrink: 0;
}
.ctx-progress.warn .ctx-progress-label { color: var(--warn); }
.ctx-progress-bar {
  flex: 1; min-width: 40px; height: 4px;
  background: var(--border-soft); border-radius: 999px; overflow: hidden;
}
.ctx-progress-fill {
  height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, var(--accent-2), var(--accent));
  box-shadow: 0 0 0 1px var(--accent-soft-2);
  transition: width 0.4s cubic-bezier(0.16,1,0.3,1), background 0.2s;
}
.ctx-progress.warn .ctx-progress-fill {
  background: linear-gradient(90deg, var(--warn-2), var(--warn));
}
.ctx-progress-text {
  font-size: 10px; color: var(--text-5); flex-shrink: 0;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
.ctx-progress-text .used { color: var(--text-3); font-weight: 600; }
.ctx-progress.warn .ctx-progress-text .used { color: var(--warn); }
.ctx-progress-pct {
  font-size: 10px; color: var(--accent); font-weight: 700; flex-shrink: 0;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  font-variant-numeric: tabular-nums;
}
.ctx-progress.warn .ctx-progress-pct { color: var(--warn); }

.panel-enter-active, .panel-leave-active { transition: opacity 0.25s cubic-bezier(0.16,1,0.3,1), transform 0.25s cubic-bezier(0.16,1,0.3,1); }
.panel-enter-from, .panel-leave-to { opacity: 0; transform: translateY(16px) scale(0.94); }
.msg { animation: msg-in 0.3s cubic-bezier(0.16,1,0.3,1); }
@keyframes msg-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

/* /model 模型选择弹窗 */
.picker-mask { position: absolute; inset: 0; background: var(--shadow-mask); z-index: 10020; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
.picker-dialog { width: 380px; max-height: 70vh; background: var(--bg); border-radius: 12px; box-shadow: var(--shadow-card); display: flex; flex-direction: column; overflow: hidden; }
.picker-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.picker-title { font-size: 13.5px; font-weight: 600; color: var(--text); }
.picker-hint { font-size: 10.5px; color: var(--text-5); flex: 1; text-align: center; }
.picker-close { width: 26px; height: 26px; border: none; background: transparent; color: var(--text-4); cursor: pointer; border-radius: 6px; display: flex; align-items: center; justify-content: center; }
.picker-close:hover { background: var(--surface-4); color: var(--text); }
.picker-body { flex: 1; overflow-y: auto; padding: 8px; }
.picker-body::-webkit-scrollbar { width: 6px; }
.picker-body::-webkit-scrollbar-thumb { background: var(--text-6); border-radius: 3px; }
.picker-group { margin-bottom: 4px; }
.picker-group-name { font-size: 11px; font-weight: 600; color: var(--text-5); padding: 8px 10px 4px; text-transform: uppercase; letter-spacing: 0.3px; }
.picker-model { padding: 9px 10px; border-radius: 8px; cursor: pointer; transition: background 0.12s; }
.picker-model:hover { background: var(--surface-3); }
.picker-model.active { background: var(--accent-soft); }
.picker-model-name { font-size: 12.5px; font-weight: 500; color: var(--text); display: flex; align-items: center; gap: 6px; }
.picker-model.active .picker-model-name { color: var(--accent); }
.picker-model-ctx { font-size: 9.5px; color: var(--text-5); background: var(--surface-4); padding: 1px 5px; border-radius: 3px; font-family: 'SF Mono', 'Menlo', 'Consolas', monospace; }
.picker-model-id { font-size: 10.5px; color: var(--text-5); margin-top: 2px; font-family: 'SF Mono', 'Menlo', 'Consolas', monospace; }
.picker-empty { text-align: center; color: var(--text-5); padding: 32px 0; font-size: 13px; }

.picker-enter-active, .picker-leave-active { transition: opacity 0.2s ease; }
.picker-enter-from, .picker-leave-to { opacity: 0; }
.picker-enter-active .picker-dialog, .picker-leave-active .picker-dialog { transition: transform 0.2s cubic-bezier(0.16,1,0.3,1); }
.picker-enter-from .picker-dialog, .picker-leave-to .picker-dialog { transform: scale(0.96) translateY(8px); }
</style>
