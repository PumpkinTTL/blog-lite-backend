<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { CheckmarkCircle, CloseCircle, SyncCircle, ChevronDownOutline } from '@vicons/ionicons5'
import type { AiToolCall } from '../../api/ai'

type Status = 'pending' | 'running' | 'success' | 'error'

const props = defineProps<{
  call: AiToolCall
  status: Status
  result?: string
  /** 流式工具进度文本（web_search 的"正在搜索…"），仅 running 期间显示 */
  progress?: string
}>()

// 折叠状态：running 时展开（看进度），success/error 后自动收起。用户仍可手动点开。
const expanded = ref(props.status === 'running')
watch(
  () => props.status,
  (s) => { if (s !== 'running') expanded.value = false },
)

// 是否为"实时流式完成"：挂载时已是 success 视为历史回放，不播揭示动画。
// 只有 running→success 的实时转换才播逐条出现动画（首次见证）。
// 历史/滚动重现的已完成卡片直接全量展示，避免 setInterval 重跑导致卡顿。
const isLiveReveal = ref(props.status === 'running')

// 工具名中文映射
const NAME_LABEL: Record<string, string> = {
  get_article: '读取文章',
  get_content_section: '读取正文片段',
  read_section_by_heading: '按标题读取',
  get_outline: '提取大纲',
  update_title: '修改标题',
  update_subtitle: '修改副标题',
  update_summary: '修改摘要',
  update_slug: '修改 Slug',
  append_content: '追加正文',
  replace_content: '替换正文',
  insert_content_at: '插入正文',
  insert_after_heading: '按标题插入',
  find_and_replace: '查找替换',
  delete_lines: '删除行',
  move_lines: '移动行',
  wrap_text: '包裹标记',
  deduplicate_lines: '清理排版',
  get_word_count: '字数统计',
  web_search: '联网搜索',
}

const label = computed(() => NAME_LABEL[props.call.function.name] || props.call.function.name)
const isWebSearch = computed(() => props.call.function.name === 'web_search')

// 参数解析为 key-value 数组（结构化展示）
type KV = { key: string; value: string }
const argsList = computed(() => {
  try {
    const obj = JSON.parse(props.call.function.arguments || '{}')
    const list: KV[] = Object.entries(obj).map(([k, v]) => ({
      key: k,
      value: typeof v === 'string' ? v : JSON.stringify(v),
    }))
    return list
  } catch {
    return [{ key: '(原始)', value: props.call.function.arguments }]
  }
})

// 结果解析为 key-value 数组（非 web_search 工具用）
const resultList = computed(() => {
  // web_search 用专属的卡片式列表，不走通用 kv 展示
  if (isWebSearch.value) return [] as KV[]
  if (!props.result) return [] as KV[]
  try {
    const obj = JSON.parse(props.result)
    const list: KV[] = Object.entries(obj).map(([k, v]) => ({
      key: k,
      value: typeof v === 'string' ? v : JSON.stringify(v),
    }))
    return list
  } catch {
    return [{ key: '(原始)', value: props.result.slice(0, 200) }]
  }
})

/* ============ web_search 专属：逐条渲染动画 ============ */
type SearchResultItem = {
  title: string
  url: string
  content: string
  score: number
}
/** 已揭示的结果（逐条 push，驱动动画） */
const revealedResults = ref<SearchResultItem[]>([])
/** 搜索元信息（answer / responseTime / 总数） */
const searchMeta = ref<{ answer: string | null; responseTime: number; total: number } | null>(null)
let revealTimer: ReturnType<typeof setInterval> | null = null

function clearRevealTimer() {
  if (revealTimer) { clearInterval(revealTimer); revealTimer = null }
}

// 从 url 提取域名（卡片右下角显示来源）
function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url.slice(0, 40)
  }
}

// watch result：success 时解析搜索结果。
// - 实时流式完成（isLiveReveal）：启动逐条揭示动画，模拟"结果一条条出现"。
// - 历史回放/滚动重现（挂载即 success）：直接全量展示，不启动 setInterval，
//   避免每张卡片挂载都重跑定时器导致快速滚动卡顿。
watch(
  () => [props.result, props.status] as const,
  ([result, status]) => {
    if (!isWebSearch.value || status !== 'success' || !result) {
      revealedResults.value = []
      searchMeta.value = null
      clearRevealTimer()
      return
    }
    try {
      const parsed = JSON.parse(result)
      const all: SearchResultItem[] = Array.isArray(parsed.results) ? parsed.results : []
      searchMeta.value = {
        answer: parsed.answer ?? null,
        responseTime: parsed.responseTime ?? 0,
        total: all.length,
      }
      // 历史回放：直接全量，不播动画
      if (!isLiveReveal.value) {
        revealedResults.value = all
        return
      }
      // 实时完成：逐条揭示动画（仅本次实时转换触发一次）
      revealedResults.value = []
      clearRevealTimer()
      let idx = 0
      revealTimer = setInterval(() => {
        if (idx >= all.length) {
          clearRevealTimer()
          return
        }
        revealedResults.value.push(all[idx])
        idx++
      }, 150)
    } catch {
      revealedResults.value = []
      searchMeta.value = null
    }
  },
  { immediate: true },
)

