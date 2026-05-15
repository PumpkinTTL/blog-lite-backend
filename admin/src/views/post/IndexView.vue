<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import { NCard, NButton, NDataTable, NSpace, NTag, NInput, NIcon, NSelect, NPagination, useMessage, useDialog } from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { AddOutline, TrashOutline, CreateOutline, SearchOutline, RefreshOutline } from '@vicons/ionicons5'
import { useRouter } from 'vue-router'
import { getPosts, deletePost } from '../../api/post'
import type { Post } from '../../api/post'
import { getCategories } from '../../api/category'

const router = useRouter()
const message = useMessage()
const dialog = useDialog()
const loading = ref(false)
const posts = ref<Post[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const searchId = ref('')
const searchKeyword = ref('')
const searchStatus = ref<number | null>(null)
const searchCategoryId = ref<number | null>(null)
const categoryOptions = ref<{ label: string; value: number }[]>([])

const statusOptions = [
  { label: '全部', value: null },
  { label: '草稿', value: 0 },
  { label: '已发布', value: 1 },
  { label: '已下架', value: 2 },
]

const columns: DataTableColumns<Post> = [
  { title: 'ID', key: 'id', width: 70 },
  { title: '标题', key: 'title', ellipsis: { tooltip: true }, width: 200 },
  { title: '内容预览', key: 'content', ellipsis: { tooltip: true }, width: 200, render: (row) => row.content?.replace(/[#*`\n]/g, '').slice(0, 80) || '-' },
  { title: '作者', key: 'author', width: 100, render: (row) => row.author?.nickname || '-' },
  { title: '分类', key: 'category', width: 100, render: (row) => row.category?.name || '-' },
  {
    title: '标签',
    key: 'tags',
    width: 200,
    render: (row) =>
      h(NSpace, { size: 4 }, {
        default: () => (row.tags || []).map((t) =>
          h(NTag, { size: 'small', bordered: false }, { default: () => t.name }),
        ),
      }),
  },
  {
    title: '状态',
    key: 'status',
    width: 90,
    render: (row) =>
      h(NTag, {
        size: 'small',
        type: row.status === 1 ? 'success' : row.status === 2 ? 'warning' : 'default',
      }, {
        default: () => row.status === 1 ? '已发布' : row.status === 2 ? '已下架' : '草稿',
      }),
  },
  { title: '更新时间', key: 'updatedAt', width: 170, render: (row) => new Date(row.updatedAt).toLocaleString('zh-CN') },
  { title: '阅读', key: 'viewCount', width: 80, render: (row) => row.viewCount || 0 },
  {
    title: '操作',
    key: 'actions',
    width: 140,
    render: (row) =>
      h(NSpace, { size: 'small' }, {
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
  } catch {
    message.error('加载文章列表失败')
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
  } catch {
    // ignore
  }
}

function handlePageChange(p: number) {
  page.value = p
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
    </n-space>

    <n-card :bordered="false" class="table-card">
      <n-data-table :columns="columns" :data="posts" :loading="loading" :bordered="false" />
      <div class="pagination-wrap" v-if="total > pageSize">
        <n-pagination :page="page" :page-size="pageSize" :item-count="total" @update:page="handlePageChange" />
      </div>
    </n-card>
  </div>
</template>

<style scoped>
.page-wrapper {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
}

.table-card {
  border-radius: 12px;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.search-bar {
  margin-bottom: 12px;
}
</style>
