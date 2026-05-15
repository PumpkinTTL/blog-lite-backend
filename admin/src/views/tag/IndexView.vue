<script setup lang="ts">
import { ref, h } from 'vue'
import { NCard, NButton, NDataTable, NSpace, NInput, NIcon, NModal, NForm, NFormItem } from 'naive-ui'
import type { DataTableColumns, FormInst, FormRules } from 'naive-ui'
import { AddOutline, TrashOutline, CreateOutline, SearchOutline, RefreshOutline } from '@vicons/ionicons5'
import { getTags, createTag, updateTag, deleteTag } from '../../api/tag'
import type { Tag } from '../../api/tag'
import { useCrudList } from '../../composables/useCrudList'

const formRef = ref<FormInst | null>(null)

const { loading, list, searchId, searchKeyword, showModal, editingId, saving, formValue,
  handleSearch, handleReset, openCreate, openEdit, handleSave: _handleSave, handleDelete } =
  useCrudList<Tag>({
    loadApi: getTags,
    createApi: createTag,
    updateApi: updateTag,
    deleteApi: deleteTag,
    deleteContent: (row) => `确定删除标签「${row.name}」？`,
    defaultForm: () => ({ name: '', slug: '' }),
  })

async function handleSave() {
  return _handleSave(() => formRef!.validate())
}

const rules: FormRules = {
  name: [{ required: true, message: '请输入标签名称', trigger: ['input', 'blur'] }],
  slug: [{ required: true, message: '请输入 Slug', trigger: ['input', 'blur'] }],
}

const columns: DataTableColumns<Tag> = [
  { title: 'ID', key: 'id', width: 70 },
  { title: '名称', key: 'name', width: 200 },
  { title: 'Slug', key: 'slug', width: 200 },
  { title: '创建时间', key: 'createdAt', width: 180 },
  { title: '更新时间', key: 'updatedAt', width: 180 },
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
      <h2 class="page-title">标签管理</h2>
      <n-button type="primary" @click="openCreate">
        <template #icon><n-icon><AddOutline /></n-icon></template>
        新建标签
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
    </n-card>

    <n-modal
      v-model:show="showModal"
      preset="dialog"
      :title="editingId ? '编辑标签' : '新建标签'"
      :positive-text="saving ? '提交中...' : '确认'"
      :negative-text="saving ? undefined : '取消'"
      :loading="saving"
      @positive-click="handleSave"
    >
      <n-form ref="formRef" :model="formValue" :rules="rules" label-placement="top">
        <n-form-item label="标签名称" path="name">
          <n-input v-model:value="formValue.name" placeholder="请输入标签名称" />
        </n-form-item>
        <n-form-item label="Slug" path="slug">
          <n-input v-model:value="formValue.slug" placeholder="url-friendly 标识，如 javascript" />
        </n-form-item>
      </n-form>
    </n-modal>
  </div>
</template>

<style scoped></style>
