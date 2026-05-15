<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import { NCard, NButton, NDataTable, NSpace, NInput, NIcon, NModal, NForm, NFormItem, useMessage, useDialog } from 'naive-ui'
import type { DataTableColumns, FormInst, FormRules } from 'naive-ui'
import { AddOutline, TrashOutline, CreateOutline, SearchOutline } from '@vicons/ionicons5'
import { getRoles, createRole, updateRole, deleteRole } from '../../api/role'
import type { Role } from '../../api/role'

const message = useMessage()
const dialog = useDialog()
const loading = ref(false)
const roles = ref<Role[]>([])
const keyword = ref('')
const showModal = ref(false)
const editingId = ref<number | null>(null)
const formRef = ref<FormInst | null>(null)
const saving = ref(false)
const formValue = ref({ name: '', displayName: '', description: '' })

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

async function loadRoles() {
  loading.value = true
  try {
    const res = await getRoles()
    const payload = res.data
    roles.value = Array.isArray(payload) ? payload : (payload?.list || [])
  } catch {
    message.error('加载角色失败')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  formValue.value = { name: '', displayName: '', description: '' }
  showModal.value = true
}

function openEdit(row: Role) {
  editingId.value = row.id
  formValue.value = { name: row.name, displayName: row.displayName, description: row.description || '' }
  showModal.value = true
}

async function handleSave() {
  try {
    await formRef.value?.validate()
  } catch {
    return false
  }
  saving.value = true
  try {
    if (editingId.value) {
      await updateRole(editingId.value, formValue.value)
      message.success('更新成功')
    } else {
      await createRole(formValue.value)
      message.success('创建成功')
    }
    showModal.value = false
    loadRoles()
  } catch (e: any) {
    message.error(e.message || '操作失败')
    return false
  } finally {
    saving.value = false
  }
}

function handleDelete(row: Role) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除角色「${row.displayName}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteRole(row.id)
        message.success('删除成功')
        loadRoles()
      } catch (e: any) {
        message.error(e.message || '删除失败')
      }
    },
  })
}

onMounted(loadRoles)
</script>

<template>
  <div class="page-wrapper">
    <div class="page-header">
      <h2 class="page-title">角色管理</h2>
      <n-space>
        <n-input v-model:value="keyword" placeholder="搜索角色..." clearable>
          <template #prefix>
            <n-icon><SearchOutline /></n-icon>
          </template>
        </n-input>
        <n-button type="primary" @click="openCreate">
          <template #icon><n-icon><AddOutline /></n-icon></template>
          新建角色
        </n-button>
      </n-space>
    </div>

    <n-card :bordered="false" class="table-card">
      <n-data-table
        :columns="columns"
        :data="keyword ? roles.filter(r => r.name.includes(keyword) || r.displayName.includes(keyword)) : roles"
        :loading="loading"
        :bordered="false"
      />
    </n-card>

    <n-modal
      v-model:show="showModal"
      preset="dialog"
      :title="editingId ? '编辑角色' : '新建角色'"
      :positive-text="saving ? '提交中...' : '确认'"
      :negative-text="saving ? undefined : '取消'"
      :loading="saving"
      @positive-click="handleSave"
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
.page-wrapper { display: flex; flex-direction: column; gap: 16px; }
.page-header { display: flex; align-items: center; justify-content: space-between; }
.page-title { font-size: 20px; font-weight: 700; margin: 0; }
.table-card { border-radius: 12px; }
</style>
