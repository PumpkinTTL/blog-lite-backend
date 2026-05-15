<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import { NCard, NButton, NDataTable, NSpace, NInput, NIcon, NModal, NForm, NFormItem, NTag, useMessage, useDialog } from 'naive-ui'
import type { DataTableColumns, FormInst, FormRules } from 'naive-ui'
import { AddOutline, TrashOutline, CreateOutline } from '@vicons/ionicons5'
import { getFriendLinks, createFriendLink, updateFriendLink, deleteFriendLink } from '../../api/friend-link'
import type { FriendLink } from '../../api/friend-link'

const message = useMessage()
const dialog = useDialog()
const loading = ref(false)
const list = ref<FriendLink[]>([])
const showModal = ref(false)
const editingId = ref<number | null>(null)
const formRef = ref<FormInst | null>(null)
const saving = ref(false)
const formValue = ref({ name: '', url: '', logo: '', description: '', status: 1, sortOrder: 0, postId: null as number | null })

const rules: FormRules = {
  name: [{ required: true, message: '请输入站点名称', trigger: ['input', 'blur'] }],
  url: [{ required: true, message: '请输入站点 URL', trigger: ['input', 'blur'] }],
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
    const res = await getFriendLinks()
    const payload = res.data
    list.value = Array.isArray(payload) ? payload : []
  } catch { message.error('加载失败') }
  finally { loading.value = false }
}

function openCreate() {
  editingId.value = null
  formValue.value = { name: '', url: '', logo: '', description: '', status: 1, sortOrder: 0, postId: null }
  showModal.value = true
}

function openEdit(row: FriendLink) {
  editingId.value = row.id
  formValue.value = { name: row.name, url: row.url, logo: row.logo || '', description: row.description || '', status: row.status, sortOrder: row.sortOrder, postId: row.postId }
  showModal.value = true
}

async function handleSave() {
  try { await formRef.value?.validate() } catch { return false }
  saving.value = true
  try {
    const data = {
      ...formValue.value,
      sortOrder: Number(formValue.value.sortOrder) || 0,
      postId: formValue.value.postId ? Number(formValue.value.postId) : null,
    }
    if (editingId.value) { await updateFriendLink(editingId.value, data); message.success('更新成功') }
    else { await createFriendLink(data); message.success('创建成功') }
    showModal.value = false; loadList()
  } catch (e: any) { message.error(e.message || '操作失败'); return false }
  finally { saving.value = false }
}

function handleDelete(row: FriendLink) {
  dialog.warning({
    title: '确认删除', content: `确定删除友链「${row.name}」？`, positiveText: '删除', negativeText: '取消',
    onPositiveClick: async () => {
      try { await deleteFriendLink(row.id); message.success('删除成功'); loadList() }
      catch (e: any) { message.error(e.message || '删除失败') }
    },
  })
}

onMounted(loadList)
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
    <n-card :bordered="false" class="table-card">
      <n-data-table :columns="columns" :data="list" :loading="loading" :bordered="false" />
    </n-card>
    <n-modal v-model:show="showModal" preset="dialog" :title="editingId ? '编辑友链' : '新建友链'"
      :positive-text="saving ? '提交中...' : '确认'" :negative-text="saving ? undefined : '取消'" :loading="saving" @positive-click="handleSave">
      <n-form ref="formRef" :model="formValue" :rules="rules" label-placement="top">
        <n-form-item label="站点名称" path="name"><n-input v-model:value="formValue.name" placeholder="如：张三的博客" /></n-form-item>
        <n-form-item label="站点 URL" path="url"><n-input v-model:value="formValue.url" placeholder="https://example.com" /></n-form-item>
        <n-form-item label="Logo URL"><n-input v-model:value="formValue.logo" placeholder="可选" /></n-form-item>
        <n-form-item label="描述"><n-input v-model:value="formValue.description" type="textarea" placeholder="可选" :rows="2" /></n-form-item>
        <n-form-item label="绑定文章 ID"><n-input v-model:value="formValue.postId" placeholder="留空为全局友链，填文章 ID 绑定到指定文章" clearable /></n-form-item>
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
