<script setup lang="ts">
import { ref, h, onMounted, computed, reactive } from 'vue'
import { NButton, NDataTable, NSpace, NInput, NIcon, NTag, NPagination, NUpload, NImage, NSelect, NEllipsis, NTooltip, useMessage, useDialog } from 'naive-ui'
import type { DataTableColumns, UploadFileInfo } from 'naive-ui'
import { CloudUploadOutline, TrashOutline, SearchOutline, RefreshOutline, DocumentOutline, CopyOutline, CheckmarkOutline, CloseOutline, AddOutline } from '@vicons/ionicons5'
import { getMediaList, uploadMedia, deleteMedia, batchDeleteMedia, updateMedia } from '../../api/media'
import { uploadToR2, deleteR2Media, batchDeleteR2Media } from '../../api/r2-storage'
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
const uploading = ref(false)

/**
 * 备注列编辑状态：Map<mediaId, draftValue>
 * - 不在 Map 中：显示态（纯文本）
 * - 在 Map 中：编辑态（输入框 + ✓✗ 按钮）
 * 进入编辑 = 把当前 note 放进 Map；取消 = 删除 key；保存 = 提交后删除 key
 */
const noteDrafts = reactive(new Map<number, string>())

/** 存储通道：local=本地, oss=通用OSS, r2=Cloudflare R2 */
const storageChannel = ref<'local' | 'oss' | 'r2'>('local')
const uploadOssPlatform = ref<Media['ossPlatform']>('aliyun')

const storageChannelOptions = [
  { label: '本地存储', value: 'local' },
  { label: 'OSS', value: 'oss' },
  { label: 'R2', value: 'r2' },
]

const uploadOssPlatformOptions = [
  { label: '阿里云', value: 'aliyun' },
  { label: '腾讯云', value: 'tencent' },
  { label: 'Backblaze', value: 'backblaze' },
]

const showOssPlatformSelect = computed(() => storageChannel.value === 'oss')

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

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(
    () => message.success('已复制链接'),
    () => message.error('复制失败'),
  )
}

