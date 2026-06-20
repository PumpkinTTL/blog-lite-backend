<script setup lang="ts">
import { ref, reactive, shallowReactive, nextTick, computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import {
  RemoveOutline,
  BulbOutline, ChevronDownOutline,
  SparklesOutline, ContractOutline, ExpandOutline, HappyOutline, ColorPaletteOutline, CubeOutline,
  StopOutline, ArrowUpSharp, ArrowUpOutline, ArrowDownOutline, SyncOutline,
} from '@vicons/ionicons5'
import { streamChat, streamCompact, streamWebSearch } from '../../api/ai'
import type { AiChatMessage, AiToolCall, AiArticleContext, AiUsage } from '../../api/ai'
import { getConversationByPostId, saveConversation } from '../../api/ai-conversation'
import { getActiveAiProviders } from '../../api/ai-provider'
import type { AiProvider } from '../../api/ai-provider'
import { isDark } from '../../theme'
import ToolCallCard from './ToolCallCard.vue'
import MarkdownStatic from './MarkdownStatic.vue'

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
const panelPos = reactive({ left: 0, top: 0 })

const form = computed<ArticleForm>(() =>
  props.formValue && 'value' in props.formValue ? props.formValue.value : (props.formValue as ArticleForm),
)

// === 对话状态 ===
const messages = ref<AiChatMessage[]>([])
const inputText = ref('')
const inputFocused = ref(false)
const isFullscreen = ref(false)
function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
}
const sending = ref(false)
const compacting = ref(false)
/** 对话中断控制器：sending 期间用户点"停止"时 abort，终止 streamChat fetch */
let abortController: AbortController | null = null
const selectedProviderId = ref<number | null>(null)
const selectedModel = ref<string | null>(null)
const providers = ref<AiProvider[]>([])

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
/** ISO 时间 → 相对时间（如「3分钟前」），超过 7 天回落为日期 */
function formatCompactTime(iso: string | null): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const diff = Date.now() - t
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return Math.floor(diff / 60_000) + '分钟前'
  if (diff < 86_400_000) return Math.floor(diff / 3600_000) + '小时前'
  if (diff < 7 * 86_400_000) return Math.floor(diff / 86_400_000) + '天前'
  // 超过 7 天：相对时间已不直观，回落为具体日期
  const d = new Date(t)
  return `${d.getMonth() + 1}月${d.getDate()}日`
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
// === 消息渲染策略 ==========================================================
//
// 使用 vue-virtual-scroller 的 DynamicScroller：库内部处理动态高度测量
// （ResizeObserver）、窗口裁剪、节点复用。scrollHeight 由库维护估算+真实高度，
// DOM 永远只有视口附近几十条，但滚动条表现成全部消息的长度。
//
// 不抖的保证：markdown-it 同步渲染，高度渲染即定；DynamicScroller 在 buffer
// 区提前测量，视口内的条目高度早已稳定。
// ==========================================================================
// scrollBody 现在绑 DynamicScroller 组件实例（非 DOM 元素），统一用 scrollEl()
// 取其内部滚动 DOM（$el）。
const scrollBody = ref<any>(null)
// 取 DS 内部滚动容器 DOM：用于 scrollTop/scrollHeight/classList 等元素操作。
function scrollEl(): HTMLElement | null {
  const s = scrollBody.value
  if (!s) return null
  return (s as any).$el ?? s
}
// DynamicScroller 配置：min-item-size 取真实最小高度估值（用户单行气泡~40px），
// buffer/prerender 给足，让视口外足够多条目提前测量好高度。
const DS_MIN_ITEM_SIZE = 40
const DS_BUFFER = 400
const DS_PRERENDER = 20

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
// 关键设计：mousemove 直接写 DOM 做零延迟视觉反馈，同时用 rAF 合并写回 panelPos
// （reactive）。style 绑定始终走 panelPos（不在拖拽时切 undefined），避免按下/松开
// 瞬间 style 绑定切换导致面板闪回旧位置。mousedown 时先把 panelPos 对齐真实 DOM
// 位置，杜绝 render 写回旧值造成的闪烁。
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
let dragPanelEl: HTMLElement | null = null
// 拖拽位置同步用的 rAF：mousemove 高频触发，直接写 DOM 做即时视觉反馈，
// 再用 rAF 合并写回 panelPos（reactive），避免每帧都触发 Vue render。
let dragPosRaf = 0
let dragPendingLeft = 0
let dragPendingTop = 0
function commitDragPos() {
  dragPosRaf = 0
  panelPos.left = dragPendingLeft
  panelPos.top = dragPendingTop
}
function onDragMove(e: MouseEvent) {
  if (!dragPanelEl) return
  const left = Math.max(0, Math.min(window.innerWidth - PANEL_W, dragStart.left + e.clientX - dragStart.x))
  const top = Math.max(0, Math.min(window.innerHeight - 48, dragStart.top + e.clientY - dragStart.y))
  // 直接写 DOM：零延迟视觉反馈，不依赖 Vue 渲染
  dragPanelEl.style.left = left + 'px'
  dragPanelEl.style.top = top + 'px'
  // rAF 合并写回 panelPos，保持 style 绑定与实际 DOM 一致（拖拽结束/下次 render 不闪）
  dragPendingLeft = left
  dragPendingTop = top
  if (!dragPosRaf) dragPosRaf = requestAnimationFrame(commitDragPos)
}
function stopDrag() {
  // 拖拽结束：把最终位置同步回 panelPos，供下次拖拽起点
  if (dragPosRaf) { cancelAnimationFrame(dragPosRaf); dragPosRaf = 0 }
  if (dragPanelEl) {
    const rect = dragPanelEl.getBoundingClientRect()
    panelPos.left = rect.left
    panelPos.top = rect.top
  }
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', stopDrag)
}
function startDrag(e: MouseEvent) {
  if (isFullscreen.value) return  // 全屏态禁拖
  ensureDefaultPos()
  const head = e.currentTarget as HTMLElement
  dragPanelEl = head.closest('.agent-panel') as HTMLElement
  if (!dragPanelEl) return
  // 从 DOM 读实际位置作为起点（与 panelPos 可能短暂不一致时也稳妥）
  const rect = dragPanelEl.getBoundingClientRect()
  // 先把 panelPos 对齐到真实位置，避免 mousedown 触发 render 时 style 绑定写回旧值导致闪
  panelPos.left = rect.left
  panelPos.top = rect.top
  dragStart = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top }
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', stopDrag)
  e.preventDefault()
}
async function togglePanel() {
  open.value = !open.value
  if (open.value) {
    ensureDefaultPos()
    await nextTick()
    const isFirst = !inited
    if (isFirst) scrollEl()?.classList.add('opening')
    // 打开即贴底，方向量清零防首次 scroll 误判
    stickToBottom = true
    lastScrollTop = 0
    scrollDirAccum = 0
    forceScrollBottom()
    // 首次打开才异步加载历史；后续重开 DOM 已在，贴底即可。
    if (isFirst) {
      requestAnimationFrame(() => {
        initOnFirstOpen().finally(() => {
          nextTick(() => {
            forceScrollBottom()
            scrollEl()?.classList.remove('opening')
          })
        })
      })
    }
  } else {
    lastScrollTop = 0
    scrollDirAccum = 0
  }
}

