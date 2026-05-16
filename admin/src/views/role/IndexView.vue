<script setup lang="ts">
import { ref, h } from 'vue'
import { NCard, NButton, NDataTable, NSpace, NInput, NIcon, NModal, NForm, NFormItem, NPagination } from 'naive-ui'
import type { DataTableColumns, FormInst, FormRules } from 'naive-ui'
import { AddOutline, TrashOutline, CreateOutline, SearchOutline, RefreshOutline } from '@vicons/ionicons5'
import { getRoles, createRole, updateRole, deleteRole } from '../../api/role'
import type { Role } from '../../api/role'
import { useCrudList } from '../../composables/useCrudList'

const formRef = ref<FormInst | null>(null)

// Pagination
const total = ref(0)
const page = ref(1)
const pageSize = ref(5)

const { loading, list, searchId, searchKeyword, showModal, editingId, saving, formValue,
  handleSearch: _handleSearch, handleReset: _handleReset, openCreate, openEdit, handleSave, handleDelete } =
  useCrudList<Role>({
    loadApi: (params) => getRoles({
      ...params,
      page: page.value,
      pageSize: pageSize.value,
    }),
    createApi: createRole,
    updateApi: updateRole,
    deleteApi: deleteRole,
    deleteContent: (row) => `确定删除角色「${row.displayName}」？`,
    defaultForm: () => ({ name: '', displayName: '', description: '' }),
    extractList: (res) => {
      const payload = res.data
      if (payload?.list) {
        total.value = payload.total
        return payload.list
      }
      if (Array.isArray(payload)) {
        total.value = payload.length
        return payload
      }
      return []
    },
  })

function handleSearch() {
  page.value = 1
  _handleSearch()
}

function handleReset() {
  page.value = 1
  _handleReset()
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
  name: [{ required: true, message: '请输入角色标识', trigger: ['input', 'blur'] }],
  displayName: [{ required: true, message: '请输入显示名称', trigger: ['input', 'blur'] }],
}

const columns: DataTableColumns<Role> = [
  { title: 'ID', key: 'id', width: 70 },
  { title: '标识', key: 'name', width: 160 },
  { title: '显示名称', key: 'displayName', width: 160 },
  { title: '描述', key: 'description', ellipsis: { tooltip: true } },
  { title: '创建时间', key: 'createdAt', width: 180, render: (row) => new Date(row.createdAt).toLocaleString('zh-CN') },
  {
    title: '操作',
    key: 'actions',
    width: 140,
    render: (row) =>
      h(NSpace, { size: 'small' }, {
        default: () => [
          h(NButton, { size: 'small', quaternary: true, type: 'primary', onClick: () => openEdit(row, (r) => ({ name: r.name, displayName: r.displayName, description: r.description })) }, {
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
      <h2 class="page-title">角色管理</h2>
      <n-button type="primary" @click="openCreate">
        <template #icon><n-icon><AddOutline /></n-icon></template>
        新建角色
      </n-button>
    </div>
    <n-space class="search-bar" :size="12" align="center">
      <n-input v-model:value="searchId" placeholder="ID" clearable style="width: 100px" @keyup.enter="handleSearch" />
      <n-input v-model:value="searchKeyword" placeholder="搜索..." clearable @keyup.enter="handleSearch" />
      <n-button type="primary" @click="handleSearch">
        <template #icon><n-icon><SearchOutline /></n-icon></template>
        搜索
      </n-button>
      <n-button @click="handleReset">
        <template #icon><n-icon><RefreshOutline /></n-icon></template>
        重置
      </n-button>
    </n-space>

    <n-card :bordered="false" class="table-card">
      <n-data-table
        :columns="columns"
        :data="list"
        :loading="loading"
        :bordered="false"
      />
      <div class="pagination-wrap" v-if="total > 0">
        <n-pagination :page="page" :page-size="pageSize" :page-sizes="[5, 10, 20]" :item-count="total" show-size-picker @update:page="handlePageChange" @update:page-size="handlePageSizeChange" />
      </div>
    </n-card>

    <n-modal
      v-model:show="showModal"
      preset="dialog"
      :title="editingId ? '编辑角色' : '新建角色'"
      :positive-text="saving ? '提交中...' : '确认'"
      :negative-text="saving ? undefined : '取消'"
      :loading="saving"
      @positive-click="() => handleSave(() => formRef?.validate())"
    >
      <n-form ref="formRef" :model="formValue" :rules="rules" label-placement="top">
        <n-form-item label="角色标识" path="name">
          <n-input v-model:value="formValue.name" placeholder="如 admin、editor" />
        </n-form-item>
        <n-form-item label="显示名称" path="displayName">
          <n-input v-model:value="formValue.displayName" placeholder="如 管理员、编辑" />
        </n-form-item>
        <n-form-item label="描述" path="description">
          <n-input v-model:value="formValue.description" type="textarea" placeholder="可选" :rows="3" />
        </n-form-item>
      </n-form>
    </n-modal>
  </div>
</template>

<style scoped>
.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
