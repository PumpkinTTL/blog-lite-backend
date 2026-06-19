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

// 折叠状态：running 时展开（看进度），success/error 后自动收起。
const expanded = ref(props.status === 'running')
watch(
  () => props.status,
  (s) => { if (s !== 'running') expanded.value = false },
)

// 是否为"实时流式完成"：挂载时已是 success 视为历史回放，不播揭示动画。
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
    case 'running': return '执行中'
    case 'success': return '完成'
    case 'error':   return '失败'
    default:        return '等待'
  }
})
</script>

<template>
  <!-- 与 think-block 同族：surface-3 底 + border + border-radius，无侧边彩条 -->
  <div class="tc-card" :class="`is-${status}`">

    <!-- 头部：点击折叠/展开 -->
    <div class="tc-head" @click="expanded = !expanded">

      <!-- 工具类型图标（纯内联 SVG，无外部依赖） -->
      <span class="tc-icon-wrap" :class="`kind-${toolKind}`">
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
          <path d="M8 3v2M12 3v2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        <!-- 状态角标 -->
        <span class="tc-status-dot" :class="`dot-${status}`">
          <!-- running：旋转圆弧 -->
          <svg v-if="status === 'running'" viewBox="0 0 10 10" class="spin-svg">
            <circle cx="5" cy="5" r="3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="16 6" stroke-linecap="round"/>
          </svg>
          <!-- success：对勾 -->
          <svg v-else-if="status === 'success'" viewBox="0 0 10 10">
            <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          </svg>
          <!-- error：叉 -->
          <svg v-else-if="status === 'error'" viewBox="0 0 10 10">
            <path d="M3 3l4 4M7 3l-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>
          </svg>
        </span>
      </span>

      <!-- 工具名 + 类型标签 -->
      <div class="tc-title-wrap">
        <span class="tc-name">{{ label }}</span>
        <span class="tc-sub">{{ isWebSearch ? '联网搜索' : '工具调用' }}</span>
      </div>

      <!-- 状态文字 -->
      <span class="tc-status-text" :class="`st-${status}`">{{ statusText }}</span>

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

    <!-- ===== 展开内容 ===== -->
    <div v-if="expanded" class="tc-body">

      <!-- 参数 -->
      <div v-if="argsList.length > 0" class="tc-section">
        <div class="tc-section-title">参数</div>
        <div class="tc-kv-block">
          <div v-for="arg in argsList" :key="arg.key" class="tc-kv-row">
            <span class="tc-kv-key">{{ arg.key }}</span>
            <span class="tc-kv-val">{{ truncate(arg.value, 120) }}</span>
          </div>
        </div>
      </div>

      <!-- web_search 结果 -->
      <div v-if="isWebSearch && status === 'success' && searchMeta" class="tc-section">
        <div class="tc-section-title">
          搜索结果
          <span class="tc-section-meta">{{ searchMeta.total }} 条{{ searchMeta.responseTime ? ` · ${searchMeta.responseTime}s` : '' }}</span>
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

      <!-- 其他工具结果 -->
      <div v-else-if="!isWebSearch && resultList.length > 0" class="tc-section">
        <div class="tc-section-title tc-section-title-ok">结果</div>
        <div class="tc-kv-block">
          <div v-for="r in resultList" :key="r.key" class="tc-kv-row">
            <span class="tc-kv-key">{{ r.key }}</span>
            <span class="tc-kv-val tc-kv-val-ok">{{ truncate(r.value, 120) }}</span>
          </div>
        </div>
      </div>

      <!-- 原始数据（call_id + JSON） -->
      <div class="tc-raw">
        <span class="tc-raw-id-label">call_id</span>
        <code class="tc-raw-id">{{ call.id || '(无)' }}</code>
        <details class="tc-details">
          <summary>原始参数 / 结果</summary>
          <pre class="tc-pre">{{ call.function.arguments || '{}' }}</pre>
          <template v-if="result">
            <div class="tc-raw-id-label" style="margin-top:6px">结果</div>
            <pre class="tc-pre">{{ result }}</pre>
          </template>
        </details>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* =====================================================================
   ToolCallCard — 完全融入 AgentPanel 的 Claude 风暖灰体系
   颜色层次：卡片(surface) > 展开区(surface-2) > 内容块(surface-3)
   绝无侧边彩条，间距与 msg/think-block/bubble 全部统一。
   ===================================================================== */

