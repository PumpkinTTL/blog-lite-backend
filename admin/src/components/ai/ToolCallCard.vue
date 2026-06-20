<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import type { AiToolCall } from '../../api/ai'

type Status = 'pending' | 'running' | 'success' | 'error'

const props = defineProps<{
  call: AiToolCall
  status: Status
  result?: string
  /** 流式工具进度文本（web_search 的"正在搜索…"），仅 running 期间显示 */
  progress?: string
}>()

// 折叠状态：默认收起。
// 之前 running 时自动展开（看进度），但并行多工具时 running→success 的高度突变
// 会让 DynamicScroller 偶尔测不准（ResizeObserver 漏测），导致工具间留白。
// 改为始终默认收起，高度恒定，DS 测一次就准；用户想看进度/结果再点开。
// （running 进度文本 tc-progress-label 在折叠态也显示，不丢信息。）
const expanded = ref(false)

// 是否为"实时流式完成"：挂载时已是 success 视为历史回放，不播揭示动画。
const isLiveReveal = ref(props.status === 'running')

// 工具命令名映射：动词 + 对象的 CLI 命令式（全小写）
const NAME_LABEL: Record<string, string> = {
  get_article: 'read article',
  get_content_section: 'read section',
  read_section_by_heading: 'read by heading',
  get_outline: 'read outline',
  update_title: 'edit title',
  update_subtitle: 'edit subtitle',
  update_summary: 'edit summary',
  update_slug: 'edit slug',
  append_content: 'append content',
  replace_content: 'replace content',
  insert_content_at: 'insert content',
  insert_after_heading: 'insert after heading',
  find_and_replace: 'find & replace',
  delete_lines: 'delete lines',
  move_lines: 'move lines',
  wrap_text: 'wrap text',
  deduplicate_lines: 'dedupe lines',
  get_word_count: 'count words',
  web_search: 'search web',
}

const label = computed(() => NAME_LABEL[props.call.function.name] || props.call.function.name)
const isWebSearch = computed(() => props.call.function.name === 'web_search')

// 工具种类：读取/写入/搜索/其他
const toolKind = computed(() => {
  const n = props.call.function.name
  if (n === 'web_search') return 'search'
  if (n.startsWith('get_') || n === 'read_section_by_heading' || n === 'get_outline') return 'read'
  if (n.startsWith('update_') || n.startsWith('append_') || n.startsWith('replace_') ||
      n.startsWith('insert_') || n === 'find_and_replace' || n.startsWith('delete_') ||
      n.startsWith('move_') || n === 'wrap_text' || n === 'deduplicate_lines') return 'write'
  return 'tool'
})

// 参数解析为 key-value 数组
type KV = { key: string; value: string }
const argsList = computed(() => {
  try {
    const obj = JSON.parse(props.call.function.arguments || '{}')
    return Object.entries(obj).map(([k, v]) => ({
      key: k,
      value: typeof v === 'string' ? v : JSON.stringify(v),
    })) as KV[]
  } catch {
    return [{ key: '原始', value: props.call.function.arguments }]
  }
})

// 结果解析（非 web_search）
const resultList = computed(() => {
  if (isWebSearch.value || !props.result) return [] as KV[]
  try {
    const obj = JSON.parse(props.result)
    return Object.entries(obj).map(([k, v]) => ({
      key: k,
      value: typeof v === 'string' ? v : JSON.stringify(v),
    })) as KV[]
  } catch {
    return [{ key: '原始', value: props.result.slice(0, 200) }]
  }
})

/* ============ web_search 专属 ============ */
type SearchResultItem = { title: string; url: string; content: string; score: number }
const revealedResults = ref<SearchResultItem[]>([])
const searchMeta = ref<{ answer: string | null; responseTime: number; total: number } | null>(null)
let revealTimer: ReturnType<typeof setInterval> | null = null

function clearRevealTimer() {
  if (revealTimer) { clearInterval(revealTimer); revealTimer = null }
}

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url.slice(0, 30) }
}

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
      searchMeta.value = { answer: parsed.answer ?? null, responseTime: parsed.responseTime ?? 0, total: all.length }
      if (!isLiveReveal.value) { revealedResults.value = all; return }
      revealedResults.value = []
      clearRevealTimer()
      let idx = 0
      revealTimer = setInterval(() => {
        if (idx >= all.length) { clearRevealTimer(); return }
        revealedResults.value.push(all[idx++])
      }, 140)
    } catch {
      revealedResults.value = []
      searchMeta.value = null
    }
  },
  { immediate: true },
)

