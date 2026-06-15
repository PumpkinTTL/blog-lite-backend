<script setup lang="ts">
import { ref, computed, h } from 'vue'
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
  NTabs,
  NTabPane,
  NImage,
} from 'naive-ui'
import type { DataTableColumns, FormInst, FormRules, UploadFileInfo } from 'naive-ui'
import { MdEditor } from 'md-editor-v3'
import type { UploadImgCallBack } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import {
  AddOutline,
  TrashOutline,
  CreateOutline,
  SearchOutline,
  RefreshOutline,
  CloudUploadOutline,
  ImagesOutline,
  ExpandOutline,
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
import {
  getResourceCategories,
  createResourceCategory,
  updateResourceCategory,
  deleteResourceCategory,
  batchDeleteResourceCategories,
} from '../../api/resource-category'
import type { ResourceCategory } from '../../api/resource-category'
import { getUsers } from '../../api/user'
import { getRoles } from '../../api/role'
import { uploadToR2 } from '../../api/r2-storage'
import { getMediaList } from '../../api/media'
import { useCrudList } from '../../composables/useCrudList'
import { isDark } from '../../theme'

const formRef = ref<FormInst | null>(null)
const activeTab = ref('resources')

// ==================== 资源分类选项（下拉用） ====================
const categorySelectOptions = ref<{ label: string; value: number }[]>([])
const searchCategory = ref<number | null>(null)

async function loadCategoryOptions() {
  try {
    const res = await getResourceCategories({ pageSize: 1000 })
    const payload = res.data
    const cats = Array.isArray(payload) ? payload : payload?.list || []
    categorySelectOptions.value = cats.map((c: ResourceCategory) => ({
      label: c.name,
      value: c.id,
    }))
  } catch {
    /* ignore */
  }
}
loadCategoryOptions()

// ==================== 资源：分页/搜索 ====================
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const searchStatus = ref<string | null>(null)

const statusOptions = [
  { label: '全部', value: null },
  { label: '草稿', value: 'draft' },
  { label: '公开', value: 'published' },
  { label: '登录可见', value: 'login' },
  { label: '指定可见', value: 'private' },
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

// 可见性多选选项（弹窗打开时加载）
const userOptions = ref<{ label: string; value: number }[]>([])
const roleOptions = ref<{ label: string; value: number }[]>([])

async function loadVisibilityOptions() {
  if (userOptions.value.length > 0) return
  try {
    const [userRes, roleRes] = await Promise.all([
      getUsers({ pageSize: 1000 }),
      getRoles({ pageSize: 1000 }),
    ])
    const up = userRes.data
    const users = Array.isArray(up) ? up : up?.list || []
    userOptions.value = users.map((u: any) => ({
      label: `${u.nickname || u.username} (#${u.id})`,
      value: u.id,
    }))
    const rp = roleRes.data
    const roles = Array.isArray(rp) ? rp : rp?.list || []
    roleOptions.value = roles.map((r: any) => ({
      label: `${r.displayName || r.name} (#${r.id})`,
      value: r.id,
    }))
  } catch {
    /* ignore */
  }
}

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
      ...(searchCategory.value !== null ? { categoryId: searchCategory.value } : {}),
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
    categoryId: null,
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

function onCreatePanLink() {
  return { name: '', url: '', code: '' }
}

// ==================== 封面图：base64 预览 + 保存时上传 ====================
const coverUploadFileList = ref<UploadFileInfo[]>([])
const coverDragOver = ref(false)
const showMediaPicker = ref(false)
const mediaList = ref<any[]>([])
const mediaLoading = ref(false)

/** 封面是否为待上传的 base64（未实际上传） */
const isCoverPending = computed(() => formValue.value.cover.startsWith('data:'))

function resolveCoverUrl(url: string): string {
  if (!url) return ''
  if (url.startsWith('data:')) return url
  if (/^https?:\/\//.test(url)) return url
  const base = import.meta.env.VITE_API_BASE_URL || window.location.origin
  return new URL(url, base).toString()
}
const coverUrl = computed(() => resolveCoverUrl(formValue.value.cover))

/** base64 转 File */
function base64ToFile(dataUrl: string, filename: string): File {
  const [meta, b64] = dataUrl.split(',')
  const mime = /:(.*?);/.exec(meta)?.[1] || 'image/png'
  const ext = mime.split('/')[1] || 'png'
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new File([arr], `${filename}.${ext}`, { type: mime })
}

/** File 转 base64 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** 从原生 File 加载封面（转 base64 预览，不实际上传） */
function loadCoverFromFile(raw: File) {
  if (!raw.type.startsWith('image/')) {
    message.error('请选择图片文件')
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    formValue.value.cover = reader.result as string
  }
  reader.onerror = () => message.error('读取文件失败')
  reader.readAsDataURL(raw)
}

/** 选择本地图片：只转 base64 预览 */
function handleCoverSelect({ file }: { file: UploadFileInfo }) {
  const raw = file.file
  if (!raw) return
  loadCoverFromFile(raw)
  coverUploadFileList.value = []
}

/** 拖拽图片到封面区 */
function handleCoverDrop(event: DragEvent) {
  coverDragOver.value = false
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return
  loadCoverFromFile(files[0])
}

function handleRemoveCover() {
  formValue.value.cover = ''
}

// ==================== 媒体库选择（带 loading + 点击预览） ====================
async function openMediaPicker() {
  showMediaPicker.value = true
  mediaLoading.value = true
  try {
    const res = await getMediaList({ pageSize: 60 })
    const payload = res.data
    const all = Array.isArray(payload) ? payload : payload?.list || []
    // 仅展示图片，并规范化 URL
    mediaList.value = all
      .filter((m: any) => m.mimeType?.startsWith('image/'))
      .map((m: any) => ({ ...m, _resolvedUrl: resolveCoverUrl(m.url) }))
  } catch (e: any) {
    message.error(e?.message || '加载媒体库失败')
  } finally {
    mediaLoading.value = false
  }
}

/** 从媒体库选取（已是真实 URL，无需再上传） */
function pickMedia(m: any) {
  formValue.value.cover = m._resolvedUrl
  showMediaPicker.value = false
  message.success('已选取封面')
}

/** 媒体库大图预览 */
const previewSrc = ref('')
const showPreview = ref(false)
function previewMedia(m: any) {
  previewSrc.value = m._resolvedUrl
  showPreview.value = true
}

// ==================== 正文图片：粘贴/拖拽转 base64 预览 ====================
const editorRef = ref<any>(null)

async function onEditorUploadImg(files: File[], callback: UploadImgCallBack) {
  const urls: string[] = []
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue
    try {
      urls.push(await fileToBase64(f))
    } catch {
      // 单张失败跳过
    }
  }
  callback(urls)
}

async function onEditorDrop(event: DragEvent) {
  const items = event.dataTransfer?.files
  if (!items || items.length === 0) return
  event.preventDefault()
  for (const f of items) {
    if (!f.type.startsWith('image/')) continue
    try {
      const dataUrl = await fileToBase64(f)
      editorRef.value?.insert(() => ({
        targetValue: `\n![](${dataUrl})\n`,
        select: false,
      }))
    } catch {
      // 静默
    }
  }
}

// ==================== 统一上传（R2 + 分类 folder + 详细 note） ====================
async function uploadOne(file: File, note: string): Promise<string> {
  const cat = categorySelectOptions.value.find(
    (c) => c.value === formValue.value.categoryId,
  )
  const folder = cat?.label || 'uncategorized'
  const res = await uploadToR2(file, { note, app: 'resource', folder })
  return res.data.url
}

/** 保存时上传封面：若为 base64 则上传，返回真实 URL；否则原样返回 */
async function uploadCoverIfNeeded(): Promise<string> {
  const url = formValue.value.cover
  if (!url || !url.startsWith('data:')) return url
  const file = base64ToFile(url, `resource-cover-${Date.now()}`)
  const note = formValue.value.title
    ? `资源「${formValue.value.title}」(#${editingId.value || '新'})的封面图`
    : '资源封面图'
  return uploadOne(file, note)
}

/**
 * 扫描正文中的 base64 图片，逐个上传后替换为真实 URL
 * 匹配 markdown 图片语法 ![](data:image/...;base64,...)
 */
const DATA_IMG_RE = /!\[([^\]]*)\]\(data:image\/[^)]+\)/g

