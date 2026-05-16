<script setup lang="ts">
import { ref, h } from 'vue'
import { NCard, NButton, NDataTable, NSpace, NInput, NIcon, NModal, NForm, NFormItem, NTag, NSelect, NPagination, NInputNumber } from 'naive-ui'
import type { DataTableColumns, FormInst, FormRules } from 'naive-ui'
import { AddOutline, TrashOutline, CreateOutline, SearchOutline, RefreshOutline, BanOutline } from '@vicons/ionicons5'
import { getCodes, createCode, updateCode, deleteCode, batchCreateCodes, batchDisableCodes, batchDeleteCodes } from '../../api/code'
import type { Code } from '../../api/code'
import { useCrudList } from '../../composables/useCrudList'

const formRef = ref<FormInst | null>(null)

// Pagination
const total = ref(0)
const page = ref(1)
const pageSize = ref(5)

// Extra search fields
const searchType = ref<string | null>(null)
const searchStatusField = ref<string | null>(null)

// Row selection for batch operations
const checkedRowKeys = ref<number[]>([])

const typeOptions = [
  { label: '全部', value: null },
  { label: '邀请码', value: 'invitation' },
  { label: '激活码', value: 'activation' },
  { label: '优惠码', value: 'discount' },
]

const statusOptions = [
  { label: '全部', value: null },
  { label: '有效', value: 'active' },
  { label: '已用', value: 'used' },
  { label: '过期', value: 'expired' },
  { label: '禁用', value: 'disabled' },
]

const typeTagMap: Record<string, string> = {
  invitation: 'info',
  activation: 'success',
  discount: 'warning',
}

const typeLabelMap: Record<string, string> = {
  invitation: '邀请码',
  activation: '激活码',
  discount: '优惠码',
}

const statusTagMap: Record<string, string> = {
  active: 'success',
  used: 'warning',
  expired: 'default',
  disabled: 'error',
}

const statusLabelMap: Record<string, string> = {
  active: '有效',
  used: '已用',
  expired: '过期',
  disabled: '禁用',
}

const { loading, list, searchId, searchKeyword, showModal, editingId, saving, formValue,
  handleSearch: _handleSearch, handleReset: _handleReset, openCreate, openEdit: _openEdit,
  handleSave: _handleSave, handleDelete, message, dialog, loadList } =
  useCrudList<Code>({
    loadApi: (params) => getCodes({
      ...params,
      page: page.value,
      pageSize: pageSize.value,
      ...(searchType.value !== null ? { type: searchType.value } : {}),
      ...(searchStatusField.value !== null ? { status: searchStatusField.value } : {}),
    }),
    createApi: batchCreateCodes,
    updateApi: updateCode,
    deleteApi: deleteCode,
    deleteContent: (row) => `确定删除激活码「${row.code}」？`,
    defaultForm: () => ({ type: 'activation', count: 1, maxUses: 1, expiresAt: '' }),
    extractList: (res) => {
      const payload = res.data
      if (payload?.list) {
        total.value = payload.total
        return payload.list
      }
      return []
    },
  })

function openEdit(row: Code) {
  _openEdit(row, (r) => ({
    type: r.type,
    maxUses: r.maxUses,
    expiresAt: r.expiresAt || '',
    status: r.status,
  }))
}

function handleSearch() {
  page.value = 1
  _handleSearch()
}

function handleReset() {
  searchId.value = ''
  searchKeyword.value = ''
  searchType.value = null
  searchStatusField.value = null
  page.value = 1
  _handleReset()
}

async function handleSave() {
  try {
    await formRef.value?.validate()
  } catch {
    return false
  }
  if (!editingId.value && (!formValue.value.count || formValue.value.count < 1)) {
    message.warning('数量至少为 1')
    return false
  }
  // 强制转 number，防止 NInputNumber 传 string
  formValue.value.count = Number(formValue.value.count)
  formValue.value.maxUses = Number(formValue.value.maxUses)
  if (!formValue.value.expiresAt) {
    delete formValue.value.expiresAt
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

async function handleBatchDisable() {
  if (checkedRowKeys.value.length === 0) {
    message.warning('请先选择要禁用的激活码')
    return
  }
  dialog.warning({
    title: '批量禁用',
    content: `确定要禁用选中的 ${checkedRowKeys.value.length} 个激活码吗？`,
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await batchDisableCodes(checkedRowKeys.value)
        message.success('批量禁用成功')
        checkedRowKeys.value = []
        loadList()
      } catch (e: any) {
        message.error(e.message || '批量禁用失败')
      }
    },
  })
}

async function handleBatchDelete() {
  if (checkedRowKeys.value.length === 0) {
    message.warning('请先选择要删除的激活码')
    return
  }
  dialog.warning({
    title: '批量删除',
    content: `确定要删除选中的 ${checkedRowKeys.value.length} 个激活码吗？此操作不可恢复！`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await batchDeleteCodes(checkedRowKeys.value)
        message.success('批量删除成功')
        checkedRowKeys.value = []
        loadList()
      } catch (e: any) {
        message.error(e.message || '批量删除失败')
      }
    },
  })
}

const rules: FormRules = {
  type: [{ required: true, message: '请选择类型', trigger: ['blur'] }],
  maxUses: [
    { type: 'number', min: 1, message: '最大使用次数至少为 1', trigger: ['blur', 'input'] },
  ],
  status: [{ required: true, message: '请选择状态', trigger: ['blur'] }],
}

const editStatusOptions = [
  { label: '有效', value: 'active' },
  { label: '已用', value: 'used' },
  { label: '过期', value: 'expired' },
  { label: '禁用', value: 'disabled' },
]