onBeforeUnmount(clearRevealTimer)

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + '…' : s
}

const statusText = computed(() => {
  switch (props.status) {
    case 'running': return 'running'
    case 'success': return 'done'
    case 'error':   return 'fail'
    default:        return 'idle'
  }
})
</script>

<template>
  <!-- TUI 终端式工具调用：$ command → status -->
  <div class="tc-card" :class="`is-${status}`">

    <!-- 头部：点击折叠/展开 -->
    <div class="tc-head" @click="expanded = !expanded">
      <!-- 命令提示符 + 命令名 -->
      <span class="tc-prompt">$</span>
      <span class="tc-icon" :class="`kind-${toolKind}`">
        <!-- 联网搜索 -->
        <svg v-if="toolKind === 'search'" viewBox="0 0 20 20" fill="none">
          <circle cx="8.5" cy="8.5" r="5" stroke="currentColor" stroke-width="1.6"/>
          <path d="M13 13l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
        <!-- 读取 -->
        <svg v-else-if="toolKind === 'read'" viewBox="0 0 20 20" fill="none">
          <rect x="4" y="3" width="12" height="14" rx="2" stroke="currentColor" stroke-width="1.6"/>
          <path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        <!-- 写入/编辑 -->
        <svg v-else-if="toolKind === 'write'" viewBox="0 0 20 20" fill="none">
          <path d="M13.5 3.5a2 2 0 0 1 2.828 2.828l-8.5 8.5L4 16l1.172-3.828 8.328-8.672z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
        </svg>
        <!-- 其他工具 -->
        <svg v-else viewBox="0 0 20 20" fill="none">
          <path d="M8 3a1 1 0 0 0-1 1v1.17A5 5 0 0 0 5 9.17V15a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9.17A5 5 0 0 0 13 5.17V4a1 1 0 0 0-1-1H8z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
      </span>
      <span class="tc-name">{{ label }}</span>

      <!-- 状态：圆点 + 文字（行尾） -->
      <span class="tc-status" :class="`st-${status}`">
        <span class="tc-status-dot" :class="`dot-${status}`">
          <span v-if="status === 'running'" class="tc-dot-pulse"></span>
          <svg v-else-if="status === 'success'" viewBox="0 0 10 10">
            <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          </svg>
          <svg v-else-if="status === 'error'" viewBox="0 0 10 10">
            <path d="M3 3l4 4M7 3l-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>
          </svg>
        </span>
        <span class="tc-status-text">{{ statusText }}</span>
      </span>

      <!-- 折叠箭头 -->
      <svg class="tc-chevron" :class="{ rotated: expanded }" viewBox="0 0 16 16" fill="none">
        <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>

    <!-- running 时底部细进度条 -->
    <div v-if="status === 'running'" class="tc-progress-bar">
      <div class="tc-progress-fill"></div>
    </div>

    <!-- 流式进度文本（web_search "正在搜索…"） -->
    <div v-if="progress && status === 'running'" class="tc-progress-label">
      <span class="tc-blink-dot"></span>
      {{ progress }}
    </div>

    <!-- ===== 展开内容：CLI 参数风格 ===== -->
    <div v-if="expanded" class="tc-body">

      <!-- 参数：--key value 命令行选项式 -->
      <div v-if="argsList.length > 0" class="tc-section">
        <div class="tc-section-title">args</div>
        <div class="tc-cli-args">
          <div v-for="arg in argsList" :key="arg.key" class="tc-cli-arg">
            <span class="tc-cli-flag">--{{ arg.key }}</span>
            <span class="tc-cli-val">{{ truncate(arg.value, 120) }}</span>
          </div>
        </div>
      </div>

      <!-- web_search 结果 -->
      <div v-if="isWebSearch && status === 'success' && searchMeta" class="tc-section">
        <div class="tc-section-title">
          results
          <span class="tc-section-meta">{{ searchMeta.total }} found{{ searchMeta.responseTime ? ` · ${searchMeta.responseTime}s` : '' }}</span>
        </div>
        <transition-group name="sr" tag="div" class="tc-search-list">
          <a
            v-for="(r, i) in revealedResults"
            :key="r.url || i"
            :href="r.url"
            target="_blank"
            rel="noopener noreferrer"
            class="tc-search-item"
          >
            <div class="tc-sr-top">
              <span class="tc-sr-num">{{ i + 1 }}</span>
              <span class="tc-sr-domain">{{ domainOf(r.url) }}</span>
              <svg class="tc-sr-link" viewBox="0 0 12 12" fill="none">
                <path d="M2 10L9 3M5 3h4v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="tc-sr-title">{{ truncate(r.title || '(无标题)', 50) }}</div>
            <div v-if="r.content" class="tc-sr-snippet">{{ truncate(r.content, 90) }}</div>
          </a>
        </transition-group>
      </div>

      <!-- 其他工具结果：→ 返回值 -->
      <div v-else-if="!isWebSearch && resultList.length > 0" class="tc-section">
        <div class="tc-section-title tc-section-title-ok">return</div>
        <div class="tc-cli-args">
          <div v-for="r in resultList" :key="r.key" class="tc-cli-arg">
            <span class="tc-cli-arrow">→</span>
            <span class="tc-cli-val tc-cli-val-ok">{{ truncate(r.value, 120) }}</span>
          </div>
        </div>
      </div>

      <!-- 原始 JSON 折叠 -->
      <details class="tc-details">
        <summary>raw</summary>
        <pre class="tc-pre">{{ call.function.arguments || '{}' }}</pre>
        <template v-if="result">
          <div class="tc-raw-label">result</div>
          <pre class="tc-pre">{{ result }}</pre>
        </template>
      </details>

    </div>
  </div>
