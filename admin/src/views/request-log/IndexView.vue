<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import { NDataTable, NTag, NPagination, NInput, NButton, NIcon, NSelect, NSpace, useMessage, NPopconfirm } from 'naive-ui'
import type { DataTableColumns, SelectOption } from 'naive-ui'
import { SearchOutline, RefreshOutline, TrashOutline } from '@vicons/ionicons5'
import { getRequestLogs, cleanRequestLogs, type RequestLog } from '../../api/request-log'

const message = useMessage()
const loading = ref(false)
const list = ref<RequestLog[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

// 筛选条件
const searchRequestId = ref('')
const searchIp = ref('')
const searchStatus = ref<number | null>(null)
const searchMethod = ref<string | null>(null)

const statusOptions = [
  { label: '全部', value: null },
  { label: '2xx 成功', value: 2 },
  { label: '3xx 重定向', value: 3 },
  { label: '4xx 客户端错误', value: 4 },
  { label: '5xx 服务端错误', value: 5 },
] as unknown as SelectOption[]

const methodOptions = [
  { label: '全部', value: null },
  { label: 'GET', value: 'GET' },
  { label: 'POST', value: 'POST' },
  { label: 'PUT', value: 'PUT' },
  { label: 'DELETE', value: 'DELETE' },
  { label: 'PATCH', value: 'PATCH' },
] as unknown as SelectOption[]

// 状态码标签颜色
function statusType(status: number): 'success' | 'info' | 'warning' | 'error' {
  if (status < 300) return 'success'
  if (status < 400) return 'info'
  if (status < 500) return 'warning'
  return 'error'
}

// 方法标签颜色
function methodType(method: string): 'info' | 'success' | 'warning' | 'error' {
  const m: Record<string, 'info' | 'success' | 'warning' | 'error'> = {
    GET: 'info', POST: 'success', PUT: 'warning', DELETE: 'error', PATCH: 'warning',
  }
  return m[method] || 'info'
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

const columns: DataTableColumns<RequestLog> = [
  { title: 'ID', key: 'id', width: 60 },
  {
    title: '追踪号', key: 'requestId', width: 280, ellipsis: { tooltip: true },
    render: (row) => h('span', {
      style: 'font-family: monospace; font-size: 12px; color: var(--primary-color, #2563EB)',
    }, row.requestId),
  },
  {
    title: '方法', key: 'method', width: 70,
    render: (row) => h(NTag, { size: 'small', type: methodType(row.method), bordered: false }, { default: () => row.method }),
  },
  { title: '路径', key: 'path', width: 200, ellipsis: { tooltip: true } },
  {
    title: '状态', key: 'status', width: 70,
    render: (row) => h(NTag, { size: 'small', type: statusType(row.status), bordered: false }, { default: () => row.status }),
  },
  {
    title: '耗时', key: 'durationMs', width: 80,
    render: (row) => fmtDuration(row.durationMs),
  },
  { title: 'IP', key: 'ip', width: 130, ellipsis: { tooltip: true } },
  {
    title: '用户', key: 'userId', width: 70,
    render: (row) => row.userId ? `#${row.userId}` : h('span', { style: 'color:#bbb' }, '-'),
  },
  {
    title: '错误', key: 'errorMessage', width: 220, ellipsis: { tooltip: true },
    render: (row) => row.errorMessage
      ? h('span', { style: 'color: var(--n-error-color, #d03050); font-size: 12px' }, row.errorMessage)
      : h('span', { style: 'color:#bbb' }, '-'),
  },
  { title: '时间', key: 'createdAt', width: 160, render: (row) => new Date(row.createdAt).toLocaleString('zh-CN') },
]

async function load() {
  loading.value = true
  try {
    const res = await getRequestLogs({
      page: page.value,
      pageSize: pageSize.value,
      requestId: searchRequestId.value.trim() || undefined,
      ip: searchIp.value.trim() || undefined,
      status: searchStatus.value ?? undefined,
      method: searchMethod.value ?? undefined,
    })
    list.value = res.data?.list || []
    total.value = res.data?.total || 0
  } catch (e: any) {
    message.error(e?.message || '加载失败')
    list.value = []; total.value = 0
  } finally {
    loading.value = false
  }
}

function handleSearch() { page.value = 1; load() }
function handleReset() {
  searchRequestId.value = ''
  searchIp.value = ''
  searchStatus.value = null
  searchMethod.value = null
  page.value = 1
  load()
}
function handlePageChange(p: number) { page.value = p; load() }

async function handleClean() {
  try {
    const res = await cleanRequestLogs(30)
    message.success((res as any)?.data?.message || '清理完成')
    load()
  } catch (e: any) {
    message.error(e?.message || '清理失败')
  }
}

onMounted(() => { load() })
</script>

<template>
  <div class="page-wrapper">
    <div class="page-header">
      <h2 class="page-title">请求日志</h2>
      <n-popconfirm @positive-click="handleClean">
        <template #trigger>
          <n-button quaternary type="error">
            <template #icon><n-icon><TrashOutline /></n-icon></template>
            清理30天前
          </n-button>
        </template>
        确定清理 30 天前的请求日志？此操作不可恢复。
      </n-popconfirm>
    </div>
    <n-space :size="12" align="center" wrap>
      <n-input v-model:value="searchRequestId" placeholder="追踪号 (requestId)" clearable style="width:260px" @keyup.enter="handleSearch" />
      <n-input v-model:value="searchIp" placeholder="IP" clearable style="width:140px" @keyup.enter="handleSearch" />
      <n-select v-model:value="searchStatus" :options="statusOptions" placeholder="状态" style="width:140px" clearable />
      <n-select v-model:value="searchMethod" :options="methodOptions" placeholder="方法" style="width:110px" clearable />
      <n-button type="primary" @click="handleSearch">
        <template #icon><n-icon><SearchOutline /></n-icon></template>查询
      </n-button>
      <n-button @click="handleReset">
        <template #icon><n-icon><RefreshOutline /></n-icon></template>重置
      </n-button>
    </n-space>
    <div class="table-section">
      <n-data-table :columns="columns" :data="list" :loading="loading" :bordered="false" :scroll-x="1330" :row-key="(row: any) => row.id" />
      <div class="pagination-wrap" v-if="total > 0">
        <n-pagination :page="page" :page-size="pageSize" :item-count="total"
          @update:page="handlePageChange"
          @update:page-size="(s: number) => { pageSize = s; page = 1; load() }" />
      </div>
    </div>
  </div>
</template>
