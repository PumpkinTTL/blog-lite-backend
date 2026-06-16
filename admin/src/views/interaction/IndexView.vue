<script setup lang="ts">
import { ref, h, onMounted } from 'vue'
import { NButton, NDataTable, NSpace, NInput, NIcon, NTag, NSelect, NAvatar, NPagination, useDialog, useMessage } from 'naive-ui'
import type { DataTableColumns, SelectOption } from 'naive-ui'
import { TrashOutline, SearchOutline, RefreshOutline, HeartOutline, StarOutline } from '@vicons/ionicons5'
import { getAdminInteractions, deleteInteraction, batchDeleteInteractions } from '../../api/interaction'
import type { AdminInteraction, InteractionType, InteractionEntityType } from '../../api/interaction'

const message = useMessage()
const dialog = useDialog()

const loading = ref(false)
const list = ref<AdminInteraction[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const checkedRowKeys = ref<number[]>([])

const searchKeyword = ref('')
const searchEntityId = ref('')
const searchUserId = ref('')
const searchType = ref<InteractionType | null>(null)
const searchEntityType = ref<InteractionEntityType | null>(null)

const typeOptions = [
  { label: '全部', value: null },
  { label: '点赞', value: 'like' },
  { label: '收藏', value: 'favorite' },
] as unknown as SelectOption[]
const entityTypeOptions = [
  { label: '全部', value: null },
  { label: '文章', value: 'post' },
  { label: '评论', value: 'comment' },
] as unknown as SelectOption[]

const typeLabelMap: Record<InteractionType, string> = {
  like: '点赞',
  favorite: '收藏',
}
const typeTagMap: Record<InteractionType, 'error' | 'warning'> = {
  like: 'error',
  favorite: 'warning',
}
const entityTypeLabelMap: Record<string, string> = {
  post: '文章',
  comment: '评论',
}

async function loadList() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value }
    if (searchKeyword.value) params.keyword = searchKeyword.value
    if (searchEntityId.value) params.entityId = searchEntityId.value
    if (searchUserId.value) params.userId = searchUserId.value
    if (searchType.value !== null) params.type = searchType.value
    if (searchEntityType.value !== null) params.entityType = searchEntityType.value
    const res = await getAdminInteractions(params)
    const payload = res.data
    list.value = payload?.list || []
    total.value = payload?.total || 0
    checkedRowKeys.value = []
  } catch (e: any) {
    message.error(e?.message || '加载互动记录失败')
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
  searchKeyword.value = ''
  searchEntityId.value = ''
  searchUserId.value = ''
  searchType.value = null
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

function handleDelete(row: AdminInteraction) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除这条 ${typeLabelMap[row.type]} 记录？（用户 ${row.user?.nickname || row.user?.username || '#' + row.userId} → ${entityTypeLabelMap[row.entityType] || row.entityType} #${row.entityId}）删除后冗余计数会自动同步。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteInteraction(row.id)
        message.success('已删除')
        loadList()
      } catch (e: any) {
        message.error(e?.message || '删除失败')
      }
    },
  })
}

function handleBatchDelete() {
  if (checkedRowKeys.value.length === 0) {
    message.warning('请先选择要操作的记录')
    return
  }
  dialog.warning({
    title: '批量删除',
    content: `确定批量删除 ${checkedRowKeys.value.length} 条互动记录？此操作不可撤销。`,
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await batchDeleteInteractions(checkedRowKeys.value)
        message.success('批量删除成功')
        loadList()
      } catch (e: any) {
        message.error(e?.message || '批量删除失败')
      }
    },
  })
}

const columns: DataTableColumns<AdminInteraction> = [
  { type: 'selection', width: 40 },
  { title: 'ID', key: 'id', width: 70 },
  {
    title: '类型', key: 'type', width: 90,
    render: (row) => h(NTag, {
      size: 'small', bordered: false,
      type: typeTagMap[row.type],
    }, {
      default: () => h(NSpace, { size: 4, wrap: false, align: 'center' }, {
        default: () => [
          h(NIcon, { size: 12 }, { default: () => h(row.type === 'like' ? HeartOutline : StarOutline) }),
          typeLabelMap[row.type],
        ],
      }),
    }),
  },
  {
    title: '目标', key: 'target', width: 130,
    render: (row) => h(NSpace, { size: 4, wrap: false, align: 'center' }, {
      default: () => [
        h(NTag, { size: 'small', bordered: false, type: 'info' }, { default: () => entityTypeLabelMap[row.entityType] || row.entityType }),
        h('span', { style: 'font-size: 12px; color: #999' }, `#${row.entityId}`),
      ],
    }),
  },
  {
    title: '文章标题', key: 'postTitle', minWidth: 200, ellipsis: { tooltip: true },
    render: (row) => {
      if (row.post) {
        // 仅 post 类型显示标题，可点击跳前台（这里用 a 标签，新窗口打开）
        return h('a', {
          href: `/post/${row.post.slug}`,
          target: '_blank',
          style: 'color: var(--primary-color, #2563EB); text-decoration: none;',
        }, row.post.title)
      }
      return h('span', { style: 'color: #bbb' }, '—')
    },
  },
  {
    title: '用户', key: 'user', width: 160, ellipsis: { tooltip: true },
    render: (row) => {
      const u = row.user
      if (!u) return h('span', { style: 'color: #999' }, `#${row.userId}`)
      return h(NSpace, { size: 6, wrap: false, align: 'center' }, {
        default: () => [
          h(NAvatar, { size: 22, round: true, src: u.avatar || undefined }, {
            default: () => u.avatar ? '' : (u.nickname || u.username).slice(0, 1).toUpperCase(),
          }),
          h('span', null, u.nickname || u.username),
        ],
      })
    },
  },
  {
    title: '时间', key: 'createdAt', width: 170,
    render: (row) => new Date(row.createdAt).toLocaleString('zh-CN'),
  },
  {
    title: '操作', key: 'actions', width: 100, fixed: 'right',
    render: (row) => h(NButton, {
      size: 'small', quaternary: true, type: 'error',
      onClick: () => handleDelete(row),
    }, { default: () => '删除', icon: () => h(NIcon, null, { default: () => h(TrashOutline) }) }),
  },
]

onMounted(() => {
  loadList()
})
</script>

<template>
  <div class="page-wrapper">
    <div class="page-header">
      <h2 class="page-title">互动管理</h2>
    </div>
    <n-space class="search-bar" :size="12" align="center">
      <n-input v-model:value="searchKeyword" placeholder="用户名/昵称搜索" clearable style="width: 160px" @keyup.enter="handleSearch" />
      <n-input v-model:value="searchUserId" placeholder="用户ID" clearable style="width: 100px" @keyup.enter="handleSearch" />
      <n-input v-model:value="searchEntityId" placeholder="目标ID" clearable style="width: 100px" @keyup.enter="handleSearch" />
      <n-select v-model:value="searchType" :options="typeOptions" placeholder="类型" style="width: 110px" clearable />
      <n-select v-model:value="searchEntityType" :options="entityTypeOptions" placeholder="目标类型" style="width: 120px" clearable />
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
      <n-data-table :columns="columns" :data="list" :loading="loading" :bordered="false" :scroll-x="1100"
        :row-key="(row: AdminInteraction) => row.id" @update:checked-row-keys="(keys: any) => checkedRowKeys = keys" />
      <div class="pagination-wrap" v-if="total > 0">
        <n-pagination :page="page" :page-size="pageSize" :page-sizes="[20, 50, 100]" :item-count="total" show-size-picker
          @update:page="handlePageChange" @update:page-size="handlePageSizeChange" />
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>