onBeforeUnmount(clearRevealTimer)

// 截断长文本用于摘要展示
function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s
}

const statusIcon = computed(() => {
  switch (props.status) {
    case 'running': return SyncCircle
    case 'success': return CheckmarkCircle
    case 'error': return CloseCircle
    default: return SyncCircle
  }
})

const statusColor = computed(() => {
  switch (props.status) {
    case 'running': return 'var(--accent)'
    case 'success': return 'var(--success)'
    case 'error': return 'var(--warn)'
    default: return 'var(--text-5)'
  }
})

const statusText = computed(() => {
  switch (props.status) {
    case 'running': return '执行中'
    case 'success': return '完成'
    case 'error': return '失败'
    default: return '等待'
  }
})
</script>

<template>
  <div class="tool-card" :class="`is-${status}`">
    <!-- 头部：工具调用标签 + 状态点 + 工具名 + 状态 -->
    <div class="tool-head" @click="expanded = !expanded">
      <span v-if="status !== 'success'" class="tool-call-label">
        <i class="ico tool-label-icon" :style="{ fontSize: 11 + 'px' }"><component :is="statusIcon" /></i>
        <span>工具调用</span>
      </span>
      <span v-if="status !== 'success'" class="tool-status-dot" :style="{ background: statusColor }" :class="{ spinning: status === 'running' }" />
      <span class="tool-name">{{ label }}</span>
      <span class="tool-tag">{{ call.function.name }}</span>
      <span class="tool-status-text" :style="{ color: statusColor }">
        <i class="ico" :style="{ fontSize: 12 + 'px' }"><component :is="statusIcon" /></i>
        {{ statusText }}
      </span>
      <i class="ico tool-chevron" :class="{ rotated: expanded }" :style="{ fontSize: 12 + 'px' }">
        <ChevronDownOutline />
      </i>
    </div>

    <!-- 参数概览（展开才显示，折叠态更干净） -->
    <div v-if="expanded && argsList.length > 0" class="tool-section">
      <div v-for="arg in argsList" :key="arg.key" class="kv-row">
        <span class="kv-key">{{ arg.key }}</span>
        <span class="kv-val">{{ truncate(arg.value, 80) }}</span>
      </div>
    </div>

    <!-- 流式进度（仅 running 期间，如 web_search 的"正在搜索…"） -->
    <div v-if="progress && status === 'running'" class="tool-section tool-progress-section">
      <div class="kv-row">
        <span class="kv-key">进度</span>
        <span class="kv-val kv-progress">{{ progress }}</span>
      </div>
    </div>

    <!-- web_search 专属：紧凑卡片式结果，逐条揭示动画 -->
    <div v-if="isWebSearch && status === 'success' && searchMeta" class="tool-section tool-search-section">
      <div class="search-meta">
        共 {{ searchMeta.total }} 条{{ searchMeta.responseTime ? ` · ${searchMeta.responseTime}s` : '' }}
      </div>
      <transition-group name="search-item" tag="div" class="search-list">
        <a
          v-for="(r, i) in revealedResults"
          :key="r.url || i"
          :href="r.url"
          target="_blank"
          rel="noopener noreferrer"
          class="search-item"
          :title="r.title"
        >
          <span class="search-item-main">
            <span class="search-item-title">{{ truncate(r.title || '(无标题)', 44) }}</span>
            <span class="search-item-domain">{{ domainOf(r.url) }}</span>
          </span>
          <span v-if="r.content" class="search-item-snippet">{{ truncate(r.content, 90) }}</span>
        </a>
      </transition-group>
    </div>

    <!-- 其他工具：通用 key-value 结果展示 -->
    <div v-else-if="!isWebSearch && resultList.length > 0" class="tool-section tool-result-section">
      <div v-for="r in resultList" :key="r.key" class="kv-row">
        <span class="kv-key">{{ r.key }}</span>
        <span class="kv-val">{{ truncate(r.value, 80) }}</span>
      </div>
    </div>

    <!-- 展开详情（靠 expanded 控制）：id + 完整参数/结果 JSON -->
    <div v-if="expanded" class="tool-detail">
      <div class="detail-row">
        <span class="detail-label">call_id</span>
        <code class="detail-val">{{ call.id || '(无)' }}</code>
      </div>
      <div class="detail-row">
        <span class="detail-label">参数（原始）</span>
      </div>
      <pre class="detail-code">{{ call.function.arguments || '{}' }}</pre>
      <template v-if="result">
        <div class="detail-row">
          <span class="detail-label">结果（原始）</span>
        </div>
        <pre class="detail-code">{{ result }}</pre>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* 通用图标容器（与 AgentPanel 的 .ico 定义一致）：font-size 驱动 svg，line-height:0 消除基线偏移 */
