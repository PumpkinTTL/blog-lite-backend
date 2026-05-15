<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import { NCard, NButton, NDataTable, NSpace, NInput, NIcon, NModal, NForm, NFormItem, NTag, useMessage, useDialog } from 'naive-ui'
import type { DataTableColumns, FormInst, FormRules } from 'naive-ui'
import { AddOutline, TrashOutline, CreateOutline, SearchOutline } from '@vicons/ionicons5'
import { getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '../../api/announcement'
import type { Announcement } from '../../api/announcement'

const message = useMessage()
const dialog = useDialog()
const loading = ref(false)
const list = ref<Announcement[]>([])
const keyword = ref('')
const showModal = ref(false)
const editingId = ref<number | null>(null)
const formRef = ref<FormInst | null>(null)
const saving = ref(false)
const formValue = ref({ title: '', content: '', status: 1, sortOrder: 0 })

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

async function loadList() {
  loading.value = true
  try {
    const res = await getAnnouncements()
    const payload = res.data
    list.value = Array.isArray(payload) ? payload : []
  } catch { message.error('加载失败') }
  finally { loading.value = false }
}

function openCreate() {
  editingId.value = null
  formValue.value = { title: '', content: '', status: 1, sortOrder: 0 }
  showModal.value = true
}

function openEdit(row: Announcement) {
  editingId.value = row.id
  formValue.value = { title: row.title, content: row.content, status: row.status, sortOrder: row.sortOrder }
  showModal.value = true
}

async function handleSave() {
  try { await formRef.value?.validate() } catch { return false }
  saving.value = true
  try {
    if (editingId.value) { await updateAnnouncement(editingId.value, formValue.value); message.success('更新成功') }
    else { await createAnnouncement(formValue.value); message.success('创建成功') }
    showModal.value = false; loadList()
  } catch (e: any) { message.error(e.message || '操作失败'); return false }
  finally { saving.value = false }
}

function handleDelete(row: Announcement) {
  dialog.warning({
    title: '确认删除', content: `确定删除公告「${row.title}」？`, positiveText: '删除', negativeText: '取消',
    onPositiveClick: async () => {
      try { await deleteAnnouncement(row.id); message.success('删除成功'); loadList() }
      catch (e: any) { message.error(e.message || '删除失败') }
    },
  })
}

onMounted(loadList)
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
    <n-card :bordered="false" class="table-card">
      <n-data-table :columns="columns" :data="keyword ? list.filter(a => a.title.includes(keyword)) : list" :loading="loading" :bordered="false" />
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

<style scoped>
.page-wrapper { display: flex; flex-direction: column; gap: 16px; }
.page-header { display: flex; align-items: center; justify-content: space-between; }
.page-title { font-size: 20px; font-weight: 700; margin: 0; }
.table-card { border-radius: 12px; }
</style>
