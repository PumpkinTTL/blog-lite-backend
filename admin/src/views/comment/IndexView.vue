<script setup lang="ts">
import { ref, h, onMounted } from 'vue'
import { NButton, NDataTable, NSpace, NInput, NIcon, NTag, NSelect, NPagination, useDialog, useMessage } from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { CheckmarkOutline, CloseOutline, TrashOutline, SearchOutline, RefreshOutline } from '@vicons/ionicons5'
import { getAdminComments, moderateComment, batchModerateComment, deleteComment, batchDeleteComments } from '../../api/comment'
import type { Comment, CommentStatus } from '../../api/comment'

const message = useMessage()
const dialog = useDialog()

const loading = ref(false)
const list = ref<Comment[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const checkedRowKeys = ref<number[]>([])

const searchId = ref('')
const searchKeyword = ref('')
const searchStatus = ref<CommentStatus | null>(null)
const searchEntityType = ref<string | null>(null)

const statusOptions = [
  { label: '全部', value: null },
  { label: '待审核', value: 'pending' },
  { label: '已通过', value: 'approved' },
  { label: '已拒绝', value: 'rejected' },
]
const entityTypeOptions = [
  { label: '全部', value: null },
  { label: '文章', value: 'post' },
]

const statusTagMap: Record<CommentStatus, 'warning' | 'success' | 'error'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
}
const statusLabelMap: Record<CommentStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
}

async function loadList() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value }
    if (searchId.value) params.id = searchId.value
    if (searchKeyword.value) params.keyword = searchKeyword.value
    if (searchStatus.value !== null) params.status = searchStatus.value
    if (searchEntityType.value !== null) params.entityType = searchEntityType.value
    const res = await getAdminComments(params)
    const payload = res.data
    list.value = payload?.list || []
    total.value = payload?.total || 0
    checkedRowKeys.value = []
  } catch (e: any) {
    message.error(e?.message || '加载评论失败')
    list.value = []
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  page.value = 1
  loadList()
}

function handleReset() {
  searchId.value = ''
  searchKeyword.value = ''
  searchStatus.value = null
  searchEntityType.value = null
  page.value = 1
  loadList()
}

function handlePageChange(p: number) {
  page.value = p
  loadList()
}

function handlePageSizeChange(s: number) {
  pageSize.value = s
  page.value = 1
  loadList()
}

async function handleModerate(row: Comment, status: 'approved' | 'rejected') {
  try {
    await moderateComment(row.id, status)
    message.success(status === 'approved' ? '已通过' : '已拒绝')
    loadList()
  } catch (e: any) {
    message.error(e?.message || '操作失败')
  }
}

async function handleBatchModerate(status: 'approved' | 'rejected') {
  if (checkedRowKeys.value.length === 0) {
    message.warning('请先选择要操作的评论')
    return
  }
  dialog.warning({
    title: '批量操作',
    content: `确定批量${status === 'approved' ? '通过' : '拒绝'} ${checkedRowKeys.value.length} 条评论？`,
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await batchModerateComment(checkedRowKeys.value, status)
        message.success('批量操作成功')
        loadList()
      } catch (e: any) {
        message.error(e?.message || '批量操作失败')
      }
    },
  })
}

async function handleBatchDeleteComments() {
  if (checkedRowKeys.value.length === 0) {
    message.warning('请先选择要删除的评论')
    return
  }
  dialog.warning({
    title: '批量删除',
    content: `确定要删除选中的 ${checkedRowKeys.value.length} 条评论吗？此操作不可恢复！`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await batchDeleteComments(checkedRowKeys.value)
        message.success('批量删除成功')
        loadList()
      } catch (e: any) {
        message.error(e?.message || '批量删除失败')
      }
    },
  })
}

function handleDelete(row: Comment) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除评论 #${row.id}？一级评论删除会连带其下二级回复。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteComment(row.id)
        message.success('已删除')
        loadList()
      } catch (e: any) {
        message.error(e?.message || '删除失败')
      }
    },
  })
}

