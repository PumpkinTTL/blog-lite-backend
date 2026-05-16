<script setup lang="ts">
import { ref, h, onMounted } from 'vue'
import { NCard, NButton, NDataTable, NSpace, NInput, NIcon, NTag, NPagination, NUpload, NImage, NSelect, useMessage, useDialog } from 'naive-ui'
import type { DataTableColumns, UploadFileInfo } from 'naive-ui'
import { CloudUploadOutline, TrashOutline, SearchOutline, RefreshOutline, DocumentOutline } from '@vicons/ionicons5'
import { getMediaList, uploadMedia, deleteMedia, batchDeleteMedia } from '../../api/media'
import type { Media } from '../../api/media'

const message = useMessage()
const dialog = useDialog()
const loading = ref(false)
const mediaList = ref<Media[]>([])
const searchId = ref('')
const searchKeyword = ref('')
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const checkedRowKeys = ref<number[]>([])
const uploadFileList = ref<UploadFileInfo[]>([])
const uploadStorageType = ref<'local' | 'oss'>('local')
const uploadOssPlatform = ref<Media['ossPlatform']>('aliyun')

const uploadStorageOptions = [
  { label: '本地', value: 'local' },
  { label: 'OSS', value: 'oss' },
]

const uploadOssPlatformOptions = [
  { label: '阿里云', value: 'aliyun' },
  { label: '腾讯云', value: 'tencent' },
  { label: 'Cloudflare', value: 'cloudflare' },
  { label: 'Backblaze', value: 'backblaze' },
]

function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function isImage(mimeType: string): boolean {
  return mimeType?.startsWith('image/')
}

function resolveFileUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url
  const base = import.meta.env.VITE_API_BASE_URL || window.location.origin
  return new URL(url, base).toString()
}

const storageTypeLabel: Record<string, string> = { local: '本地', oss: 'OSS' }
const ossPlatformLabel: Record<string, string> = { aliyun: '阿里云', tencent: '腾讯云', cloudflare: 'Cloudflare', backblaze: 'Backblaze' }

async function loadMedia() {
  loading.value = true
  try {
    const params: any = {}
    if (searchId.value) params.id = searchId.value
    if (searchKeyword.value) params.keyword = searchKeyword.value
    params.page = page.value
    params.pageSize = pageSize.value
    const res = await getMediaList(params)
    const payload = res.data
    if (payload?.list) {
      total.value = payload.total
      mediaList.value = payload.list
    } else {
      mediaList.value = Array.isArray(payload) ? payload : []
    }
  } catch {
    message.error('加载文件列表失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  page.value = 1
  loadMedia()
}

function handleReset() {
  searchId.value = ''
  searchKeyword.value = ''
  page.value = 1
  loadMedia()
}

function handlePageChange(p: number) {
  page.value = p
  loadMedia()
}

function handlePageSizeChange(s: number) {
  pageSize.value = s
  page.value = 1
  loadMedia()
}

async function handleUpload({ file }: { file: UploadFileInfo }) {
  if (!file.file) return
  try {
    await uploadMedia(file.file, {
      storageType: uploadStorageType.value,
      ossPlatform: uploadStorageType.value === 'oss' ? uploadOssPlatform.value : null,
    })
    message.success('上传成功')
    uploadFileList.value = []
    loadMedia()
  } catch (e: any) {
    message.error(e.message || '上传失败')
    uploadFileList.value = []
  }
}

function handleDelete(item: Media) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除文件「${item.originalName}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteMedia(item.id)
        message.success('删除成功')
        loadMedia()
      } catch (e: any) {
        message.error(e.message || '删除失败')
      }
    },
  })
}

async function handleBatchDelete() {
  if (checkedRowKeys.value.length === 0) { message.warning('请先选择要删除的文件'); return }
  dialog.warning({
    title: '批量删除',
    content: `确定要删除选中的 ${checkedRowKeys.value.length} 个文件吗？`,
    positiveText: '删除', negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await batchDeleteMedia(checkedRowKeys.value)
        message.success('批量删除成功')
        checkedRowKeys.value = []
        loadMedia()
      } catch (e: any) {
        message.error(e.message || '批量删除失败')
      }
    },
  })
}