// === 上下文快照 ===
function buildContext(): AiArticleContext {
  const f = form.value
  return { title: f.title, subtitle: f.subtitle, summary: f.summary, slug: f.slug, content: f.content }
}

// === 渲染项（shallowReactive：顶层属性响应式以驱动流式更新，
//    深层对象如 toolCall 不做代理，大幅降低大列表的响应式追踪开销） ===
function addRenderItem(item: RenderItem): RenderItem {
  const reactiveItem = shallowReactive(item)
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
        maybeStickBottom()
      },
      (think) => {
        compactItem.thinkText = (compactItem.thinkText ?? '') + think
        thinkExpanded.value.add(compactItem.id)
        maybeStickBottom()
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
    // 压缩期间切了文章（pendingReload），结束后补触发重载
    if (pendingReload) {
      pendingReload = false
      historyLoaded.value = false
      loadHistory()
    }
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
          maybeStickBottom()
        },
        () => {
          // 收到 tool_calls 事件时不创建卡片，留到执行循环按序创建
        },
        selectedModel.value ?? undefined,
        (think) => {
          assistantItem.thinkText = (assistantItem.thinkText ?? '') + think
          thinkExpanded.value.add(assistantItem.id)
          maybeStickBottom()
        },
        (usage: AiUsage) => {
          // 记录单步真实 usage（agent 一轮可能多步，循环结束才提交本轮）
          recordStepUsage(assistantItem.id, usage)
        },
        signal,
      )

      assistantItem.streaming = false
      currentAssistantItem = null
      // 思考保持展开：不在这里 delete thinkExpanded。
      // 收起思考会让 think-body 高度突变，即便有 size-dependencies，密集的多步
      // 循环里 DS 仍可能在重测完成前用旧高度定位后续 item = 留白。
      // 常驻展开则高度恒定，DS 测量稳定。用户可手动点击 think-head 折叠。

      // 关键修复：移除「无思考无回复、直接调工具」的空 assistant item。
      // agent 多步循环里，AI 可能某步直接返回 toolCalls（无 content/think），
      // 此时 assistantItem 只剩 avatar。它在流式期间显示 pixel-loader 被DS测量，
      // 结束后 loader 消失高度骤降，但 DS 没重测 → 该 item 留白、且把后续工具
      // item 挤到错误位置。这种空 item 对用户无意义（用户看的是工具调用），直接移除。
      if (!assistantItem.replyText && !assistantItem.thinkText) {
        renderItems.value = renderItems.value.filter((r) => r.id !== assistantItem.id)
      }

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
    // 发送期间切了文章（pendingReload），结束后补触发重载
    if (pendingReload) {
      pendingReload = false
      historyLoaded.value = false
      loadHistory()
    }
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
// 历史加载竞态控制：每次 loadHistory 递增 generation，响应回来后校验是否仍是最新。
// 双保险：AbortController 主动取消上一个 in-flight 请求；generation 防止
// 已发出的请求（来不及取消）把旧数据覆盖到新文章上。
let historyGen = 0
let historyAbort: AbortController | null = null
async function loadHistory() {
  if (!props.postId) {
    abortHistory()
    messages.value = []
    renderItems.value = []
    thinkExpanded.value.clear()
    resetTokenStats()
    historyLoaded.value = true
    return
  }
  // 取消上一个 in-flight 请求，本次 generation +1
  abortHistory()
  const myGen = ++historyGen
  const myAbort = new AbortController()
  historyAbort = myAbort
  historyLoading.value = true
  try {
    const res = await getConversationByPostId(props.postId, myAbort.signal)
    // 竞态守卫：若期间又触发了新的 loadHistory（切了文章），丢弃本次结果
    if (myGen !== historyGen) return
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
  } catch {
    // 主动取消（切文章）抛 AbortError，静默；其余错误也静默保持原行为
  } finally {
    // 仅当本次仍是最新 generation 时才更新 loading 标志，避免旧请求的 finally
    // 把新请求的 loading 提前置回 false
    if (myGen === historyGen) {
      historyLoaded.value = true
      historyLoading.value = false
      // 仅在面板已打开时贴底
      if (open.value) await scrollToBottom()
    }
  }
}
/** 取消正在进行的 history 请求（切文章 / 卸载时调用） */
function abortHistory() {
  if (historyAbort) { historyAbort.abort(); historyAbort = null }
}

