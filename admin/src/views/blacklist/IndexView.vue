<script setup lang="ts">
import { ref, h } from 'vue'
import { NButton, NDataTable, NSpace, NInput, NIcon, NModal, NForm, NFormItem, NTag, NSelect, NPagination, NDatePicker } from 'naive-ui'
import type { DataTableColumns, FormInst, FormRules, SelectOption } from 'naive-ui'
import { AddOutline, TrashOutline, CreateOutline, SearchOutline, RefreshOutline } from '@vicons/ionicons5'
import { getBlacklists, createBlacklist, updateBlacklist, deleteBlacklist, batchDeleteBlacklists } from '../../api/blacklist'
import type { Blacklist } from '../../api/blacklist'
import { useCrudList } from '../../composables/useCrudList'

const formRef = ref<FormInst | null>(null)

const total = ref(0)
const page = ref(1)
const pageSize = ref(10)

const searchType = ref<string | null>(null)
const searchStatus = ref<string | null>(null)

const typeOptions = [
  { label: '全部', value: null },
  { label: 'IP', value: 'ip' },
  { label: '用户', value: 'user' },
] as unknown as SelectOption[]

const statusOptions = [
  { label: '全部', value: null },
  { label: '生效中', value: 'active' },
  { label: '已解除', value: 'expired' },
] as unknown as SelectOption[]

const { loading, list, searchId, searchKeyword, showModal, editingId, saving, formValue,
  handleSearch: _handleSearch, handleReset: _handleReset, openCreate, openEdit,
  handleSave: _handleSave, handleDelete, handleBatchDelete, checkedRowKeys, selectionColumn, message } =
  useCrudList<Blacklist>({
    loadApi: (params) => getBlacklists({
      ...params,
      page: page.value,
      pageSize: pageSize.value,
      ...(searchType.value !== null ? { type: searchType.value } : {}),
      ...(searchStatus.value !== null ? { status: searchStatus.value } : {}),
    }),
    createApi: (data) => {
      // 创建只传后端 CreateBlacklistDto 允许的字段（剔除 status 等）
      const expiresAt = data.expiresAt
        ? new Date(data.expiresAt).toISOString()
        : undefined
      return createBlacklist({
        type: data.type,
        value: data.value,
        reason: data.reason || undefined,
        expiresAt,
      })
    },
    updateApi: (id, data) => {
      // 更新只传后端 UpdateBlacklistDto 允许的字段
      const expiresAt = data.expiresAt === null ? undefined
        : data.expiresAt ? new Date(data.expiresAt).toISOString() : undefined
      return updateBlacklist(id, {
        reason: data.reason,
        status: data.status,
        ...(expiresAt !== undefined ? { expiresAt } : {}),
      })
    },
    deleteApi: deleteBlacklist,
    batchDeleteApi: batchDeleteBlacklists,
    deleteContent: (row) => `确定将「${row.type === 'ip' ? 'IP ' + row.value : '用户 #' + row.value}」移出黑名单？`,
    defaultForm: () => ({
      type: 'ip' as string,
      value: '',
      reason: '',
      status: 'active' as string,
      expiresAt: null as number | null,
    }),
    extractList: (res) => {
      const payload = res.data
      if (payload?.list) {
        total.value = payload.total
        return payload.list
      }
      return Array.isArray(payload) ? payload : []
    },
  })

function handleSearch() {
  page.value = 1
  _handleSearch()
}

function handleReset() {
  searchId.value = ''
  searchKeyword.value = ''
  searchType.value = null
  searchStatus.value = null
  page.value = 1
  _handleReset()
}

async function handleSave() {
  try {
    await formRef.value?.validate()
  } catch {
    return false
  }
  // value 去除首尾空格
  formValue.value.value = String(formValue.value.value).trim()
  if (!formValue.value.value) {
    message.warning('请输入封禁值')
    return false
  }
  // user 类型校验必须是数字（userId）
  if (formValue.value.type === 'user' && !/^\d+$/.test(formValue.value.value)) {
    message.warning('用户封禁值必须是数字 userId')
    return false
  }
  // expiresAt 字段清洗：空字符串/无效值 → null（createApi/updateApi 内转 ISO）
  const ea = formValue.value.expiresAt
  if (ea !== null && (ea === '' || Number.isNaN(Number(ea)))) {
    formValue.value.expiresAt = null
  }
  return _handleSave()
}

function handlePageChange(p: number) {
  page.value = p
  _handleSearch()
}

function handlePageSizeChange(s: number) {
  pageSize.value = s
  page.value = 1
  _handleSearch()
}

const rules: FormRules = {
  type: [{ required: true, message: '请选择类型', trigger: ['blur'] }],
  value: [{ required: true, message: '请输入封禁值', trigger: ['input', 'blur'] }],
}

const typeTagMap: Record<string, 'info' | 'warning'> = { ip: 'info', user: 'warning' }
const typeLabelMap: Record<string, string> = { ip: 'IP', user: '用户' }

