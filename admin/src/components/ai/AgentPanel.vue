<script setup lang="ts">
import { ref, reactive, nextTick, computed, onBeforeUnmount, onMounted, watch } from 'vue'
import {
  NIcon, NInput, useMessage, NTooltip,
} from 'naive-ui'
import {
  RemoveOutline,
  SendOutline, BulbOutline, ChevronDownOutline,
  SparklesOutline, ContractOutline, HappyOutline, ColorPaletteOutline, CubeOutline,
  StopOutline,
} from '@vicons/ionicons5'
import { streamChat, streamCompact, streamWebSearch } from '../../api/ai'
import type { AiChatMessage, AiToolCall, AiArticleContext, AiUsage } from '../../api/ai'
import { getConversationByPostId, saveConversation } from '../../api/ai-conversation'
import { getActiveAiProviders } from '../../api/ai-provider'
import type { AiProvider } from '../../api/ai-provider'
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
const scrollBody = ref<HTMLElement | null>(null)
const inputRef = ref<any>(null)
const thinkExpanded = ref<Set<string>>(new Set())

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
function togglePanel() {
  open.value = !open.value
  if (open.value) {
    ensureDefaultPos()
    nextTick(() => scrollToBottom())
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
async function loadHistory() {
  if (!props.postId) {
    messages.value = []
    renderItems.value = []
    thinkExpanded.value.clear()
    resetTokenStats()
    historyLoaded.value = true
    return
  }
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
    await nextTick()
    scrollToBottom()
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
  if (scrollBody.value) scrollBody.value.scrollTop = scrollBody.value.scrollHeight
}
function onInputKeydown(e: KeyboardEvent) {
  // 斜杠菜单打开时优先处理（方向键/回车/Tab/Esc），拦截默认 Enter 发送
  if (onSlashMenuKeydown(e)) return
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
}
</script>

<template>
  <!-- 悬浮触发器 -->
  <div class="robot-trigger" :class="{ active: open }" @click="togglePanel">
    <n-icon :size="22"><SparklesOutline /></n-icon>
    <span v-if="!open && !sending" class="robot-pulse" />
    <span v-if="sending || compacting" class="robot-badge" />
  </div>

  <transition name="panel">
    <div
      v-if="open"
      class="agent-panel"
      :style="{ left: panelPos.left + 'px', top: panelPos.top + 'px' }"
    >
      <!-- 头部 -->
      <div class="panel-head" @mousedown="startDrag">
        <div class="head-title">
          <n-icon :size="16" class="head-icon"><SparklesOutline /></n-icon>
          <span class="head-name">{{ title }}</span>
          <span v-if="tokenStats.rounds > 0" class="head-mini-info">{{ tokenStats.rounds }}轮</span>
        </div>
        <div class="head-actions">
          <button class="head-btn" @click.stop="open = false" title="收起">
            <n-icon :size="15"><RemoveOutline /></n-icon>
          </button>
        </div>
      </div>

      <!-- 消息流 -->
      <div ref="scrollBody" class="panel-body">
        <div v-if="renderItems.length === 0" class="empty-hint">
          <div class="empty-icon"><n-icon :size="32"><SparklesOutline /></n-icon></div>
          <p class="empty-title">{{ title }}</p>
          <p class="empty-desc">{{ subtitle }}</p>
          <div class="empty-tips">
            <span v-for="tip in tips" :key="tip" class="tip-chip">{{ tip }}</span>
          </div>
        </div>

        <template v-for="item in renderItems" :key="item.id">
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
              <n-icon :size="13"><SparklesOutline /></n-icon>
            </div>
            <div class="bubble-wrap ai-bubble-wrap">
              <div class="ai-content">
                <!-- 思考折叠块 -->
                <div v-if="item.thinkText" class="think-block" :class="{ expanded: thinkExpanded.has(item.id) || item.streaming }">
                  <div class="think-head" @click="!item.streaming && toggleThink(item.id)">
                    <n-icon :size="12" class="think-icon"><BulbOutline /></n-icon>
                    <span class="think-label">思考过程</span>
                    <n-icon v-if="!item.streaming" :size="11" class="think-chevron" :class="{ rotated: thinkExpanded.has(item.id) }"><ChevronDownOutline /></n-icon>
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
                <!-- 加载点 -->
                <div v-else-if="item.streaming && !item.thinkText" class="typing-dots">
                  <span></span><span></span><span></span>
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
              <n-icon :size="13"><SparklesOutline /></n-icon>
            </div>
            <div class="tool-card-wrap">
              <ToolCallCard :call="item.toolCall!" :status="item.toolStatus || 'pending'" :result="item.toolResult" :progress="item.toolProgress" />
            </div>
          </div>
        </template>
      </div>

      <!-- 底部：快捷指令 + token统计 + 输入 -->
      <div class="panel-footer">
        <!-- 快捷指令按钮 + 模型选择下拉（同一行） -->
        <div class="quick-cmds">
          <n-tooltip v-for="cmd in quickCmds" :key="cmd.label" trigger="hover" :z-index="10010">
            <template #trigger>
              <button class="quick-btn" :disabled="sending || compacting" @click="applyQuickCmd(cmd)">
                <n-icon :size="13"><component :is="cmd.icon" /></n-icon>
                <span>{{ cmd.label }}</span>
              </button>
            </template>
            {{ cmd.desc }}
          </n-tooltip>
          <!-- 提供商下拉 -->
          <div class="custom-select" @click.stop="provDropdownOpen = !provDropdownOpen">
            <div class="cs-trigger">
              <span class="cs-text">{{ activeProvider?.name || '提供商' }}</span>
              <n-icon :size="12"><ChevronDownOutline /></n-icon>
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
              <n-icon :size="12"><ChevronDownOutline /></n-icon>
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
              <n-icon :size="13" class="slash-icon"><component :is="cmd.icon" /></n-icon>
              <span class="slash-name">{{ cmd.name }}</span>
              <span class="slash-desc">{{ cmd.desc }}</span>
            </div>
          </div>
          <n-input
            ref="inputRef"
            v-model:value="inputText"
            type="textarea"
            :autosize="{ minRows: 1, maxRows: 4 }"
            :placeholder="compacting ? '正在压缩历史…' : '输入指令，/ 查看命令，Enter 发送'"
            :disabled="sending || compacting"
            @keydown.capture="onInputKeydown"
          />
          <!-- 发送 / 停止 按钮：sending 时切换为停止按钮（可点击终止生成） -->
          <button
            v-if="sending"
            class="send-btn stop-btn"
            title="停止生成"
            @click="stopGeneration"
          >
            <n-icon :size="16"><StopOutline /></n-icon>
          </button>
          <button
            v-else
            class="send-btn"
            :class="{ disabled: !inputText.trim() || compacting }"
            :disabled="!inputText.trim() || compacting"
            @click="handleSend"
          >
            <n-icon :size="16"><SendOutline /></n-icon>
          </button>
        </div>

        <!-- 会话级 token 统计 + 上下文占用进度条 -->
        <div v-if="tokenStats.rounds > 0" class="ctx-foot">
          <!-- 第一行：累计消耗（算钱用） -->
          <span class="ctx-stat">
            {{ tokenStats.rounds }}轮 · 累计 ↑{{ tokenStats.totalPrompt }} ↓{{ tokenStats.totalCompletion }} = {{ tokenStats.totalPrompt + tokenStats.totalCompletion }}
          </span>
          <!-- 第二行：上下文占用进度条（防溢出用，对齐模型 maxContextTokens） -->
          <div v-if="contextLimit > 0" class="ctx-progress" :class="{ warn: contextWarn }">
            <span class="ctx-progress-label">上下文</span>
            <div class="ctx-progress-bar">
              <div class="ctx-progress-fill" :style="{ width: contextPercent + '%' }"></div>
            </div>
            <span class="ctx-progress-text">{{ contextUsed }} / {{ contextLimit }} ({{ contextPercent }}%)</span>
            <!-- 压缩胶囊：嵌在进度条行末尾，不独占行 -->
            <span
              v-if="compactionSummary"
              class="ctx-pill-compacted"
              :title="`历史已摘要化（释放约 ${formatTokens(compactionTokens)} token）${compactionReleasedAt ? ' · ' + formatCompactTime(compactionReleasedAt) : ''}`"
            >
              摘要-{{ formatTokens(compactionTokens) }}
            </span>
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
              <button class="picker-close" @click="modelPickerOpen = false"><n-icon :size="16"><RemoveOutline /></n-icon></button>
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
.robot-trigger {
  position: fixed; right: 24px; bottom: 24px;
  width: 48px; height: 48px; border-radius: 50%;
  background: #1a1a1a; color: #fafaf9;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,0.18);
  z-index: 9999; transition: transform 0.2s, box-shadow 0.2s, background 0.2s;
}
.robot-trigger:hover { transform: scale(1.06); box-shadow: 0 6px 20px rgba(0,0,0,0.24); }
.robot-trigger.active { background: #78716c; }
.robot-pulse { position: absolute; inset: -3px; border-radius: 50%; border: 2px solid #d6d3d1; animation: robot-ring 2s ease-out infinite; }
@keyframes robot-ring { 0% { transform: scale(1); opacity: 0.7; } 100% { transform: scale(1.5); opacity: 0; } }
.robot-badge { position: absolute; top: -2px; right: -2px; width: 11px; height: 11px; border-radius: 50%; background: #c15f3c; border: 2px solid #fafaf9; animation: badge-blink 1s ease-in-out infinite; }
@keyframes badge-blink { 50% { opacity: 0.4; } }

.agent-panel {
  position: fixed; width: 480px; height: 660px; z-index: 10001;
  background: #fafaf9; border-radius: 12px;
  box-shadow: 0 16px 48px rgba(28,25,23,0.18), 0 0 0 1px rgba(28,25,23,0.06);
  display: flex; flex-direction: column; overflow: visible;
}
.head-mini-info { font-size: 10px; color: #a8a29e; font-weight: 400; margin-left: 4px; }

.panel-head { display: flex; align-items: center; justify-content: space-between; padding: 11px 14px; background: #f5f5f4; border-bottom: 1px solid #e7e5e4; border-radius: 12px 12px 0 0; cursor: grab; user-select: none; }
.panel-head:active { cursor: grabbing; }
.head-title { display: inline-flex; align-items: center; gap: 8px; }
.head-icon { color: #c15f3c; }
.head-name { font-size: 13.5px; font-weight: 600; color: #1c1917; }
.head-actions { display: flex; gap: 2px; }
.head-btn { width: 26px; height: 26px; border: none; background: transparent; color: #78716c; cursor: pointer; border-radius: 6px; display: flex; align-items: center; justify-content: center; transition: background 0.15s, color 0.15s; }
.head-btn:hover { background: #e7e5e4; color: #1c1917; }
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
  font-size: 12px; color: #57534e;
  line-height: 1.4;
  white-space: nowrap; overflow: hidden;
  height: 26px; box-sizing: border-box;
  transition: background 0.15s, color 0.15s;
}
.cs-trigger:hover { background: #f5f5f4; color: #1c1917; }
/* 展开状态下保持 hover 态,避免点开菜单后触发器"消失" */
.custom-select:has(.cs-menu) .cs-trigger { min-width: 0; background: #f5f5f4; color: #1c1917; }
.cs-text { overflow: hidden; text-overflow: ellipsis; }
.cs-menu { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: #fff; border: 1px solid #e7e5e4; border-radius: 8px; box-shadow: 0 8px 24px rgba(28,25,23,0.12); z-index: 10010; max-height: 200px; overflow-y: auto; }
.cs-option { padding: 7px 12px; font-size: 12px; color: #1c1917; cursor: pointer; transition: background 0.12s; }
.cs-option:hover { background: #f5f5f4; }
.cs-option.active { color: #c15f3c; background: rgba(193,95,60,0.08); }
.cs-option.disabled { color: #a8a29e; cursor: default; }

.panel-body { flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 12px; background: #fafaf9; }
.panel-body::-webkit-scrollbar { width: 6px; }
.panel-body::-webkit-scrollbar-thumb { background: #d6d3d1; border-radius: 3px; }
.panel-body::-webkit-scrollbar-track { background: transparent; }

.empty-hint { margin: auto; text-align: center; }
.empty-icon { width: 56px; height: 56px; margin: 0 auto 12px; border-radius: 14px; background: #f5f5f4; border: 1px solid #e7e5e4; display: flex; align-items: center; justify-content: center; color: #c15f3c; }
.empty-title { margin: 0; font-size: 15px; font-weight: 600; color: #1c1917; }
.empty-desc { margin: 4px 0 12px; font-size: 12px; color: #78716c; }
.empty-tips { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.tip-chip { font-size: 11px; padding: 3px 9px; border-radius: 6px; background: #f5f5f4; border: 1px solid #e7e5e4; color: #57534e; }

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

.avatar { flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: #fff; width: 24px; height: 24px; border-radius: 50%; }
.avatar-ai { background: #c15f3c; }
.avatar-ai.thinking { animation: avatar-pulse 1.4s ease-in-out infinite; }
@keyframes avatar-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(193,95,60,0.4); } 50% { box-shadow: 0 0 0 6px rgba(193,95,60,0); } }
.avatar-user { background: #44403c; font-size: 11px; font-weight: 600; }

.bubble { padding: 9px 13px; border-radius: 12px; font-size: 13px; line-height: 1.6; word-break: break-word; white-space: pre-wrap; }
.bubble-user { background: #e7e5e4; color: #1c1917; border-top-right-radius: 4px; }
.bubble-ai { background: #ffffff; color: #1c1917; border: 1px solid #e7e5e4; border-top-left-radius: 4px; display: inline-block; }

/* 单轮 token 小字 */
.item-usage { font-size: 10px; color: #a8a29e; margin-top: 3px; padding: 0 4px; font-family: 'SF Mono', 'Menlo', 'Consolas', monospace; }

/* 思考折叠块 */
.think-block { width: 100%; border-radius: 8px; border-top-left-radius: 4px; background: #f5f5f4; border: 1px solid #e7e5e4; overflow: hidden; margin-bottom: 5px; }
.think-head { display: flex; align-items: center; gap: 5px; padding: 6px 10px; cursor: pointer; user-select: none; font-size: 11px; color: #78716c; }
.think-icon { color: #c15f3c; }
.think-label { font-weight: 500; }
.think-chevron { margin-left: auto; transition: transform 0.25s; color: #a8a29e; }
.think-chevron.rotated { transform: rotate(180deg); }
.think-streaming { margin-left: auto; color: #c15f3c; font-size: 10px; display: inline-flex; align-items: center; gap: 3px; }
.think-streaming::after { content: ''; width: 4px; height: 4px; border-radius: 50%; background: #c15f3c; animation: think-dot 1s ease-in-out infinite; }
@keyframes think-dot { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
/* 思考正文：padding 和 border 也参与过渡，折叠时归零，彻底消除残留高度 */
.think-body {
  padding: 0 10px;
  border-top: 0px solid transparent;
  font-size: 11.5px; line-height: 1.65; color: #78716c;
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
  border-top-color: #e7e5e4;
  max-height: 400px;
  opacity: 1;
}

.typing-dots { display: inline-flex; gap: 4px; padding: 11px 13px; background: #ffffff; border: 1px solid #e7e5e4; border-radius: 12px; border-top-left-radius: 4px; }
.typing-dots span { width: 6px; height: 6px; border-radius: 50%; background: #a8a29e; animation: typing 1.2s ease-in-out infinite; }
.typing-dots span:nth-child(2) { animation-delay: 0.2s; }
.typing-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes typing { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-5px); opacity: 1; } }

.cursor { display: inline-block; color: #c15f3c; margin-left: 1px; animation: blink 0.9s steps(2) infinite; }
@keyframes blink { 50% { opacity: 0; } }

/* 底部 */
.panel-footer { border-top: 1px solid #e7e5e4; background: #fafaf9; border-radius: 0 0 12px 12px; }
.quick-cmds { display: flex; gap: 6px; padding: 8px 12px 0; align-items: center; min-width: 0; overflow: hidden; }
.quick-btn { display: inline-flex; align-items: center; gap: 4px; padding: 4px 9px; border: 1px solid #e7e5e4; background: #ffffff; color: #57534e; font-size: 11px; border-radius: 6px; cursor: pointer; transition: all 0.15s; flex-shrink: 0; height: 26px; box-sizing: border-box; }
.quick-btn:hover { background: #f5f5f4; border-color: #d6d3d1; color: #1c1917; }
.quick-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.panel-input { display: flex; gap: 8px; padding: 8px 12px; align-items: flex-end; position: relative; }

/* 斜杠命令菜单 */
.slash-menu { position: absolute; bottom: calc(100% + 4px); left: 12px; right: 12px; background: #fff; border: 1px solid #e7e5e4; border-radius: 8px; box-shadow: 0 8px 24px rgba(28,25,23,0.12); z-index: 10010; overflow: hidden; }
.slash-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; transition: background 0.12s; border-left: 2px solid transparent; }
.slash-item:hover { background: #f5f5f4; }
.slash-item.active { background: rgba(193,95,60,0.08); color: #c15f3c; border-left-color: #c15f3c; }
.slash-icon { flex-shrink: 0; color: #78716c; }
.slash-item.active .slash-icon { color: #c15f3c; }
.slash-name { font-size: 12px; font-weight: 600; color: #1c1917; white-space: nowrap; }
.slash-desc { font-size: 11px; color: #a8a29e; margin-left: auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.send-btn { flex-shrink: 0; width: 34px; height: 34px; border: none; border-radius: 8px; background: #1c1917; color: #fafaf9; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.15s, opacity 0.15s; }
.send-btn:hover { background: #292524; }
.send-btn.disabled { opacity: 0.3; cursor: not-allowed; }
/* 停止按钮：sending 期间替代发送按钮，红色 + 呼吸感，明确可点击终止 */
.send-btn.stop-btn { background: #dc2626; animation: stop-breath 1.4s ease-in-out infinite; }
.send-btn.stop-btn:hover { background: #b91c1c; }
@keyframes stop-breath {
  0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); }
  50%      { box-shadow: 0 0 0 4px rgba(220, 38, 38, 0.2); }
}

/* 底部 token 统计 + 上下文进度条 */
.ctx-foot { padding: 4px 12px 8px; display: flex; flex-direction: column; gap: 4px; }
.ctx-stat { font-size: 10px; color: #a8a29e; font-family: 'SF Mono', 'Menlo', 'Consolas', monospace; }
.ctx-progress { display: flex; align-items: center; gap: 6px; }
.ctx-progress-label { font-size: 9.5px; color: #a8a29e; flex-shrink: 0; }
.ctx-progress-bar { width: 90px; height: 5px; background: #e7e5e4; border-radius: 3px; overflow: hidden; flex-shrink: 0; }
.ctx-progress-fill { height: 100%; background: #c15f3c; border-radius: 3px; transition: width 0.3s ease, background 0.2s; }
.ctx-progress.warn .ctx-progress-fill { background: #dc2626; }
.ctx-progress-text { font-size: 9.5px; color: #a8a29e; font-family: 'SF Mono', 'Menlo', 'Consolas', monospace; white-space: nowrap; margin-left: auto; }
.ctx-progress.warn .ctx-progress-text { color: #dc2626; }

/* 压缩胶囊：嵌在进度条行末尾，不独占行 */
.ctx-pill-compacted {
  flex-shrink: 0;
  font-size: 9px;
  color: #16a34a;
  background: rgba(22, 163, 74, 0.1);
  border: 1px solid rgba(22, 163, 74, 0.25);
  padding: 1px 6px;
  border-radius: 8px;
  margin-left: 4px;
  white-space: nowrap;
  cursor: help;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  line-height: 1.4;
}

.panel-enter-active, .panel-leave-active { transition: opacity 0.25s cubic-bezier(0.16,1,0.3,1), transform 0.25s cubic-bezier(0.16,1,0.3,1); }
.panel-enter-from, .panel-leave-to { opacity: 0; transform: translateY(16px) scale(0.94); }
.msg { animation: msg-in 0.3s cubic-bezier(0.16,1,0.3,1); }
@keyframes msg-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

/* /model 模型选择弹窗 */
.picker-mask { position: absolute; inset: 0; background: rgba(28,25,23,0.32); z-index: 10020; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
.picker-dialog { width: 380px; max-height: 70vh; background: #fafaf9; border-radius: 12px; box-shadow: 0 16px 48px rgba(28,25,23,0.24); display: flex; flex-direction: column; overflow: hidden; }
.picker-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #e7e5e4; }
.picker-title { font-size: 13.5px; font-weight: 600; color: #1c1917; }
.picker-hint { font-size: 10.5px; color: #a8a29e; flex: 1; text-align: center; }
.picker-close { width: 26px; height: 26px; border: none; background: transparent; color: #78716c; cursor: pointer; border-radius: 6px; display: flex; align-items: center; justify-content: center; }
.picker-close:hover { background: #e7e5e4; color: #1c1917; }
.picker-body { flex: 1; overflow-y: auto; padding: 8px; }
.picker-body::-webkit-scrollbar { width: 6px; }
.picker-body::-webkit-scrollbar-thumb { background: #d6d3d1; border-radius: 3px; }
.picker-group { margin-bottom: 4px; }
.picker-group-name { font-size: 11px; font-weight: 600; color: #a8a29e; padding: 8px 10px 4px; text-transform: uppercase; letter-spacing: 0.3px; }
.picker-model { padding: 9px 10px; border-radius: 8px; cursor: pointer; transition: background 0.12s; }
.picker-model:hover { background: #f5f5f4; }
.picker-model.active { background: rgba(193,95,60,0.08); }
.picker-model-name { font-size: 12.5px; font-weight: 500; color: #1c1917; display: flex; align-items: center; gap: 6px; }
.picker-model.active .picker-model-name { color: #c15f3c; }
.picker-model-ctx { font-size: 9.5px; color: #a8a29e; background: #e7e5e4; padding: 1px 5px; border-radius: 3px; font-family: 'SF Mono', 'Menlo', 'Consolas', monospace; }
.picker-model-id { font-size: 10.5px; color: #a8a29e; margin-top: 2px; font-family: 'SF Mono', 'Menlo', 'Consolas', monospace; }
.picker-empty { text-align: center; color: #a8a29e; padding: 32px 0; font-size: 13px; }

.picker-enter-active, .picker-leave-active { transition: opacity 0.2s ease; }
.picker-enter-from, .picker-leave-to { opacity: 0; }
.picker-enter-active .picker-dialog, .picker-leave-active .picker-dialog { transition: transform 0.2s cubic-bezier(0.16,1,0.3,1); }
.picker-enter-from .picker-dialog, .picker-leave-to .picker-dialog { transform: scale(0.96) translateY(8px); }
</style>