function rebuildRenderFromHistory() {
  renderItems.value = []
  thinkExpanded.value.clear()
  itemUsage.value = {}
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

onMounted(() => {
  document.addEventListener('click', closeDropdowns)
})
// 历史加载懒到首次打开面板时触发（避免进页面即发请求，且与打开动作合并为一次）。
// providers 同理懒加载。首次打开标志位保证只执行一次。
let inited = false
async function initOnFirstOpen() {
  if (inited) return
  inited = true
  loadProviders()
  if (props.postId) {
    historyLoaded.value = false
    await loadHistory()
  } else {
    historyLoaded.value = true
  }
}
// 发送/压缩期间切文章的待重载标志，发送结束后兜底重载
let pendingReload = false
watch(() => props.postId, () => {
  // postId 变化（切换文章）时重新加载历史；首次打开已由 initOnFirstOpen 处理。
  if (!inited) return
  // 发送/压缩进行中时切文章：streamChat 回调仍在写 messages/renderItems，
  // 此时 loadHistory 会清空并重建，导致流式输出和新历史互相污染。
  // 标记待重载，等发送结束后由 handleSend finally 触发重载。
  if (sending.value || compacting.value) {
    pendingReload = true
    return
  }
  historyLoaded.value = false
  loadHistory()
})
onBeforeUnmount(() => {
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', stopDrag)
  document.removeEventListener('click', closeDropdowns)
  // 清理流式滚动 rAF，避免卸载后回调写已销毁的 DOM
  if (stickRafId) { cancelAnimationFrame(stickRafId); stickRafId = 0 }
  if (scrollRafId) { cancelAnimationFrame(scrollRafId); scrollRafId = 0 }
  if (dragPosRaf) { cancelAnimationFrame(dragPosRaf); dragPosRaf = 0 }
  // 取消正在进行的 history 请求，避免卸载后回调写已销毁的响应式状态
  abortHistory()
  // 离开页面/卸载前把当前对话落库，避免未点"保存文章"就关闭导致丢失
  void persistConversation()
})
function closeDropdowns() { slashMenuOpen.value = false }

// === 滚动管理 ===
// DynamicScroller 负责窗口化与高度测量。这里只管：贴底判断、双向浮动按钮。

function toggleThink(id: string) {
  if (thinkExpanded.value.has(id)) thinkExpanded.value.delete(id)
  else thinkExpanded.value.add(id)
}

// 记录当前是否贴底（流式时只在贴底才 auto-scroll，避免打断用户看历史）
let stickToBottom = true

/** 即时强制贴底。DynamicScroller 内部高度测量是异步的（ResizeObserver），
 *  直接 el.scrollTop = el.scrollHeight 会读到旧高度 = 滚不到真正底部。
 *  改用 DS 官方 scrollToBottom()：内部 rAF 递归重试直到所有 item 测量收敛，
 *  且多滚 5000px 兜底。再补一帧手动设 scrollTop 双保险。 */
function forceScrollBottom() {
  stickToBottom = true
  const scroller = scrollBody.value
  if (scroller && typeof scroller.scrollToBottom === 'function') {
    scroller.scrollToBottom()
  }
  // 双保险：即便 DS 方法内部已处理，再手动补设一次（取 $el 真实滚动 DOM）
  requestAnimationFrame(() => {
    const el = scrollEl()
    if (el) el.scrollTop = el.scrollHeight
  })
}
async function scrollToBottom() {
  await nextTick()
  forceScrollBottom()
}
// 流式时调用：仅当用户当前贴底（stickToBottom）才自动滚动，
// 用户向上看历史时不打断。
// 关键：流式 token 更新触发 DOM 变化 → DS ResizeObserver 异步测高，
// 同步设 scrollTop 会读到旧 scrollHeight。所以这里用 rAF 延后到下一帧，
// 且连续追加多个 token 时合并到一次（stickRafId 去重）。
let stickRafId = 0
function maybeStickBottom() {
  if (!stickToBottom) return
  if (stickRafId) return
  stickRafId = requestAnimationFrame(() => {
    stickRafId = 0
    if (!stickToBottom) return
    // 优先用 DS 官方 scrollToBottom（内部重试到高度收敛）
    const scroller = scrollBody.value
    if (scroller && typeof scroller.scrollToBottom === 'function') {
      scroller.scrollToBottom()
    } else {
      const el = scrollEl()
      if (el) el.scrollTop = el.scrollHeight
    }
  })
}

// 双向浮动按钮
const showBackBtn = ref(false)
const arrowDown = ref(true)
let lastScrollTop = 0
let scrollDirAccum = 0
const SCROLL_DIR_THRESHOLD = 12

let scrollRafId = 0
function onScroll() {
  const el = scrollEl()
  if (!el) return
  const max = el.scrollHeight - el.clientHeight
  // 同步更新贴底状态，避免用户刚向上滚、rAF 尚未执行时，流式输出仍把视图拉回底部
  stickToBottom = max <= 0 || el.scrollTop >= max - 60
  if (scrollRafId) return
  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = 0
    updateScrollUi()
  })
}
function updateScrollUi() {
  const el = scrollEl()
  if (!el) return
  const top = el.scrollTop
  const max = el.scrollHeight - el.clientHeight
  const nearBottom = max <= 0 || top >= max - 60
  const nearTop = top <= 60
  const delta = top - lastScrollTop
  lastScrollTop = top
  stickToBottom = nearBottom
  const shouldShow = max > 0 && !nearBottom && !(nearTop && delta <= 0)
  if (shouldShow !== showBackBtn.value) showBackBtn.value = shouldShow
  if (!shouldShow) { scrollDirAccum = 0; return }
  scrollDirAccum += delta
  if (Math.abs(scrollDirAccum) >= SCROLL_DIR_THRESHOLD) {
    const newDir = scrollDirAccum > 0
    if (newDir !== arrowDown.value) arrowDown.value = newDir
    scrollDirAccum = 0
  }
}
function onBackBtnClick() {
  const el = scrollEl()
  if (!el) return
  if (arrowDown.value) {
    forceScrollBottom()
  } else {
    el.scrollTop = 0
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
      v-show="open"
      class="agent-panel"
      :class="{ dark: isDark, fullscreen: isFullscreen }"
      :style="isFullscreen ? undefined : { left: panelPos.left + 'px', top: panelPos.top + 'px' }"
    >
      <!-- 头部 -->
      <div class="panel-head" @mousedown="startDrag">
        <div class="head-left">
          <div class="head-icon-badge">
            <i class="ico" :style="{ fontSize: 15 + 'px' }"><SparklesOutline /></i>
          </div>
          <span class="head-name">{{ title }}</span>
          <span v-if="tokenStats.rounds > 0" class="head-mini-info">{{ tokenStats.rounds }}轮</span>
        </div>
        <div class="head-right">
          <!-- AI 响应状态指示点 -->
          <span v-if="sending || compacting" class="head-status-dot" :title="compacting ? '正在压缩…' : '正在生成…'" />
          <button class="head-btn" @click.stop="toggleFullscreen" :title="isFullscreen ? '还原' : '全屏'">
            <i class="ico" :style="{ fontSize: 15 + 'px' }"><ContractOutline v-if="isFullscreen" /><ExpandOutline v-else /></i>
          </button>
          <button class="head-btn" @click.stop="open = false" title="收起">
            <i class="ico" :style="{ fontSize: 15 + 'px' }"><RemoveOutline /></i>
          </button>
        </div>
      </div>

      <!-- 消息流：DynamicScroller 动态高度虚拟化。库内部处理高度测量、窗口裁剪、
           节点复用。DOM 永远只有视口附近几十条，但滚动条表现成全部消息长度。
           markdown-it 同步渲染让高度渲染即定，buffer 区提前测量 → 滚动不抖。 -->
      <div class="panel-body-scroll">
        <!-- 历史加载中 / 空状态：作为覆盖层，与消息列表互斥 -->
        <div v-if="historyLoading" class="history-loading">
          <i class="ico spin" :style="{ fontSize: 18 + 'px' }"><SyncOutline /></i>
          <span>加载历史对话…</span>
        </div>
        <div v-else-if="renderItems.length === 0" class="empty-hint">
          <div class="empty-glow-ring">
            <div class="empty-icon"><i class="ico" :style="{ fontSize: 24 + 'px' }"><SparklesOutline /></i></div>
          </div>
          <p class="empty-title">{{ title }}</p>
          <p class="empty-desc">{{ subtitle }}</p>
          <div class="empty-tips">
            <span v-for="tip in tips" :key="tip" class="tip-chip">{{ tip }}</span>
          </div>
          <p class="empty-hint-slash">输入 <code>/</code> 查看快捷命令</p>
        </div>

        <!-- DynamicScroller：滚动容器。ref/scroll 绑在它上，scrollEl() 取 $el。 -->
        <DynamicScroller
          v-else
          ref="scrollBody"
          :items="renderItems"
          :min-item-size="DS_MIN_ITEM_SIZE"
          :buffer="DS_BUFFER"
          :prerender="DS_PRERENDER"
          key-field="id"
          class="panel-body"
          @scroll.native="onScroll"
        >
          <template v-slot="{ item, index, active }">
            <!-- size-dependencies：列出所有影响 item 渲染高度的响应式字段。
                 DS 内部 watch 这些值，变化时强制重测并更新 sizes[id]，
                 确保 item.position（=前序item累积高度）始终准确，杜绝留白。
                 覆盖：流式文本增长、思考展开/收起、工具状态变化、usage显隐。 -->
            <DynamicScrollerItem
              :item="item" :active="active" :data-index="index" :data-id="item.id"
              :size-dependencies="[
                item.text, item.replyText, item.thinkText, item.streaming,
                item.toolStatus, item.toolResult, item.toolProgress,
                thinkExpanded.has(item.id),
                !!itemUsage[item.id],
              ]"
            >
              <!-- 用户消息 -->
              <div v-if="item.kind === 'user'"
                class="msg msg-user" :data-id="item.id"
              >
                <div class="bubble-wrap">
                  <div class="bubble bubble-user">{{ item.text }}</div>
                </div>
                <div class="avatar avatar-user">{{ userInitial }}</div>
              </div>

              <!-- AI 消息 -->
              <div v-else-if="item.kind === 'assistant'"
                class="msg msg-ai" :data-id="item.id"
              >
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
                      <!-- think-body 用 v-if 挂载/卸载（非 max-height 过渡）：
                           DynamicScroller 用 ResizeObserver 测高，CSS max-height 过渡会让它
                           读到中间态高度并缓存 → sizes[id] 陈旧 → 后续 item position 错位 = 留白。
                           v-if 卸载后高度立即确定，DS 测量准确。仅 opacity 淡入不影响高度。 -->
                      <transition name="think-fade">
                        <div v-if="thinkExpanded.has(item.id) || item.streaming" class="think-collapse">
                          <div class="think-body">{{ item.thinkText }}</div>
                        </div>
                      </transition>
                    </div>
                    <!-- 正式回复：MarkdownStatic 纯同步渲染，渲染完静止，滚动不抖 -->
                    <div v-if="item.replyText" class="ai-reply" :class="{ dark: isDark }">
                      <MarkdownStatic :content="item.replyText" />
                      <span v-if="item.streaming" class="cursor">▋</span>
                    </div>
                    <div v-else-if="item.streaming && !item.thinkText" class="pixel-loader">
                      <i></i><i></i><i></i><i></i><i></i><i></i>
                    </div>
                    <!-- 单轮 token -->
                    <div v-if="itemUsage[item.id] && !item.streaming" class="item-usage">
                      ↑{{ itemUsage[item.id].promptTokens }} · ↓{{ itemUsage[item.id].completionTokens }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- 工具调用 -->
              <div v-else
                class="msg msg-tool" :data-id="item.id"
              >
                <div class="avatar avatar-ai avatar-tool">
                  <i class="ico" :style="{ fontSize: 13 + 'px' }"><SparklesOutline /></i>
                </div>
                <div class="tool-card-wrap">
                  <ToolCallCard :call="item.toolCall!" :status="item.toolStatus || 'pending'" :result="item.toolResult" :progress="item.toolProgress" />
                </div>
              </div>
            </DynamicScrollerItem>
          </template>
        </DynamicScroller>
      </div>

      <!-- 双向浮动按钮：放在 panel-body 外，用 absolute 定位，不受列表布局影响 -->
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
        <!-- 工具栏：快捷指令 + 模型状态条（点击调起 /model 弹窗切换）。
             删掉底部冗余的 prov/model 下拉——/model 命令已能切两者。 -->
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
          <!-- 模型状态条：点击调起 /model 弹窗，展示"提供商 · 模型"，贴右 -->
          <button
            v-if="activeModelLabel || activeProvider?.name"
            class="model-chip"
            :disabled="sending"
            title="切换模型"
            @click="modelPickerOpen = true"
          >
            <i class="ico" :style="{ fontSize: 12 + 'px' }"><CubeOutline /></i>
            <span class="model-chip-text">
              <span v-if="activeProvider?.name" class="model-chip-prov">{{ activeProvider.name }}</span>
              <span v-if="activeProvider?.name && activeModelLabel" class="model-chip-sep">·</span>
              <span class="model-chip-name">{{ activeModelLabel || '未选择' }}</span>
            </span>
            <i class="ico" :style="{ fontSize: 11 + 'px' }"><ChevronDownOutline /></i>
          </button>
        </div>

        <!-- 状态行：单行文本流，左=会话统计，右=上下文容量。
             用纯文本 + · 分隔替代一堆胶囊，避免视觉拥挤。
             只有"轮次"用胶囊（主状态），其余统计降级为轻量文本。 -->
        <div v-if="tokenStats.rounds > 0" class="ctx-foot">
          <div class="ctx-left">
            <span class="ctx-rounds">{{ tokenStats.rounds }}轮</span>
            <span
              v-if="compactionSummary"
              class="ctx-summary"
              :title="`历史已摘要化（释放约 ${formatTokens(compactionTokens)} token）${compactionReleasedAt ? ' · ' + formatCompactTime(compactionReleasedAt) : ''}`"
            >摘要{{ formatTokens(compactionTokens) }}</span>
            <span class="ctx-tok">
              <span class="ctx-tok-up">↑{{ formatTokens(tokenStats.totalPrompt) }}</span>
              <span class="ctx-tok-down">↓{{ formatTokens(tokenStats.totalCompletion) }}</span>
            </span>
          </div>
          <!-- 上下文容量：独立右栏，进度条 + 数字 -->
          <span
            v-if="contextLimit > 0"
            class="ctx-prog"
            :class="{ warn: contextWarn }"
            :title="`上下文占用 ${contextPercent}%`"
          >
            <span class="ctx-prog-bar"><span class="ctx-prog-fill" :style="{ width: contextPercent + '%' }"></span></span>
            <span class="ctx-prog-text">{{ formatTokens(contextUsed) }}/{{ formatTokens(contextLimit) }}</span>
          </span>
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
/* 色彩令牌系统：层级递进明确，消除打补丁感。
   设计原则（对标 Claude/ChatGPT 暖灰体系）：
   - bg: 最底层（消息流画布）
   - surface: 浮起卡片（输入框、弹窗、代码块）= bg 微调暖白
   - surface-2: 次级层（头部、底部栏）= 比 bg 略深，建立区域分界
   - surface-3: 容器内底色（代码块、表头、think-block、悬停）= 比 surface-2 再深一档
   - surface-4: 最深容器（user 气泡、按钮）= 强对比
   每一层都有明确角色，不再临时凑颜色。 */
.agent-panel {
  --bg:           #faf9f7;  /* 画布：暖米白，所有元素的基底 */
  --surface:      #ffffff;  /* 浮起卡片：纯白，输入框/弹窗/代码块用 */
  --surface-2:    #f1efec;  /* 区域栏：头部/底部，比画布深一档建立分界 */
  --surface-3:    #ebe8e4;  /* 容器底：代码块/表头/think-block/悬停，深两档 */
  --surface-4:    #e2ded8;  /* 强对比：user 气泡/激活态，最深 */
  --border:       #e2ded8;  /* 边框：与 surface-4 同色，视觉统一 */
  --border-soft:  rgba(28,25,23,0.06);
  --text:         #1c1917;
  --text-2:       #44403c;
  --text-3:       #57534e;
  --text-4:       #78716c;
  --text-5:       #a8a29e;
  --text-6:       #c7c3be;
  --accent:       #c15f3c;
  --accent-2:     #d4724e;
  --accent-hover: #a84d2e;
  --accent-soft:  rgba(193,95,60,0.08);
  --accent-soft-2:rgba(193,95,60,0.12);
  --accent-border:rgba(193,95,60,0.22);
  --warn:         #dc2626;
  --warn-2:       #f87171;
  --warn-soft:    rgba(220,38,38,0.1);
  --success:      #16a34a;
  --error-bg:     #fef5f5;   /* 错误态柔和红底（ToolCallCard 用） */
  --accent-bg:    #fefcfb;   /* 工具卡 running 态柔和橙底（ToolCallCard 用） */
  --shadow-card: 0 0 0 1px rgba(28,25,23,0.08), 0 4px 12px rgba(28,25,23,0.08), 0 24px 56px rgba(28,25,23,0.16);
  --shadow-pop:  0 8px 24px rgba(28,25,23,0.12);
  --shadow-mask: rgba(28,25,23,0.32);
}
.agent-panel.dark {
  /* 深色：暖黑 stone 体系，层级递进方向反转（越深越暗）。
   bg 最暗 → surface-4 最亮（浮起感）。 */
  --bg:           #1a1714;  /* 画布：暖黑 */
  --surface:      #2a2522;  /* 浮起卡片：比 bg 亮一档 */
  --surface-2:    #221e1b;  /* 区域栏：比 bg 略深，建立分界（深色下栏要更暗） */
  --surface-3:    #322c28;  /* 容器底：比 surface 亮，代码块/表头 */
  --surface-4:    #3a332e;  /* 强对比：user 气泡，最亮容器 */
  --border:       #38322d;
  --border-soft:  rgba(255,255,255,0.06);
  --text:         #f5f4f2;
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
  --accent-bg:    rgba(224,131,98,0.08);
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
  transition: width 0.25s cubic-bezier(0.16,1,0.3,1), height 0.25s cubic-bezier(0.16,1,0.3,1), border-radius 0.25s;
}
/* 全屏态：铺满视口（留 24px 边距），置顶，去掉圆角，禁用拖拽 */
.agent-panel.fullscreen {
  left: 24px !important; top: 24px !important;
  width: calc(100vw - 48px); height: calc(100vh - 48px);
  border-radius: 12px;
  z-index: 10010;
}
.agent-panel.fullscreen .panel-head { cursor: default; border-radius: 12px 12px 0 0; }
.agent-panel.fullscreen .panel-footer { border-radius: 0 0 12px 12px; }
/* 全屏时消息流居中限宽（对标 ChatGPT/Claude 全屏阅读宽度 ~820px），
   用 padding 让内容区居中，避免宽屏上内容散成难看的窄条。 */
.agent-panel.fullscreen .panel-body { padding-left: max(14px, calc(50% - 410px)); padding-right: max(14px, calc(50% - 410px)); }
/* 轮次pill：紧贴标题，弱化色让标题更突出 */
.head-mini-info {
  font-size: 10px; color: var(--text-5); font-weight: 600;
  padding: 1px 6px; background: var(--surface-4);
  border-radius: 4px; white-space: nowrap; flex-shrink: 0;
}
/* 头像徽章：土橙软渐变底色 + 微边框 + 阴影，比裸图标更立体 */
.head-icon-badge {
  width: 30px; height: 30px; border-radius: 9px; flex-shrink: 0;
  background: linear-gradient(145deg, var(--accent-soft-2) 0%, rgba(193,95,60,0.18) 100%);
  border: 1px solid var(--accent-border);
  color: var(--accent);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 1px 3px rgba(193,95,60,0.12);
}
.agent-panel.dark .head-icon-badge {
  background: linear-gradient(145deg, rgba(224,131,98,0.16) 0%, rgba(224,131,98,0.1) 100%);
  box-shadow: 0 1px 4px rgba(224,131,98,0.18);
}

/* 头部：surface-2 底色 + 底部分界线 */
.panel-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px 10px 14px;
  background: var(--surface-2);
  border-bottom: 1px solid var(--border);
  border-radius: 16px 16px 0 0;
  cursor: grab; user-select: none;
  box-shadow: 0 1px 0 rgba(28,25,23,0.04);
}
.agent-panel.dark .panel-head { box-shadow: 0 1px 0 rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.03); }
.panel-head:active { cursor: grabbing; }
/* 左侧：icon徽章 + 标题 + 轮次pill，单行紧凑排列 */
.head-left { display: inline-flex; align-items: center; gap: 9px; flex: 1; min-width: 0; overflow: hidden; }
/* 右侧：状态点 + 操作按钮 */
.head-right { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
.head-name { font-size: 13.5px; font-weight: 700; color: var(--text); letter-spacing: -0.01em; white-space: nowrap; }
/* AI 响应状态指示点：sending/compacting 时显示，呼吸动画 */
.head-status-dot {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
  background: var(--accent);
  margin-right: 4px;
  animation: status-breath 1.4s ease-in-out infinite;
}
@keyframes status-breath {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.75); }
}
.head-btn { width: 28px; height: 28px; border: none; background: transparent; color: var(--text-4); cursor: pointer; border-radius: 7px; display: flex; align-items: center; justify-content: center; transition: background 0.15s, color 0.15s; }
.head-btn:hover { background: var(--surface-4); color: var(--text); }
.head-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* 模型状态条：和 quick-btn 高度对齐，向右推到底部 */
.model-chip {
  margin-left: auto;
  display: inline-flex; align-items: center; gap: 5px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
  cursor: pointer;
  font-size: 12px; color: var(--text-3);
  line-height: 1;
  height: 28px; box-sizing: border-box;
  flex-shrink: 0; min-width: 0;
  transition: background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s;
  box-shadow: 0 1px 2px rgba(28,25,23,0.04);
}
.model-chip:hover:not(:disabled) {
  background: var(--surface-3);
  color: var(--text);
  border-color: var(--accent-border);
}
.model-chip:disabled { opacity: 0.5; cursor: default; }
.model-chip-text {
  display: inline-flex; align-items: center; gap: 4px;
  min-width: 0; overflow: hidden;
  white-space: nowrap; text-overflow: ellipsis;
}
.model-chip-prov { color: var(--text-5); font-size: 11px; }
.model-chip-sep { color: var(--text-6); font-size: 11px; }
.model-chip-name { color: var(--text-2); font-weight: 500; overflow: hidden; text-overflow: ellipsis; }
.model-chip:hover:not(:disabled) .model-chip-name { color: var(--accent); }

