<script setup lang="ts">
import { computed, ref } from 'vue'
import { NIcon } from 'naive-ui'
import { CheckmarkCircle, CloseCircle, SyncCircle, ChevronDownOutline } from '@vicons/ionicons5'
import type { AiToolCall } from '../../api/ai'

type Status = 'pending' | 'running' | 'success' | 'error'

const props = defineProps<{
  call: AiToolCall
  status: Status
  result?: string
}>()

const expanded = ref(false)

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
}

const label = computed(() => NAME_LABEL[props.call.function.name] || props.call.function.name)

// 参数解析为 key-value 数组（结构化展示）
interface KV { key: string; value: string }
const argsList = computed<KV[]>(() => {
  try {
    const obj = JSON.parse(props.call.function.arguments || '{}')
    return Object.entries(obj).map(([k, v]) => ({
      key: k,
      value: typeof v === 'string' ? v : JSON.stringify(v),
    }))
  } catch {
    return [{ key: '(原始)', value: props.call.function.arguments }]
  }
})

// 结果解析为 key-value 数组
const resultList = computed<KV[]>(() => {
  if (!props.result) return []
  try {
    const obj = JSON.parse(props.result)
    return Object.entries(obj).map(([k, v]) => ({
      key: k,
      value: typeof v === 'string' ? v : JSON.stringify(v),
    }))
  } catch {
    return [{ key: '(原始)', value: props.result.slice(0, 200) }]
  }
})

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
      <span class="tool-call-label">
        <n-icon :size="11" class="tool-label-icon"><component :is="statusIcon" /></n-icon>
        <span>工具调用</span>
      </span>
      <span class="tool-status-dot" :style="{ background: statusColor }" :class="{ spinning: status === 'running' }" />
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

    <!-- 参数概览（始终显示，紧凑） -->
    <div v-if="argsList.length > 0" class="tool-section">
      <div v-for="arg in argsList" :key="arg.key" class="kv-row">
        <span class="kv-key">{{ arg.key }}</span>
        <span class="kv-val">{{ truncate(arg.value, 80) }}</span>
      </div>
    </div>

    <!-- 结果概览（成功时显示，紧凑） -->
    <div v-if="resultList.length > 0" class="tool-section tool-result-section">
      <div v-for="r in resultList" :key="r.key" class="kv-row">
        <span class="kv-key">{{ r.key }}</span>
        <span class="kv-val">{{ truncate(r.value, 80) }}</span>
      </div>
    </div>

    <!-- 展开详情：id + 完整参数/结果 JSON -->
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
.tool-card.is-running { border-color: #c15f3c; background: #fefcfb; }
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
