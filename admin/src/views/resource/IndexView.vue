<script setup lang="ts">
import { ref, h } from 'vue'
import {
  NButton,
  NDataTable,
  NSpace,
  NInput,
  NInputNumber,
  NIcon,
  NModal,
  NForm,
  NFormItem,
  NTag,
  NSelect,
  NPagination,
  NDynamicInput,
  NUpload,
} from 'naive-ui'
import type { DataTableColumns, FormInst, FormRules, UploadFileInfo } from 'naive-ui'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import {
  AddOutline,
  TrashOutline,
  CreateOutline,
  SearchOutline,
  RefreshOutline,
  CloudUploadOutline,
} from '@vicons/ionicons5'
import {
  getResources,
  createResource,
  updateResource,
  deleteResource,
  batchDeleteResources,
  updateResourceVisibility,
} from '../../api/resource'
import type { Resource, PanLink } from '../../api/resource'
import { getUsers } from '../../api/user'
import { getRoles } from '../../api/role'
import { uploadToR2 } from '../../api/r2-storage'
import { useCrudList } from '../../composables/useCrudList'
import { isDark } from '../../theme'

const formRef = ref<FormInst | null>(null)

// 分页
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)

// 搜索条件
const searchStatus = ref<string | null>(null)
const searchCategory = ref<string | null>(null)

// 可见性多选选项（弹窗打开时加载）
const userOptions = ref<{ label: string; value: number }[]>([])
const roleOptions = ref<{ label: string; value: number }[]>([])

const statusOptions = [
  { label: '全部', value: null },
  { label: '草稿', value: 'draft' },
  { label: '公开', value: 'published' },
  { label: '登录可见', value: 'login' },
  { label: '指定可见', value: 'private' },
]

// 预设分类（可自定义输入）
const categoryPresets = [
  'PPT模板',
  '开源软件',
  '电子书',
  '整合包',
  '设计素材',
  '其他',
]
const categoryOptions = [
  { label: '全部分类', value: null },
  ...categoryPresets.map((c) => ({ label: c, value: c })),
]

const memberLevelOptions = [
  { label: '不限', value: null },
  { label: 'Plus', value: 'plus' },
  { label: 'Pro', value: 'pro' },
  { label: 'Max', value: 'max' },
]

const formStatusOptions = [
  { label: '草稿', value: 'draft' },
  { label: '公开', value: 'published' },
  { label: '登录可见', value: 'login' },
  { label: '指定可见', value: 'private' },
]

const {
  loading,
  list,
  searchId,
  searchKeyword,
  showModal,
  editingId,
  saving,
  formValue,
  handleSearch: _handleSearch,
  handleReset: _handleReset,
  openCreate: _openCreate,
  openEdit: _openEdit,
  handleSave: _handleSave,
  handleDelete,
  handleBatchDelete,
  checkedRowKeys,
  selectionColumn,
  message,
} = useCrudList<Resource>({
  loadApi: (params) =>
    getResources({
      ...params,
      page: page.value,
      pageSize: pageSize.value,
      ...(searchStatus.value !== null ? { status: searchStatus.value } : {}),
      ...(searchCategory.value !== null
        ? { category: searchCategory.value }
        : {}),
    }),
  createApi: (data) => createResource(data),
  updateApi: (id, data) => updateResource(id, data),
  deleteApi: deleteResource,
  batchDeleteApi: batchDeleteResources,
  deleteContent: (row) => `确定删除资源「${row.title}」？`,
  defaultForm: () => ({
    title: '',
    description: '',
    cover: '',
    category: null,
    content: '',
    panLinks: [{ name: '', url: '', code: '' }] as PanLink[],
    priceYuan: 0,
    status: 'draft',
    minMemberLevel: null,
    sortOrder: 0,
    allowedUserIds: [] as number[],
    allowedRoleIds: [] as number[],
  }),
  extractList: (res) => {
    const payload = res.data
    if (payload?.list) {
      total.value = payload.total
      return payload.list
    }
    return Array.isArray(payload) ? payload : []
  },
})