/* ---- 主卡片 -------------------------------------------------------- */
.tc-card {
  border-radius: 8px;
  border-top-left-radius: 4px;        /* 与 think-block、pixel-loader 保持同族 */
  background: var(--surface);
  border: 1px solid var(--border);
  overflow: hidden;
  font-size: 12px;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.tc-card.is-running {
  border-color: var(--accent-border);
  animation: tc-breath 2s ease-in-out infinite;
}
.tc-card.is-error {
  border-color: rgba(220, 38, 38, 0.22);
}
@keyframes tc-breath {
  0%, 100% { box-shadow: none; }
  50%       { box-shadow: 0 0 0 3px var(--accent-soft); }
}

/* ---- 头部 ---------------------------------------------------------- */
.tc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 8px 10px;
  cursor: pointer;
  user-select: none;
  border-radius: 8px 8px 0 0;
  border-top-left-radius: 4px;
  transition: background 0.14s;
}
.tc-head:hover { background: var(--surface-2); }

/* ---- 工具类型图标 -------------------------------------------------- */
.tc-icon-wrap {
  position: relative;
  width: 26px; height: 26px;
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 7px;
  background: var(--surface-3);
  color: var(--text-4);
  border: 1px solid var(--border);
}
.tc-icon-wrap.kind-read  { color: var(--text-3); }
.tc-icon-wrap.kind-write {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: var(--accent-border);
}
.tc-icon-wrap.kind-search {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: var(--accent-border);
}
.tc-icon-wrap svg { width: 13px; height: 13px; display: block; flex-shrink: 0; }

/* 状态角标（右下角小徽标） */
.tc-status-dot {
  position: absolute;
  right: -4px; bottom: -4px;
  width: 13px; height: 13px;
  border-radius: 50%;
  background: var(--surface);
  border: 1.5px solid var(--border);
  display: flex; align-items: center; justify-content: center;
}
.tc-status-dot svg { width: 8px; height: 8px; display: block; }
.dot-running { color: var(--accent); }
.dot-success { color: var(--success); }
.dot-error   { color: var(--warn); }
.dot-pending { opacity: 0; }
.spin-svg { animation: tc-spin 1s linear infinite; }
@keyframes tc-spin { to { transform: rotate(360deg); } }

/* ---- 标题区 -------------------------------------------------------- */
.tc-title-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.tc-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.3;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tc-sub {
  font-size: 10px;
  color: var(--text-5);
  line-height: 1.2;
  letter-spacing: 0.1px;
}

/* ---- 状态文字（轻量胶囊，不抢眼但有辨识度） ----------------------- */
.tc-status-text {
  font-size: 10.5px;
  font-weight: 500;
  flex-shrink: 0;
  color: var(--text-5);
  padding: 1px 7px;
  border-radius: 4px;
  background: var(--surface-3);
  border: 1px solid var(--border-soft);
  letter-spacing: 0.1px;
}
.st-running {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: var(--accent-border);
}
.st-success {
  color: var(--success);
  background: rgba(22,163,74,0.07);
  border-color: rgba(22,163,74,0.16);
}
.st-error {
  color: var(--warn);
  background: rgba(220,38,38,0.07);
  border-color: rgba(220,38,38,0.16);
}

/* ---- 折叠箭头 ------------------------------------------------------ */
.tc-chevron {
  width: 12px; height: 12px; flex-shrink: 0;
  color: var(--text-6);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: block;
}
.tc-chevron.rotated { transform: rotate(180deg); }

/* ---- running 进度条 ------------------------------------------------ */
.tc-progress-bar {
  height: 2px;
  background: var(--surface-4);
  overflow: hidden;
}
.tc-progress-fill {
  height: 100%;
  width: 35%;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  animation: tc-slide 1.5s ease-in-out infinite;
}
@keyframes tc-slide { 0% { transform: translateX(-180%); } 100% { transform: translateX(480%); } }

