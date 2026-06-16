<script setup lang="ts">
import { ref, h } from 'vue'
import { NButton, NDataTable, NSpace, NInput, NIcon, NPagination, NTag, NDrawer, NDrawerContent, useDialog, useMessage } from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { TrashOutline, SearchOutline, RefreshOutline, EyeOutline } from '@vicons/ionicons5'
import { getAiConversations, deleteAiConversation, batchDeleteAiConversations } from '../../api/ai-conversation'
import type { AiConversation } from '../../api/ai-conversation'

const dialog = useDialog()
const message = useMessage()
const loading = ref(false)
const list = ref<AiConversation[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const searchId = ref('')
const searchPostId = ref('')
const checkedRowKeys = ref<number[]>([])

// 详情查看
const detailVisible = ref(false)
const detailItem = ref<AiConversation | null>(null)

const selectionColumn = { type: 'selection' as const }

async function loadData() {
  loading.value = true
  try {
    const res = await getAiConversations({
      id: searchId.value ? Number(searchId.value) : undefined,
      postId: searchPostId.value ? Number(searchPostId.value) : undefined,
      page: page.value,
      pageSize: pageSize.value,
    })
    list.value = res.data?.list ?? []
    total.value = res.data?.total ?? 0
  } finally {
    loading.value = false
  }
}
loadData()

function handleSearch() { page.value = 1; loadData() }
function handleReset() { searchId.value = ''; searchPostId.value = ''; page.value = 1; loadData() }
function handlePageChange(p: number) { page.value = p; loadData() }
function handlePageSizeChange(s: number) { pageSize.value = s; page.value = 1; loadData() }

async function handleDelete(row: AiConversation) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除文章 #${row.postId} 的对话历史？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await deleteAiConversation(row.id)
      message.success('已删除')
      loadData()
    },
  })
}

async function handleBatchDelete() {
  if (checkedRowKeys.value.length === 0) return
  dialog.warning({
    title: '批量删除',
    content: `确定删除选中的 ${checkedRowKeys.value.length} 条对话？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await batchDeleteAiConversations(checkedRowKeys.value)
      message.success('批量删除成功')
      checkedRowKeys.value = []
      loadData()
    },
  })
}

function viewDetail(row: AiConversation) {
  detailItem.value = row
  detailVisible.value = true
}

function messageCount(row: AiConversation): number {
  return Array.isArray(row.messages) ? row.messages.length : 0
}

const columns: DataTableColumns<AiConversation> = [
  selectionColumn,
  { title: 'ID', key: 'id', width: 70 },
  { title: '文章 ID', key: 'postId', width: 100 },
  { title: '消息数', key: 'count', width: 90, render: (row) => messageCount(row) },
  { title: '模型', key: 'model', width: 200, ellipsis: { tooltip: true }, render: (row) => row.model || '-' },
  { title: '更新时间', key: 'updatedAt', width: 170 },
  {
    title: '操作', key: 'actions', width: 160, fixed: 'right',
    render: (row) => h(NSpace, { size: 'small', wrap: false }, {
      default: () => [
        h(NButton, { size: 'small', quaternary: true, type: 'primary', onClick: () => viewDetail(row) }, {
          default: () => '查看', icon: () => h(NIcon, null, { default: () => h(EyeOutline) }),
        }),
        h(NButton, { size: 'small', quaternary: true, type: 'error', onClick: () => handleDelete(row) }, {
          default: () => '删除', icon: () => h(NIcon, null, { default: () => h(TrashOutline) }),
        }),
      ],
    }),
  },
]
</script>

<template>
  <div class="page-wrapper">
    <div class="page-header">
      <h2 class="page-title">AI 对话历史</h2>
    </div>
    <n-space class="search-bar" :size="12" align="center">
      <n-input v-model:value="searchId" placeholder="对话 ID" clearable style="width: 120px" @keyup.enter="handleSearch" />
      <n-input v-model:value="searchPostId" placeholder="文章 ID" clearable style="width: 120px" @keyup.enter="handleSearch" />
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
      <n-data-table :columns="columns" :data="list" :loading="loading" :bordered="false" :scroll-x="800" :row-key="(row: any) => row.id" @update:checked-row-keys="(keys: any) => checkedRowKeys = keys" />
      <div class="pagination-wrap" v-if="total > 0">
        <n-pagination :page="page" :page-size="pageSize" :page-sizes="[10, 20, 50]" :item-count="total" show-size-picker @update:page="handlePageChange" @update:page-size="handlePageSizeChange" />
      </div>
    </div>

    <!-- 详情抽屉 -->
    <n-drawer v-model:show="detailVisible" :width="520" placement="right">
      <n-drawer-content :title="`文章 #${detailItem?.postId} 对话`" closable>
        <n-space vertical :size="8">
          <template v-if="detailItem">
            <div v-for="(msg, i) in (detailItem.messages as any[])" :key="i" class="msg-row">
              <n-tag size="small" :type="msg.role === 'user' ? 'primary' : msg.role === 'tool' ? 'warning' : 'default'">{{ msg.role }}</n-tag>
              <span class="msg-text">{{ typeof msg.content === 'string' ? msg.content.slice(0, 200) : JSON.stringify(msg).slice(0, 200) }}</span>
            </div>
          </template>
        </n-space>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<style scoped>
.msg-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 6px 0;
  border-bottom: 1px dashed #f1f5f9;
}
.msg-text {
  font-size: 12px;
  color: #475569;
  word-break: break-all;
  line-height: 1.5;
  flex: 1;
}
</style>
