<script setup lang="ts">
import { ref, h, onMounted } from 'vue'
import { NCard, NButton, NDataTable, NSpace, NInput, NIcon, NModal, NForm, NFormItem, NTag, NSelect, NPagination, NInputNumber, NTabs, NTabPane } from 'naive-ui'
import type { DataTableColumns, FormInst, FormRules } from 'naive-ui'
import { AddOutline, TrashOutline, CreateOutline, SearchOutline, RefreshOutline, BanOutline } from '@vicons/ionicons5'
import { getCodes, updateCode, deleteCode, batchCreateCodes, batchDisableCodes, batchDeleteCodes, getAllUsageLogs } from '../../api/code'
import type { Code, CodeUsageLog, CodeDiscount } from '../../api/code'
import { useCrudList } from '../../composables/useCrudList'

const formRef = ref<FormInst | null>(null)

// Tab
const activeTab = ref('codes')

// ==================== Tab 1: 激活码列表 ====================
const total = ref(0)
const page = ref(1)
const pageSize = ref(5)
const searchType = ref<string | null>(null)
const searchStatusField = ref<string | null>(null)
const checkedRowKeys = ref<number[]>([])

const typeOptions = [
  { label: '全部', value: null },
  { label: '邀请码', value: 'invitation' },
  { label: '激活码', value: 'activation' },
  { label: '优惠码', value: 'discount' },
]

const statusOptions = [
  { label: '全部', value: null },
  { label: '有效', value: 'active' },
  { label: '已用', value: 'used' },
  { label: '过期', value: 'expired' },
  { label: '禁用', value: 'disabled' },
]

const typeTagMap: Record<string, string> = { invitation: 'info', activation: 'success', discount: 'warning' }
const typeLabelMap: Record<string, string> = { invitation: '邀请码', activation: '激活码', discount: '优惠码' }
const statusTagMap: Record<string, string> = { active: 'success', used: 'warning', expired: 'default', disabled: 'error' }
const statusLabelMap: Record<string, string> = { active: '有效', used: '已用', expired: '过期', disabled: '禁用' }

const discountTypeLabel: Record<string, string> = { percentage: '打折', threshold: '满减', fixed: '立减' }

function renderDiscount(discount: CodeDiscount | null): string {
  if (!discount) return '-'
  if (discount.type === 'percentage') return `${discountTypeLabel.percentage} ${(discount.value * 10).toFixed(1)}折`
  if (discount.type === 'threshold') return `满${discount.threshold}减${discount.value}`
  return `立减${discount.value}`
}

const { loading, list, searchId, searchKeyword, showModal, editingId, saving, formValue,
  handleSearch: _handleSearch, handleReset: _handleReset, openCreate, openEdit: _openEdit,
  handleSave: _handleSave, handleDelete, message, dialog, loadList } =
  useCrudList<Code>({
    loadApi: (params) => getCodes({
      ...params,
      page: page.value,
      pageSize: pageSize.value,
      ...(searchType.value !== null ? { type: searchType.value } : {}),
      ...(searchStatusField.value !== null ? { status: searchStatusField.value } : {}),
    }),
    createApi: batchCreateCodes,
    updateApi: updateCode,
    deleteApi: deleteCode,
    deleteContent: (row) => `确定删除激活码「${row.code}」？`,
    defaultForm: () => ({ type: 'activation', count: 1, maxUses: 1, expiresAt: '', discountType: 'fixed', discountValue: '', discountThreshold: '' }),
    extractList: (res) => {
      const payload = res.data
      if (payload?.list) {
        total.value = payload.total
        return payload.list
      }
      return []
    },
  })

function openEdit(row: Code) {
  const d = row.discount
  _openEdit(row, (r) => ({
    type: r.type,
    maxUses: r.maxUses,
    expiresAt: r.expiresAt || '',
    status: r.status,
    discountType: d?.type || 'fixed',
    discountValue: d?.value != null ? String(d.value) : '',
    discountThreshold: d?.threshold != null ? String(d.threshold) : '',
  }))
}

function handleSearch() {
  page.value = 1
  _handleSearch()
}

function handleReset() {
  searchId.value = ''
  searchKeyword.value = ''
  searchType.value = null
  searchStatusField.value = null
  page.value = 1
  _handleReset()
}

function buildDiscountPayload(): CodeDiscount | undefined {
  if (formValue.value.type !== 'discount') return undefined
  const dtype = formValue.value.discountType as 'percentage' | 'threshold' | 'fixed'
  const payload: CodeDiscount = { type: dtype, value: Number(formValue.value.discountValue) || 0 }
  if (dtype === 'threshold') payload.threshold = Number(formValue.value.discountThreshold) || 0
  return payload
}

