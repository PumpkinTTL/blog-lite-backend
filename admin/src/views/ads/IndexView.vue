<script setup lang="ts">
import { ref, h } from 'vue'
import {
  NButton, NDataTable, NSpace, NInput, NIcon, NModal, NForm, NFormItem, NTag,
  NSelect, NPagination, NInputNumber, NDatePicker, NUpload, NImage, useMessage,
} from 'naive-ui'
import type { DataTableColumns, FormInst, FormRules, SelectOption, UploadCustomRequestOptions } from 'naive-ui'
import { AddOutline, TrashOutline, CreateOutline, SearchOutline, RefreshOutline } from '@vicons/ionicons5'
import {
  getAds, createAd, updateAd, deleteAd, batchDeleteAds, toggleAdStatus,
  type Ad, type AdPosition, type AdStatus,
} from '../../api/ads'
import { uploadMedia } from '../../api/media'
import { uploadToR2Direct } from '../../api/r2-direct'
import { useCrudList } from '../../composables/useCrudList'

const formRef = ref<FormInst | null>(null)
const message = useMessage()

// 分页
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)

// 筛选
const searchPosition = ref<string | null>(null)
const searchStatus = ref<string | null>(null)

const positionOptions = [
  { label: '全部', value: null },
  { label: '侧边栏', value: 'sidebar' },
  { label: '弹窗', value: 'popup' },
  { label: '右下角浮窗', value: 'popup_toast' },
] as unknown as SelectOption[]

const statusOptions = [
  { label: '全部', value: null },
  { label: '投放中', value: 'active' },
  { label: '已暂停', value: 'inactive' },
] as unknown as SelectOption[]

const formPositionOptions = [
  { label: '侧边栏', value: 'sidebar' },
  { label: '弹窗', value: 'popup' },
  { label: '右下角浮窗', value: 'popup_toast' },
] as unknown as SelectOption[]

