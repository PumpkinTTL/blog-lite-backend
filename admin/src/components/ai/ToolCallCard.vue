<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { NIcon } from 'naive-ui'
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

// 工具名中文映射
const NAME_LABEL: Record<string, string> = {
  get_article: '读取文章',
  get_content_section: '读取正文片段',
  update_title: '修改标题',
  update_subtitle: '修改副标题',
  update_summary: '修改摘要',
  update_slug: '修改 Slug',
  append_content: '追加正文',
  replace_content: '替换正文',
  insert_content_at: '插入正文',
  find_and_replace: '查找替换',
  delete_lines: '删除行',
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

// watch result：success 时解析，启动逐条揭示动画
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
      // 逐条揭示：每 150ms push 一条，模拟"搜索结果一条条出现"
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
    case 'running': return '#c15f3c'
    case 'success': return '#16a34a'
    case 'error': return '#dc2626'
    default: return '#a8a29e'
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
        <n-icon :size="11" class="tool-label-icon"><component :is="statusIcon" /></n-icon>
        <span>工具调用</span>
      </span>
      <span v-if="status !== 'success'" class="tool-status-dot" :style="{ background: statusColor }" :class="{ spinning: status === 'running' }" />
      <span class="tool-name">{{ label }}</span>
      <span class="tool-tag">{{ call.function.name }}</span>
      <span class="tool-status-text" :style="{ color: statusColor }">
        <n-icon :size="12"><component :is="statusIcon" /></n-icon>
        {{ statusText }}
      </span>
      <n-icon :size="12" class="tool-chevron" :class="{ rotated: expanded }">
        <ChevronDownOutline />
      </n-icon>
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
.tool-card {
  padding: 9px 11px;
  border-radius: 8px;
  background: #ffffff;
  border: 1px solid #e7e5e4;
  font-size: 12px;
  transition: border-color 0.2s;
}
.tool-card.is-running {
  border-color: #c15f3c;
  background: #fefcfb;
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
.tool-card.is-success { border-color: #e7e5e4; }
.tool-card.is-error { border-color: #dc2626; background: #fef9f9; }

/* 头部内"工具调用"标签（和工具名同一行） */
.tool-call-label {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: #a8a29e;
  padding-right: 6px;
  margin-right: 2px;
  border-right: 1px solid #e7e5e4;
}
.tool-label-icon { color: #c15f3c; }

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
.tool-name { font-weight: 600; color: #1c1917; }
.tool-tag {
  font-size: 10px;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  padding: 1px 6px;
  border-radius: 4px;
  background: #f5f5f4;
  color: #78716c;
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
.tool-chevron { color: #a8a29e; transition: transform 0.2s; }
.tool-chevron.rotated { transform: rotate(180deg); }

/* 参数/结果 区块 */
.tool-section {
  margin-top: 7px;
  padding-top: 6px;
  border-top: 1px dashed #e7e5e4;
}
.tool-result-section .kv-val { color: #16a34a; }

/* ============ web_search 结果：单行紧凑列表 ============ */
.tool-search-section { padding-top: 7px; }
.search-meta { font-size: 10px; color: #a8a29e; margin-bottom: 4px; }
.search-list { display: flex; flex-direction: column; gap: 2px; }
.search-item {
  display: flex; flex-direction: column; gap: 2px;
  padding: 5px 7px;
  border-radius: 5px;
  background: #fafaf9;
  border: 1px solid #f0eeec;
  text-decoration: none;
  transition: border-color 0.12s, background 0.12s;
  line-height: 1.4;
}
.search-item:hover { background: #fff; border-color: #e7e5e4; }
/* 第一行：标题 + 域名 */
.search-item-main {
  display: flex; align-items: baseline; gap: 6px;
  min-width: 0;
}
/* 标题：主体，可省略 */
.search-item-title {
  font-size: 11.5px; color: #1c1917; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  flex: 1;
}
.search-item:hover .search-item-title { color: #c15f3c; }
/* 来源域名：标题右侧灰色等宽小字 */
.search-item-domain {
  font-size: 9px; color: #a8a29e;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  flex-shrink: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 40%;
}
/* 第二行：内容摘要，2行截断 */
.search-item-snippet {
  font-size: 10.5px; color: #78716c; line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
/* 逐条揭示动画 */
.search-item-enter-active { transition: all 0.2s ease; }
.search-item-enter-from { opacity: 0; transform: translateX(-4px); }
/* 进度区块（running 期间） */
.tool-progress-section .kv-progress { color: #c15f3c; }

.kv-row {
  display: flex;
  gap: 8px;
  line-height: 1.6;
  font-size: 11px;
}
.kv-key {
  flex-shrink: 0;
  color: #a8a29e;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  min-width: 60px;
}
.kv-val {
  color: #57534e;
  word-break: break-all;
  flex: 1;
}

/* 展开详情 */
.tool-detail {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #e7e5e4;
}
.detail-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 3px;
}
.detail-label {
  font-size: 10px;
  color: #a8a29e;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.detail-val {
  font-size: 10px;
  color: #78716c;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
}
.detail-code {
  margin: 0 0 6px;
  padding: 7px;
  background: #f5f5f4;
  border-radius: 5px;
  font-size: 10.5px;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  white-space: pre-wrap;
  word-break: break-all;
  color: #44403c;
  max-height: 140px;
  overflow: auto;
}
</style>