</template>

<style scoped>
/* =====================================================================
   ToolCallCard — 无卡片纯文字行，工具调用融进消息流，像终端日志
   去掉所有容器样式（边框/圆角/背景），只留文字本身。
   ===================================================================== */

/* ---- 根：无容器，纯文字流 ----------------------------------------- */
.tc-card {
  font-size: 12.5px;
  font-family: 'SF Mono', 'Menlo', 'Consolas', 'Liberation Mono', monospace;
  color: var(--text-4);
  line-height: 1.7;
}

/* ---- 头部：一行命令，无 hover 背景变化 ---------------------------- */
.tc-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  cursor: pointer;
  user-select: none;
  transition: color 0.14s;
}
.tc-head:hover { color: var(--text-2); }

/* 命令提示符 $：淡灰 */
.tc-prompt {
  color: var(--text-6);
  flex-shrink: 0;
  user-select: none;
}

/* ---- 工具图标：12px，与文字同色系 --------------------------------- */
.tc-icon {
  width: 12px; height: 12px;
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-5);
  opacity: 0.85;
}
.tc-icon svg { width: 12px; height: 12px; display: block; }

/* ---- 命令名 ------------------------------------------------------- */
.tc-name {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 400;
  color: inherit;
  line-height: 1.7;
  letter-spacing: 0.1px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* ---- 状态：小圆点 + 文字（行尾，同色系，不抢眼） ------------------- */
.tc-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-5);
}
.tc-status-dot {
  width: 8px; height: 8px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.tc-status-dot svg { width: 9px; height: 9px; display: block; }
/* running：呼吸圆点 */
.tc-dot-pulse {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--accent);
  animation: tc-pulse 1.1s ease-in-out infinite;
}
@keyframes tc-pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
.dot-running { color: var(--accent); }
.dot-success { color: var(--success); }
.dot-error   { color: var(--warn); }
.dot-pending { opacity: 0.4; }
.st-running { color: var(--accent); }
.st-success { color: var(--success); }
.st-error   { color: var(--warn); }

/* ---- 折叠箭头：极淡，hover 才显 ---------------------------------- */
.tc-chevron {
  width: 11px; height: 11px; flex-shrink: 0;
  color: var(--text-6);
  opacity: 0.5;
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.14s;
  display: block;
}
.tc-head:hover .tc-chevron { opacity: 1; }
.tc-chevron.rotated { transform: rotate(180deg); }

/* ---- running 进度条（紧贴命令下方，无容器） ----------------------- */
.tc-progress-bar {
  height: 1px;
  margin-top: 3px;
  background: transparent;
  overflow: hidden;
}
.tc-progress-fill {
  height: 100%;
  width: 30%;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  animation: tc-slide 1.5s ease-in-out infinite;
}
@keyframes tc-slide { 0% { transform: translateX(-180%); } 100% { transform: translateX(480%); } }