const columns: DataTableColumns<Blacklist> = [
  selectionColumn,
  { title: 'ID', key: 'id', width: 60 },
  {
    title: '类型', key: 'type', width: 80,
    render: (row) => h(NTag, { size: 'small', type: typeTagMap[row.type] || 'default', bordered: false }, { default: () => typeLabelMap[row.type] || row.type }),
  },
  { title: '封禁值', key: 'value', width: 180, ellipsis: { tooltip: true } },
  { title: '原因', key: 'reason', ellipsis: { tooltip: true } },
  {
    title: '状态', key: 'status', width: 90,
    render: (row) => h(NTag, { size: 'small', type: row.status === 'active' ? 'error' : 'default', bordered: false }, { default: () => (row.status === 'active' ? '生效中' : '已解除') }),
  },
  {
    title: '过期时间', key: 'expiresAt', width: 160,
    render: (row) => row.expiresAt ? new Date(row.expiresAt).toLocaleString('zh-CN') : '永久',
  },
  { title: '操作人', key: 'creatorId', width: 90, render: (row) => row.creatorId ? `#${row.creatorId}` : '-' },
  {
    title: '操作', key: 'actions', width: 140, fixed: 'right',
    render: (row) => h(NSpace, { size: 'small', wrap: false }, {
      default: () => [
        h(NButton, { size: 'small', quaternary: true, type: 'primary', onClick: () => openEdit(row, (r) => ({
          type: r.type,
          value: r.value,
          reason: r.reason || '',
          status: r.status,
          expiresAt: r.expiresAt ? new Date(r.expiresAt).getTime() : null,
        })) }, {
          default: () => '编辑', icon: () => h(NIcon, null, { default: () => h(CreateOutline) }),
        }),
        h(NButton, { size: 'small', quaternary: true, type: 'error', onClick: () => handleDelete(row) }, {
          default: () => '删除', icon: () => h(NIcon, null, { default: () => h(TrashOutline) }),
        }),
      ],
    }),
  },
]
</script>

<template>
  <div class="page-wrapper">
    <div class="page-header">
      <h2 class="page-title">黑名单管理</h2>
      <n-button type="primary" @click="openCreate">
        <template #icon><n-icon><AddOutline /></n-icon></template>
        新增封禁
      </n-button>
    </div>
    <n-space class="search-bar" :size="12" align="center">
      <n-input v-model:value="searchId" placeholder="ID" clearable style="width: 90px" @keyup.enter="handleSearch" />
      <n-input v-model:value="searchKeyword" placeholder="搜索 IP/用户ID/原因..." clearable style="width: 220px" @keyup.enter="handleSearch" />
      <n-select v-model:value="searchType" :options="typeOptions" placeholder="类型" style="width: 110px" clearable />
      <n-select v-model:value="searchStatus" :options="statusOptions" placeholder="状态" style="width: 120px" clearable />
      <n-button type="primary" @click="handleSearch">
        <template #icon><n-icon><SearchOutline /></n-icon></template>
        搜索
      </n-button>
      <n-button @click="handleReset">
        <template #icon><n-icon><RefreshOutline /></n-icon></template>
        重置
      </n-button>
      <n-button :disabled="checkedRowKeys.length === 0" type="error" @click="handleBatchDelete">
        <template #icon><n-icon><TrashOutline /></n-icon></template>
        批量删除
      </n-button>
    </n-space>
    <div class="table-section">
      <n-data-table :columns="columns" :data="list" :loading="loading" :bordered="false" :scroll-x="1100"
        :row-key="(row: any) => row.id" @update:checked-row-keys="(keys: any) => checkedRowKeys = keys" />
      <div class="pagination-wrap" v-if="total > 0">
        <n-pagination :page="page" :page-size="pageSize" :page-sizes="[10, 20, 50]" :item-count="total" show-size-picker @update:page="handlePageChange" @update:page-size="handlePageSizeChange" />
      </div>
    </div>
    <n-modal v-model:show="showModal" preset="dialog" :title="editingId ? '编辑封禁' : '新增封禁'"
      :positive-text="saving ? '提交中...' : '确认'" :negative-text="saving ? undefined : '取消'" :loading="saving" @positive-click="handleSave">
      <n-form ref="formRef" :model="formValue" :rules="rules" label-placement="top">
        <n-form-item label="类型" path="type">
          <n-select v-model:value="formValue.type" :options="[
            { label: 'IP 封禁', value: 'ip' },
            { label: '用户封禁（填 userId）', value: 'user' },
          ]" :disabled="!!editingId" />
        </n-form-item>
        <n-form-item :label="formValue.type === 'ip' ? 'IP 地址' : '用户 ID'" path="value">
          <n-input v-model:value="formValue.value" :placeholder="formValue.type === 'ip' ? '如 192.168.1.1' : '用户 userId（纯数字）'" :disabled="!!editingId" />
        </n-form-item>
        <n-form-item label="封禁原因">
          <n-input v-model:value="formValue.reason" placeholder="可选，如：恶意刷接口" />
        </n-form-item>
        <n-form-item label="过期时间">
          <n-date-picker v-model:value="formValue.expiresAt" type="datetime" clearable placeholder="留空 = 永久封禁" style="width: 100%" />
        </n-form-item>
        <n-form-item v-if="editingId" label="状态">
          <n-select v-model:value="formValue.status" :options="[
            { label: '生效中', value: 'active' },
            { label: '已解除', value: 'expired' },
          ]" />
        </n-form-item>
      </n-form>
    </n-modal>
  </div>
</template>

<style scoped>
</style>