const columns: DataTableColumns<Comment> = [
  { type: 'selection', width: 40 },
  { title: 'ID', key: 'id', width: 70 },
  {
    title: '目标', key: 'target', width: 120,
    render: (row) => {
      const typeMap: Record<string, string> = { post: '文章' }
      return h(NSpace, { size: 4, wrap: false, align: 'center' }, {
        default: () => [
          h(NTag, { size: 'small', bordered: false, type: 'info' }, { default: () => typeMap[row.entityType] || row.entityType }),
          h('span', { style: 'font-size: 12px; color: #999' }, `#${row.entityId}`),
        ],
      })
    },
  },
  {
    title: '内容', key: 'content', width: 400, ellipsis: { tooltip: true },
    render: (row) => {
      // 一级评论：直接显示；二级回复：显示 @ 提示
      const replyTo = row.replyToUser?.nickname || row.replyToUser?.username
      const prefix = row.parentId ? (replyTo ? `回复 @${replyTo}: ` : '') : ''
      return h('span', null, prefix + row.content)
    },
  },
  {
    title: '作者', key: 'user', width: 120, ellipsis: { tooltip: true },
    render: (row) => row.user?.nickname || row.user?.username || `#${row.userId}`,
  },
  {
    title: '层级', key: 'level', width: 80,
    render: (row) => h(NTag, {
      size: 'small', bordered: false,
      type: row.parentId === null ? 'default' : 'info',
    }, { default: () => row.parentId === null ? '一级' : '二级' }),
  },
  {
    title: '状态', key: 'status', width: 100,
    render: (row) => h(NTag, {
      size: 'small', bordered: false,
      type: statusTagMap[row.status],
    }, { default: () => statusLabelMap[row.status] }),
  },
  {
    title: '提交时间', key: 'createdAt', width: 180,
    render: (row) => new Date(row.createdAt).toLocaleString('zh-CN'),
  },
  {
    title: '操作', key: 'actions', width: 200, fixed: 'right',
    render: (row) => h(NSpace, { size: 4, wrap: false }, {
      default: () => [
        // 只有 pending/rejected 状态显示通过
        row.status !== 'approved'
          ? h(NButton, {
            size: 'small', quaternary: true, type: 'success',
            onClick: () => handleModerate(row, 'approved'),
          }, { default: () => '通过', icon: () => h(NIcon, null, { default: () => h(CheckmarkOutline) }) })
          : null,
        // 只有 pending/approved 状态显示拒绝
        row.status !== 'rejected'
          ? h(NButton, {
            size: 'small', quaternary: true, type: 'warning',
            onClick: () => handleModerate(row, 'rejected'),
          }, { default: () => '拒绝', icon: () => h(NIcon, null, { default: () => h(CloseOutline) }) })
          : null,
        h(NButton, {
          size: 'small', quaternary: true, type: 'error',
          onClick: () => handleDelete(row),
        }, { default: () => '删除', icon: () => h(NIcon, null, { default: () => h(TrashOutline) }) }),
      ].filter(Boolean),
    }),
  },
]

onMounted(() => {
  loadList()
})
</script>

<template>
  <div class="page-wrapper">
    <div class="page-header">
      <h2 class="page-title">评论管理</h2>
    </div>
    <n-space class="search-bar" :size="12" align="center">
      <n-input v-model:value="searchId" placeholder="评论ID" clearable style="width: 100px" @keyup.enter="handleSearch" />
      <n-input v-model:value="searchKeyword" placeholder="搜索内容..." clearable @keyup.enter="handleSearch" />
      <n-select v-model:value="searchEntityType" :options="entityTypeOptions" placeholder="目标类型" style="width: 120px" clearable />
      <n-select v-model:value="searchStatus" :options="statusOptions" placeholder="状态" style="width: 120px" clearable />
      <n-button type="primary" @click="handleSearch">
        <template #icon><n-icon><SearchOutline /></n-icon></template>
        搜索
      </n-button>
      <n-button @click="handleReset">
        <template #icon><n-icon><RefreshOutline /></n-icon></template>
        重置
      </n-button>
      <n-button :disabled="checkedRowKeys.length === 0" type="success" @click="handleBatchModerate('approved')">
        <template #icon><n-icon><CheckmarkOutline /></n-icon></template>
        批量通过
      </n-button>
      <n-button :disabled="checkedRowKeys.length === 0" type="warning" @click="handleBatchModerate('rejected')">
        <template #icon><n-icon><CloseOutline /></n-icon></template>
        批量拒绝
      </n-button>
      <n-button :disabled="checkedRowKeys.length === 0" type="error" @click="handleBatchDeleteComments">
        <template #icon><n-icon><TrashOutline /></n-icon></template>
        批量删除
      </n-button>
    </n-space>

    <div class="table-section">
      <n-data-table :columns="columns" :data="list" :loading="loading" :bordered="false" :scroll-x="1310"
        :row-key="(row: Comment) => row.id" @update:checked-row-keys="(keys: any) => checkedRowKeys = keys" />
      <div class="pagination-wrap" v-if="total > 0">
        <n-pagination :page="page" :page-size="pageSize" :page-sizes="[20, 50, 100]" :item-count="total" show-size-picker
          @update:page="handlePageChange" @update:page-size="handlePageSizeChange" />
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>