/* ---- 进度文本：缩进，无背景 -------------------------------------- */
.tc-progress-label {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 0 0 16px;
  font-size: 11px;
  color: var(--accent);
}
.tc-blink-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
  animation: tc-blink 1.1s ease-in-out infinite;
}
@keyframes tc-blink { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }

/* ---- 展开内容：缩进，无容器，紧贴命令 ---------------------------- */
.tc-body {
  padding: 4px 0 2px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* ---- 区块标题：淡灰小字 ------------------------------------------ */
.tc-section { display: flex; flex-direction: column; gap: 3px; }
.tc-section-title {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 400;
  color: var(--text-6);
  letter-spacing: 0.2px;
}
.tc-section-title-ok { color: var(--success); opacity: 0.8; }
.tc-section-meta {
  color: var(--text-6);
  font-size: 10px;
}

/* ---- CLI 参数：--flag value，无容器块 ----------------------------- */
.tc-cli-args {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.tc-cli-arg {
  display: flex;
  gap: 7px;
  font-size: 11.5px;
  line-height: 1.8;
  align-items: baseline;
}
.tc-cli-flag {
  color: var(--accent);
  opacity: 0.9;
  flex-shrink: 0;
  white-space: nowrap;
}
.tc-cli-arrow {
  color: var(--success);
  opacity: 0.9;
  flex-shrink: 0;
}
.tc-cli-val {
  color: var(--text-3);
  word-break: break-all;
  min-width: 0;
}
.tc-cli-val-ok { color: var(--success); opacity: 0.9; }

/* ---- web_search 结果列表（保留轻量卡片，因为是可点击链接） -------- */
.tc-search-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 2px;
}
.tc-search-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 9px;
  border-radius: 6px;
  background: var(--surface-2);
  border: 1px solid var(--border-soft);
  text-decoration: none;
  transition: border-color 0.14s, background 0.14s;
}
.tc-search-item:hover {
  background: var(--surface-3);
  border-color: var(--accent-border);
}
.tc-sr-top {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 1px;
}
.tc-sr-num {
  font-size: 9.5px;
  font-weight: 600;
  color: var(--text-6);
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  flex-shrink: 0;
}
.tc-sr-domain {
  font-size: 10.5px;
  color: var(--text-5);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  flex: 1; min-width: 0;
}
.tc-sr-link {
  width: 10px; height: 10px;
  flex-shrink: 0;
  color: var(--text-6);
  opacity: 0;
  transition: opacity 0.14s;
  display: block;
}
.tc-search-item:hover .tc-sr-link   { opacity: 1; color: var(--accent); }
.tc-search-item:hover .tc-sr-domain { color: var(--text-3); }
.tc-sr-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
  font-family: system-ui, sans-serif;  /* 标题用常规字体，更易读 */
  line-height: 1.4;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tc-search-item:hover .tc-sr-title { color: var(--accent); }
.tc-sr-snippet {
  font-size: 10.5px;
  color: var(--text-4);
  font-family: system-ui, sans-serif;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.sr-enter-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.sr-enter-from   { opacity: 0; transform: translateY(-3px); }

/* ---- 原始 JSON 折叠：淡灰 ---------------------------------------- */
.tc-details { font-size: 11px; margin-top: 2px; }
.tc-details summary {
  font-size: 10.5px;
  color: var(--text-6);
  cursor: pointer;
  user-select: none;
  list-style: none;
  padding: 2px 0;
  transition: color 0.14s;
}
.tc-details summary:hover { color: var(--text-3); }
.tc-details summary::-webkit-details-marker { display: none; }
.tc-raw-label {
  font-size: 10px;
  color: var(--text-6);
  margin-top: 4px;
}
.tc-pre {
  margin: 4px 0 0;
  padding: 6px 8px;
  background: var(--surface-2);
  border-radius: 5px;
  font-size: 10.5px;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-3);
  max-height: 120px;
  overflow: auto;
  line-height: 1.5;
}
.tc-pre::-webkit-scrollbar { width: 4px; }
.tc-pre::-webkit-scrollbar-thumb { background: var(--text-6); border-radius: 2px; }
</style>