const { loading, list, searchId, searchKeyword, showModal, editingId, saving, formValue,
  handleSearch: _handleSearch, handleReset: _handleReset, openCreate, openEdit, handleSave: _handleSave, handleDelete, handleBatchDelete, checkedRowKeys, selectionColumn } =
  useCrudList<Ad>({
    loadApi: (params) => getAds({
      ...params,
      page: page.value,
      pageSize: pageSize.value,
      ...(searchPosition.value ? { position: searchPosition.value } : {}),
      ...(searchStatus.value ? { status: searchStatus.value } : {}),
    }),
    createApi: createAd,
    updateApi: updateAd,
    deleteApi: deleteAd,
    batchDeleteApi: batchDeleteAds,
    deleteContent: (row) => `确定删除推广「${row.title}」？`,
    defaultForm: () => ({
      title: '',
      subtitle: '',
      imageUrl: '',
      buttonText: '了解详情',
      href: '',
      position: 'sidebar' as AdPosition,
      status: 'active' as AdStatus,
      startAt: null as number | null,
      endAt: null as number | null,
      sortOrder: 0,
      adminNote: '',
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
  searchPosition.value = null
  searchStatus.value = null
  page.value = 1
  _handleReset()
}

async function handleSave() {
  return _handleSave(() => formRef.value?.validate())
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

// 切换投放状态（active ↔ inactive）
async function handleToggleStatus(row: Ad) {
  try {
    await toggleAdStatus(row.id)
    message.success(row.status === 'active' ? '已暂停' : '已投放')
    _handleSearch()
  } catch (e: any) {
    message.error(e?.message || '操作失败')
  }
}

// 图片上传：默认 R2 走前端直传（带真实进度，绕过后端 10s 超时）；可选本地中转
const uploading = ref(false)
const uploadProgress = ref(-1) // 0-100，-1 未知
const storageType = ref<'oss' | 'local'>('oss') // 默认 R2，可切换本地
function handleUpload({ file, onFinish, onError }: UploadCustomRequestOptions) {
  const raw = file.file as File | null
  if (!raw) {
    onError()
    return
  }
  uploading.value = true
  uploadProgress.value = -1

  const doUpload = storageType.value === 'oss'
    // R2 直传：XHR 真实进度，绕过后端 axios 10s 超时
    ? uploadToR2Direct(raw, {
        app: 'ad', folder: 'ad', note: raw.name,
        onProgress: (p) => { uploadProgress.value = p.percent },
      }).then((res) => res.url)
    // 本地：后端中转（小文件够用）
    : uploadMedia(raw, { app: 'ad', folder: 'ad', storageType: 'local' })
        .then((res: any) => res?.data?.url)

  doUpload
    .then((url) => {
      if (url) {
        formValue.value.imageUrl = url
        onFinish()
      } else {
        message.error('上传成功但未返回 URL')
        onError()
      }
    })
    .catch((e: any) => {
      message.error(e?.message || '图片上传失败')
      onError()
    })
    .finally(() => {
      uploading.value = false
      uploadProgress.value = -1
    })
}

const rules: FormRules = {
  title: [{ required: true, message: '请输入标题', trigger: ['input', 'blur'] }],
  href: [{ required: true, message: '请输入跳转链接', trigger: ['input', 'blur'] }],
  position: [{ required: true, message: '请选择投放位置', trigger: ['change', 'blur'] }],
}

// 表单提交前格式化：时间戳 → ISO 字符串（后端接收 ISO）
function buildPayload(): Record<string, any> {
  const f = formValue.value
  const payload: Record<string, any> = {
    title: f.title,
    subtitle: f.subtitle || null,
    imageUrl: f.imageUrl || null,
    buttonText: f.buttonText || '了解详情',
    href: f.href,
    position: f.position,
    status: f.status,
    sortOrder: f.sortOrder ?? 0,
    adminNote: f.adminNote || null,
  }
  if (f.startAt) payload.startAt = new Date(f.startAt).toISOString()
  else payload.startAt = null
  if (f.endAt) payload.endAt = new Date(f.endAt).toISOString()
  else payload.endAt = null
  return payload
}

// 编辑时 entity → 表单（时间字符串 → 时间戳给 DatePicker）
function editMapper(row: Ad) {
  return {
    title: row.title,
    subtitle: row.subtitle || '',
    imageUrl: row.imageUrl || '',
    buttonText: row.buttonText,
    href: row.href,
    position: row.position,
    status: row.status,
    startAt: row.startAt ? new Date(row.startAt).getTime() : null,
    endAt: row.endAt ? new Date(row.endAt).getTime() : null,
    sortOrder: row.sortOrder,
    adminNote: row.adminNote || '',
  }
}

const positionLabel: Record<string, string> = {
  sidebar: '侧边栏',
  popup: '弹窗',
  popup_toast: '右下角浮窗',
}

const columns: DataTableColumns<Ad> = [
  selectionColumn,
  { title: 'ID', key: 'id', width: 70 },
  { title: '标题', key: 'title', ellipsis: { tooltip: true }, width: 140 },
  { title: '副标题', key: 'subtitle', ellipsis: { tooltip: true }, width: 200, render: (row) => row.subtitle || h('span', { style: 'color:#bbb' }, '—') },
  {
    title: '封面', key: 'imageUrl', width: 90,
    render: (row) => row.imageUrl
      ? h(NImage, { src: row.imageUrl, width: 60, objectFit: 'cover', style: 'border-radius:4px' })
      : h('span', { style: 'color:#999' }, '—'),
  },
  {
    title: '位置', key: 'position', width: 110,
    render: (row) => h(NTag, { size: 'small', type: 'info', bordered: false }, { default: () => positionLabel[row.position] || row.position }),
  },
  {
    title: '状态', key: 'status', width: 90,
    render: (row) =>
      h(NTag, { size: 'small', type: row.status === 'active' ? 'success' : 'default', bordered: false },
        { default: () => (row.status === 'active' ? '投放中' : '已暂停') }),
  },
  { title: '排序', key: 'sortOrder', width: 70 },
  { title: '曝光', key: 'impressions', width: 80 },
  { title: '点击', key: 'clicks', width: 80 },
  {
    title: '排期', key: 'schedule', width: 180,
    render: (row) => {
      const s = row.startAt ? new Date(row.startAt).toLocaleDateString('zh-CN') : '即时'
      const e = row.endAt ? new Date(row.endAt).toLocaleDateString('zh-CN') : '长期'
      return `${s} ~ ${e}`
    },
  },
  {
    title: '操作', key: 'actions', width: 180, fixed: 'right',
    render: (row) => h(NSpace, { size: 'small', wrap: false }, {
      default: () => [
        h(NButton, { size: 'small', quaternary: true, type: row.status === 'active' ? 'warning' : 'success', onClick: () => handleToggleStatus(row) },
          { default: () => (row.status === 'active' ? '暂停' : '投放') }),
        h(NButton, { size: 'small', quaternary: true, type: 'primary', onClick: () => openEdit(row, editMapper) },
          { default: () => '编辑', icon: () => h(NIcon, null, { default: () => h(CreateOutline) }) }),
        h(NButton, { size: 'small', quaternary: true, type: 'error', onClick: () => handleDelete(row) },
          { default: () => '删除', icon: () => h(NIcon, null, { default: () => h(TrashOutline) }) }),
      ],
    }),
  },
]

// 覆盖 handleSave 的提交数据：用 buildPayload 而非原始 formValue（处理时间格式）
async function handleSaveFormatted() {
  if (saving.value) return false
  if (formRef.value) {
    try {
      await formRef.value.validate()
    } catch {
      return false
    }
  }
  saving.value = true
  try {
    const payload = buildPayload()
    if (editingId.value) {
      await updateAd(editingId.value, payload)
      message.success('更新成功')
    } else {
      await createAd(payload)
      message.success('创建成功')
    }
    showModal.value = false
    _handleSearch()
  } catch (e: any) {
    message.error(e?.message || '操作失败')
    return false
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="page-wrapper">
    <div class="page-header">
      <h2 class="page-title">推广管理</h2>
      <n-button type="primary" @click="openCreate">
        <template #icon><n-icon><AddOutline /></n-icon></template>
        新建推广
      </n-button>
    </div>
    <n-space class="search-bar" :size="12" align="center">
      <n-input v-model:value="searchId" placeholder="ID" clearable style="width: 100px" @keyup.enter="handleSearch" />
      <n-input v-model:value="searchKeyword" placeholder="搜索标题/副标题/备注..." clearable @keyup.enter="handleSearch" />
      <n-select v-model:value="searchPosition" :options="positionOptions" placeholder="位置" style="width: 150px" clearable />
      <n-select v-model:value="searchStatus" :options="statusOptions" placeholder="状态" style="width: 120px" clearable />
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
      <n-data-table :columns="columns" :data="list" :loading="loading" :bordered="false" :scroll-x="1390"
        :row-key="(row: any) => row.id" @update:checked-row-keys="(keys: any) => checkedRowKeys = keys" />
      <div class="pagination-wrap" v-if="total > 0">
        <n-pagination :page="page" :page-size="pageSize" :page-sizes="[5, 10, 20, 30, 50, 100]" :item-count="total" show-size-picker @update:page="handlePageChange" @update:page-size="handlePageSizeChange" />
      </div>
    </div>
    <n-modal v-model:show="showModal" preset="card" :title="editingId ? '编辑推广' : '新建推广'"
      style="width: 620px" :mask-closable="false"
      content-style="max-height: 70vh; overflow-y: auto; padding-right: 6px">
      <n-form ref="formRef" :model="formValue" :rules="rules" label-placement="left" label-width="86">
        <n-form-item label="标题" path="title">
          <n-input v-model:value="formValue.title" placeholder="推广标题（用户可见）" />
        </n-form-item>
        <n-form-item label="副标题">
          <n-input v-model:value="formValue.subtitle" type="textarea" :rows="2" placeholder="推广描述（用户可见）" />
        </n-form-item>
        <n-form-item label="封面图">
          <n-space vertical :size="8" style="width: 100%">
            <n-space :size="8" align="center" style="width: 100%">
              <n-upload :custom-request="handleUpload" :show-file-list="false" accept="image/*">
                <n-button :loading="uploading" size="small">
                  {{ uploading && uploadProgress >= 0 ? `上传中 ${Math.round(uploadProgress)}%` : (formValue.imageUrl ? '重传' : '上传') }}
                </n-button>
              </n-upload>
              <n-input v-model:value="formValue.imageUrl" placeholder="或粘贴图片 URL" size="small" style="flex:1" />
            </n-space>
            <n-radio-group v-model:value="storageType" size="small">
              <n-radio-button value="oss">存到 R2</n-radio-button>
              <n-radio-button value="local">存到本地</n-radio-button>
            </n-radio-group>
            <n-image v-if="formValue.imageUrl" :src="formValue.imageUrl" width="120" object-fit="cover" style="border-radius:4px" />
          </n-space>
        </n-form-item>
        <n-form-item label="CTA 文案">
          <n-input v-model:value="formValue.buttonText" placeholder="如：立即学习 / 立即购买" />
        </n-form-item>
        <n-form-item label="跳转链接" path="href">
          <n-input v-model:value="formValue.href" placeholder="完整 URL（邀请码可拼在此）" />
        </n-form-item>
        <n-form-item label="投放位置" path="position">
          <n-radio-group v-model:value="formValue.position" name="position">
            <n-radio-button v-for="opt in formPositionOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</n-radio-button>
          </n-radio-group>
        </n-form-item>
        <n-form-item label="排期">
          <n-space :size="8" style="width: 100%">
            <n-date-picker v-model:value="formValue.startAt" type="datetime" placeholder="开始（空=立即）" clearable size="small" style="flex:1" />
            <n-date-picker v-model:value="formValue.endAt" type="datetime" placeholder="结束（空=长期）" clearable size="small" style="flex:1" />
          </n-space>
        </n-form-item>
        <n-form-item label="排序/状态">
          <n-space :size="12" align="center">
            <n-input-number v-model:value="formValue.sortOrder" placeholder="排序" :min="0" size="small" style="width: 110px" />
            <n-radio-group v-model:value="formValue.status" name="status" size="small">
              <n-radio-button value="active">投放中</n-radio-button>
              <n-radio-button value="inactive">已暂停</n-radio-button>
            </n-radio-group>
          </n-space>
        </n-form-item>
        <n-form-item label="后台备注">
          <n-input v-model:value="formValue.adminNote" type="textarea" :rows="2" placeholder="仅管理可见，含收益说明：如合作方/价格/分成" />
        </n-form-item>
      </n-form>
      <template #action>
        <n-space justify="end">
          <n-button @click="showModal = false">取消</n-button>
          <n-button type="primary" :loading="saving" @click="handleSaveFormatted">{{ editingId ? '保存' : '创建' }}</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
</style>