// 弹窗打开时加载用户/角色选项
async function loadVisibilityOptions() {
  if (userOptions.value.length > 0) return
  try {
    const [userRes, roleRes] = await Promise.all([
      getUsers({ pageSize: 1000 }),
      getRoles({ pageSize: 1000 }),
    ])
    const userPayload = userRes.data
    const users = Array.isArray(userPayload) ? userPayload : (userPayload?.list || [])
    userOptions.value = users.map((u: any) => ({
      label: `${u.nickname || u.username} (#${u.id})`,
      value: u.id,
    }))
    const rolePayload = roleRes.data
    const roles = Array.isArray(rolePayload) ? rolePayload : (rolePayload?.list || [])
    roleOptions.value = roles.map((r: any) => ({
      label: `${r.displayName || r.name} (#${r.id})`,
      value: r.id,
    }))
  } catch (e: any) {
    message.error(e?.message || '加载可见性选项失败')
  }
}

// 状态联动：切换为非 private 时清空可见性配置
function handleStatusChange(val: string) {
  formValue.value.status = val
  if (val !== 'private') {
    formValue.value.allowedUserIds = []
    formValue.value.allowedRoleIds = []
  }
}

function openCreate() {
  _openCreate()
  loadVisibilityOptions()
}

function openEdit(row: Resource, mapper: (r: Resource) => Record<string, any>) {
  _openEdit(row, mapper)
  loadVisibilityOptions()
}

function handleSearch() {
  page.value = 1
  _handleSearch()
}

function handleReset() {
  searchId.value = ''
  searchKeyword.value = ''
  searchStatus.value = null
  searchCategory.value = null
  page.value = 1
  _handleReset()
}

// 网盘链接动态表单的增删按钮
function onCreatePanLink() {
  return { name: '', url: '', code: '' }
}

// === 封面图上传（R2，folder 用分类，无分类用 'uncategorized'） ===
const coverUploadFileList = ref<UploadFileInfo[]>([])

async function handleCoverSelect({ file }: { file: UploadFileInfo }) {
  const raw = file.file
  if (!raw || !raw.type.startsWith('image/')) {
    message.error('请选择图片文件')
    return
  }
  try {
    const folder = formValue.value.category || 'uncategorized'
    const note = formValue.value.title
      ? `资源「${formValue.value.title}」封面`
      : '资源封面'
    const res = await uploadToR2(raw, { note, app: 'resource', folder })
    formValue.value.cover = res.data.url
    message.success('封面上传成功')
  } catch (e: any) {
    message.error(e?.message || '封面上传失败')
  }
  coverUploadFileList.value = []
}

function handleRemoveCover() {
  formValue.value.cover = ''
}