const storageTypeLabel: Record<string, string> = { local: '本地', oss: 'OSS' }
const ossPlatformLabel: Record<string, string> = { aliyun: '阿里云', tencent: '腾讯云', cloudflare: 'R2', backblaze: 'Backblaze' }

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
  } catch (e: any) {
    message.error(e?.message || '加载文件列表失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  page.value = 1
  loadMedia()
}

/** 进入备注编辑态：把当前值放进 draft */
function startEditNote(row: Media) {
  if (!noteDrafts.has(row.id)) {
    noteDrafts.set(row.id, row.note || '')
  }
}

/** 取消编辑：丢弃草稿 */
function cancelEditNote(row: Media) {
  noteDrafts.delete(row.id)
}

/** 提交备注：对比原始值，有变化才发请求 */
async function commitEditNote(row: Media) {
  const draft = noteDrafts.get(row.id)
  if (draft === undefined) return
  const note = draft.trim()
  if (note === (row.note || '').trim()) {
    noteDrafts.delete(row.id)
    return
  }
  try {
    await updateMedia(row.id, { note })
    row.note = note || null
    noteDrafts.delete(row.id)
    message.success(note ? '备注已更新' : '备注已清空')
  } catch (e: any) {
    message.error(e.message || '更新备注失败')
  }
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
  uploading.value = true
  try {
    if (storageChannel.value === 'r2') {
      await uploadToR2(file.file, { app: 'vibehub', folder: 'media', note: file.file.name })
    } else {
      await uploadMedia(file.file, {
        storageType: storageChannel.value === 'oss' ? 'oss' : 'local',
        ossPlatform: storageChannel.value === 'oss' ? uploadOssPlatform.value : null,
        app: 'vibehub', folder: 'media', note: file.file.name,
      })
    }
    message.success('上传成功')
    uploadFileList.value = []
    loadMedia()
  } catch (e: any) {
    message.error(e.message || '上传失败')
    uploadFileList.value = []
  } finally {
    uploading.value = false
  }
}

function handleDelete(item: Media) {
  const doDelete = async () => {
    if (item.ossPlatform === 'cloudflare' && item.storageType === 'oss') {
      await deleteR2Media(item.id)
    } else {
      await deleteMedia(item.id)
    }
  }
  dialog.warning({
    title: '确认删除',
    content: `确定删除文件「${item.originalName}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      loading.value = true
      try {
        await doDelete()
        message.success('删除成功')
        await loadMedia()
      } catch (e: any) {
        message.error(e.message || '删除失败')
        loading.value = false
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
      loading.value = true
      try {
        const selectedItems = mediaList.value.filter((m) => checkedRowKeys.value.includes(m.id))
        const allR2 = selectedItems.length > 0 && selectedItems.every((m) => m.ossPlatform === 'cloudflare' && m.storageType === 'oss')
        if (allR2) {
          await batchDeleteR2Media(checkedRowKeys.value)
        } else {
          await batchDeleteMedia(checkedRowKeys.value)
        }
        message.success('批量删除成功')
        checkedRowKeys.value = []
        await loadMedia()
      } catch (e: any) {
        message.error(e.message || '批量删除失败')
        loading.value = false
      }
    },
  })
}

const columns: DataTableColumns<Media> = [
  { type: 'selection', width: 40, fixed: 'left' },
  { title: 'ID', key: 'id', width: 50, fixed: 'left' },
  {
    title: '预览', key: 'preview', width: 52, fixed: 'left',
    render: (row) => {
      if (isImage(row.mimeType)) {
        return h(NImage, {
          src: resolveFileUrl(row.url),
          width: 32,
          height: 32,
          objectFit: 'cover',
          style: 'border-radius: 3px; cursor: pointer; display: block',
          previewSrc: resolveFileUrl(row.url),
          alt: row.originalName,
        })
      }
      return h('div', {
        style: 'width:32px;height:32px;border-radius:3px;background:rgba(148,163,184,0.08);display:flex;align-items:center;justify-content:center',
      }, [h(NIcon, { size: 16, color: '#94A3B8' }, { default: () => h(DocumentOutline) })])
    },
  },
  {
    title: '文件名', key: 'originalName', minWidth: 150,
    render: (row) => {
      const url = resolveFileUrl(row.url)
      const renderNameRow = (text: string, copyText: string, isUrl = false) => h('div', {
        style: 'display:flex;align-items:center;gap:2px;' + (isUrl ? 'margin-top:2px' : ''),
      }, [
        h(NEllipsis, { lineClamp: 1, tooltip: true, style: 'flex:1;min-width:0;' + (isUrl ? 'font-size:11px;color:#6366f1' : 'font-weight:500') }, {
          default: () => isUrl
            ? h('a', { href: url, target: '_blank', rel: 'noopener', style: 'text-decoration:none;color:inherit', onClick: (e: Event) => e.stopPropagation() }, text)
            : text,
        }),
        h(NTooltip, { trigger: 'hover' }, {
          trigger: () => h(NButton, {
            size: 'tiny', quaternary: true,
            style: 'padding:0 2px;line-height:1;flex-shrink:0',
            onClick: (e: Event) => { e.stopPropagation(); copyToClipboard(copyText) },
          }, { default: () => h(NIcon, { size: 12, color: '#6366f1' }, { default: () => h(CopyOutline) }) }),
          default: () => isUrl ? '复制链接' : '复制文件名',
        }),
      ])
      return h('div', null, [
        renderNameRow(row.originalName, row.originalName),
        renderNameRow(url, url, true),
      ])
    },
  },
  {
    title: '备注', key: 'note', minWidth: 100,
    render: (row) => {
      const isEditing = noteDrafts.has(row.id)
      const noteText = row.note || ''
      // 显示态：纯文本 + 省略号 + tooltip（用 NEllipsis 组件，非原生 title）
      if (!isEditing) {
        if (!noteText) {
          return h('span', {
            class: 'note-empty',
            onClick: () => startEditNote(row),
          }, [h(NIcon, { size: 14 }, { default: () => h(AddOutline) })])
        }
        return h('div', {
          class: 'note-display',
          onClick: () => startEditNote(row),
        }, [
          h(NEllipsis, { lineClamp: 1, tooltip: true }, { default: () => noteText }),
        ])
      }
      // 编辑态：输入框 + ✓ + ✗
      return h('div', { class: 'note-edit-row' }, [
        h(NInput, {
          value: noteDrafts.get(row.id) || '',
          size: 'small',
          placeholder: '备注',
          autofocus: true,
          'onUpdate:value': (val: string) => noteDrafts.set(row.id, val),
          onKeydown: (e: KeyboardEvent) => {
            if (e.key === 'Enter') commitEditNote(row)
            if (e.key === 'Escape') cancelEditNote(row)
          },
          onBlur: () => {
            setTimeout(() => {
              if (!noteDrafts.has(row.id)) return
              const draft = noteDrafts.get(row.id) || ''
              if (draft.trim() === (row.note || '').trim()) {
                noteDrafts.delete(row.id)
              }
            }, 150)
          },
        }),
        h(NButton, {
          size: 'tiny',
          quaternary: true,
          type: 'success',
          class: 'note-action',
          onClick: () => commitEditNote(row),
        }, { default: () => h(NIcon, null, { default: () => h(CheckmarkOutline) }) }),
        h(NButton, {
          size: 'tiny',
          quaternary: true,
          type: 'error',
          class: 'note-action',
          onClick: () => cancelEditNote(row),
        }, { default: () => h(NIcon, null, { default: () => h(CloseOutline) }) }),
      ])
    },
  },
  {
    title: '类型', key: 'mimeType', width: 120, ellipsis: { tooltip: true },
    cellProps: () => ({ style: { whiteSpace: 'nowrap' } }),
    render: (row) => h(NTag, { size: 'small', bordered: false }, { default: () => row.mimeType }),
  },
  {
    title: '大小', key: 'size', width: 85,
    cellProps: () => ({ style: { whiteSpace: 'nowrap' } }),
    render: (row) => formatSize(row.size),
  },
  {
    title: '存储', key: 'storage', width: 90,
    render: (row) => {
      // 合并显示：本地 / R2 / OSS·阿里云 / OSS·腾讯云 等
      const label = row.storageType === 'oss' && row.ossPlatform
        ? (row.ossPlatform === 'cloudflare' ? 'R2' : `OSS·${ossPlatformLabel[row.ossPlatform] || row.ossPlatform}`)
        : storageTypeLabel[row.storageType] || row.storageType
      const type = row.storageType === 'oss' ? 'info' : 'default'
      return h(NTag, { size: 'small', type, round: true, bordered: false }, { default: () => label })
    },
  },
  {
    title: '上传者', key: 'uploader', width: 85,
    render: (row) => {
      const name = row.uploader?.nickname || row.uploader?.username || '-'
      if (name === '-') return '-'
      return h(NEllipsis, { lineClamp: 1, tooltip: true }, { default: () => name })
    },
  },
  {
    title: '创建时间', key: 'createdAt', width: 155,
    cellProps: () => ({ style: { whiteSpace: 'nowrap' } }),
    render: (row) => new Date(row.createdAt).toLocaleString('zh-CN'),
  },
  {
    title: '操作', key: 'actions', width: 100, fixed: 'right',
    render: (row) => h(NSpace, { size: 'small', wrap: false }, {
      default: () => [
        h(NButton, {
          size: 'small', quaternary: true, type: 'error',
          onClick: () => handleDelete(row),
        }, {
          default: () => '删除',
          icon: () => h(NIcon, null, { default: () => h(TrashOutline) }),
        }),
      ],
    }),
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
      <n-select v-model:value="storageChannel" :options="storageChannelOptions" style="width: 110px" />
      <n-select v-if="showOssPlatformSelect" v-model:value="uploadOssPlatform" :options="uploadOssPlatformOptions" style="width: 130px" />
      <n-upload v-model:file-list="uploadFileList" :show-file-list="false" :disabled="uploading" :custom-request="({ file }) => handleUpload({ file })">
        <n-button type="primary" :loading="uploading">
          <template #icon><n-icon><CloudUploadOutline /></n-icon></template>
          上传文件
        </n-button>
      </n-upload>
      <n-button :disabled="checkedRowKeys.length === 0" type="error" @click="handleBatchDelete">
        <template #icon><n-icon><TrashOutline /></n-icon></template>
        批量删除
      </n-button>
    </n-space>

    <div class="table-section">
      <n-data-table :columns="columns" :data="mediaList" :loading="loading" :bordered="false"
        :scroll-x="1032"
        :row-key="(row: any) => row.id" @update:checked-row-keys="(keys: any) => checkedRowKeys = keys" />
      <div class="pagination-wrap" v-if="total > 0">
        <n-pagination :page="page" :page-size="pageSize" :page-sizes="[10, 20, 50]" :item-count="total" show-size-picker @update:page="handlePageChange" @update:page-size="handlePageSizeChange" />
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>

<style>
/* 备注列样式：不能用 scoped，因为是在 render 函数里 h() 出来的 */
.note-display {
  cursor: pointer;
  color: #475569;
  padding: 2px 4px;
  border-radius: 3px;
  transition: background 0.12s, color 0.12s;
}
.note-display:hover {
  background: rgba(99, 102, 241, 0.08);
  color: #6366f1;
}
.note-empty {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 3px;
  color: #C0C4CC;
  transition: background 0.12s, color 0.12s;
}
.note-empty:hover {
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
}
.note-edit-row {
  display: flex;
  align-items: center;
  gap: 2px;
}
.note-edit-row .note-action {
  padding: 0 4px !important;
  flex-shrink: 0;
}
</style>
