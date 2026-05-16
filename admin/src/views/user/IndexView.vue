<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import { NCard, NButton, NDataTable, NSpace, NInput, NIcon, NTag, NModal, NForm, NFormItem, NSelect, NPagination, NSwitch } from 'naive-ui'
import type { DataTableColumns, FormInst, FormRules } from 'naive-ui'
import { AddOutline, TrashOutline, CreateOutline, SearchOutline, RefreshOutline } from '@vicons/ionicons5'
import { getUsers, createUser, updateUser, deleteUser, toggleUserStatus } from '../../api/user'
import type { User } from '../../api/user'
import { getRoles } from '../../api/role'
import type { Role } from '../../api/role'
import { useCrudList } from '../../composables/useCrudList'

const formRef = ref<FormInst | null>(null)

// Pagination
const total = ref(0)
const page = ref(1)
const pageSize = ref(5)

// Extra search field
const searchStatus = ref<number | null>(null)

const userStatusOptions = [
  { label: '全部', value: null },
  { label: '正常', value: 1 },
  { label: '禁用', value: 0 },
]

// Role options for form select
const roleOptions = ref<{ label: string; value: number }[]>([])

const { loading, list, searchId, searchKeyword, showModal, editingId, saving, formValue,
  handleSearch: _handleSearch, handleReset: _handleReset, openCreate, openEdit: _openEdit,
  handleSave: _handleSave, handleDelete, message } =
  useCrudList<User>({
    loadApi: (params) => getUsers({
      ...params,
      page: page.value,
      pageSize: pageSize.value,
      ...(searchStatus.value !== null ? { status: searchStatus.value } : {}),
    }),
    createApi: createUser,
    updateApi: (id, data) => {
      const payload = { ...data }
      if (!payload.password) delete payload.password
      delete payload.username
      return updateUser(id, payload)
    },
    deleteApi: deleteUser,
    deleteContent: (row) => `确定删除用户「${row.nickname}」？`,
    defaultForm: () => ({ username: '', password: '', nickname: '', email: '', status: 1, roleIds: [] }),
    extractList: (res) => {
      const payload = res.data
      if (payload?.list) {
        total.value = payload.total
        return payload.list
      }
      return []
    },
  })

function openEdit(row: User) {
  _openEdit(row, (r) => ({
    username: r.username,
    password: '',
    nickname: r.nickname,
    email: r.email || '',
    status: r.status,
    roleIds: (r.roles || []).map((r) => r.id),
  }))
}

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
  if (!editingId.value && !formValue.value.password) {
    message.warning('新建用户必须设置密码')
    return false
  }
  if (!formValue.value.email) {
    delete formValue.value.email
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

async function handleToggleStatus(row: User) {
  try {
    await toggleUserStatus(row.id)
    message.success(row.status === 1 ? '已禁用用户' : '已启用用户')
    _handleSearch()
  } catch (e: any) {
    message.error(e.message || '操作失败')
  }
}

async function loadRoleOptions() {
  try {
    const res = await getRoles()
    const payload = res.data
    const list = Array.isArray(payload) ? payload : (payload?.list || [])
    roleOptions.value = list.map((r: Role) => ({ label: r.displayName, value: r.id }))
  } catch (e) {
    console.error('加载角色选项失败:', e)
  }
}

onMounted(() => {
  loadRoleOptions()
})

const rules: FormRules = {
  username: [{ required: true, message: '请输入账号', trigger: ['input', 'blur'] }],
  nickname: [{ required: true, message: '请输入昵称', trigger: ['input', 'blur'] }],
  email: [{ type: 'email', message: '请输入正确的邮箱格式', trigger: ['input', 'blur'] }],
  password: [{ min: 6, message: '密码至少 6 位', trigger: ['input', 'blur'] }],
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
    width: 100,
    render: (row) =>
      h(NSwitch, {
        value: row.status === 1,
        loading: false,
        onUpdateValue: () => handleToggleStatus(row),
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
    <n-space class="search-bar" :size="12" align="center">
      <n-input v-model:value="searchId" placeholder="ID" clearable style="width: 100px" @keyup.enter="handleSearch" />
      <n-input v-model:value="searchKeyword" placeholder="搜索..." clearable @keyup.enter="handleSearch" />
      <n-select v-model:value="searchStatus" :options="userStatusOptions" placeholder="状态" style="width: 120px" clearable />
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
.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