/* 消息流容器：外层 .panel-body-scroll 占满 flex 空间；
   DynamicScroller（根元素带 .panel-body + DS 自带 .vue-recycle-scroller）
   作为实际滚动元素——DS 自带 overflow-y:auto（见 vue-virtual-scroller.css），
   这里不重复加，只保留 padding/背景/滚动条样式。 */
.panel-body-scroll { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
.panel-body { flex: 1; min-height: 0; overflow-anchor: auto; padding: 16px; background: var(--bg); }
.panel-body.opening .msg { opacity: 0; transition: opacity 0.2s ease; }
.panel-body::-webkit-scrollbar { width: 6px; }
.panel-body::-webkit-scrollbar-thumb { background: var(--text-6); border-radius: 3px; transition: background 0.15s; }
.panel-body::-webkit-scrollbar-thumb:hover { background: var(--text-5); }
.panel-body::-webkit-scrollbar-track { background: transparent; }
/* 历史加载占位 */
.history-loading { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 24px 0; color: var(--text-5); font-size: 12px; min-height: calc(100% - 32px); }
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

.empty-hint { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 16px 0; min-height: calc(100% - 32px); }
/* 光晕环：icon 外面一圈柔和的环形渐变，增加仪式感 */
.empty-glow-ring {
  width: 72px; height: 72px; margin: 0 auto 16px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--accent-soft-2) 0%, transparent 70%);
  display: flex; align-items: center; justify-content: center;
}
.empty-icon {
  width: 52px; height: 52px;
  border-radius: 16px;
  background: linear-gradient(145deg, var(--accent-soft-2), rgba(193,95,60,0.06));
  border: 1px solid var(--accent-border);
  display: flex; align-items: center; justify-content: center;
  color: var(--accent);
  box-shadow: 0 4px 12px rgba(193,95,60,0.12), 0 1px 3px rgba(28,25,23,0.06);
}
.agent-panel.dark .empty-icon { box-shadow: 0 4px 12px rgba(224,131,98,0.15); }
.empty-title { margin: 0 0 4px; font-size: 15px; font-weight: 700; color: var(--text); letter-spacing: -0.01em; }
.empty-desc { margin: 0 0 14px; font-size: 12px; color: var(--text-4); line-height: 1.5; }
.empty-tips { display: flex; flex-wrap: wrap; gap: 7px; justify-content: center; margin-bottom: 16px; }
.tip-chip {
  font-size: 11.5px; padding: 4px 11px; border-radius: 20px;
  background: var(--surface-3); border: 1px solid var(--border);
  color: var(--text-3); cursor: default;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.tip-chip:hover { background: var(--accent-soft); border-color: var(--accent-border); color: var(--accent); }
/* 斜杠命令提示 */
.empty-hint-slash { font-size: 11px; color: var(--text-5); margin: 0; }
.empty-hint-slash code { font-size: 11px; padding: 1px 5px; border-radius: 4px; background: var(--surface-3); border: 1px solid var(--border); color: var(--accent); font-family: 'SF Mono', 'Menlo', 'Consolas', monospace; }

/* 消息渲染：DynamicScroller 做窗口虚拟化（高度测量/裁剪/复用全由库内部处理）。
   每条消息由 DynamicScrollerItem 包裹，库内部用绝对定位摆放（top = 之前条目
   测量高度之和）。关键：项间距必须用 padding-bottom 而非 margin-bottom——
   因为 DS 测的是 offsetHeight（含 padding，不含 margin），间距进到测量值里，
   下一条的 top 才会正确跳过这段间距。用 margin 会丢失间距导致条目叠在一起。 */
.msg {
  display: flex; gap: 7px; max-width: 100%; align-items: flex-start; padding-bottom: 16px;
}
/* 用户消息靠右 */
.msg-user { justify-content: flex-end; }
/* AI 消息靠左 */
.msg-ai { justify-content: flex-start; }
/* 工具调用：和 AI 消息一样 avatar + content 左对齐，不再用 padding-left 硬缩进 */
.msg-tool { justify-content: flex-start; }
.tool-card-wrap { flex: 1; min-width: 0; }

.bubble-wrap { display: flex; align-items: flex-end; max-width: 80%; }
/* AI 气泡自由宽度：fit-content 收缩到内容宽度，max-width 防止超宽。
   不顶满水平轴，短回复就是短气泡，长回复（代码块/表格）才撑到上限。 */
.ai-bubble-wrap { flex-direction: column; align-items: flex-start; }
.msg-ai .ai-content { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; max-width: 100%; }

.avatar { flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: #fff; width: 28px; height: 28px; border-radius: 50%; }
/* AI 头像：土橙微渐变，更立体，不破坏 Claude 暖色调 */
.avatar-ai { background: linear-gradient(135deg, var(--accent-2) 0%, var(--accent) 100%); box-shadow: 0 1px 3px rgba(193,95,60,0.3); }
.avatar-ai.thinking { animation: avatar-pulse 1.4s ease-in-out infinite; }
@keyframes avatar-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(193,95,60,0.4); } 50% { box-shadow: 0 0 0 6px rgba(193,95,60,0); } }
.avatar-user { background: var(--text-2); font-size: 12px; font-weight: 600; }