/* ---- 进度文本 ------------------------------------------------------ */
.tc-progress-label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  font-size: 11px;
  color: var(--accent);
  background: var(--surface-2);
  border-top: 1px solid var(--border-soft);
}
.tc-blink-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
  animation: tc-blink 1.1s ease-in-out infinite;
}
@keyframes tc-blink { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }

/* ---- 展开内容体 ---------------------------------------------------- */
.tc-body {
  padding: 9px 10px 11px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--surface-2);
}

/* ---- 区块 ---------------------------------------------------------- */
.tc-section { display: flex; flex-direction: column; gap: 5px; }
.tc-section-title {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-5);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  padding: 0 1px;
}
.tc-section-title-ok { color: var(--success); }
.tc-section-meta {
  font-weight: 400;
  color: var(--text-6);
  text-transform: none;
  letter-spacing: 0;
  font-size: 10px;
}

/* ---- kv 参数/结果块 ------------------------------------------------ */
.tc-kv-block {
  background: var(--surface-3);
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  padding: 5px 8px;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.tc-kv-row {
  display: grid;
  grid-template-columns: minmax(56px, max-content) 1fr;
  gap: 8px;
  font-size: 11px;
  line-height: 1.6;
  align-items: baseline;
  padding: 1px 0;
}
/* 相邻行之间画分隔线 */
.tc-kv-row + .tc-kv-row {
  border-top: 1px solid var(--border-soft);
}
.tc-kv-key {
  color: var(--text-5);
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  font-size: 10.5px;
  white-space: nowrap;
}
.tc-kv-val {
  color: var(--text-2);
  word-break: break-all;
  min-width: 0;
}
.tc-kv-val-ok { color: var(--success); }

/* ---- web_search 结果列表 ------------------------------------------ */
.tc-search-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.tc-search-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--surface);
  border: 1px solid var(--border-soft);
  text-decoration: none;
  transition: border-color 0.14s, background 0.14s;
}
.tc-search-item:hover {
  background: var(--surface-2);
  border-color: var(--accent-border);
}
/* 顶行：序号 + 域名 + 链接图标 */
.tc-sr-top {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 1px;
}
/* 序号小胶囊 */
.tc-sr-num {
  font-size: 9px;
  font-weight: 700;
  color: var(--text-6);
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  flex-shrink: 0;
  min-width: 14px;
  height: 14px;
  display: flex; align-items: center; justify-content: center;
  background: var(--surface-3);
  border-radius: 3px;
  padding: 0 3px;
}
.tc-sr-domain {
  font-size: 10px;
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
.tc-search-item:hover .tc-sr-num    { background: var(--accent-soft); color: var(--accent); }

.tc-sr-title {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text);
  line-height: 1.4;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tc-search-item:hover .tc-sr-title { color: var(--accent); }

.tc-sr-snippet {
  font-size: 10.5px;
  color: var(--text-4);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
/* 逐条入场动画 */
.sr-enter-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.sr-enter-from   { opacity: 0; transform: translateY(-3px); }

/* ---- 原始数据 ------------------------------------------------------ */
.tc-raw {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-top: 6px;
  border-top: 1px dashed var(--border);
}
.tc-raw-id-label {
  font-size: 9.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-5);
}
.tc-raw-id {
  display: inline;
  font-size: 10px;
  color: var(--text-4);
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  word-break: break-all;
  background: var(--surface-3);
  padding: 1px 5px;
  border-radius: 3px;
}
.tc-details { font-size: 11px; }
.tc-details summary {
  font-size: 10.5px;
  color: var(--text-5);
  cursor: pointer;
  user-select: none;
  list-style: none;
  padding: 3px 0;
  transition: color 0.14s;
}
.tc-details summary:hover { color: var(--text-3); }
.tc-details summary::-webkit-details-marker { display: none; }
.tc-pre {
  margin: 5px 0 0;
  padding: 7px 9px;
  background: var(--surface-3);
  border: 1px solid var(--border-soft);
  border-radius: 5px;
  font-size: 10.5px;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-2);
  max-height: 120px;
  overflow: auto;
  line-height: 1.5;
}
.tc-pre::-webkit-scrollbar { width: 4px; }
.tc-pre::-webkit-scrollbar-thumb { background: var(--text-6); border-radius: 2px; }
</style>
