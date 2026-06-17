<script setup lang="ts">
import { ref, h, computed, onMounted } from 'vue'
import { NButton, NDataTable, NSpace, NInput, NIcon, NModal, NForm, NFormItem, NTag, NSelect, NPagination, NInputNumber, NTabs, NTabPane, NDatePicker, NTooltip } from 'naive-ui'
import type { DataTableColumns, FormInst, FormRules, SelectOption } from 'naive-ui'
import { AddOutline, TrashOutline, CreateOutline, SearchOutline, RefreshOutline, BanOutline, PricetagOutline, PricetagsOutline, CopyOutline } from '@vicons/ionicons5'
import { getCodes, updateCode, deleteCode, batchCreateCodes, batchDisableCodes, batchDeleteCodes, getAllUsageLogs } from '../../api/code'
import type { Code, CodeUsageLog, CodeDiscount } from '../../api/code'
import { getPlans } from '../../api/plan'
import type { Plan } from '../../api/plan'
import { getResources } from '../../api/resource'
import type { Resource } from '../../api/resource'
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
  { label: '会员码', value: 'membership' },
  { label: '资源访问码', value: 'resource' },
] as unknown as SelectOption[]

const statusOptions = [
  { label: '全部', value: null },
  { label: '有效', value: 'active' },
  { label: '已用', value: 'used' },
  { label: '过期', value: 'expired' },
  { label: '禁用', value: 'disabled' },
] as unknown as SelectOption[]

type TagType = 'default' | 'info' | 'success' | 'warning' | 'error' | 'primary'
const typeTagMap: Record<string, TagType> = { invitation: 'info', activation: 'success', discount: 'warning', membership: 'error', resource: 'primary' }
const typeLabelMap: Record<string, string> = { invitation: '邀请码', activation: '激活码', discount: '优惠码', membership: '会员码', resource: '资源访问码' }
const statusTagMap: Record<string, TagType> = { active: 'success', used: 'warning', expired: 'default', disabled: 'error' }
const statusLabelMap: Record<string, string> = { active: '有效', used: '已用', expired: '过期', disabled: '禁用' }

function renderDiscount(discount: CodeDiscount | null) {
  if (!discount) return '-'
  if (discount.type === 'percentage') {
    const fold = (discount.value * 10).toFixed(1)
    return h(NTag, { size: 'small', type: 'warning', round: true, bordered: false }, {
      icon: () => h(NIcon, { size: 14 }, { default: () => h(PricetagOutline) }),
      default: () => `${fold}折`,
    })
  }
  if (discount.type === 'threshold') {
    return h(NTag, { size: 'small', type: 'info', round: true, bordered: false }, {
      icon: () => h(NIcon, { size: 14 }, { default: () => h(PricetagsOutline) }),
      default: () => `满${discount.threshold}/减${discount.value}`,
    })
  }
  return h(NTag, { size: 'small', type: 'success', round: true, bordered: false }, {
    icon: () => h(NIcon, { size: 14 }, { default: () => h(PricetagOutline) }),
    default: () => `减${discount.value}`,
  })
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
    defaultForm: () => ({ type: 'activation', count: 1, maxUses: 1, expiryPreset: '30d' as string, expiresAt: null as number | null, discountType: 'fixed', discountValue: null, discountThreshold: null, planId: null as number | null, resourceId: null as number | null }),
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
  // percentage 存的是小数，回显转为百分比
  const displayValue = d?.type === 'percentage' && d.value != null ? Math.round(d.value * 100) : d?.value ?? null
  // 回显关联套餐（仅 membership 类型）
  const meta = (row.metadata as any) || {}
  const metaPlanId = (meta.planId as number | undefined) ?? null
  const metaResourceId = (meta.resourceId as number | undefined) ?? null
  // expiresAt 字符串 → timestamp，NDatePicker 需要 number
  const expiresTs = row.expiresAt ? new Date(row.expiresAt).getTime() : null
  _openEdit(row, (r) => ({
    type: r.type,
    maxUses: r.maxUses,
    expiresAt: expiresTs,
    status: r.status,
    discountType: d?.type || 'fixed',
    discountValue: displayValue,
    discountThreshold: d?.threshold ?? null,
    planId: r.type === 'membership' ? metaPlanId : null,
    resourceId: r.type === 'resource' ? metaResourceId : null,
  }))
}

// ==================== 套餐下拉（会员码用）====================
const planList = ref<Plan[]>([])
const planOptions = computed(() => planList.value
  .filter((p) => p.isActive)
  .map((p) => ({ label: `${p.name}（${p.level}）`, value: p.id })))
const planMap = computed(() => {
  const m = new Map<number, Plan>()
  planList.value.forEach((p) => m.set(p.id, p))
  return m
})