async function uploadContentImages(content: string): Promise<string> {
  const matches = [...content.matchAll(DATA_IMG_RE)]
  if (matches.length === 0) return content
  const note = formValue.value.title
    ? `资源「${formValue.value.title}」(#${editingId.value || '新'})正文图片`
    : '资源正文图片'
  let result = content
  for (const m of matches) {
    const full = m[0]
    const alt = m[1]
    const dataUrlMatch = full.match(/\(data:image\/[^)]+\)/)
    if (!dataUrlMatch) continue
    const dataUrl = dataUrlMatch[0].slice(1, -1)
    try {
      const file = base64ToFile(
        dataUrl,
        `resource-content-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      )
      const realUrl = await uploadOne(file, note)
      result = result.replace(full, `![${alt}](${realUrl})`)
    } catch (e: any) {
      message.error(e?.message || '正文图片上传失败')
    }
  }
  return result
}

// ==================== 保存 ====================
async function handleSave() {
  try {
    await formRef.value?.validate()
  } catch {
    return false
  }
  const fv = formValue.value
  fv.panLinks = (fv.panLinks || [])
    .filter((p: PanLink) => p.name?.trim() && p.url?.trim())
    .map((p: PanLink) => ({
      name: p.name.trim(),
      url: p.url.trim(),
      code: p.code?.trim() || null,
    }))
  fv.sortOrder = Number(fv.sortOrder) || 0
  fv.priceCents = Math.round((Number(fv.priceYuan) || 0) * 100)

  // 保存时上传：封面 base64 → R2；正文 base64 → R2
  try {
    fv.cover = await uploadCoverIfNeeded()
    fv.content = await uploadContentImages(fv.content || '')
  } catch (e: any) {
    message.error(e?.message || '图片上传失败')
    return false
  }
  delete (fv as any).priceYuan

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
  const ret = await _handleSave()
  loadCategoryOptions()
  return ret
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
  { title: '标题', key: 'title', width: 180, ellipsis: { tooltip: true } },
  { title: '副标题', key: 'description', width: 160, ellipsis: { tooltip: true } },
  {
    title: '分类',
    key: 'category',
    width: 100,
    render: (row) => row.category?.name || h('span', { style: 'color:#bbb' }, '-'),
  },
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
  { title: '排序', key: 'sortOrder', width: 60 },
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
                  categoryId: r.categoryId,
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

// ==================== Tab 2: 分类管理 ====================
const catTotal = ref(0)
const catPage = ref(1)
const catPageSize = ref(10)
const catFormRef = ref<FormInst | null>(null)

const catRules: FormRules = {
  name: [{ required: true, message: '请输入分类名称', trigger: ['input', 'blur'] }],
}

const {
  loading: catLoading,
  list: catList,
  searchId: catSearchId,
  searchKeyword: catSearchKeyword,
  showModal: catShowModal,
  editingId: catEditingId,
  saving: catSaving,
  formValue: catFormValue,
  handleSearch: _catHandleSearch,
  handleReset: _catHandleReset,
  openCreate: _catOpenCreate,
  openEdit: _catOpenEdit,
  handleSave: _catHandleSave,
  handleDelete: catHandleDelete,
  handleBatchDelete: catHandleBatchDelete,
  checkedRowKeys: catCheckedRowKeys,
  selectionColumn: catSelectionColumn,
} = useCrudList<ResourceCategory>({
  loadApi: (params) =>
    getResourceCategories({
      ...params,
      page: catPage.value,
      pageSize: catPageSize.value,
    }),
  createApi: (data) => createResourceCategory(data),
  updateApi: (id, data) => updateResourceCategory(id, data),
  deleteApi: deleteResourceCategory,
  batchDeleteApi: batchDeleteResourceCategories,
  deleteContent: (row) => `确定删除分类「${row.name}」？`,
  defaultForm: () => ({ name: '', description: '', sortOrder: 0 }),
  extractList: (res) => {
    const payload = res.data
    if (payload?.list) {
      catTotal.value = payload.total
      return payload.list
    }
    return Array.isArray(payload) ? payload : []
  },
})

function catHandleSearch() {
  catPage.value = 1
  _catHandleSearch()
}
function catHandleReset() {
  catSearchId.value = ''
  catSearchKeyword.value = ''
  catPage.value = 1
  _catHandleReset()
}
function catOpenCreate() {
  _catOpenCreate()
}
function catOpenEdit(row: ResourceCategory) {
  _catOpenEdit(row, (r) => ({
    name: r.name,
    description: r.description || '',
    sortOrder: r.sortOrder,
  }))
}
async function catHandleSave() {
  try {
    await catFormRef.value?.validate()
  } catch {
    return false
  }
  catFormValue.value.sortOrder = Number(catFormValue.value.sortOrder) || 0
  const ret = await _catHandleSave()
  // 分类变动后刷新资源页的下拉选项
  loadCategoryOptions()
  return ret
}
function catHandlePageChange(p: number) {
  catPage.value = p
  _catHandleSearch()
}
function catHandlePageSizeChange(s: number) {
  catPageSize.value = s
  catPage.value = 1
  _catHandleSearch()
}

const catColumns: DataTableColumns<ResourceCategory> = [
  catSelectionColumn,
  { title: 'ID', key: 'id', width: 60 },
  { title: '分类名称', key: 'name', width: 200 },
  { title: '描述', key: 'description', ellipsis: { tooltip: true } },
  { title: '排序', key: 'sortOrder', width: 80 },
  {
    title: '创建时间',
    key: 'createdAt',
    width: 160,
    render: (row) => new Date(row.createdAt).toLocaleString('zh-CN'),
  },
  {
    title: '操作',
    key: 'actions',
    width: 120,
    render: (row) =>
      h(NSpace, { size: 'small', wrap: false }, {
        default: () => [
          h(
            NButton,
            {
              size: 'small',
              quaternary: true,
              type: 'primary',
              onClick: () => catOpenEdit(row),
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
              onClick: () => catHandleDelete(row),
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
    <n-tabs v-model:value="activeTab" type="line" animated>
      <!-- ============ Tab 1: 资源管理 ============ -->
      <n-tab-pane name="resources" tab="资源管理">
        <div class="page-header">
          <h2 class="page-title">资源列表</h2>
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
            :options="categorySelectOptions"
            placeholder="分类"
            style="width: 160px"
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
            :scroll-x="1390"
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
      </n-tab-pane>

      <!-- ============ Tab 2: 分类管理 ============ -->
      <n-tab-pane name="categories" tab="分类管理">
        <div class="page-header">
          <h2 class="page-title">资源分类</h2>
          <n-button type="primary" @click="catOpenCreate">
            <template #icon><n-icon><AddOutline /></n-icon></template>
            新建分类
          </n-button>
        </div>
        <n-space class="search-bar" :size="12" align="center">
          <n-input
            v-model:value="catSearchId"
            placeholder="ID"
            clearable
            style="width: 90px"
            @keyup.enter="catHandleSearch"
          />
          <n-input
            v-model:value="catSearchKeyword"
            placeholder="搜索分类名称..."
            clearable
            style="width: 200px"
            @keyup.enter="catHandleSearch"
          />
          <n-button type="primary" @click="catHandleSearch">
            <template #icon><n-icon><SearchOutline /></n-icon></template>
            搜索
          </n-button>
          <n-button @click="catHandleReset">
            <template #icon><n-icon><RefreshOutline /></n-icon></template>
            重置
          </n-button>
          <n-button
            :disabled="catCheckedRowKeys.length === 0"
            type="error"
            @click="catHandleBatchDelete"
          >
            <template #icon><n-icon><TrashOutline /></n-icon></template>
            批量删除
          </n-button>
        </n-space>
        <div class="table-section">
          <n-data-table
            :columns="catColumns"
            :data="catList"
            :loading="catLoading"
            :bordered="false"
            :scroll-x="660"
            :row-key="(row: any) => row.id"
            @update:checked-row-keys="(keys: any) => (catCheckedRowKeys = keys)"
          />
          <div class="pagination-wrap" v-if="catTotal > 0">
            <n-pagination
              :page="catPage"
              :page-size="catPageSize"
              :page-sizes="[10, 20, 50]"
              :item-count="catTotal"
              show-size-picker
              @update:page="catHandlePageChange"
              @update:page-size="catHandlePageSizeChange"
            />
          </div>
        </div>
      </n-tab-pane>
    </n-tabs>

    <!-- ============ 资源编辑弹窗 ============ -->
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
            <n-input v-model:value="formValue.description" placeholder="一句话副标题" />
          </n-form-item>
        </div>

        <div class="form-grid form-grid-3">
          <n-form-item label="分类">
            <n-select
              v-model:value="formValue.categoryId"
              :options="categorySelectOptions"
              placeholder="选择分类"
              filterable
              clearable
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

        <!-- 可见性配置：紧跟状态字段，仅 private 时显示 -->
        <template v-if="formValue.status === 'private'">
          <div class="form-grid form-grid-2">
            <n-form-item label="可见角色">
              <n-select
                v-model:value="formValue.allowedRoleIds"
                :options="roleOptions"
                placeholder="拥有这些角色的用户可见"
                multiple
                clearable
                filterable
              />
            </n-form-item>
            <n-form-item label="可见用户">
              <n-select
                v-model:value="formValue.allowedUserIds"
                :options="userOptions"
                placeholder="直接授权的用户"
                multiple
                clearable
                filterable
              />
            </n-form-item>
          </div>
        </template>

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

        <!-- 封面图：预览（可放大） + 本地上传 + 媒体库选 -->
        <n-form-item label="封面图" class="res-form-item">
          <div class="cover-area">
            <!-- 已有封面：预览 + 待上传标记 + 操作 -->
            <div v-if="coverUrl" class="cover-preview-frame">
              <n-image
                :src="coverUrl"
                :preview-src="coverUrl"
                object-fit="cover"
                style="width: 100%; height: 100%; display: block"
                alt="封面预览（点击放大）"
              />
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
              <n-tag v-if="isCoverPending" size="tiny" type="warning" :bordered="false" round class="cover-status-tag">
                保存时上传
              </n-tag>
            </div>

            <!-- 操作区：本地上传 + 媒体库选，与预览顶部对齐 -->
            <div class="cover-actions">
              <n-upload
                v-model:file-list="coverUploadFileList"
                :show-file-list="false"
                accept="image/*"
                :custom-request="handleCoverSelect"
                class="cover-upload"
              >
                <div
                  class="cover-empty"
                  :class="{ 'is-dragover': coverDragOver }"
                  @dragenter.prevent="coverDragOver = true"
                  @dragover.prevent="coverDragOver = true"
                  @dragleave.prevent="coverDragOver = false"
                  @drop.prevent="handleCoverDrop"
                >
                  <n-icon size="24" color="#94A3B8"><CloudUploadOutline /></n-icon>
                  <span class="cover-empty-title">本地上传</span>
                  <span class="cover-empty-hint">点击或拖拽图片</span>
                </div>
              </n-upload>
              <n-button quaternary type="primary" @click="openMediaPicker" class="cover-pick-btn">
                <template #icon><n-icon><ImagesOutline /></n-icon></template>
                从媒体库选
              </n-button>
            </div>
          </div>
        </n-form-item>

        <n-form-item label="详细说明" class="res-form-item">
          <MdEditor
            ref="editorRef"
            v-model="formValue.content"
            :theme="isDark ? 'dark' : 'light'"
            style="height: 280px"
            placeholder="资源详细说明（支持 Markdown，可粘贴/拖拽图片，保存时自动上传）"
            :toolbars-exclude="['github', 'htmlPreview', 'catalog', 'save']"
            preview-theme="default"
            :on-upload-img="onEditorUploadImg"
            :on-drop="onEditorDrop"
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

    <!-- ============ 媒体库选择弹窗（缩略图完整 + 点击放大） ============ -->
    <n-modal
      v-model:show="showMediaPicker"
      preset="card"
      title="从媒体库选取封面"
      :style="{ width: '760px', maxWidth: '94vw' }"
    >
      <n-spin :show="mediaLoading">
        <div v-if="!mediaLoading && mediaList.length === 0" class="media-empty">
          媒体库暂无图片
        </div>
        <div v-else class="media-grid">
          <div v-for="m in mediaList" :key="m.id" class="media-item">
            <!-- 完整缩略图（object-fit:contain 不裁切）：点击选取 -->
            <div class="media-thumb" @click="pickMedia(m)" :title="`点击选取：${m.originalName}`">
              <img :src="m._resolvedUrl" :alt="m.originalName" />
            </div>
            <div class="media-foot">
              <n-button
                size="tiny"
                quaternary
                type="primary"
                @click.stop="previewMedia(m)"
                title="点击放大预览"
              >
                <template #icon><n-icon><ExpandOutline /></n-icon></template>
              </n-button>
              <span class="media-name" :title="m.originalName">{{ m.originalName }}</span>
            </div>
          </div>
        </div>
      </n-spin>
      <template #footer>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#999">
          <span>共 {{ mediaList.length }} 张图片</span>
          <span>点击缩略图选取 · 点放大按钮预览</span>
        </div>
      </template>
    </n-modal>

    <!-- 媒体库大图预览 -->
    <n-modal v-model:show="showPreview" preset="card" :style="{ width: 'auto', maxWidth: '90vw' }" :bordered="false">
      <img :src="previewSrc" style="max-width: 80vw; max-height: 78vh; display: block; margin: 0 auto" />
    </n-modal>

    <!-- ============ 分类编辑弹窗 ============ -->
    <n-modal
      v-model:show="catShowModal"
      preset="dialog"
      :title="catEditingId ? '编辑分类' : '新建分类'"
      :positive-text="catSaving ? '提交中...' : '确认'"
      :negative-text="catSaving ? undefined : '取消'"
      :loading="catSaving"
      :style="{ width: '480px', maxWidth: '94vw' }"
      @positive-click="catHandleSave"
    >
      <n-form
        ref="catFormRef"
        :model="catFormValue"
        :rules="catRules"
        label-placement="top"
        style="margin-top: 12px"
      >
        <n-form-item label="分类名称" path="name">
          <n-input v-model:value="catFormValue.name" placeholder="如：PPT模板" />
        </n-form-item>
        <n-form-item label="描述">
          <n-input v-model:value="catFormValue.description" type="textarea" placeholder="可选" :rows="2" />
        </n-form-item>
        <n-form-item label="排序权重">
          <n-input-number v-model:value="catFormValue.sortOrder" :min="0" placeholder="越小越靠前" style="width: 100%" />
        </n-form-item>
      </n-form>
    </n-modal>
  </div>
</template>

<style scoped>
/* === 表单整体紧凑化 === */
.res-form {
  margin-top: 12px;
}
.res-form :deep(.n-form-item) {
  margin-bottom: 14px;
}

/* === 多列布局 === */
.form-grid {
  display: grid;
  gap: 0 16px;
}
.form-grid-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.form-grid-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.form-grid :deep(.n-form-item) {
  width: 100%;
  margin-bottom: 14px;
}

/* === 网盘链接行 === */
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

/* === 封面图：预览 + 操作区横向排列，顶部对齐 === */
.cover-area {
  width: 100%;
  display: flex;
  align-items: flex-start; /* 关键：顶部对齐 */
  gap: 16px;
  flex-wrap: wrap;
}
.cover-preview-frame {
  position: relative;
  width: 160px;
  flex-shrink: 0;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(148, 163, 184, 0.08);
  border: 1px solid rgba(148, 163, 184, 0.18);
}
.cover-preview-frame :deep(img) {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
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
  pointer-events: none;
}
.cover-preview-frame:hover .cover-overlay {
  opacity: 1;
}
.cover-preview-frame:hover .cover-overlay .n-button {
  pointer-events: auto;
}
.cover-status-tag {
  position: absolute;
  left: 6px;
  bottom: 6px;
  pointer-events: none;
}

/* 操作区：与预览框顶部对齐（cover-area 已 align-items:flex-start） */
.cover-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}
.cover-upload {
  width: auto;
}
.cover-upload :deep(.n-upload),
.cover-upload :deep(.n-upload-trigger) {
  display: block;
}
.cover-empty {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 12px 24px;
  border: 1px dashed rgba(148, 163, 184, 0.4);
  border-radius: 8px;
  color: #94a3b8;
  cursor: pointer;
  transition: border-color 0.18s ease, color 0.18s ease, background 0.18s ease;
}
.cover-empty-title {
  font-size: 12px;
  font-weight: 500;
}
.cover-empty-hint {
  font-size: 11px;
  color: #b0b7c3;
}
.cover-empty:hover,
.cover-empty.is-dragover {
  border-color: #6366f1;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.08);
}

/* === 媒体库网格：完整缩略图（contain 不裁切） === */
.media-empty {
  text-align: center;
  padding: 40px;
  color: #999;
}
.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  max-height: 60vh;
  overflow-y: auto;
  padding: 4px;
}
.media-item {
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(148, 163, 184, 0.04);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.media-item:hover {
  border-color: #6366f1;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.15);
}
/* 缩略图区：固定正方形，contain 完整显示不裁切 */
.media-thumb {
  width: 100%;
  aspect-ratio: 1;
  background: rgba(0, 0, 0, 0.03);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
}
.media-thumb img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
}
/* 底部：放大按钮 + 文件名 */
.media-foot {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-top: 1px solid rgba(148, 163, 184, 0.15);
}
.media-name {
  font-size: 11px;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

/* === MdEditor === */
.res-form :deep(.md-editor) {
  border-radius: 6px;
}
</style>

<!-- 非 scoped：modal teleport 到 body -->
<style>
.res-modal {
  max-height: calc(100vh - 48px) !important;
  margin: 24px auto !important;
  display: flex !important;
  flex-direction: column !important;
}
.res-modal .n-dialog__content {
  max-height: calc(100vh - 180px) !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  padding-right: 4px;
}
.res-modal .n-dialog__action {
  flex-shrink: 0 !important;
}
</style>
