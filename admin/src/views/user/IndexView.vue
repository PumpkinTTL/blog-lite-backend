<script setup lang="ts">
import { ref, onMounted, h, watch } from 'vue'
import { NButton, NDataTable, NSpace, NInput, NIcon, NTag, NModal, NForm, NFormItem, NSelect, NPagination, NSwitch, NAvatar, NUpload } from 'naive-ui'
import type { DataTableColumns, FormInst, FormRules } from 'naive-ui'
import { AddOutline, TrashOutline, CreateOutline, SearchOutline, RefreshOutline } from '@vicons/ionicons5'
import { getUsers, createUser, updateUser, deleteUser, batchDeleteUsers, toggleUserStatus } from '../../api/user'
import type { User } from '../../api/user'
import { getRoles } from '../../api/role'
import type { Role } from '../../api/role'
import type { PlanLevel } from '../../api/plan'
import { uploadToR2, getR2MediaList } from '../../api/r2-storage'
import { useCrudList } from '../../composables/useCrudList'

const formRef = ref<FormInst | null>(null)

// Pagination
const total = ref(0)
const page = ref(1)
const pageSize = ref(5)

// Extra search field
const searchStatus = ref<string | null>(null)

const userStatusOptions = [
  { label: '全部', value: null },
  { label: '正常', value: 'active' },
  { label: '禁用', value: 'disabled' },
]

// 会员等级标签（与 membership 页一致）
const levelTagType: Record<PlanLevel, 'info' | 'success' | 'warning'> = {
  plus: 'info',
  pro: 'success',
  max: 'warning',
}
const levelLabel: Record<PlanLevel, string> = { plus: 'Plus', pro: 'Pro', max: 'Max' }

function renderMembership(row: User) {
  const m = row.membership
  if (!m) return h(NTag, { size: 'small', bordered: false }, { default: () => '无' })
  const expireText = m.expiresAt === null ? '终身' : new Date(m.expiresAt).toLocaleDateString('zh-CN')
  return h(NSpace, { size: 4, align: 'center', wrap: false }, {
    default: () => [
      h(NTag, { size: 'small', type: levelTagType[m.level], bordered: false }, { default: () => levelLabel[m.level] }),
      h('span', { style: 'font-size: 12px; color: #999; white-space: nowrap;' }, `${expireText}到期`),
    ],
  })
}

// Role options for form select
const roleOptions = ref<{ label: string; value: number }[]>([])

const avatarUrl = ref<string | null>(null)
const avatarUploading = ref(false)
const r2PickerShow = ref(false)
const r2Images = ref<any[]>([])
const r2Loading = ref(false)

async function openR2Picker() {
  r2PickerShow.value = true
  r2Loading.value = true
  try {
    const res: any = await getR2MediaList({ pageSize: 50, mimeType: 'image' })
    r2Images.value = res.data?.list || []
  } catch { r2Images.value = [] }
  finally { r2Loading.value = false }
}

function pickR2Image(url: string) {
  avatarUrl.value = url
  r2PickerShow.value = false
}

async function handleAvatarChange(data: { file: any; fileList: any[] }) {
  const rawFile = data.file?.file
  if (!rawFile) return
  avatarUploading.value = true
  try {
    const name = formValue.value.nickname || formValue.value.username || '未知'
    const uid = editingId.value ? `#${editingId.value} ` : ''
    const res: any = await uploadToR2(rawFile, { app: 'vibehub', folder: 'avatar', note: `${uid}${name} 头像` })
    avatarUrl.value = res.data?.url || res.url || ''
    message.success('头像上传成功')
  } catch (e: any) {
    message.error(e?.message || '头像上传失败')
  } finally {
    avatarUploading.value = false
  }
}

const { loading, list, searchId, searchKeyword, showModal, editingId, saving, formValue,
  handleSearch: _handleSearch, handleReset: _handleReset, openCreate, openEdit: _openEdit,
  handleSave: _handleSave, handleDelete, handleBatchDelete, checkedRowKeys, selectionColumn, message } =
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
    batchDeleteApi: batchDeleteUsers,
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

// 弹窗关闭时重置头像（取消的情况）
watch(showModal, (v) => { if (!v) avatarUrl.value = null })