const createTypeOptions = [
  { label: '邀请码', value: 'invitation' },
  { label: '激活码', value: 'activation' },
  { label: '优惠码', value: 'discount' },
]

const columns: DataTableColumns<Code> = [
  { type: 'selection' },
  { title: 'ID', key: 'id', width: 70 },
  { title: '激活码', key: 'code', width: 220 },
  {
    title: '类型',
    key: 'type',
    width: 100,
    render: (row) =>
      h(NTag, { size: 'small', type: typeTagMap[row.type] || 'default', bordered: false }, {
        default: () => typeLabelMap[row.type] || row.type,
      }),
  },
  {
    title: '状态',
    key: 'status',
    width: 90,
    render: (row) =>
      h(NTag, { size: 'small', type: statusTagMap[row.status] || 'default', bordered: false }, {
        default: () => statusLabelMap[row.status] || row.status,
      }),
  },
  { title: '最大次数', key: 'maxUses', width: 90 },
  { title: '已用次数', key: 'usedCount', width: 90 },
  {
    title: '过期时间',
    key: 'expiresAt',
    width: 170,
    render: (row) => row.expiresAt ? new Date(row.expiresAt).toLocaleString('zh-CN') : '-',
  },
  { title: '创建时间', key: 'createdAt', width: 170, render: (row) => new Date(row.createdAt).toLocaleString('zh-CN') },
  {
    title: '操作',
    key: 'actions',
    width: 140,
    render: (row) =>
      h(NSpace, { size: 'small' }, {
        default: () => [
          h(NButton, { size: 'small', quaternary: true, type: 'primary', onClick: () => openEdit(row) }, {
            default: () => '编辑',
            icon: () => h(NIcon, null, { default: () => h(CreateOutline) }),
          }),
          h(NButton, { size: 'small', quaternary: true, type: 'error', onClick: () => handleDelete(row) }, {
            default: () => '删除',
            icon: () => h(NIcon, null, { default: () => h(TrashOutline) }),
          }),
        ],
      }),
  },
]
</script>

<template>
  <div class="page-wrapper">
    <div class="page-header">
      <h2 class="page-title">激活码管理</h2>
      <n-button type="primary" @click="openCreate">
        <template #icon><n-icon><AddOutline /></n-icon></template>
        新建激活码
      </n-button>
    </div>
    <n-space class="search-bar" :size="12" align="center">
      <n-input v-model:value="searchId" placeholder="ID" clearable style="width: 100px" @keyup.enter="handleSearch" />
      <n-input v-model:value="searchKeyword" placeholder="搜索..." clearable @keyup.enter="handleSearch" />
      <n-select v-model:value="searchType" :options="typeOptions" placeholder="类型" style="width: 120px" clearable />
      <n-select v-model:value="searchStatusField" :options="statusOptions" placeholder="状态" style="width: 120px" clearable />
      <n-button type="primary" @click="handleSearch">
        <template #icon><n-icon><SearchOutline /></n-icon></template>
        搜索
      </n-button>
      <n-button @click="handleReset">
        <template #icon><n-icon><RefreshOutline /></n-icon></template>
        重置
      </n-button>
    </n-space>

    <n-space :size="8" style="margin-bottom: 12px">
      <n-button :disabled="checkedRowKeys.length === 0" @click="handleBatchDisable">
        <template #icon><n-icon><BanOutline /></n-icon></template>
        批量禁用
      </n-button>
      <n-button :disabled="checkedRowKeys.length === 0" type="error" @click="handleBatchDelete">
        <template #icon><n-icon><TrashOutline /></n-icon></template>
        批量删除
      </n-button>
    </n-space>

    <n-card :bordered="false" class="table-card">
      <n-data-table
        :columns="columns"
        :data="list"
        :loading="loading"
        :bordered="false"
        :row-key="(row: any) => row.id"
        @update:checked-row-keys="(keys: any) => checkedRowKeys = keys"
      />
      <div class="pagination-wrap" v-if="total > 0">
        <n-pagination :page="page" :page-size="pageSize" :page-sizes="[5, 10, 20]" :item-count="total" show-size-picker @update:page="handlePageChange" @update:page-size="handlePageSizeChange" />
      </div>
    </n-card>

    <n-modal
      v-model:show="showModal"
      preset="dialog"
      :title="editingId ? '编辑激活码' : '新建激活码'"
      :positive-text="saving ? '提交中...' : '确认'"
      :negative-text="saving ? undefined : '取消'"
      :loading="saving"
      @positive-click="handleSave"
    >
      <n-form ref="formRef" :model="formValue" :rules="rules" label-placement="top">
        <n-form-item label="类型" path="type">
          <n-select v-model:value="formValue.type" :options="createTypeOptions" placeholder="选择类型" />
        </n-form-item>
        <n-form-item v-if="!editingId" label="数量" path="count">
          <n-input-number v-model:value="formValue.count" placeholder="生成数量" :min="1" :max="100" style="width: 100%" />
        </n-form-item>
        <n-form-item label="最大使用次数" path="maxUses">
          <n-input-number v-model:value="formValue.maxUses" placeholder="每个码可用次数" :min="1" style="width: 100%" />
        </n-form-item>
        <n-form-item label="过期时间" path="expiresAt">
          <n-input v-model:value="formValue.expiresAt" placeholder="可选，格式如 2026-12-31 23:59:59" />
        </n-form-item>
        <n-form-item v-if="editingId" label="状态" path="status">
          <n-select v-model:value="formValue.status" :options="editStatusOptions" placeholder="选择状态" />
        </n-form-item>
      </n-form>
    </n-modal>
  </div>
</template>

<style scoped>
.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