async function handleSave() {
  try {
    await formRef.value?.validate()
  } catch {
    return false
  }
  saving.value = true
  try {
    const discount = buildDiscountPayload()
    const expiresAt = formValue.value.expiresAt || undefined
    const maxUses = Number(formValue.value.maxUses) || 1

    if (editingId.value) {
      // 更新：只传 UpdateCodeDto 允许的字段
      const payload: Record<string, any> = {}
      if (formValue.value.status) payload.status = formValue.value.status
      if (discount) payload.discount = discount
      if (expiresAt) payload.expiresAt = expiresAt
      await updateCode(editingId.value, payload)
      message.success('更新成功')
    } else {
      // 创建：传 BatchCreateCodeDto 的字段
      const count = Number(formValue.value.count)
      if (!count || count < 1) {
        message.warning('数量至少为 1')
        return false
      }
      const payload: Record<string, any> = {
        type: formValue.value.type,
        count,
        maxUses,
      }
      if (expiresAt) payload.expiresAt = expiresAt
      if (discount) payload.discount = discount
      await batchCreateCodes(payload as any)
      message.success('创建成功')
    }
    showModal.value = false
    loadList()
  } catch (e: any) {
    message.error(e.response?.data?.message?.toString() || e.message || '操作失败')
    return false
  } finally {
    saving.value = false
  }
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

async function handleBatchDisable() {
  if (checkedRowKeys.value.length === 0) { message.warning('请先选择要禁用的激活码'); return }
  dialog.warning({
    title: '批量禁用',
    content: `确定要禁用选中的 ${checkedRowKeys.value.length} 个激活码吗？`,
    positiveText: '确认', negativeText: '取消',
    onPositiveClick: async () => {
      try { await batchDisableCodes(checkedRowKeys.value); message.success('批量禁用成功'); checkedRowKeys.value = []; loadList() }
      catch (e: any) { message.error(e.message || '批量禁用失败') }
    },
  })
}

async function handleBatchDelete() {
  if (checkedRowKeys.value.length === 0) { message.warning('请先选择要删除的激活码'); return }
  dialog.warning({
    title: '批量删除',
    content: `确定要删除选中的 ${checkedRowKeys.value.length} 个激活码吗？此操作不可恢复！`,
    positiveText: '删除', negativeText: '取消',
    onPositiveClick: async () => {
      try { await batchDeleteCodes(checkedRowKeys.value); message.success('批量删除成功'); checkedRowKeys.value = []; loadList() }
      catch (e: any) { message.error(e.message || '批量删除失败') }
    },
  })
}

const rules: FormRules = {
  type: [{ required: true, message: '请选择类型', trigger: ['blur'] }],
  maxUses: [{ type: 'number', min: 1, message: '最大使用次数至少为 1', trigger: ['blur', 'input'] }],
  status: [{ required: true, message: '请选择状态', trigger: ['blur'] }],
}

const editStatusOptions = [
  { label: '有效', value: 'active' },
  { label: '已用', value: 'used' },
  { label: '过期', value: 'expired' },
  { label: '禁用', value: 'disabled' },
]

const createTypeOptions = [
  { label: '邀请码', value: 'invitation' },
  { label: '激活码', value: 'activation' },
  { label: '优惠码', value: 'discount' },
]

const discountTypeOptions = [
  { label: '打折', value: 'percentage' },
  { label: '满减', value: 'threshold' },
  { label: '立减', value: 'fixed' },
]

const codeColumns: DataTableColumns<Code> = [
  { type: 'selection' },
  { title: 'ID', key: 'id', width: 60 },
  { title: '激活码', key: 'code', width: 210 },
  {
    title: '类型', key: 'type', width: 90,
    render: (row) => h(NTag, { size: 'small', type: typeTagMap[row.type] || 'default', bordered: false }, { default: () => typeLabelMap[row.type] || row.type }),
  },
  {
    title: '状态', key: 'status', width: 80,
    render: (row) => h(NTag, { size: 'small', type: statusTagMap[row.status] || 'default', bordered: false }, { default: () => statusLabelMap[row.status] || row.status }),
  },
  {
    title: '优惠', key: 'discount', width: 120,
    render: (row) => row.type === 'discount' ? h('span', null, renderDiscount(row.discount)) : '-',
  },
  { title: '最大次数', key: 'maxUses', width: 80 },
  { title: '已用', key: 'usedCount', width: 70 },
  {
    title: '过期时间', key: 'expiresAt', width: 160,
    render: (row) => row.expiresAt ? new Date(row.expiresAt).toLocaleString('zh-CN') : '永久',
  },
  {
    title: '操作', key: 'actions', width: 130,
    render: (row) => h(NSpace, { size: 'small' }, {
      default: () => [
        h(NButton, { size: 'small', quaternary: true, type: 'primary', onClick: () => openEdit(row) }, {
          default: () => '编辑', icon: () => h(NIcon, null, { default: () => h(CreateOutline) }),
        }),
        h(NButton, { size: 'small', quaternary: true, type: 'error', onClick: () => handleDelete(row) }, {
          default: () => '删除', icon: () => h(NIcon, null, { default: () => h(TrashOutline) }),
        }),
      ],
    }),
  },
]

// ==================== Tab 2: 使用日志 ====================
const logLoading = ref(false)
const logList = ref<CodeUsageLog[]>([])
const logTotal = ref(0)
const logPage = ref(1)
const logPageSize = ref(10)
const logKeyword = ref('')

async function loadLogs() {
  logLoading.value = true
  try {
    const res = await getAllUsageLogs({ page: logPage.value, pageSize: logPageSize.value, keyword: logKeyword.value || undefined })
    const payload = res.data
    logList.value = payload?.list || []
    logTotal.value = payload?.total || 0
  } catch {
    logList.value = []
  } finally {
    logLoading.value = false
  }
}

function handleLogPageChange(p: number) {
  logPage.value = p
  loadLogs()
}

function handleLogPageSizeChange(s: number) {
  logPageSize.value = s
  logPage.value = 1
  loadLogs()
}

function handleLogSearch() {
  logPage.value = 1
  loadLogs()
}

const logColumns: DataTableColumns<CodeUsageLog> = [
  { title: 'ID', key: 'id', width: 60 },
  {
    title: '激活码', key: 'code', width: 210,
    render: (row) => row.code?.code || `#${row.codeId}`,
  },
  {
    title: '类型', key: 'type', width: 90,
    render: (row) => {
      const t = row.code?.type
      return t ? h(NTag, { size: 'small', type: typeTagMap[t] || 'default', bordered: false }, { default: () => typeLabelMap[t] || t }) : '-'
    },
  },
  { title: '用户ID', key: 'userId', width: 80, render: (row) => row.userId ?? '匿名' },
  { title: 'IP', key: 'clientIp', width: 130, render: (row) => row.clientIp || '-' },
  {
    title: '使用时间', key: 'usedAt', width: 170,
    render: (row) => new Date(row.usedAt).toLocaleString('zh-CN'),
  },
]

function handleTabChange(tab: string) {
  activeTab.value = tab
  if (tab === 'logs') loadLogs()
}
</script>

<template>
  <div class="page-wrapper">
    <n-tabs v-model:value="activeTab" type="line" @update:value="handleTabChange">
      <!-- ===== Tab 1: 激活码列表 ===== -->
      <n-tab-pane name="codes" tab="激活码管理">
        <div style="margin-bottom: 16px">
          <n-button type="primary" @click="openCreate">
            <template #icon><n-icon><AddOutline /></n-icon></template>
            新建激活码
          </n-button>
        </div>
        <n-space class="search-bar" :size="12" align="center">
          <n-input v-model:value="searchId" placeholder="ID" clearable style="width: 100px" @keyup.enter="handleSearch" />
          <n-input v-model:value="searchKeyword" placeholder="搜索..." clearable @keyup.enter="handleSearch" />
          <n-select v-model:value="searchType" :options="typeOptions" placeholder="类型" style="width: 120px" clearable />
          <n-select v-model:value="searchStatusField" :options="statusOptions" placeholder="状态" style="width: 120px" clearable />
          <n-button type="primary" @click="handleSearch">
            <template #icon><n-icon><SearchOutline /></n-icon></template>
            搜索
          </n-button>
          <n-button @click="handleReset">
            <template #icon><n-icon><RefreshOutline /></n-icon></template>
            重置
          </n-button>
        </n-space>

        <n-space :size="8" style="margin: 12px 0">
          <n-button :disabled="checkedRowKeys.length === 0" @click="handleBatchDisable">
            <template #icon><n-icon><BanOutline /></n-icon></template>
            批量禁用
          </n-button>
          <n-button :disabled="checkedRowKeys.length === 0" type="error" @click="handleBatchDelete">
            <template #icon><n-icon><TrashOutline /></n-icon></template>
            批量删除
          </n-button>
        </n-space>

        <n-card :bordered="false" class="table-card">
          <n-data-table :columns="codeColumns" :data="list" :loading="loading" :bordered="false"
            :row-key="(row: any) => row.id" @update:checked-row-keys="(keys: any) => checkedRowKeys = keys" />
          <div class="pagination-wrap" v-if="total > 0">
            <n-pagination :page="page" :page-size="pageSize" :page-sizes="[5, 10, 20]" :item-count="total" show-size-picker @update:page="handlePageChange" @update:page-size="handlePageSizeChange" />
          </div>
        </n-card>
      </n-tab-pane>

      <!-- ===== Tab 2: 使用日志 ===== -->
      <n-tab-pane name="logs" tab="使用日志">
        <n-space class="search-bar" :size="12" align="center">
          <n-input v-model:value="logKeyword" placeholder="搜索激活码..." clearable @keyup.enter="handleLogSearch" />
          <n-button type="primary" @click="handleLogSearch">
            <template #icon><n-icon><SearchOutline /></n-icon></template>
            搜索
          </n-button>
        </n-space>
        <n-card :bordered="false" class="table-card">
          <n-data-table :columns="logColumns" :data="logList" :loading="logLoading" :bordered="false" />
          <div class="pagination-wrap" v-if="logTotal > 0">
            <n-pagination :page="logPage" :page-size="logPageSize" :page-sizes="[10, 20, 50]" :item-count="logTotal" show-size-picker @update:page="handleLogPageChange" @update:page-size="handleLogPageSizeChange" />
          </div>
        </n-card>
      </n-tab-pane>
    </n-tabs>

    <!-- ===== 新建/编辑弹窗 ===== -->
    <n-modal v-model:show="showModal" preset="dialog" :title="editingId ? '编辑激活码' : '新建激活码'"
      :positive-text="saving ? '提交中...' : '确认'" :negative-text="saving ? undefined : '取消'" :loading="saving" @positive-click="handleSave">
      <n-form ref="formRef" :model="formValue" :rules="rules" label-placement="top">
        <n-form-item label="类型" path="type">
          <n-select v-model:value="formValue.type" :options="createTypeOptions" placeholder="选择类型" :disabled="!!editingId" />
        </n-form-item>
        <n-form-item v-if="!editingId" label="数量" path="count">
          <n-input-number v-model:value="formValue.count" placeholder="生成数量" :min="1" :max="100" style="width: 100%" />
        </n-form-item>
        <n-form-item label="最大使用次数" path="maxUses">
          <n-input-number v-model:value="formValue.maxUses" placeholder="每个码可用次数" :min="0" style="width: 100%" />
        </n-form-item>

        <!-- 优惠码专属字段 -->
        <template v-if="formValue.type === 'discount'">
          <n-form-item label="优惠类型" path="discountType">
            <n-select v-model:value="formValue.discountType" :options="discountTypeOptions" placeholder="选择优惠类型" />
          </n-form-item>
          <n-form-item v-if="formValue.discountType === 'percentage'" label="折扣比例" path="discountValue">
            <n-input v-model:value="formValue.discountValue" placeholder="如 0.8 = 八折，范围 0.01~1" />
          </n-form-item>
          <n-form-item v-if="formValue.discountType === 'fixed'" label="立减金额" path="discountValue">
            <n-input v-model:value="formValue.discountValue" placeholder="减免金额" />
          </n-form-item>
          <template v-if="formValue.discountType === 'threshold'">
            <n-form-item label="满减门槛" path="discountThreshold">
              <n-input v-model:value="formValue.discountThreshold" placeholder="最低消费金额" />
            </n-form-item>
            <n-form-item label="减免金额" path="discountValue">
              <n-input v-model:value="formValue.discountValue" placeholder="减免金额" />
            </n-form-item>
          </template>
        </template>

        <n-form-item label="过期时间" path="expiresAt">
          <n-input v-model:value="formValue.expiresAt" placeholder="可选，格式如 2026-12-31 23:59:59" />
        </n-form-item>
        <n-form-item v-if="editingId" label="状态" path="status">
          <n-select v-model:value="formValue.status" :options="editStatusOptions" placeholder="选择状态" />
        </n-form-item>
      </n-form>
    </n-modal>
  </div>
</template>

<style scoped>
.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
.search-bar { margin-bottom: 12px; }
</style>
