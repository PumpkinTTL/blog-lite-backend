<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import { NCard, NButton, NDataTable, NSpace, NTag, NInput, NIcon, useMessage, useDialog } from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { AddOutline, TrashOutline, CreateOutline, SearchOutline } from '@vicons/ionicons5'
import { getPosts, deletePost } from '../../api/post'
import type { Post } from '../../api/post'

const message = useMessage()
const dialog = useDialog()
const loading = ref(false)
const posts = ref<Post[]>([])
const keyword = ref('')

const columns: DataTableColumns<Post> = [
  { title: '标题', key: 'title', ellipsis: { tooltip: true }, width: 280 },
  { title: '分类', key: 'categoryId', width: 120, render: () => '-' },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render: (row) =>
      h(
        NTag,
        { size: 'small', type: row.status === 'published' ? 'success' : 'default' },
        { default: () => (row.status === 'published' ? '已发布' : '草稿') },
      ),
  },
  { title: '更新时间', key: 'updatedAt', width: 180 },
  {
    title: '操作',
    key: 'actions',
    width: 140,
    render: (row) =>
      h(NSpace, { size: 'small' }, {
        default: () => [
          h(NButton, { size: 'small', quaternary: true, type: 'primary' }, { default: () => '编辑', icon: () => h(NIcon, null, { default: () => h(CreateOutline) }) }),
          h(NButton, { size: 'small', quaternary: true, type: 'error', onClick: () => handleDelete(row) }, { default: () => '删除', icon: () => h(NIcon, null, { default: () => h(TrashOutline) }) }),
        ],
      }),
  },
]

async function loadPosts() {
  loading.value = true
  try {
    const res = await getPosts({ keyword: keyword.value || undefined })
    const payload = res.data
    posts.value = Array.isArray(payload) ? payload : (payload?.list || [])
  } catch {
    message.error('加载文章列表失败')
  } finally {
    loading.value = false
  }
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
      } catch {
        message.error('删除失败')
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
        <n-input v-model:value="keyword" placeholder="搜索文章..." clearable @keyup.enter="loadPosts">
          <template #prefix>
            <n-icon><SearchOutline /></n-icon>
          </template>
        </n-input>
        <n-button type="primary">
          <template #icon><n-icon><AddOutline /></n-icon></template>
          新建文章
        </n-button>
      </n-space>
    </div>

    <n-card :bordered="false" class="table-card">
      <n-data-table :columns="columns" :data="posts" :loading="loading" :bordered="false" />
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
</style>