.bubble { padding: 9px 13px; border-radius: 12px; font-size: 13px; line-height: 1.6; word-break: break-word; }
/* AI 回复区：MarkdownStatic 渲染的纯 HTML，无包装层（ms-content/ms-markdown 已不存在）。
   自由宽度，收缩到内容大小，max-width 限制上限不超容器。
   短文本就是窄气泡，代码块/表格才撑宽。
   透明背景：AI 回复不要气泡背景，和 panel-body 融为一体。
   overflow-x:auto 让宽表格/代码块横向滚动而非挤掉布局。 */
.ai-reply { width: fit-content; max-width: 100%; min-width: 0; color: var(--text); background: transparent; overflow-x: auto; }
/* 代码块保留中性灰底，引用块/表头/隔行表格用对应底色 */
.ai-reply :deep(pre),
.ai-reply :deep(pre code) { background: var(--surface-3); }
.ai-reply :deep(blockquote) { background: var(--surface-2); }
.ai-reply :deep(th) { background: var(--surface-3); }
.ai-reply :deep(tr:nth-child(even) td) { background: var(--surface-2); }
/* user 气泡走纯文本，保留 pre-wrap 换行 */
.bubble-user { background: var(--surface-4); color: var(--text); border-top-right-radius: 4px; white-space: pre-wrap; }

