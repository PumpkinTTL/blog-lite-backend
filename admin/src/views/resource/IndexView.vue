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
} from 'naive-ui'
import type { DataTableColumns, FormInst, FormRules } from 'naive-ui'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import {
  AddOutline,
  TrashOutline,
  CreateOutline,
  SearchOutline,
  RefreshOutline,
  AddCircleOutline,
  RemoveCircleOutline,
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
  openCreate,
  openEdit,
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
    priceCents: 0,
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

// 保存前处理：类型转换 + 可见性配置同步
async function handleSave() {
  try {
    await formRef.value?.validate()
  } catch {
    return false
  }
  const fv = formValue.value
  // 过滤掉空的网盘链接（name 或 url 为空）
  const cleanedLinks = (fv.panLinks || [])
    .filter((p: PanLink) => p.name?.trim() && p.url?.trim())
    .map((p: PanLink) => ({
      name: p.name.trim(),
      url: p.url.trim(),
      code: p.code?.trim() || null,
    }))
  fv.panLinks = cleanedLinks
  fv.sortOrder = Number(fv.sortOrder) || 0
  // 价格分（表单输入元，提交分）
  fv.priceCents = Math.round((Number(fv.priceYuan) || 0) * 100)
  // allowedUserIds/allowedRoleIds 字符串转数字数组
  fv.allowedUserIds = parseIdList(fv.allowedUserIdsInput)
  fv.allowedRoleIds = parseIdList(fv.allowedRoleIdsInput)

  // private 资源同步写可见性（更新场景；新建场景 service 内部已处理）
  if (editingId.value && fv.status === 'private') {
    try {
      await updateResourceVisibility(editingId.value, {
        allowedUserIds: fv.allowedUserIds,
        allowedRoleIds: fv.allowedRoleIds,
      })
    } catch (e: any) {
      message.error(e?.message || '可见性配置失败')
    }
  }
  return _handleSave()
}

function parseIdList(raw: any): number[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map((n) => Number(n)).filter((n) => !isNaN(n))
  return String(raw)
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => !isNaN(n))
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
                  allowedUserIdsInput:
                    r.allowedUserIds?.join(', ') || '',
                  allowedRoleIdsInput:
                    r.allowedRoleIds?.join(', ') || '',
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
        <n-form-item label="标题" path="title" class="res-form-item">
          <n-input v-model:value="formValue.title" placeholder="资源标题" />
        </n-form-item>

        <div class="form-grid form-grid-3">
          <n-form-item label="分类">
            <n-select
              v-model:value="formValue.category"
              :options="categoryPresets.map((c) => ({ label: c, value: c }))"
              placeholder="选择或自定义"
              filterable
              tag
            />
          </n-form-item>
          <n-form-item label="状态">
            <n-select v-model:value="formValue.status" :options="formStatusOptions" />
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

        <div class="form-grid form-grid-2">
          <n-form-item label="封面图 URL">
            <n-input v-model:value="formValue.cover" placeholder="https://..." />
          </n-form-item>
          <n-form-item label="简介">
            <n-input v-model:value="formValue.description" placeholder="一句话介绍" />
          </n-form-item>
        </div>

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

        <!-- 指定可见配置：仅 private 状态展开 -->
        <template v-if="formValue.status === 'private'">
          <div class="form-grid form-grid-2">
            <n-form-item label="可见性 - 指定用户 ID">
              <n-input
                v-model:value="formValue.allowedUserIdsInput"
                placeholder="逗号分隔，如 1, 23, 45"
              />
            </n-form-item>
            <n-form-item label="可见性 - 指定角色 ID">
              <n-input
                v-model:value="formValue.allowedRoleIdsInput"
                placeholder="逗号分隔的角色 ID"
              />
            </n-form-item>
          </div>
        </template>
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
</style>