// 保存前处理：类型转换 + 可见性配置同步
async function handleSave() {
  try {
    await formRef.value?.validate()
  } catch {
    return false
  }
  const fv = formValue.value
  // 过滤掉空的网盘链接（name 或 url 为空）
  fv.panLinks = (fv.panLinks || [])
    .filter((p: PanLink) => p.name?.trim() && p.url?.trim())
    .map((p: PanLink) => ({
      name: p.name.trim(),
      url: p.url.trim(),
      code: p.code?.trim() || null,
    }))
  fv.sortOrder = Number(fv.sortOrder) || 0
  fv.priceCents = Math.round((Number(fv.priceYuan) || 0) * 100)
  // priceYuan 仅前端展示用，提交时删除避免后端 DTO 校验报错
  delete (fv as any).priceYuan

  // private 资源同步写可见性（更新场景；新建场景 service 内部已处理）
  if (editingId.value && fv.status === 'private') {
    try {
      await updateResourceVisibility(editingId.value, {
        allowedUserIds: fv.allowedUserIds || [],
        allowedRoleIds: fv.allowedRoleIds || [],
      })
    } catch (e: any) {
      message.error(e?.message || '可见性配置失败')
    }
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

const rules: FormRules = {
  title: [{ required: true, message: '请输入标题', trigger: ['input', 'blur'] }],
}

// 状态标签映射
const statusTagType: Record<string, 'default' | 'success' | 'info' | 'warning'> = {
  draft: 'default',
  published: 'success',
  login: 'info',
  private: 'warning',
}
const statusText: Record<string, string> = {
  draft: '草稿',
  published: '公开',
  login: '登录可见',
  private: '指定可见',
}

const columns: DataTableColumns<Resource> = [
  selectionColumn,
  { title: 'ID', key: 'id', width: 60 },
  {
    title: '封面',
    key: 'cover',
    width: 70,
    render: (row) =>
      row.cover
        ? h('img', {
            src: row.cover,
            style: 'width:40px;height:40px;object-fit:cover;border-radius:4px',
          })
        : h('span', { style: 'color:#bbb' }, '-'),
  },
  { title: '标题', key: 'title', width: 200, ellipsis: { tooltip: true } },
  { title: '副标题', key: 'description', width: 180, ellipsis: { tooltip: true } },
  { title: '分类', key: 'category', width: 100, ellipsis: { tooltip: true } },
  {
    title: '状态',
    key: 'status',
    width: 90,
    render: (row) =>
      h(
        NTag,
        { size: 'small', type: statusTagType[row.status] || 'default', bordered: false },
        { default: () => statusText[row.status] || row.status },
      ),
  },
  {
    title: '网盘',
    key: 'panLinks',
    width: 70,
    render: (row) =>
      h(
        NTag,
        { size: 'small', type: row.panLinks?.length ? 'info' : 'default', bordered: false },
        { default: () => `${row.panLinks?.length || 0} 条` },
      ),
  },
  {
    title: '价格',
    key: 'priceCents',
    width: 80,
    render: (row) => (row.priceCents > 0 ? `¥${(row.priceCents / 100).toFixed(2)}` : '免费'),
  },
  {
    title: '最低会员',
    key: 'minMemberLevel',
    width: 90,
    render: (row) =>
      row.minMemberLevel
        ? h(NTag, { size: 'small', type: 'info', bordered: false }, { default: () => row.minMemberLevel })
        : h('span', { style: 'color:#bbb' }, '不限'),
  },
  {
    title: '排序',
    key: 'sortOrder',
    width: 60,
  },
  {
    title: '创建时间',
    key: 'createdAt',
    width: 150,
    render: (row) => new Date(row.createdAt).toLocaleString('zh-CN'),
  },
  {
    title: '操作',
    key: 'actions',
    width: 120,
    fixed: 'right',
    render: (row) =>
      h(NSpace, { size: 'small', wrap: false }, {
        default: () => [
          h(
            NButton,
            {
              size: 'small',
              quaternary: true,
              type: 'primary',
              onClick: () =>
                openEdit(row, (r) => ({
                  title: r.title,
                  description: r.description || '',
                  cover: r.cover || '',
                  category: r.category,
                  content: r.content || '',
                  panLinks:
                    r.panLinks && r.panLinks.length
                      ? r.panLinks
                      : ([{ name: '', url: '', code: '' }] as PanLink[]),
                  priceYuan: r.priceCents ? r.priceCents / 100 : 0,
                  status: r.status,
                  minMemberLevel: r.minMemberLevel,
                  sortOrder: r.sortOrder,
                  allowedUserIds: r.allowedUserIds || [],
                  allowedRoleIds: r.allowedRoleIds || [],
                })),
            },
            {
              default: () => '编辑',
              icon: () => h(NIcon, null, { default: () => h(CreateOutline) }),
            },
          ),
          h(
            NButton,
            {
              size: 'small',
              quaternary: true,
              type: 'error',
              onClick: () => handleDelete(row),
            },
            {
              default: () => '删除',
              icon: () => h(NIcon, null, { default: () => h(TrashOutline) }),
            },
          ),
        ],
      }),
  },
]
</script>

<template>
  <div class="page-wrapper">
    <div class="page-header">
      <h2 class="page-title">资源管理</h2>
      <n-button type="primary" @click="openCreate">
        <template #icon><n-icon><AddOutline /></n-icon></template>
        新建资源
      </n-button>
    </div>
    <n-space class="search-bar" :size="12" align="center">
      <n-input
        v-model:value="searchId"
        placeholder="ID"
        clearable
        style="width: 90px"
        @keyup.enter="handleSearch"
      />
      <n-input
        v-model:value="searchKeyword"
        placeholder="搜索标题..."
        clearable
        style="width: 200px"
        @keyup.enter="handleSearch"
      />
      <n-select
        v-model:value="searchCategory"
        :options="categoryOptions"
        placeholder="分类"
        style="width: 140px"
        clearable
      />
      <n-select
        v-model:value="searchStatus"
        :options="statusOptions"
        placeholder="状态"
        style="width: 130px"
        clearable
      />
      <n-button type="primary" @click="handleSearch">
        <template #icon><n-icon><SearchOutline /></n-icon></template>
        搜索
      </n-button>
      <n-button @click="handleReset">
        <template #icon><n-icon><RefreshOutline /></n-icon></template>
        重置
      </n-button>
      <n-button
        :disabled="checkedRowKeys.length === 0"
        type="error"
        @click="handleBatchDelete"
      >
        <template #icon><n-icon><TrashOutline /></n-icon></template>
        批量删除
      </n-button>
    </n-space>
    <div class="table-section">
      <n-data-table
        :columns="columns"
        :data="list"
        :loading="loading"
        :bordered="false"
        :scroll-x="1290"
        :row-key="(row: any) => row.id"
        @update:checked-row-keys="(keys: any) => (checkedRowKeys = keys)"
      />
      <div class="pagination-wrap" v-if="total > 0">
        <n-pagination
          :page="page"
          :page-size="pageSize"
          :page-sizes="[10, 20, 50]"
          :item-count="total"
          show-size-picker
          @update:page="handlePageChange"
          @update:page-size="handlePageSizeChange"
        />
      </div>
    </div>

    <n-modal
      v-model:show="showModal"
      preset="dialog"
      :title="editingId ? '编辑资源' : '新建资源'"
      :positive-text="saving ? '提交中...' : '确认'"
      :negative-text="saving ? undefined : '取消'"
      :loading="saving"
      :class="'res-modal'"
      :style="{ width: '860px', maxWidth: '94vw' }"
      @positive-click="handleSave"
    >
      <n-form
        ref="formRef"
        :model="formValue"
        :rules="rules"
        label-placement="top"
        class="res-form"
      >
        <div class="form-grid form-grid-2">
          <n-form-item label="标题" path="title">
            <n-input v-model:value="formValue.title" placeholder="资源标题" />
          </n-form-item>
          <n-form-item label="副标题（简介）">
            <n-input v-model:value="formValue.description" placeholder="一句话副标题/简介" />
          </n-form-item>
        </div>

        <div class="form-grid form-grid-3">
          <n-form-item label="分类">
            <n-select
              v-model:value="formValue.category"
              :options="categoryPresets.map((c) => ({ label: c, value: c }))"
              placeholder="选择或自定义（上传文件夹名）"
              filterable
              tag
            />
          </n-form-item>
          <n-form-item label="状态">
            <n-select
              :value="formValue.status"
              :options="formStatusOptions"
              @update:value="handleStatusChange"
            />
          </n-form-item>
          <n-form-item label="最低会员等级">
            <n-select
              v-model:value="formValue.minMemberLevel"
              :options="memberLevelOptions"
              placeholder="不限"
            />
          </n-form-item>
        </div>

        <div class="form-grid form-grid-2">
          <n-form-item label="价格（元）">
            <n-input-number
              v-model:value="formValue.priceYuan"
              :min="0"
              :precision="2"
              :step="0.01"
              placeholder="0 = 免费 / 仅兑换码"
              style="width: 100%"
            />
          </n-form-item>
          <n-form-item label="排序权重">
            <n-input-number
              v-model:value="formValue.sortOrder"
              :min="0"
              placeholder="越小越靠前"
              style="width: 100%"
            />
          </n-form-item>
        </div>

        <!-- 封面图：上传到 R2，folder 用分类 -->
        <n-form-item label="封面图" class="res-form-item">
          <div class="cover-area">
            <div v-if="formValue.cover" class="cover-preview-frame">
              <img :src="formValue.cover" class="cover-img" alt="封面" />
              <div class="cover-overlay">
                <n-button
                  circle
                  size="small"
                  type="error"
                  :focusable="false"
                  @click.stop="handleRemoveCover"
                  title="移除封面"
                >
                  <template #icon><n-icon><TrashOutline /></n-icon></template>
                </n-button>
              </div>
            </div>
            <n-upload
              v-else
              v-model:file-list="coverUploadFileList"
              :show-file-list="false"
              accept="image/*"
              :custom-request="handleCoverSelect"
              class="cover-upload"
            >
              <div class="cover-empty">
                <n-icon size="28" color="#94A3B8"><CloudUploadOutline /></n-icon>
                <span class="cover-empty-title">点击上传封面</span>
                <span class="cover-empty-hint">上传到 R2，按分类归档</span>
              </div>
            </n-upload>
          </div>
        </n-form-item>

        <!-- 可见性配置：private 状态时紧跟状态字段（就近原则） -->
        <template v-if="formValue.status === 'private'">
          <div class="form-grid form-grid-2">
            <n-form-item label="可见角色（拥有这些角色的用户可见）">
              <n-select
                v-model:value="formValue.allowedRoleIds"
                :options="roleOptions"
                placeholder="选择可见的角色"
                multiple
                clearable
                filterable
              />
            </n-form-item>
            <n-form-item label="可见用户（直接授权单个用户）">
              <n-select
                v-model:value="formValue.allowedUserIds"
                :options="userOptions"
                placeholder="选择可见的用户"
                multiple
                clearable
                filterable
              />
            </n-form-item>
          </div>
        </template>

        <n-form-item label="详细说明" class="res-form-item">
          <MdEditor
            v-model="formValue.content"
            :theme="isDark ? 'dark' : 'light'"
            style="height: 280px"
            placeholder="资源详细说明（支持 Markdown / 图片拖拽粘贴）"
            :toolbars-exclude="['github', 'htmlPreview', 'catalog', 'save']"
            preview-theme="default"
          />
        </n-form-item>

        <n-form-item label="网盘链接" class="res-form-item">
          <div style="width: 100%">
            <n-dynamic-input
              v-model:value="formValue.panLinks"
              :on-create="onCreatePanLink"
              :min="1"
            >
              <template #default="{ value }">
                <div class="pan-link-row">
                  <n-input v-model:value="value.name" placeholder="网盘名称（如 夸克网盘）" />
                  <n-input v-model:value="value.url" placeholder="分享链接" class="pan-link-url" />
                  <n-input v-model:value="value.code" placeholder="提取码（可选）" />
                </div>
              </template>
            </n-dynamic-input>
            <div class="pan-link-hint">
              可添加多个网盘（夸克/百度/蓝奏云等），提取码可选。链接内容仅对有权限用户展示。
            </div>
          </div>
        </n-form-item>
      </n-form>
    </n-modal>
  </div>
</template>

<style scoped>
/* === 表单整体紧凑化：压缩 form-item 默认下边距 === */
.res-form {
  margin-top: 12px;
}
.res-form :deep(.n-form-item) {
  margin-bottom: 14px;
}
/* 单列字段（标题/编辑器/网盘）用默认间距即可 */
.res-form .res-form-item {
  margin-bottom: 14px;
}

/* === 多列布局：CSS Grid 等分，替代 n-space+flex === */
.form-grid {
  display: grid;
  gap: 0 16px; /* 列间距 16px，行间距由 form-item 控制 */
}
.form-grid-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.form-grid-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
/* grid 内的 form-item 撑满列宽并消除自身下边距（由容器控制） */
.form-grid :deep(.n-form-item) {
  width: 100%;
  margin-bottom: 14px;
}

/* === 网盘链接行：名称(固定) + 链接(自适应) + 提取码(固定) === */
.pan-link-row {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr) 130px;
  gap: 8px;
  width: 100%;
  align-items: center;
}
.pan-link-hint {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

/* === MdEditor 在弹窗内的滚动隔离 === */
.res-form :deep(.md-editor) {
  border-radius: 6px;
}

/* === 封面图上传 === */
.cover-area {
  width: 100%;
}
.cover-upload {
  width: 100%;
}
.cover-upload :deep(.n-upload),
.cover-upload :deep(.n-upload-trigger) {
  width: 100%;
  display: block;
}
.cover-empty {
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 20px 16px;
  border: 1px dashed rgba(148, 163, 184, 0.4);
  border-radius: 8px;
  color: #94a3b8;
  cursor: pointer;
  transition: border-color 0.18s ease, color 0.18s ease, background 0.18s ease;
}
.cover-empty-title {
  font-size: 13px;
  font-weight: 500;
}
.cover-empty-hint {
  font-size: 11px;
  color: #b0b7c3;
}
.cover-empty:hover {
  border-color: #6366f1;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.08);
}
.cover-preview-frame {
  position: relative;
  width: 160px;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(148, 163, 184, 0.08);
  border: 1px solid rgba(148, 163, 184, 0.18);
}
.cover-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
  pointer-events: none;
}
.cover-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 6px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.4) 0%, transparent 30%);
  opacity: 0;
  transition: opacity 0.18s ease;
}
.cover-preview-frame:hover .cover-overlay {
  opacity: 1;
}
</style>

<!-- 非 scoped：modal teleport 到 body，需全局类名精准命中 -->
<style>
.res-modal {
  /* 弹窗整体上下留出视口边距，避免顶边 */
  max-height: calc(100vh - 48px) !important;
  margin: 24px auto !important;
  display: flex !important;
  flex-direction: column !important;
}
/* 内容区限高 + 内部滚动，让长表单不再撑破视口 */
.res-modal .n-dialog__content {
  max-height: calc(100vh - 180px) !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  padding-right: 4px;
}
/* 操作按钮区固定在底部，不被内容滚动带走 */
.res-modal .n-dialog__action {
  flex-shrink: 0 !important;
}
</style>
