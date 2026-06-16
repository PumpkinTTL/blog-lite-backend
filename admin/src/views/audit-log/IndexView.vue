<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import { NDataTable, NTag, NPagination, NInput, NButton, NIcon, NSelect, NSpace } from 'naive-ui'
import type { DataTableColumns, SelectOption } from 'naive-ui'
import { SearchOutline, RefreshOutline } from '@vicons/ionicons5'
import { getAuditLogs, type AuditLog } from '../../api/audit-log'
import request from '../../api/request'

const loading = ref(false)
const list = ref<AuditLog[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

const targetType = ref<string | null>(null)
const targetId = ref<string | null>(null)

const typeOptions = [
  { label: '全部', value: null },
  { label: '用户', value: 'user' },
  { label: '文章', value: 'post' },
  { label: '设置', value: 'setting' },
  { label: '套餐', value: 'plan' },
  { label: '会员', value: 'membership' },
  { label: '激活码', value: 'code' },
] as unknown as SelectOption[]

const fieldLabel: Record<string, string> = {
  avatar: '头像', nickname: '昵称', email: '邮箱', status: '状态',
  password: '密码', title: '标题', content: '内容',
}

const typeTag: Record<string, { label: string; type: 'info' | 'success' | 'warning' }> = {
  user: { label: '用户', type: 'info' },
  post: { label: '文章', type: 'success' },
  setting: { label: '设置', type: 'warning' },
  plan: { label: '套餐', type: 'info' },
  membership: { label: '会员', type: 'success' },
  code: { label: '激活码', type: 'warning' },
  comment: { label: '评论', type: 'info' },
  media: { label: '文件', type: 'info' },
}

function fmtVal(v: string | null): string {
  if (!v) return '-'
  if (v.startsWith('http') && v.length > 60) return v.slice(0, 60) + '...'
  return v
}

async function load() {
  loading.value = true
  try {
    let res: any
    const idNum = targetId.value ? Number(targetId.value) : NaN
    if (targetType.value && !Number.isNaN(idNum)) {
      res = await getAuditLogs(targetType.value, idNum, { page: page.value, pageSize: pageSize.value })
    } else {
      res = await request.get(`/audit-log?page=${page.value}&pageSize=${pageSize.value}`)
    }
    list.value = res.data?.list || []
    total.value = res.data?.total || 0
  } catch { list.value = []; total.value = 0 }
  finally { loading.value = false }
}

const columns: DataTableColumns<AuditLog> = [
  { title: 'ID', key: 'id', width: 50 },
  {
    title: '类型', key: 'targetType', width: 60,
    render: (row) => {
      const t = typeTag[row.targetType]
      return t ? h(NTag, { size: 'small', type: t.type, bordered: false }, { default: () => t.label }) : row.targetType
    },
  },
  {
    title: '对象', key: 'targetName', width: 140, ellipsis: { tooltip: true },
    render: (row) => row.targetName || `${row.targetType}#${row.targetId}`,
  },
  {
    title: '字段', key: 'field', width: 60,
    render: (row) => fieldLabel[row.field] || row.field,
  },
  {
    title: '旧值', key: 'oldValue', width: 200, ellipsis: { tooltip: true },
    render: (row) => fmtVal(row.oldValue),
  },
  {
    title: '新值', key: 'newValue', width: 200, ellipsis: { tooltip: true },
    render: (row) => fmtVal(row.newValue),
  },
  {
    title: '操作人', key: 'operatorName', width: 90,
    render: (row) => row.operatorName || '-',
  },
  { title: '时间', key: 'createdAt', width: 160, render: (row) => new Date(row.createdAt).toLocaleString('zh-CN') },
]

function handleSearch() { page.value = 1; load() }
function handleReset() {
  // 清空筛选条件并回到第 1 页重新加载
  targetType.value = null
  targetId.value = null
  page.value = 1
  load()
}
function handlePageChange(p: number) { page.value = p; load() }

onMounted(() => { load() })
</script>

<template>
  <div class="page-wrapper">
    <div class="page-header">
      <h2 class="page-title">审计日志</h2>
    </div>
    <n-space :size="12" align="center">
      <n-select v-model:value="targetType" :options="typeOptions" style="width:100px" />
      <n-input v-model:value="targetId" placeholder="实体ID" style="width:120px" @keyup.enter="handleSearch" />
      <n-button type="primary" @click="handleSearch">
        <template #icon><n-icon><SearchOutline /></n-icon></template>查询
      </n-button>
      <n-button @click="handleReset">
        <template #icon><n-icon><RefreshOutline /></n-icon></template>重置
      </n-button>
    </n-space>
    <div class="table-section">
      <n-data-table :columns="columns" :data="list" :loading="loading" :bordered="false" :scroll-x="900" />
      <div class="pagination-wrap" v-if="total > 0">
        <n-pagination :page="page" :page-size="pageSize" :item-count="total" @update:page="handlePageChange" />
      </div>
    </div>
  </div>
</template>