/* ===== AI 回复 Markdown 排版（对标 ChatGPT/Claude 聊天界面）=====
   MarkdownStatic 输出的是裸 HTML，:deep() 直接选元素（无 ms-* 包装层）。
   所有颜色走 CSS 变量，深色模式自动跟随。 */
.ai-reply :deep(.md-static) {
  font-size: 14px; line-height: 1.7; color: var(--text);
  word-wrap: break-word; overflow-wrap: break-word;
}
/* 首尾元素不留多余间距 */
.ai-reply :deep(.md-static > :first-child) { margin-top: 0; }
.ai-reply :deep(.md-static > :last-child) { margin-bottom: 0; }
/* 段落：ChatGPT 风的宽松行高 + 适度段间距 */
.ai-reply :deep(p) { margin: 0 0 12px; }
.ai-reply :deep(p:last-child) { margin-bottom: 0; }
/* 标题：克制，不喧宾夺主 */
.ai-reply :deep(h1) { font-size: 18px; font-weight: 700; margin: 20px 0 10px; line-height: 1.3; }
.ai-reply :deep(h2) { font-size: 16px; font-weight: 700; margin: 18px 0 8px; line-height: 1.3; }
.ai-reply :deep(h3) { font-size: 15px; font-weight: 600; margin: 16px 0 6px; line-height: 1.4; }
.ai-reply :deep(h4) { font-size: 14px; font-weight: 600; margin: 12px 0 4px; }
/* 加粗 */
.ai-reply :deep(strong) { font-weight: 700; }
/* 行内代码：紧凑灰底 */
.ai-reply :deep(code:not(pre code)) {
  padding: 2px 6px; border-radius: 5px;
  background: var(--surface-3);
  color: var(--accent);
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  font-size: 0.88em;
}
/* 代码块：克制的灰底块，MarkdownStatic 输出标准 <pre><code> */
.ai-reply :deep(pre) {
  margin: 12px 0; padding: 14px 16px;
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow-x: auto;
  font-size: 13px;
}
.ai-reply :deep(pre code) {
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  font-size: 13px; line-height: 1.6;
  background: transparent;
  padding: 0;
}
/* ===== 代码语法高亮（highlight.js，明色：GitHub Light 风克制配色） =====
   不引 highlight.js 的整套主题文件（会和 surface 配色打架），按 token class
   手写配色，对齐画布暖米白基调。 */
