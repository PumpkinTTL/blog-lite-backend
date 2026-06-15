<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import { NButton, NDataTable, NSpace, NTag, NInput, NIcon, NSelect, NPagination, NImage, useMessage, useDialog } from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { AddOutline, TrashOutline, CreateOutline, SearchOutline, RefreshOutline, ImageOutline } from '@vicons/ionicons5'
import { useRouter } from 'vue-router'
import { getPosts, deletePost, batchDeletePosts } from '../../api/post'
import type { Post } from '../../api/post'
import { getCategories } from '../../api/category'

const router = useRouter()
const message = useMessage()
const dialog = useDialog()
const loading = ref(false)
const posts = ref<Post[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(5)
const searchId = ref('')
const searchKeyword = ref('')
const searchStatus = ref<string | null>(null)
const searchCategoryId = ref<number | null>(null)
const categoryOptions = ref<{ label: string; value: number }[]>([])
const checkedRowKeys = ref<number[]>([])

const statusOptions = [
  { label: '全部', value: null },
  { label: '草稿', value: 'draft' },
  { label: '已发布', value: 'published' },
  { label: '登录可见', value: 'login' },
  { label: '指定用户', value: 'private' },
]

function resolveCoverUrl(url: string | null): string {
  if (!url) return ''
  if (/^https?:\/\//.test(url)) return url
  const base = import.meta.env.VITE_API_BASE_URL || window.location.origin
  return new URL(url, base).toString()
}

const columns: DataTableColumns<Post> = [
  { type: 'selection', width: 40 },
  { title: 'ID', key: 'id', width: 70 },
  {
    title: '封面',
    key: 'coverImage',
    width: 80,
    render: (row) => {
      const url = resolveCoverUrl(row.coverImage)
      if (!url) {
        return h('div', {
          style: 'width:48px;height:48px;border-radius:6px;background:rgba(148,163,184,0.08);display:flex;align-items:center;justify-content:center',
        }, [h(NIcon, { size: 22, color: '#94A3B8' }, { default: () => h(ImageOutline) })])
      }
      return h(NImage, {
        src: url,
        width: 48,
        height: 48,
        objectFit: 'cover',
        style: 'border-radius:6px;display:block',
        previewSrc: url,
        alt: row.title,
      })
    },
  },
  { title: '标题', key: 'title', ellipsis: { tooltip: true }, width: 200 },
  { title: '内容预览', key: 'content', ellipsis: { tooltip: true }, width: 200, render: (row) => row.content?.replace(/[#*`\n]/g, '').slice(0, 80) || '-' },
  { title: '作者', key: 'author', width: 100, render: (row) => row.author?.nickname || '-' },
  { title: '分类', key: 'category', width: 100, render: (row) => row.category?.name || '-' },
  {
    title: '标签',
    key: 'tags',
    width: 200,
    render: (row) =>
      h(NSpace, { size: 4, wrap: false }, {
        default: () => (row.tags || []).map((t) =>
          h(NTag, { size: 'small', bordered: false }, { default: () => t.name }),
        ),
      }),
  },
  {
    title: '状态',
    key: 'status',
    width: 140,
    render: (row) => {
      if (row.status === 'private') {
        const hasUsers = (row.allowedUserIds?.length ?? 0) > 0
        const hasRoles = (row.allowedRoleIds?.length ?? 0) > 0
        let suffix = ''
        if (hasUsers && hasRoles) suffix = '用户+角色'
        else if (hasUsers) suffix = `用户${row.allowedUserIds!.length}人`
        else if (hasRoles) suffix = `角色${row.allowedRoleIds!.length}个`
        const label = suffix ? `指定可见·${suffix}` : '指定可见'
        return h(NTag, { size: 'small', type: 'warning' }, { default: () => label })
      }
      const map: Record<string, { type: 'success' | 'warning' | 'info' | 'default'; label: string }> = {
        published: { type: 'success', label: '已发布' },
        draft: { type: 'default', label: '草稿' },
        login: { type: 'info', label: '登录可见' },
      }
      const s = map[row.status] || { type: 'default' as const, label: row.status }
      return h(NTag, { size: 'small', type: s.type }, { default: () => s.label })
    },
  },
  { title: '更新时间', key: 'updatedAt', width: 170, render: (row) => new Date(row.updatedAt).toLocaleString('zh-CN') },
  { title: '阅读', key: 'viewCount', width: 80, render: (row) => row.viewCount || 0 },
  {
    title: '操作',
    key: 'actions',
    width: 140,
    fixed: 'right',
    render: (row) =>
      h(NSpace, { size: 'small', wrap: false }, {
        default: () => [
          h(NButton, { size: 'small', quaternary: true, type: 'primary', onClick: () => router.push(`/posts/${row.id}/edit`) }, {
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

async function loadPosts() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value }
    if (searchId.value) params.id = searchId.value
    if (searchKeyword.value) params.keyword = searchKeyword.value
    if (searchStatus.value !== null) params.status = searchStatus.value
    if (searchCategoryId.value !== null) params.categoryId = searchCategoryId.value
    const res = await getPosts(params)
    const payload = res.data
    if (payload?.list) {
      posts.value = payload.list
      total.value = payload.total
    } else if (Array.isArray(payload)) {
      posts.value = payload
      total.value = payload.length
    }
  } catch (e: any) {
    message.error(e?.message || '加载文章列表失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  page.value = 1
  loadPosts()
}

function handleReset() {
  searchId.value = ''
  searchKeyword.value = ''
  searchStatus.value = null
  searchCategoryId.value = null
  page.value = 1
  loadPosts()
}

async function loadCategoryOptions() {
  try {
    const res = await getCategories()
    const payload = res.data
    const list = Array.isArray(payload) ? payload : (payload?.list || [])
    categoryOptions.value = list.map((c: any) => ({ label: c.name, value: c.id }))
  } catch (e) {
    console.error('加载分类选项失败:', e)
  }
}

function handlePageChange(p: number) {
  page.value = p
  loadPosts()
}

function handlePageSizeChange(s: number) {
  pageSize.value = s
  page.value = 1
  loadPosts()
}

function handleDelete(row: Post) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除文章「${row.title}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deletePost(row.id)
        message.success('删除成功')
        loadPosts()
      } catch (e: any) {
        message.error(e.message || '删除失败')
      }
    },
  })
}

async function handleBatchDelete() {
  if (checkedRowKeys.value.length === 0) { message.warning('请先选择要删除的文章'); return }
  dialog.warning({
    title: '批量删除',
    content: `确定要删除选中的 ${checkedRowKeys.value.length} 篇文章吗？此操作不可恢复！`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await batchDeletePosts(checkedRowKeys.value)
        message.success('批量删除成功')
        checkedRowKeys.value = []
        loadPosts()
      } catch (e: any) {
        message.error(e.message || '批量删除失败')
      }
    },
  })
}

onMounted(() => { loadPosts(); loadCategoryOptions() })
</script>

<template>
  <div class="page-wrapper">
    <div class="page-header">
      <h2 class="page-title">文章管理</h2>
      <n-button type="primary" @click="router.push('/posts/create')">
        <template #icon><n-icon><AddOutline /></n-icon></template>
        新建文章
      </n-button>
    </div>
    <n-space class="search-bar" :size="12" align="center">
      <n-input v-model:value="searchId" placeholder="ID" clearable style="width: 100px" @keyup.enter="handleSearch" />
      <n-input v-model:value="searchKeyword" placeholder="搜索..." clearable @keyup.enter="handleSearch" />
      <n-select v-model:value="searchStatus" :options="statusOptions" placeholder="状态" style="width: 120px" clearable />
      <n-select v-model:value="searchCategoryId" :options="categoryOptions" placeholder="分类" style="width: 150px" clearable />
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
      <n-data-table :columns="columns" :data="posts" :loading="loading" :bordered="false" :scroll-x="1600"
        :row-key="(row: any) => row.id" @update:checked-row-keys="(keys: any) => checkedRowKeys = keys" />
      <div class="pagination-wrap" v-if="total > 0">
        <n-pagination :page="page" :page-size="pageSize" :page-sizes="[10, 20, 50]" :item-count="total" show-size-picker @update:page="handlePageChange" @update:page-size="handlePageSizeChange" />
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>
