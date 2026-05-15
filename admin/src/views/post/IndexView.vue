<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import { NCard, NButton, NDataTable, NSpace, NTag, NInput, NIcon, NSelect, NPagination, useMessage, useDialog } from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { AddOutline, TrashOutline, CreateOutline, SearchOutline } from '@vicons/ionicons5'
import { useRouter } from 'vue-router'
import { getPosts, deletePost } from '../../api/post'
import type { Post } from '../../api/post'

const router = useRouter()
const message = useMessage()
const dialog = useDialog()
const loading = ref(false)
const posts = ref<Post[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const statusFilter = ref<number | null>(null)

const statusOptions = [
  { label: '全部', value: null },
  { label: '草稿', value: 0 },
  { label: '已发布', value: 1 },
]

const columns: DataTableColumns<Post> = [
  { title: '标题', key: 'title', ellipsis: { tooltip: true }, width: 260 },
  { title: '分类', key: 'category', width: 120, render: (row) => row.category?.name || '-' },
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
      h(NTag, { size: 'small', type: row.status === 1 ? 'success' : 'default' }, {
        default: () => (row.status === 1 ? '已发布' : '草稿'),
      }),
  },
  { title: '更新时间', key: 'updatedAt', width: 170, render: (row) => new Date(row.updatedAt).toLocaleString('zh-CN') },
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
    if (statusFilter.value !== null) params.status = statusFilter.value
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

onMounted(loadPosts)
</script>

<template>
  <div class="page-wrapper">
    <div class="page-header">
      <h2 class="page-title">文章管理</h2>
      <n-space>
        <n-select
          v-model:value="statusFilter"
          :options="statusOptions"
          placeholder="状态筛选"
          style="width: 120px"
          @update:value="page = 1; loadPosts()"
        />
        <n-button type="primary" @click="router.push('/posts/create')">
          <template #icon><n-icon><AddOutline /></n-icon></template>
          新建文章
        </n-button>
      </n-space>
    </div>

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
</style>
