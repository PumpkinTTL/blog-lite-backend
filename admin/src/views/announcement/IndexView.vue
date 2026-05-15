<script setup lang="ts">
import { ref, h } from 'vue'
import { NCard, NButton, NDataTable, NSpace, NInput, NIcon, NModal, NForm, NFormItem, NTag, NSelect } from 'naive-ui'
import type { DataTableColumns, FormInst, FormRules } from 'naive-ui'
import { AddOutline, TrashOutline, CreateOutline, SearchOutline, RefreshOutline } from '@vicons/ionicons5'
import { getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '../../api/announcement'
import type { Announcement } from '../../api/announcement'
import { useCrudList } from '../../composables/useCrudList'

const formRef = ref<FormInst | null>(null)

const searchStatus = ref<number | null>(null)

const announcementStatusOptions = [
  { label: '全部', value: null },
  { label: '显示', value: 1 },
  { label: '隐藏', value: 0 },
]

const { loading, list, searchId, searchKeyword, showModal, editingId, saving, formValue,
  handleSearch: _handleSearch, handleReset: _handleReset, openCreate, openEdit, handleSave: _handleSave, handleDelete } =
  useCrudList<Announcement>({
    loadApi: (params) => getAnnouncements({
      ...params,
      ...(searchStatus.value !== null ? { status: searchStatus.value } : {}),
    }),
    createApi: createAnnouncement,
    updateApi: updateAnnouncement,
    deleteApi: deleteAnnouncement,
    deleteContent: (row) => `确定删除公告「${row.title}」？`,
    defaultForm: () => ({ title: '', content: '', status: 1, sortOrder: 0 }),
  })

function handleSearch() {
  _handleSearch()
}

function handleReset() {
  _handleReset()
  searchStatus.value = null
}

async function handleSave() {
  return _handleSave(() => formRef!.validate())
}

const rules: FormRules = {
  title: [{ required: true, message: '请输入标题', trigger: ['input', 'blur'] }],
  content: [{ required: true, message: '请输入内容', trigger: ['input', 'blur'] }],
}

const columns: DataTableColumns<Announcement> = [
  { title: 'ID', key: 'id', width: 70 },
  { title: '标题', key: 'title', ellipsis: { tooltip: true }, width: 200 },
  { title: '内容', key: 'content', ellipsis: { tooltip: true } },
  {
    title: '状态',
    key: 'status',
    width: 90,
    render: (row) =>
      h(NTag, { size: 'small', type: row.status === 1 ? 'success' : 'default' }, { default: () => (row.status === 1 ? '显示' : '隐藏') }),
  },
  { title: '排序', key: 'sortOrder', width: 80 },
  { title: '创建时间', key: 'createdAt', width: 170, render: (row) => new Date(row.createdAt).toLocaleString('zh-CN') },
  {
    title: '操作', key: 'actions', width: 140,
    render: (row) => h(NSpace, { size: 'small' }, {
      default: () => [
        h(NButton, { size: 'small', quaternary: true, type: 'primary', onClick: () => openEdit(row) }, {
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
      <h2 class="page-title">公告管理</h2>
      <n-button type="primary" @click="openCreate">
        <template #icon><n-icon><AddOutline /></n-icon></template>
        新建公告
      </n-button>
    </div>
    <n-space class="search-bar" :size="12" align="center">
      <n-input v-model:value="searchId" placeholder="ID" clearable style="width: 100px" @keyup.enter="handleSearch" />
      <n-input v-model:value="searchKeyword" placeholder="搜索..." clearable @keyup.enter="handleSearch" />
      <n-select v-model:value="searchStatus" :options="announcementStatusOptions" placeholder="状态" style="width: 120px" clearable />
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
      <n-data-table :columns="columns" :data="list" :loading="loading" :bordered="false" />
    </n-card>
    <n-modal v-model:show="showModal" preset="dialog" :title="editingId ? '编辑公告' : '新建公告'"
      :positive-text="saving ? '提交中...' : '确认'" :negative-text="saving ? undefined : '取消'" :loading="saving" @positive-click="handleSave">
      <n-form ref="formRef" :model="formValue" :rules="rules" label-placement="top">
        <n-form-item label="标题" path="title"><n-input v-model:value="formValue.title" placeholder="公告标题" /></n-form-item>
        <n-form-item label="内容" path="content"><n-input v-model:value="formValue.content" type="textarea" placeholder="公告内容" :rows="4" /></n-form-item>
        <n-form-item label="排序权重"><n-input v-model:value="formValue.sortOrder" placeholder="数字越小越靠前" /></n-form-item>
      </n-form>
    </n-modal>
  </div>
</template>

<style scoped></style>
