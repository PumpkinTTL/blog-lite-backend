<script setup lang="ts">
import { ref, h } from 'vue'
import { NCard, NButton, NDataTable, NSpace, NInput, NIcon, NModal, NForm, NFormItem, NTag, NSelect, NPagination } from 'naive-ui'
import type { DataTableColumns, FormInst, FormRules } from 'naive-ui'
import { AddOutline, TrashOutline, CreateOutline, SearchOutline, RefreshOutline } from '@vicons/ionicons5'
import { getFriendLinks, createFriendLink, updateFriendLink, deleteFriendLink } from '../../api/friend-link'
import type { FriendLink } from '../../api/friend-link'
import { useCrudList } from '../../composables/useCrudList'

const formRef = ref<FormInst | null>(null)

// Pagination
const total = ref(0)
const page = ref(1)
const pageSize = ref(5)

const searchStatus = ref<number | null>(null)

const friendLinkStatusOptions = [
  { label: '全部', value: null },
  { label: '显示', value: 1 },
  { label: '隐藏', value: 0 },
]

const { loading, list, searchId, searchKeyword, showModal, editingId, saving, formValue,
  handleSearch: _handleSearch, handleReset: _handleReset, openCreate, openEdit,
  handleSave: _handleSave, handleDelete, message } =
  useCrudList<FriendLink>({
    loadApi: (params) => getFriendLinks({
      ...params,
      page: page.value,
      pageSize: pageSize.value,
      ...(searchStatus.value !== null ? { status: searchStatus.value } : {}),
    }),
    createApi: (data) => createFriendLink(data),
    updateApi: (id, data) => updateFriendLink(id, data),
    deleteApi: deleteFriendLink,
    deleteContent: (row) => `确定删除友链「${row.name}」？`,
    defaultForm: () => ({ name: '', url: '', logo: '', description: '', status: 1, sortOrder: 0, postId: null }),
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
  formValue.value.sortOrder = Number(formValue.value.sortOrder) || 0
  formValue.value.postId = formValue.value.postId ? Number(formValue.value.postId) : null
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
  name: [{ required: true, message: '请输入站点名称', trigger: ['input', 'blur'] }],
  url: [
    { required: true, message: '请输入站点 URL', trigger: ['input', 'blur'] },
    { pattern: /^https?:\/\/.+/, message: '请输入有效的 URL（以 http:// 或 https:// 开头）', trigger: ['blur'] },
  ],
}

const columns: DataTableColumns<FriendLink> = [
  { title: 'ID', key: 'id', width: 70 },
  { title: '名称', key: 'name', width: 150 },
  { title: 'URL', key: 'url', ellipsis: { tooltip: true }, width: 200 },
  { title: '描述', key: 'description', ellipsis: { tooltip: true } },
  {
    title: '绑定文章', key: 'postId', width: 140,
    render: (row) => row.postId ? h(NTag, { size: 'small', type: 'info', bordered: false }, { default: () => row.post?.title || `#${row.postId}` }) : h(NTag, { size: 'small', bordered: false }, { default: () => '全局' }),
  },
  {
    title: '状态', key: 'status', width: 80,
    render: (row) => h(NTag, { size: 'small', type: row.status === 1 ? 'success' : 'default' }, { default: () => (row.status === 1 ? '显示' : '隐藏') }),
  },
  {
    title: '操作', key: 'actions', width: 140,
    render: (row) => h(NSpace, { size: 'small' }, {
      default: () => [
        h(NButton, { size: 'small', quaternary: true, type: 'primary', onClick: () => openEdit(row, (r) => ({
          name: r.name,
          url: r.url,
          logo: r.logo,
          description: r.description,
          status: r.status,
          sortOrder: r.sortOrder,
          postId: r.postId,
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
      <h2 class="page-title">友情链接</h2>
      <n-button type="primary" @click="openCreate">
        <template #icon><n-icon><AddOutline /></n-icon></template>
        新建友链
      </n-button>
    </div>
    <n-space class="search-bar" :size="12" align="center">
      <n-input v-model:value="searchId" placeholder="ID" clearable style="width: 100px" @keyup.enter="handleSearch" />
      <n-input v-model:value="searchKeyword" placeholder="搜索..." clearable @keyup.enter="handleSearch" />
      <n-select v-model:value="searchStatus" :options="friendLinkStatusOptions" placeholder="状态" style="width: 120px" clearable />
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
      <div class="pagination-wrap" v-if="total > 0">
        <n-pagination :page="page" :page-size="pageSize" :page-sizes="[5, 10, 20]" :item-count="total" show-size-picker @update:page="handlePageChange" @update:page-size="handlePageSizeChange" />
      </div>
    </n-card>
    <n-modal v-model:show="showModal" preset="dialog" :title="editingId ? '编辑友链' : '新建友链'"
      :positive-text="saving ? '提交中...' : '确认'" :negative-text="saving ? undefined : '取消'" :loading="saving" @positive-click="handleSave">
      <n-form ref="formRef" :model="formValue" :rules="rules" label-placement="top">
        <n-form-item label="站点名称" path="name"><n-input v-model:value="formValue.name" placeholder="如：张三的博客" /></n-form-item>
        <n-form-item label="站点 URL" path="url"><n-input v-model:value="formValue.url" placeholder="https://example.com" /></n-form-item>
        <n-form-item label="Logo URL"><n-input v-model:value="formValue.logo" placeholder="可选" /></n-form-item>
        <n-form-item label="描述"><n-input v-model:value="formValue.description" type="textarea" placeholder="可选" :rows="2" /></n-form-item>
        <n-form-item label="状态" path="status">
          <n-select v-model:value="formValue.status" :options="[
            { label: '显示', value: 1 },
            { label: '隐藏', value: 0 },
          ]" />
        </n-form-item>
        <n-form-item label="绑定文章 ID"><n-input v-model:value="formValue.postId" placeholder="留空为全局友链，填文章 ID 绑定到指定文章" clearable /></n-form-item>
        <n-form-item label="排序权重"><n-input v-model:value="formValue.sortOrder" placeholder="数字越小越靠前" /></n-form-item>
      </n-form>
    </n-modal>
  </div>
</template>

<style scoped>
.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
