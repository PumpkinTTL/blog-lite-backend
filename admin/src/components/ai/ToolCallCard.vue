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

// 工具名中文映射，方便用户理解
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

// 解析参数为可读形式
const argsDisplay = computed(() => {
  try {
    const obj = JSON.parse(props.call.function.arguments)
    return Object.entries(obj)
      .map(([k, v]) => {
        const vs = typeof v === 'string' ? (v.length > 60 ? v.slice(0, 60) + '…' : v) : String(v)
        return `${k}: ${vs}`
      })
      .join(' · ')
  } catch {
    return props.call.function.arguments
  }
})

const resultDisplay = computed(() => {
  if (!props.result) return ''
  try {
    const obj = JSON.parse(props.result)
    return Object.entries(obj)
      .map(([k, v]) => {
        const vs = typeof v === 'string' ? (v.length > 80 ? v.slice(0, 80) + '…' : v) : String(v)
        return `${k}: ${vs}`
      })
      .join(' · ')
  } catch {
    return props.result.slice(0, 100)
  }
})

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
    <div class="tool-head" @click="expanded = !expanded">
      <span class="tool-name">{{ label }}</span>
      <span class="tool-tag">{{ call.function.name }}</span>
      <span class="tool-status" :style="{ color: statusColor }">
        <n-icon :size="13" :class="{ spinning: status === 'running' }">
          <component :is="statusIcon" />
        </n-icon>
        {{ statusText }}
      </span>
      <n-icon :size="13" class="tool-chevron" :class="{ rotated: expanded }">
        <ChevronDownOutline />
      </n-icon>
    </div>
    <div class="tool-args">{{ argsDisplay }}</div>
    <div v-if="resultDisplay" class="tool-result">→ {{ resultDisplay }}</div>
    <div v-if="expanded" class="tool-raw">
      <div class="raw-label">参数</div>
      <pre>{{ call.function.arguments }}</pre>
      <template v-if="result">
        <div class="raw-label">结果</div>
        <pre>{{ result }}</pre>
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

.tool-head {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.tool-name { font-weight: 600; color: #1c1917; }
.tool-tag {
  font-size: 9px;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  padding: 1px 6px;
  border-radius: 4px;
  background: #f5f5f4;
  color: #78716c;
  letter-spacing: 0.5px;
}
.tool-status {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 500;
}
.tool-chevron { color: #a8a29e; transition: transform 0.2s; margin-left: 2px; }
.tool-chevron.rotated { transform: rotate(180deg); }
.tool-chevron:hover { color: #57534e; }

.tool-args {
  margin-top: 5px;
  color: #57534e;
  font-size: 11px;
  word-break: break-all;
  line-height: 1.5;
}
.tool-result {
  margin-top: 3px;
  color: #16a34a;
  font-size: 11px;
  word-break: break-all;
  line-height: 1.5;
}
.tool-raw { margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e7e5e4; }
.raw-label { font-size: 10px; color: #a8a29e; margin-bottom: 3px; text-transform: uppercase; letter-spacing: 0.5px; }
.tool-raw pre {
  margin: 0 0 6px;
  padding: 7px;
  background: #f5f5f4;
  border-radius: 5px;
  font-size: 10.5px;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  white-space: pre-wrap;
  word-break: break-all;
  color: #44403c;
  max-height: 120px;
  overflow: auto;
}
.spinning { animation: tool-spin 1s linear infinite; }
@keyframes tool-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
</style>