.ai-reply :deep(.hljs) { color: var(--text); }
.ai-reply :deep(.hljs-comment),
.ai-reply :deep(.hljs-quote) { color: var(--text-5); font-style: italic; }
.ai-reply :deep(.hljs-keyword),
.ai-reply :deep(.hljs-selector-tag),
.ai-reply :deep(.hljs-literal),
.ai-reply :deep(.hljs-type) { color: #b31d8c; }
.ai-reply :deep(.hljs-string),
.ai-reply :deep(.hljs-meta-string),
.ai-reply :deep(.hljs-doctag) { color: #0a7d36; }
.ai-reply :deep(.hljs-number),
.ai-reply :deep(.hljs-symbol),
.ai-reply :deep(.hljs-bullet) { color: #a8600f; }
.ai-reply :deep(.hljs-title),
.ai-reply :deep(.hljs-title.function_),
.ai-reply :deep(.hljs-section),
.ai-reply :deep(.hljs-name) { color: #6f42c1; }
.ai-reply :deep(.hljs-attr),
.ai-reply :deep(.hljs-attribute),
.ai-reply :deep(.hljs-variable),
.ai-reply :deep(.hljs-template-variable) { color: #a86a00; }
.ai-reply :deep(.hljs-built_in),
.ai-reply :deep(.hljs-builtin-name),
.ai-reply :deep(.hljs-class .hljs-title) { color: #005cc5; }
.ai-reply :deep(.hljs-tag) { color: var(--text-4); }
.ai-reply :deep(.hljs-meta) { color: var(--text-5); }
/* ===== 代码语法高亮（暗色：调亮 + 去饱和，适配暖黑画布） ===== */
.ai-reply.dark :deep(.hljs) { color: var(--text-2); }
.ai-reply.dark :deep(.hljs-comment),
.ai-reply.dark :deep(.hljs-quote) { color: var(--text-5); }
.ai-reply.dark :deep(.hljs-keyword),
.ai-reply.dark :deep(.hljs-selector-tag),
.ai-reply.dark :deep(.hljs-literal),
.ai-reply.dark :deep(.hljs-type) { color: #ff7eb6; }
.ai-reply.dark :deep(.hljs-string),
.ai-reply.dark :deep(.hljs-meta-string),
.ai-reply.dark :deep(.hljs-doctag) { color: #7ee787; }
.ai-reply.dark :deep(.hljs-number),
.ai-reply.dark :deep(.hljs-symbol),
.ai-reply.dark :deep(.hljs-bullet) { color: #f0a868; }
.ai-reply.dark :deep(.hljs-title),
.ai-reply.dark :deep(.hljs-title.function_),
.ai-reply.dark :deep(.hljs-section),
.ai-reply.dark :deep(.hljs-name) { color: #d2a8ff; }
.ai-reply.dark :deep(.hljs-attr),
.ai-reply.dark :deep(.hljs-attribute),
.ai-reply.dark :deep(.hljs-variable),
.ai-reply.dark :deep(.hljs-template-variable) { color: #ffa657; }
.ai-reply.dark :deep(.hljs-built_in),
.ai-reply.dark :deep(.hljs-builtin-name) { color: #79c0ff; }
.ai-reply.dark :deep(.hljs-tag) { color: var(--text-4); }
.ai-reply.dark :deep(.hljs-meta) { color: var(--text-5); }
/* 引用块：中性灰底（不再用暖橙 accent-bg，避免背景偏红），左侧细边框区分 */
.ai-reply :deep(blockquote) {
  margin: 12px 0; padding: 8px 16px;
  border-left: 3px solid var(--text-6);
  color: var(--text-4);
  border-radius: 0 8px 8px 0;
}
.ai-reply :deep(blockquote p) { margin: 4px 0; }
/* 列表 */
.ai-reply :deep(ul), .ai-reply :deep(ol) { margin: 12px 0; padding-left: 24px; }
.ai-reply :deep(li) { margin: 4px 0; }
.ai-reply :deep(li > p) { margin: 0; }
/* 链接 */
.ai-reply :deep(a) { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
/* 表格：保持 display:table 让列宽正确计算，
   宽表格由外层 .ai-reply 的 overflow-x:auto 处理横向滚动，不会被截断。 */
.ai-reply :deep(table) {
  margin: 12px 0; border-collapse: collapse;
  font-size: 13px; max-width: 100%;
}
.ai-reply :deep(th), .ai-reply :deep(td) {
  padding: 8px 12px; border: 1px solid var(--border); text-align: left;
  white-space: normal; word-break: break-word;
}
.ai-reply :deep(th) { background: var(--surface-3); font-weight: 700; }
.ai-reply :deep(tr:nth-child(even) td) { background: var(--surface-2); }
/* 分隔线 */
.ai-reply :deep(hr) { margin: 16px 0; border: none; border-top: 1px solid var(--border); }

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
  padding: 7px 10px 8px;
  border-top: 1px dashed var(--border);
  font-size: 11.5px; line-height: 1.65; color: var(--text-4);
  white-space: pre-wrap; word-break: break-word;
  /* 无 max-height 过渡：DynamicScroller 用 ResizeObserver 测高，CSS 过渡会让它
     读到中间态高度并缓存 → sizes[id] 陈旧 → 后续 item 错位留白。
     think-body 由父级 v-if 挂载/卸载控制，高度立即确定。 */
}
/* 仅 opacity 淡入：不影响 offsetHeight，DS 测量不受干扰 */
.think-fade-enter-active { transition: opacity 0.2s ease; }
.think-fade-enter-from { opacity: 0; }
.think-fade-leave-active { transition: opacity 0.15s ease; }
.think-fade-leave-to { opacity: 0; }

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

/* 底部：三段式布局（快捷指令 → token统计 → 输入框），统一 14px 水平 padding，
   各区块顶部 padding 统一 8px，圆角体系统一（卡片 12px / 工具栏胶囊 7px / 状态胶囊 5px）。 */
.panel-footer {
  border-top: 1px solid var(--border);
  background: var(--surface-2);
  border-radius: 0 0 16px 16px;
  box-shadow: 0 -1px 0 rgba(28,25,23,0.04), inset 0 1px 0 rgba(255,255,255,0.5);
  padding-bottom: 14px;
}
.agent-panel.dark .panel-footer { box-shadow: 0 -1px 0 rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.03); }
.quick-cmds { display: flex; gap: 4px; padding: 10px 12px 0; align-items: center; justify-content: flex-start; min-width: 0; overflow: hidden; }
/* 工具栏按钮：加高到 28px，圆角加大，hover 更丰富 */
.quick-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 0 10px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-3); font-size: 12px;
  border-radius: 7px; cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  flex-shrink: 0; height: 28px; box-sizing: border-box; line-height: 1;
}
.quick-btn:hover { background: var(--surface-3); color: var(--text); border-color: var(--border-soft); }
.quick-btn:active { transform: scale(0.96); }
.quick-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.panel-input {
  padding: 8px 12px 0; position: relative;
}
/* 一体化输入容器：textarea 和发送按钮共享同一外框/圆角/背景。 */
.input-composer {
  display: flex; align-items: flex-end; gap: 6px;
  padding: 7px 7px 7px 14px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: 0 1px 3px rgba(28,25,23,0.06), 0 0 0 0 transparent;
  transition: border-color 0.18s, box-shadow 0.18s;
}
.input-composer.focused {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft), 0 1px 3px rgba(28,25,23,0.06);
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
.slash-menu { position: absolute; bottom: calc(100% + 6px); left: 14px; right: 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: var(--shadow-pop); z-index: 10010; overflow: hidden; }
.slash-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; transition: background 0.12s; border-left: 2px solid transparent; }
.slash-item:hover { background: var(--surface-3); }
.slash-item.active { background: var(--accent-soft); color: var(--accent); border-left-color: var(--accent); }
.slash-icon { flex-shrink: 0; color: var(--text-4); }
.slash-item.active .slash-icon { color: var(--accent); }
.slash-name { font-size: 12px; font-weight: 600; color: var(--text); white-space: nowrap; }
.slash-desc { font-size: 11px; color: var(--text-5); margin-left: auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* 发送按钮：圆形实心，带轻微渐变增加立体感 */
.send-btn {
  flex-shrink: 0;
  width: 32px; height: 32px;
  border: none; border-radius: 50%;
  background: linear-gradient(145deg, var(--accent-2), var(--accent));
  color: #fff;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 6px rgba(193,95,60,0.3);
  transition: background 0.15s, opacity 0.15s, transform 0.15s, box-shadow 0.15s;
}
.send-btn:hover:not(.disabled) {
  background: linear-gradient(145deg, var(--accent), var(--accent-hover));
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(193,95,60,0.4);
}
.send-btn:active:not(.disabled) { transform: scale(0.91) translateY(0); box-shadow: 0 1px 3px rgba(193,95,60,0.2); }
.send-btn.disabled { opacity: 0.28; cursor: not-allowed; box-shadow: none; }
/* 停止按钮：sending 期间替代发送按钮 */
.send-btn.stop-btn { background: var(--warn); box-shadow: 0 2px 6px rgba(220,38,38,0.25); animation: stop-breath 1.4s ease-in-out infinite; }
.send-btn.stop-btn:hover { filter: brightness(0.9); transform: translateY(-1px); }
@keyframes stop-breath {
  0%, 100% { box-shadow: 0 2px 6px rgba(220,38,38,0.25); }
  50%      { box-shadow: 0 2px 10px rgba(220,38,38,0.45); }
}

/* 状态行：左右两栏 flex。左=会话统计文本流，右=上下文容量。
   用"1 个胶囊 + 纯文本"取代原来 4 个胶囊，瞬间清爽。
   单色系：统计统一 text-5 弱化，只轮次用强调色突出主状态。 */
.ctx-foot {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 14px 0;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
}
/* 左栏：会话统计，文本流紧凑排列 */
.ctx-left {
  display: flex; align-items: center; gap: 8px;
  min-width: 0; flex: 1;
  white-space: nowrap; overflow: hidden;
}
/* 轮次：唯一的胶囊，主状态用强调色 */
.ctx-rounds {
  display: inline-flex; align-items: center;
  height: 17px; padding: 0 6px;
  border-radius: 4px;
  background: var(--accent-soft); color: var(--accent);
  font-size: 10px; font-weight: 700; line-height: 1;
  flex-shrink: 0;
}
/* 摘要、token：纯文本，弱化色，不再用胶囊 */
.ctx-summary {
  font-size: 10px; color: var(--text-5);
  cursor: help; flex-shrink: 0;
}
.ctx-tok {
  display: inline-flex; gap: 5px;
  font-size: 10px; flex-shrink: 0;
}
.ctx-tok-up { color: var(--text-4); }
.ctx-tok-down { color: var(--text-5); }

/* 右栏：上下文容量，进度条 + 数字，独立单元 */
.ctx-prog {
  margin-left: auto;
  display: inline-flex; align-items: center; gap: 5px;
  flex-shrink: 0;
}
.ctx-prog-bar {
  display: inline-block;
  width: 50px; height: 4px;
  background: var(--surface-4);
  border-radius: 999px; overflow: hidden;
}
.ctx-prog-fill {
  display: block; height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--accent-2), var(--accent));
  transition: width 0.4s cubic-bezier(0.16,1,0.3,1), background 0.2s;
}
.ctx-prog-text {
  font-size: 10px; color: var(--text-4);
  white-space: nowrap;
}
.ctx-prog.warn .ctx-prog-fill {
  background: linear-gradient(90deg, var(--warn-2), var(--warn));
}
.ctx-prog.warn .ctx-prog-text { color: var(--warn); }

.panel-enter-active, .panel-leave-active { transition: opacity 0.25s cubic-bezier(0.16,1,0.3,1), transform 0.25s cubic-bezier(0.16,1,0.3,1); }
.panel-enter-from, .panel-leave-to { opacity: 0; transform: translateY(16px) scale(0.94); }
/* 消息入场只用 opacity 淡入。不用 transform/slide，因为：
   1. 我们已在 JS 层用锚点补偿法精确恢复滚动位置，transform 会干扰 getBoundingClientRect 测量
   2. 纯 opacity 动画无布局副作用，不影响锚点定位精度 */
.msg-new { animation: msg-fade-in 0.25s ease; }
@keyframes msg-fade-in { from { opacity: 0; } to { opacity: 1; } }

/* /model 模型选择弹窗 */
.picker-mask { position: absolute; inset: 0; background: var(--shadow-mask); z-index: 10020; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
.picker-dialog { width: 380px; max-height: 70vh; background: var(--surface); border-radius: 12px; box-shadow: var(--shadow-card); display: flex; flex-direction: column; overflow: hidden; }
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

/* ===== 移动端适配（< 768px）=====
   面板铺满屏幕（固定定位满屏），去掉圆角，字号微调。
   非全屏在小屏上意义不大，直接当全屏处理。 */
@media (max-width: 768px) {
  .agent-panel {
    left: 0 !important; top: 0 !important;
    width: 100vw !important; height: 100vh !important;
    height: 100dvh !important;   /* 动态视口高度，避免移动端浏览器栏遮挡 */
    border-radius: 0;
    max-width: none; max-height: none;
  }
  .agent-panel .panel-head { border-radius: 0; }
  .agent-panel .panel-footer { border-radius: 0; }
  /* 移动端气泡占满宽度，fit-content 在小屏上会导致内容被挤 */
  .ai-reply { width: 100% !important; }
  .bubble-wrap { max-width: 92% !important; }
  /* 输入区 padding 收紧 */
  .panel-input { padding: 8px !important; }
  .quick-cmds { padding: 8px 8px 0 !important; }
}
</style>
