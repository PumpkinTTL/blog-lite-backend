<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import { NCard, NButton, NDataTable, NSpace, NInput, NIcon, NTag, NModal, NForm, NFormItem, NSelect, NPagination, useMessage, useDialog } from 'naive-ui'
import type { DataTableColumns, FormInst, FormRules } from 'naive-ui'
import { AddOutline, TrashOutline, CreateOutline } from '@vicons/ionicons5'
import { getUsers, createUser, updateUser, deleteUser } from '../../api/user'
import type { User } from '../../api/user'
import { getRoles } from '../../api/role'
import type { Role } from '../../api/role'

const message = useMessage()
const dialog = useDialog()
const loading = ref(false)
const users = ref<User[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const showModal = ref(false)
const editingId = ref<number | null>(null)
const formRef = ref<FormInst | null>(null)
const saving = ref(false)
const formValue = ref({ username: '', password: '', nickname: '', email: '', status: 1, roleIds: [] as number[] })
const roleOptions = ref<{ label: string; value: number }[]>([])

const rules: FormRules = {
  username: [{ required: true, message: '请输入账号', trigger: ['input', 'blur'] }],
  nickname: [{ required: true, message: '请输入昵称', trigger: ['input', 'blur'] }],
}

const columns: DataTableColumns<User> = [
  { title: 'ID', key: 'id', width: 70 },
  { title: '账号', key: 'username', width: 140 },
  { title: '昵称', key: 'nickname', width: 140 },
  {
    title: '角色',
    key: 'roles',
    width: 200,
    render: (row) =>
      h(NSpace, { size: 4 }, {
        default: () => (row.roles || []).map((r) =>
          h(NTag, { size: 'small', type: 'info', bordered: false }, { default: () => r.displayName }),
        ),
      }),
  },
  {
    title: '状态',
    key: 'status',
    width: 90,
    render: (row) =>
      h(NTag, { size: 'small', type: row.status === 1 ? 'success' : 'error' }, {
        default: () => (row.status === 1 ? '正常' : '禁用'),
      }),
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

async function loadUsers() {
  loading.value = true
  try {
    const res = await getUsers({ page: page.value, pageSize: pageSize.value })
    const payload = res.data
    if (payload?.list) {
      users.value = payload.list
      total.value = payload.total
    }
  } catch {
    message.error('加载用户列表失败')
  } finally {
    loading.value = false
  }
}

async function loadRoleOptions() {
  try {
    const res = await getRoles()
    const payload = res.data
    const list = Array.isArray(payload) ? payload : (payload?.list || [])
    roleOptions.value = list.map((r: Role) => ({ label: r.displayName, value: r.id }))
  } catch {
    // 不阻塞
  }
}

function openCreate() {
  editingId.value = null
  formValue.value = { username: '', password: '', nickname: '', email: '', status: 1, roleIds: [] }
  showModal.value = true
}

function openEdit(row: User) {
  editingId.value = row.id
  formValue.value = {
    username: row.username,
    password: '',
    nickname: row.nickname,
    email: row.email || '',
    status: row.status,
    roleIds: (row.roles || []).map((r) => r.id),
  }
  showModal.value = true
}

async function handleSave() {
  try {
    await formRef.value?.validate()
  } catch {
    return false
  }
  if (!editingId.value && !formValue.value.password) {
    message.warning('新建用户必须设置密码')
    return false
  }
  saving.value = true
  try {
    if (editingId.value) {
      const data: any = { ...formValue.value }
      if (!data.password) delete data.password
      delete data.username
      await updateUser(editingId.value, data)
      message.success('更新成功')
    } else {
      await createUser(formValue.value)
      message.success('创建成功')
    }
    showModal.value = false
    loadUsers()
  } catch (e: any) {
    message.error(e.message || '操作失败')
    return false
  } finally {
    saving.value = false
  }
}

function handleDelete(row: User) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除用户「${row.nickname}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteUser(row.id)
        message.success('删除成功')
        loadUsers()
      } catch (e: any) {
        message.error(e.message || '删除失败')
      }
    },
  })
}

function handlePageChange(p: number) {
  page.value = p
  loadUsers()
}

onMounted(() => {
  loadUsers()
  loadRoleOptions()
})
</script>

<template>
  <div class="page-wrapper">
    <div class="page-header">
      <h2 class="page-title">用户管理</h2>
      <n-button type="primary" @click="openCreate">
        <template #icon><n-icon><AddOutline /></n-icon></template>
        新建用户
      </n-button>
    </div>

    <n-card :bordered="false" class="table-card">
      <n-data-table :columns="columns" :data="users" :loading="loading" :bordered="false" />
      <div class="pagination-wrap" v-if="total > pageSize">
        <n-pagination :page="page" :page-size="pageSize" :item-count="total" @update:page="handlePageChange" />
      </div>
    </n-card>

    <n-modal
      v-model:show="showModal"
      preset="dialog"
      :title="editingId ? '编辑用户' : '新建用户'"
      :positive-text="saving ? '提交中...' : '确认'"
      :negative-text="saving ? undefined : '取消'"
      :loading="saving"
      @positive-click="handleSave"
    >
      <n-form ref="formRef" :model="formValue" :rules="rules" label-placement="top">
        <n-form-item label="登录账号" path="username">
          <n-input v-model:value="formValue.username" placeholder="登录账号" :disabled="!!editingId" />
        </n-form-item>
        <n-form-item :label="editingId ? '新密码（留空不修改）' : '密码'" path="password">
          <n-input v-model:value="formValue.password" type="password" :placeholder="editingId ? '留空不修改' : '至少6位'" show-password-on="click" />
        </n-form-item>
        <n-form-item label="昵称" path="nickname">
          <n-input v-model:value="formValue.nickname" placeholder="显示昵称" />
        </n-form-item>
        <n-form-item label="邮箱" path="email">
          <n-input v-model:value="formValue.email" placeholder="可选" />
        </n-form-item>
        <n-form-item label="角色" path="roleIds">
          <n-select v-model:value="formValue.roleIds" :options="roleOptions" placeholder="选择角色" multiple clearable />
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
.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