.ico {
  display: inline-flex; align-items: center; justify-content: center;
  line-height: 0; font-style: normal; vertical-align: middle; flex-shrink: 0;
}
.ico :deep(svg) { width: 1em; height: 1em; display: block; }

.tool-card {
  padding: 9px 11px;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: 12px;
  transition: border-color 0.2s;
}
.tool-card.is-running {
  border-color: var(--accent);
  background: var(--accent-bg);
  /* 呼吸效果：外发光脉动，1.6s 一个周期 */
  animation: tool-breath 1.6s ease-in-out infinite;
}
@keyframes tool-breath {
  0%, 100% { box-shadow: 0 0 0 0 rgba(193, 95, 60, 0); }
  50%      { box-shadow: 0 0 0 3px rgba(193, 95, 60, 0.15); }
}
/* running 时"工具调用"标签轻微明灭，增强呼吸感 */
.tool-card.is-running .tool-call-label { animation: label-fade 1.6s ease-in-out infinite; }
@keyframes label-fade {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.45; }
}
.tool-card.is-success { border-color: var(--border); }
.tool-card.is-error { border-color: var(--warn); background: var(--error-bg); }

/* 头部内"工具调用"标签（和工具名同一行） */
.tool-call-label {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: var(--text-5);
  padding-right: 6px;
  margin-right: 2px;
  border-right: 1px solid var(--border);
}
.tool-label-icon { color: var(--accent); }

/* 头部 */
.tool-head {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}
.tool-status-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.tool-status-dot.spinning { animation: dot-pulse 1s ease-in-out infinite; }
@keyframes dot-pulse { 50% { opacity: 0.4; } }
.tool-name { font-weight: 600; color: var(--text); }
.tool-tag {
  font-size: 10px;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--surface-3);
  color: var(--text-4);
  letter-spacing: 0.3px;
}
.tool-status-text {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 500;
}
.tool-chevron { color: var(--text-5); transition: transform 0.2s; }
.tool-chevron.rotated { transform: rotate(180deg); }

/* 参数/结果 区块 */
.tool-section {
  margin-top: 7px;
  padding-top: 6px;
  border-top: 1px dashed var(--border);
}
.tool-result-section .kv-val { color: var(--success); }

/* ============ web_search 结果：单行紧凑列表 ============ */
.tool-search-section { padding-top: 7px; }
.search-meta { font-size: 10px; color: var(--text-5); margin-bottom: 4px; }
.search-list { display: flex; flex-direction: column; gap: 2px; }
.search-item {
  display: flex; flex-direction: column; gap: 2px;
  padding: 5px 7px;
  border-radius: 5px;
  background: var(--bg);
  border: 1px solid var(--surface-2);
  text-decoration: none;
  transition: border-color 0.12s, background 0.12s;
  line-height: 1.4;
}
.search-item:hover { background: var(--surface); border-color: var(--border); }
/* 第一行：标题 + 域名 */
.search-item-main {
  display: flex; align-items: baseline; gap: 6px;
  min-width: 0;
}
/* 标题：主体，可省略 */
.search-item-title {
  font-size: 11.5px; color: var(--text); font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  flex: 1;
}
.search-item:hover .search-item-title { color: var(--accent); }
/* 来源域名：标题右侧灰色等宽小字 */
.search-item-domain {
  font-size: 9px; color: var(--text-5);
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  flex-shrink: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 40%;
}
/* 第二行：内容摘要，2行截断 */
.search-item-snippet {
  font-size: 10.5px; color: var(--text-4); line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
/* 逐条揭示动画 */
.search-item-enter-active { transition: all 0.2s ease; }
.search-item-enter-from { opacity: 0; transform: translateX(-4px); }
/* 进度区块（running 期间） */
.tool-progress-section .kv-progress { color: var(--accent); }

.kv-row {
  display: flex;
  gap: 8px;
  line-height: 1.6;
  font-size: 11px;
}
.kv-key {
  flex-shrink: 0;
  color: var(--text-5);
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  min-width: 60px;
}
.kv-val {
  color: var(--text-3);
  word-break: break-all;
  flex: 1;
}

/* 展开详情 */
.tool-detail {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}
.detail-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 3px;
}
.detail-label {
  font-size: 10px;
  color: var(--text-5);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.detail-val {
  font-size: 10px;
  color: var(--text-4);
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
}
.detail-code {
  margin: 0 0 6px;
  padding: 7px;
  background: var(--surface-3);
  border-radius: 5px;
  font-size: 10.5px;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-2);
  max-height: 140px;
  overflow: auto;
}
</style>