function openEdit(row: User) {
  avatarUrl.value = row.avatar || null
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
  formValue.value.avatar = avatarUrl.value
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
    message.success(row.status === 'active' ? '已禁用用户' : '已启用用户')
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
  selectionColumn,
  { title: 'ID', key: 'id', width: 70 },
  { title: '账号', key: 'username', width: 140 },
  { title: '昵称', key: 'nickname', width: 140 },
  {
    title: '角色',
    key: 'roles',
    width: 200,
    render: (row) =>
      h(NSpace, { size: 4, wrap: false }, {
        default: () => (row.roles || []).map((r) =>
          h(NTag, { size: 'small', type: 'info', bordered: false }, { default: () => r.displayName }),
        ),
      }),
  },
  {
    title: '会员',
    key: 'membership',
    width: 220,
    render: (row) => renderMembership(row),
  },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render: (row) =>
      h(NSwitch, {
        value: row.status === 'active',
        loading: false,
        onUpdateValue: () => handleToggleStatus(row),
      }),
  },
  { title: '创建时间', key: 'createdAt', width: 170, render: (row) => new Date(row.createdAt).toLocaleString('zh-CN') },
  {
    title: '操作',
    key: 'actions',
    width: 140,
    fixed: 'right',
    render: (row) =>
      h(NSpace, { size: 'small', wrap: false }, {
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
      <n-button :disabled="checkedRowKeys.length === 0" type="error" @click="handleBatchDelete">
        <template #icon><n-icon><TrashOutline /></n-icon></template>
        批量删除
      </n-button>
    </n-space>

    <div class="table-section">
      <n-data-table :columns="columns" :data="list" :loading="loading" :bordered="false" :scroll-x="1300"
        :row-key="(row: any) => row.id" @update:checked-row-keys="(keys: any) => checkedRowKeys = keys" />
      <div class="pagination-wrap" v-if="total > 0">
        <n-pagination :page="page" :page-size="pageSize" :page-sizes="[10, 20, 50]" :item-count="total" show-size-picker @update:page="handlePageChange" @update:page-size="handlePageSizeChange" />
      </div>
    </div>

    <n-modal
      v-model:show="showModal"
      preset="dialog"
      :title="editingId ? '编辑用户' : '新建用户'"
      :positive-text="saving ? '提交中...' : '确认'"
      :negative-text="saving ? undefined : '取消'"
      :loading="saving"
      @positive-click="handleSave"
      style="width:560px"
    >
      <n-form ref="formRef" :model="formValue" :rules="rules" label-placement="top">
        <n-form-item label="登录账号" path="username">
          <n-input v-model:value="formValue.username" placeholder="登录账号" :disabled="!!editingId" />
        </n-form-item>
        <n-form-item :label="editingId ? '新密码（留空不修改）' : '密码'" path="password">
          <n-input v-model:value="formValue.password" type="password" :placeholder="editingId ? '留空不修改' : '至少6位'" show-password-on="click" />
        </n-form-item>
        <n-form-item label="头像">
          <div class="av-wrap">
            <div class="av-preview">
              <n-avatar v-if="avatarUrl" :src="avatarUrl" :size="96" />
              <n-avatar v-else :size="96" color="#2563EB" style="font-size:32px;font-weight:600">{{ formValue.nickname?.charAt(0)?.toUpperCase() || '?' }}</n-avatar>
            </div>
            <n-space>
              <n-button size="small" @click="openR2Picker">从R2选择</n-button>
              <n-upload :show-file-list="false" accept="image/*" :disabled="avatarUploading" :default-upload="false" @change="handleAvatarChange">
                <n-button size="small" :loading="avatarUploading">本地上传</n-button>
              </n-upload>
              <n-button v-if="avatarUrl" size="small" tertiary type="error" @click="avatarUrl = null">移除</n-button>
            </n-space>
          </div>
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

    <n-modal v-model:show="r2PickerShow" preset="dialog" title="从R2选择头像" style="width:640px">
      <div v-if="r2Loading" style="text-align:center;padding:40px">加载中...</div>
      <div v-else class="r2-grid">
        <div v-for="img in r2Images" :key="img.id" class="r2-item" @click="pickR2Image(img.url)">
          <img :src="img.url" class="r2-thumb" />
        </div>
      </div>
    </n-modal>
  </div>
</template>

<style scoped>
.av-wrap { display: flex; align-items: center; gap: 20px; }
.av-preview { flex-shrink: 0; }
.r2-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; max-height: 400px; overflow-y: auto; }
.r2-item { cursor: pointer; border-radius: 8px; overflow: hidden; border: 2px solid transparent; }
.r2-item:hover { border-color: var(--n-primary-color, #2563EB); }
.r2-thumb { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
</style>