const columns: DataTableColumns<Media> = [
  { type: 'selection', width: 40 },
  { title: 'ID', key: 'id', width: 60 },
  {
    title: '预览', key: 'preview', width: 80,
    render: (row) => {
      if (isImage(row.mimeType)) {
        return h(NImage, {
          src: resolveFileUrl(row.url),
          width: 48,
          height: 48,
          objectFit: 'cover',
          style: 'border-radius: 4px; cursor: pointer; display: block',
          previewSrc: resolveFileUrl(row.url),
          alt: row.originalName,
        })
      }
      return h('div', {
        style: 'width:48px;height:48px;border-radius:4px;background:rgba(148,163,184,0.08);display:flex;align-items:center;justify-content:center',
      }, [h(NIcon, { size: 24, color: '#94A3B8' }, { default: () => h(DocumentOutline) })])
    },
  },
  { title: '文件名', key: 'originalName', ellipsis: { tooltip: true }, minWidth: 140, width: 180 },
  {
    title: '类型', key: 'mimeType', width: 110, ellipsis: { tooltip: true },
    render: (row) => h(NTag, { size: 'small', bordered: false }, { default: () => row.mimeType }),
  },
  {
    title: '大小', key: 'size', width: 90,
    render: (row) => formatSize(row.size),
  },
  {
    title: '哈希', key: 'hash', width: 110, ellipsis: { tooltip: true },
    render: (row) => row.hash ? h('span', { style: 'font-family:monospace;font-size:12px;color:#94A3B8' }, row.hash.slice(0, 16) + '...') : '-',
  },
  {
    title: '存储', key: 'storageType', width: 75,
    render: (row) => h(NTag, {
      size: 'small',
      type: row.storageType === 'oss' ? 'info' : 'default',
      round: true,
      bordered: false,
    }, { default: () => storageTypeLabel[row.storageType] || row.storageType }),
  },
  {
    title: '平台', key: 'ossPlatform', width: 100,
    render: (row) => row.ossPlatform ? h(NTag, { size: 'small', type: 'success', round: true, bordered: false }, { default: () => ossPlatformLabel[row.ossPlatform] || row.ossPlatform }) : '-',
  },
  {
    title: '上传者', key: 'uploader', width: 90,
    render: (row) => row.uploader?.nickname || row.uploader?.username || '-',
  },
  {
    title: '创建时间', key: 'createdAt', width: 165,
    render: (row) => new Date(row.createdAt).toLocaleString('zh-CN'),
  },
  {
    title: '操作', key: 'actions', width: 80,
    render: (row) => h('div', { style: 'display:flex;align-items:center;justify-content:center;height:100%' }, [
      h(NButton, { size: 'small', quaternary: true, type: 'error', onClick: () => handleDelete(row) }, {
        default: () => '删除', icon: () => h(NIcon, null, { default: () => h(TrashOutline) }),
      }),
    ]),
  },
]

onMounted(loadMedia)
</script>

<template>
  <div class="page-wrapper">
    <n-space class="search-bar" :size="12" align="center">
      <n-input v-model:value="searchId" placeholder="ID" clearable style="width: 100px" @keyup.enter="handleSearch" />
      <n-input v-model:value="searchKeyword" placeholder="搜索文件名..." clearable @keyup.enter="handleSearch" />
      <n-button type="primary" @click="handleSearch">
        <template #icon><n-icon><SearchOutline /></n-icon></template>
        搜索
      </n-button>
      <n-button @click="handleReset">
        <template #icon><n-icon><RefreshOutline /></n-icon></template>
        重置
      </n-button>
      <n-select v-model:value="uploadStorageType" :options="uploadStorageOptions" style="width: 100px" />
      <n-select v-if="uploadStorageType === 'oss'" v-model:value="uploadOssPlatform" :options="uploadOssPlatformOptions" style="width: 130px" />
      <n-upload v-model:file-list="uploadFileList" :show-file-list="false" :custom-request="({ file }) => handleUpload({ file })">
        <n-button type="primary">
          <template #icon><n-icon><CloudUploadOutline /></n-icon></template>
          上传文件
        </n-button>
      </n-upload>
      <n-button :disabled="checkedRowKeys.length === 0" type="error" @click="handleBatchDelete">
        <template #icon><n-icon><TrashOutline /></n-icon></template>
        批量删除
      </n-button>
    </n-space>

    <n-card :bordered="false" class="table-card">
      <n-data-table :columns="columns" :data="mediaList" :loading="loading" :bordered="false"
        :row-key="(row: any) => row.id" @update:checked-row-keys="(keys: any) => checkedRowKeys = keys" />
      <div class="pagination-wrap" v-if="total > 0">
        <n-pagination :page="page" :page-size="pageSize" :page-sizes="[10, 20, 50]" :item-count="total" show-size-picker @update:page="handlePageChange" @update:page-size="handlePageSizeChange" />
      </div>
    </n-card>
  </div>
</template>

<style scoped>
.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
