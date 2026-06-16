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
    case 'running': return '#f59e0b'
    case 'success': return '#10b981'
    case 'error': return '#ef4444'
    default: return '#94a3b8'
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
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(99, 102, 241, 0.04);
  border: 1px solid rgba(99, 102, 241, 0.15);
  font-size: 12px;
  transition: border-color 0.2s;
}
.tool-card.is-running { border-color: rgba(245, 158, 11, 0.4); }
.tool-card.is-success { border-color: rgba(16, 185, 129, 0.35); }
.tool-card.is-error { border-color: rgba(239, 68, 68, 0.4); }

.tool-head {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.tool-name { font-weight: 600; color: #334155; }
.tool-tag {
  font-size: 9px;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(99, 102, 241, 0.1);
  color: rgba(99, 102, 241, 0.8);
  letter-spacing: 0.5px;
}
.tool-status {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
}
.tool-chevron { color: #94a3b8; transition: transform 0.2s; margin-left: 2px; }
.tool-chevron.rotated { transform: rotate(180deg); }
.tool-chevron:hover { color: #64748b; }

.tool-args {
  margin-top: 4px;
  color: #64748b;
  font-size: 11px;
  word-break: break-all;
  line-height: 1.5;
}
.tool-result {
  margin-top: 3px;
  color: #10b981;
  font-size: 11px;
  word-break: break-all;
  line-height: 1.5;
}
.tool-raw { margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(99, 102, 241, 0.15); }
.raw-label { font-size: 10px; color: #94a3b8; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px; }
.tool-raw pre {
  margin: 0 0 6px;
  padding: 6px;
  background: rgba(0,0,0,0.04);
  border-radius: 4px;
  font-size: 10.5px;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  white-space: pre-wrap;
  word-break: break-all;
  color: #475569;
  max-height: 120px;
  overflow: auto;
}
.spinning { animation: tool-spin 1s linear infinite; }
@keyframes tool-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
</style>