async function loadPlans() {
  try {
    const res = await getPlans()
    const payload = res.data
    // 后端 GET /plan 直接返回数组（非分页），兼容 list 字段以防未来变更
    planList.value = Array.isArray(payload) ? payload : (payload?.list || [])
  } catch {
    planList.value = []
  }
}

// ==================== 资源下拉（资源访问码用）====================
const resourceList = ref<Resource[]>([])
const resourceOptions = computed(() => resourceList.value.map((r) => ({ label: `#${r.id} ${r.title}`, value: r.id })))
const resourceMap = computed(() => {
  const m = new Map<number, Resource>()
  resourceList.value.forEach((r) => m.set(r.id, r))
  return m
})

async function loadResources() {
  try {
    const res = await getResources({ page: 1, pageSize: 200 })
    resourceList.value = res.data?.list || []
  } catch {
    resourceList.value = []
  }
}

/** 复制资源 ID 到剪贴板 */
async function copyResourceId(id: number) {
  try {
    await navigator.clipboard.writeText(String(id))
    message.success(`已复制资源 ID：${id}`)
  } catch {
    message.error('复制失败，请手动选择复制')
  }
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

/** 校验 discount 字段，不通过返回 false */
function validateDiscount(): boolean {
  if (formValue.value.type !== 'discount') return true
  const dtype = formValue.value.discountType as 'percentage' | 'threshold' | 'fixed'
  const val = Number(formValue.value.discountValue)
  const thr = Number(formValue.value.discountThreshold)

  if (!val || val <= 0) {
    message.warning('优惠金额/比例必须为正数')
    return false
  }
  // percentage 输入的是百分比（0~100），100=原价
  if (dtype === 'percentage' && val >= 100) {
    message.warning('折扣不能等于或超过原价（输入 80 = 八折）')
    return false
  }
  if (dtype === 'threshold') {
    if (!thr || thr <= 0) {
      message.warning('满减门槛必须为正数')
      return false
    }
    if (val >= thr) {
      message.warning('减免金额不能大于等于满减门槛')
      return false
    }
  }
  return true
}

/** 构造 discount 对象（调用前确保 validateDiscount 通过） */
function buildDiscountPayload(): CodeDiscount | undefined {
  if (formValue.value.type !== 'discount') return undefined
  const dtype = formValue.value.discountType as 'percentage' | 'threshold' | 'fixed'
  const rawVal = Number(formValue.value.discountValue)
  const thr = Number(formValue.value.discountThreshold)
  // percentage: 用户输入百分比（80 = 八折），转为小数 0.8 存库
  const value = dtype === 'percentage' ? rawVal / 100 : rawVal
  const payload: CodeDiscount = { type: dtype, value }
  if (dtype === 'threshold') payload.threshold = thr
  return payload
}

async function handleSave() {
  try {
    await formRef.value?.validate()
  } catch {
    return false
  }
  // 前端校验 discount，不通过直接拦截不发请求
  if (!validateDiscount()) return false
  // 会员码必须选套餐
  if (formValue.value.type === 'membership' && !formValue.value.planId) {
    message.warning('会员码必须关联一个套餐')
    return false
  }
  // 资源访问码必须选资源（仅创建时校验，编辑时 type 不可改）
  if (!editingId.value && formValue.value.type === 'resource' && !formValue.value.resourceId) {
    message.warning('资源访问码必须关联一个资源')
    return false
  }

  saving.value = true
  try {
    const discount = buildDiscountPayload()
    // 编辑模式：expiresAt 是 timestamp；创建模式：根据 preset 计算
    let expiresAt: string | undefined
    if (editingId.value) {
      expiresAt = formValue.value.expiresAt ? new Date(formValue.value.expiresAt).toISOString() : undefined
    } else {
      const preset = formValue.value.expiryPreset as string | undefined
      if (preset && preset !== 'permanent') {
        const days = parseInt(preset, 10)
        if (days > 0) expiresAt = new Date(Date.now() + days * 86400000).toISOString()
      }
    }
    const maxUses = Number(formValue.value.maxUses) || 1
    // 构造 metadata：会员码带 planId，资源访问码带 resourceId
    let metadata: Record<string, unknown> | undefined
    if (formValue.value.type === 'membership' && formValue.value.planId) {
      metadata = { planId: Number(formValue.value.planId) }
    } else if (formValue.value.type === 'resource' && formValue.value.resourceId) {
      metadata = { resourceId: Number(formValue.value.resourceId) }
    }

    if (editingId.value) {
      // 更新：只传 UpdateCodeDto 允许的字段
      const payload: Record<string, any> = {}
      if (formValue.value.status) payload.status = formValue.value.status
      if (discount) payload.discount = discount
      if (expiresAt) payload.expiresAt = expiresAt
      if (metadata) payload.metadata = metadata
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
      if (metadata) payload.metadata = metadata
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
  const d = dialog.warning({
    title: '批量禁用',
    content: `确定要禁用选中的 ${checkedRowKeys.value.length} 个激活码吗？`,
    positiveText: '确认', negativeText: '取消',
    onPositiveClick: async () => {
      d.loading = true
      try { await batchDisableCodes(checkedRowKeys.value); message.success('批量禁用成功'); checkedRowKeys.value = []; loadList() }
      catch (e: any) { message.error(e.message || '批量禁用失败'); return false }
    },
  })
}

async function handleBatchDelete() {
  if (checkedRowKeys.value.length === 0) { message.warning('请先选择要删除的激活码'); return }
  const d = dialog.warning({
    title: '批量删除',
    content: `确定要删除选中的 ${checkedRowKeys.value.length} 个激活码吗？此操作不可恢复！`,
    positiveText: '删除', negativeText: '取消',
    onPositiveClick: async () => {
      d.loading = true
      try { await batchDeleteCodes(checkedRowKeys.value); message.success('批量删除成功'); checkedRowKeys.value = []; loadList() }
      catch (e: any) { message.error(e.message || '批量删除失败'); return false }
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
  { label: '会员码', value: 'membership' },
  { label: '资源访问码', value: 'resource' },
]

const discountTypeOptions = [
  { label: '打折', value: 'percentage' },
  { label: '满减', value: 'threshold' },
  { label: '立减', value: 'fixed' },
]

// 创建时的有效期预设：值 = 天数（'permanent' 表示永久）
const expiryPresetOptions = [
  { label: '7 天', value: '7d' },
  { label: '30 天（1 个月）', value: '30d' },
  { label: '90 天（3 个月）', value: '90d' },
  { label: '180 天（半年）', value: '180d' },
  { label: '365 天（1 年）', value: '365d' },
  { label: '永久（不过期）', value: 'permanent' },
]

// 会员码开通时长预设：覆盖套餐默认时长（'default' = 用套餐 durationDays）
const codeColumns: DataTableColumns<Code> = [
  { type: 'selection', width: 40 },
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
  {
    title: '关联', key: 'metadata', width: 180, ellipsis: { tooltip: true },
    render: (row) => {
      if (row.type === 'membership') {
        const pid = row.metadata?.planId as number | undefined
        if (!pid) return '-'
        const p = planMap.value.get(pid)
        return p ? h(NTag, { size: 'small', type: 'error', bordered: false }, { default: () => p.name }) : `套餐#${pid}`
      }
      if (row.type === 'resource') {
        const rid = row.metadata?.resourceId as number | undefined
        if (!rid) return '-'
        const r = resourceMap.value.get(rid)
        // 资源名可能很长：Tag 内省略，hover tooltip 显示完整，附带可复制 ID 的按钮
        const label = r ? `#${rid} ${r.title}` : `资源#${rid}`
        const tooltipContent = r ? `#${rid} ${r.title}` : `资源 #${rid}`
        return h(NSpace, { size: 4, align: 'center', wrap: false, style: 'min-width:0' }, {
          default: () => [
            h(NTooltip, { placement: 'top' }, {
              trigger: () => h(NTag, {
                size: 'small', type: 'primary', bordered: false,
                style: 'max-width:130px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap',
              }, { default: () => label }),
              default: () => tooltipContent,
            }),
            h(NButton, {
              size: 'tiny', quaternary: true, type: 'primary',
              title: '复制资源 ID',
              onClick: () => copyResourceId(rid),
            }, { icon: () => h(NIcon, { size: 13 }, { default: () => h(CopyOutline) }) }),
          ],
        })
      }
      return '-'
    },
  },
  {
    title: '会员时长', key: 'duration', width: 110,
    render: (row) => {
      if (row.type !== 'membership') return '-'
      const pid = row.metadata?.planId as number | undefined
      if (!pid) return '-'
      const plan = planMap.value.get(pid)
      if (!plan) return '-'
      const days = plan.durationDays
      if (days === 0) return h(NTag, { size: 'small', type: 'error', bordered: false }, { default: () => '终身' })
      return h(NTag, { size: 'small', type: 'success', bordered: false }, { default: () => `${days} 天` })
    },
  },
  { title: '最大次数', key: 'maxUses', width: 80 },
  { title: '已用', key: 'usedCount', width: 70 },
  {
    title: '过期时间', key: 'expiresAt', width: 160,
    render: (row) => row.expiresAt ? new Date(row.expiresAt).toLocaleString('zh-CN') : '永久',
  },
  {
    title: '操作', key: 'actions', width: 160, fixed: 'right',
    render: (row) => h(NSpace, { size: 'small', wrap: false }, {
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
  } catch (e: any) {
    message.error(e?.message || '加载使用日志失败')
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

onMounted(() => {
  loadPlans()
  loadResources()
})
</script>

<template>
  <div class="page-wrapper">
    <n-tabs v-model:value="activeTab" type="line" @update:value="handleTabChange">
      <!-- ===== Tab 1: 激活码列表 ===== -->
      <n-tab-pane name="codes" tab="激活码管理">
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
          <n-button type="primary" @click="openCreate">
            <template #icon><n-icon><AddOutline /></n-icon></template>
            新建
          </n-button>
          <n-button :disabled="checkedRowKeys.length === 0" @click="handleBatchDisable">
            <template #icon><n-icon><BanOutline /></n-icon></template>
            批量禁用
          </n-button>
          <n-button :disabled="checkedRowKeys.length === 0" type="error" @click="handleBatchDelete">
            <template #icon><n-icon><TrashOutline /></n-icon></template>
            批量删除
          </n-button>
        </n-space>

        <div class="table-section">
          <n-data-table :columns="codeColumns" :data="list" :loading="loading" :bordered="false"
        :scroll-x="1360"
            :row-key="(row: any) => row.id" @update:checked-row-keys="(keys: any) => checkedRowKeys = keys" />
          <div class="pagination-wrap" v-if="total > 0">
            <n-pagination :page="page" :page-size="pageSize" :page-sizes="[5, 10, 20]" :item-count="total" show-size-picker @update:page="handlePageChange" @update:page-size="handlePageSizeChange" />
          </div>
        </div>
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
        <div class="table-section">
          <n-data-table :columns="logColumns" :data="logList" :loading="logLoading" :bordered="false" :scroll-x="780" />
          <div class="pagination-wrap" v-if="logTotal > 0">
            <n-pagination :page="logPage" :page-size="logPageSize" :page-sizes="[10, 20, 50]" :item-count="logTotal" show-size-picker @update:page="handleLogPageChange" @update:page-size="handleLogPageSizeChange" />
          </div>
        </div>
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
          <n-form-item v-if="formValue.discountType === 'percentage'" label="折扣（输入 80 = 八折）" path="discountValue">
            <n-input-number v-model:value="formValue.discountValue" placeholder="输入 80 = 八折" :min="1" :max="99" :step="1" style="width: 100%">
              <template #suffix>%</template>
            </n-input-number>
          </n-form-item>
          <n-form-item v-if="formValue.discountType === 'fixed'" label="立减金额" path="discountValue">
            <n-input-number v-model:value="formValue.discountValue" placeholder="减免金额" :min="0.01" :step="1" :precision="2" style="width: 100%" />
          </n-form-item>
          <template v-if="formValue.discountType === 'threshold'">
            <n-form-item label="满减门槛" path="discountThreshold">
              <n-input-number v-model:value="formValue.discountThreshold" placeholder="最低消费金额" :min="0.01" :step="1" :precision="2" style="width: 100%" />
            </n-form-item>
            <n-form-item label="减免金额" path="discountValue">
              <n-input-number v-model:value="formValue.discountValue" placeholder="减免金额（必须小于门槛）" :min="0.01" :step="1" :precision="2" style="width: 100%" />
            </n-form-item>
          </template>
        </template>

        <!-- 会员码专属字段 -->
        <template v-if="formValue.type === 'membership'">
          <n-form-item label="关联套餐" path="planId">
            <n-select v-model:value="formValue.planId" :options="planOptions" placeholder="选择要开通的套餐" filterable />
          </n-form-item>
        </template>

        <!-- 资源访问码专属字段 -->
        <template v-if="formValue.type === 'resource'">
          <n-form-item label="关联资源" path="resourceId">
            <n-select v-model:value="formValue.resourceId" :options="resourceOptions" placeholder="选择可解锁的资源" filterable />
          </n-form-item>
        </template>

        <!-- 创建模式：预设有效期 -->
        <n-form-item v-if="!editingId" label="有效期" path="expiryPreset">
          <n-select v-model:value="formValue.expiryPreset" :options="expiryPresetOptions" placeholder="选择有效期" />
        </n-form-item>
        <!-- 编辑模式：精确日期 -->
        <n-form-item v-else label="过期时间" path="expiresAt">
          <n-date-picker
            v-model:value="formValue.expiresAt"
            type="datetime"
            clearable
            placeholder="留空 = 永不过期"
            style="width: 100%"
          />
        </n-form-item>
        <n-form-item v-if="editingId" label="状态" path="status">
          <n-select v-model:value="formValue.status" :options="editStatusOptions" placeholder="选择状态" />
        </n-form-item>
      </n-form>
    </n-modal>
  </div>
</template>

<style scoped>
</style>
