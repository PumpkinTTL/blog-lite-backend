<script setup lang="ts">
import { ref, h, onMounted, computed } from 'vue'
import {
  NButton, NDataTable, NSpace, NInput, NIcon, NModal, NForm, NFormItem,
  NSelect, NPagination, NInputNumber, NSwitch, NTabs, NTabPane, NTag,
  useMessage, useDialog,
} from 'naive-ui'
import type { DataTableColumns, FormInst, FormRules, SelectOption } from 'naive-ui'
import { AddOutline, TrashOutline, CreateOutline, SearchOutline, RefreshOutline, GiftOutline, BanOutline } from '@vicons/ionicons5'
import {
  getPlans, createPlan, updatePlan, deletePlan, batchDeletePlans,
} from '../../api/plan'
import type { Plan, PlanLevel } from '../../api/plan'
import {
  getMemberships, grantMembership, updateMembership, deleteMembership, batchDeleteMemberships,
} from '../../api/membership'
import type { Membership, MembershipStatus, MembershipSource } from '../../api/membership'
import { getUsers } from '../../api/user'

const message = useMessage()
const dialog = useDialog()

// ==================== Tab ====================
const activeTab = ref('plans')

// ==================== Tab 1: 套餐管理 ====================
const planLoading = ref(false)
const plans = ref<Plan[]>([])
const planCheckedRowKeys = ref<number[]>([])
const planModalShow = ref(false)
const planEditingId = ref<number | null>(null)
const planSaving = ref(false)
const planFormRef = ref<FormInst | null>(null)
const planForm = ref({
  name: '',
  slug: '',
  level: 'plus' as PlanLevel,
  durationDays: 30,
  priceCents: 0,  // 表单存元，保存时 ×100
  benefits: [] as string[],
  benefitsInput: '', // 输入框临时值
  description: '',
  isActive: true,
  sort: 0,
})

const levelOptions = [
  { label: 'Plus（基础）', value: 'plus' },
  { label: 'Pro（专业）', value: 'pro' },
  { label: 'Max（旗舰）', value: 'max' },
]

const levelTagType: Record<PlanLevel, 'info' | 'success' | 'warning'> = {
  plus: 'info',
  pro: 'success',
  max: 'warning',
}
const levelLabel: Record<PlanLevel, string> = {
  plus: 'Plus',
  pro: 'Pro',
  max: 'Max',
}

const planRules: FormRules = {
  name: [{ required: true, message: '请输入套餐名称', trigger: ['input', 'blur'] }],
  slug: [
    { required: true, message: '请输入 slug', trigger: ['input', 'blur'] },
    { pattern: /^[a-z0-9_]+$/, message: '只能包含小写字母、数字、下划线', trigger: ['input', 'blur'] },
  ],
  level: [{ required: true, message: '请选择等级', trigger: ['change', 'blur'] }],
}

async function loadPlans() {
  planLoading.value = true
  try {
    const res = await getPlans()
    plans.value = (res.data as Plan[]) || []
  } catch (e: any) {
    message.error(e.message || '加载套餐失败')
  } finally {
    planLoading.value = false
  }
}

function openPlanCreate() {
  planEditingId.value = null
  planForm.value = {
    name: '', slug: '', level: 'plus', durationDays: 30, priceCents: 0,
    benefits: [], benefitsInput: '', description: '', isActive: true, sort: 0,
  }
  planModalShow.value = true
}

function openPlanEdit(plan: Plan) {
  planEditingId.value = plan.id
  planForm.value = {
    name: plan.name,
    slug: plan.slug,
    level: plan.level,
    durationDays: plan.durationDays,
    priceCents: plan.priceCents / 100,  // DB存分 → 表单显示元
    benefits: plan.benefits ?? [],
    benefitsInput: '',
    description: plan.description ?? '',
    isActive: plan.isActive,
    sort: plan.sort,
  }
  planModalShow.value = true
}

// 添加权益项
function addBenefit() {
  const v = planForm.value.benefitsInput.trim()
  if (!v) return
  if (planForm.value.benefits.includes(v)) {
    message.warning('权益已存在')
    return
  }
  planForm.value.benefits.push(v)
  planForm.value.benefitsInput = ''
}

function removeBenefit(idx: number) {
  planForm.value.benefits.splice(idx, 1)
}

async function handlePlanSave() {
  try {
    await planFormRef.value?.validate()
  } catch {
    return false
  }
  planSaving.value = true
  try {
    const payload = {
      name: planForm.value.name,
      slug: planForm.value.slug,
      level: planForm.value.level,
      durationDays: planForm.value.durationDays,
      priceCents: Math.round(planForm.value.priceCents * 100),  // 元转分
      benefits: planForm.value.benefits.length ? planForm.value.benefits : undefined,
      description: planForm.value.description || undefined,
      isActive: planForm.value.isActive,
      sort: planForm.value.sort,
    }
    if (planEditingId.value) {
      // 编辑时不传 slug（不允许修改）
      const { slug: _slug, ...updatePayload } = payload
      await updatePlan(planEditingId.value, updatePayload)
      message.success('更新成功')
    } else {
      await createPlan(payload)
      message.success('创建成功')
    }
    planModalShow.value = false
    loadPlans()
  } catch (e: any) {
    message.error(e.message || '操作失败')
    return false
  } finally {
    planSaving.value = false
  }
}

function handlePlanDelete(plan: Plan) {
  const d = dialog.warning({
    title: '确认删除',
    content: `确定删除套餐「${plan.name}」？已开通此套餐的用户订阅不受影响。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      d.loading = true
      try {
        await deletePlan(plan.id)
        message.success('删除成功')
        loadPlans()
      } catch (e: any) {
        message.error(e.message || '删除失败')
        return false
      }
    },
  })
}

function handlePlanBatchDelete() {
  if (planCheckedRowKeys.value.length === 0) {
    message.warning('请先选择要删除的套餐')
    return
  }
  const d = dialog.warning({
    title: '批量删除',
    content: `确定删除选中的 ${planCheckedRowKeys.value.length} 个套餐?此操作不可恢复!`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      d.loading = true
      try {
        await batchDeletePlans(planCheckedRowKeys.value)
        message.success('批量删除成功')
        planCheckedRowKeys.value = []
        loadPlans()
      } catch (e: any) {
        message.error(e?.message || '批量删除失败')
        return false
      }
    },
  })
}

const planColumns: DataTableColumns<Plan> = [
  { type: 'selection', width: 40 },
  { title: 'ID', key: 'id', width: 60 },
  { title: '名称', key: 'name', width: 160, ellipsis: { tooltip: true } },
  { title: 'Slug', key: 'slug', width: 140, ellipsis: { tooltip: true } },
  {
    title: '等级', key: 'level', width: 90,
    render: (row) => h(NTag, { size: 'small', type: levelTagType[row.level], bordered: false }, { default: () => levelLabel[row.level] }),
  },
  {
    title: '时长', key: 'durationDays', width: 90,
    render: (row) => (row.durationDays === 0 ? '终身' : `${row.durationDays} 天`),
  },
  {
    title: '价格', key: 'priceCents', width: 90,
    render: (row) => (row.priceCents === 0 ? '-' : `¥${(row.priceCents / 100).toFixed(2)}`),
  },
  {
    title: '权益', key: 'benefits', width: 220, ellipsis: { tooltip: true },
    render: (row) => {
      const arr = row.benefits ?? []
      if (!arr.length) return '-'
      return h(NSpace, { size: 4 }, { default: () => arr.map((b) => h(NTag, { size: 'small', bordered: false }, { default: () => b })) })
    },
  },
  {
    title: '上架', key: 'isActive', width: 70,
    render: (row) => h(NTag, { size: 'small', type: row.isActive ? 'success' : 'default', bordered: false }, { default: () => row.isActive ? '上架' : '下架' }),
  },
  { title: '排序', key: 'sort', width: 60 },
  { title: '创建时间', key: 'createdAt', width: 180, render: (row) => new Date(row.createdAt).toLocaleString('zh-CN') },
  {
    title: '操作', key: 'actions', width: 160, fixed: 'right',
    render: (row) => h(NSpace, { size: 'small', wrap: false }, {
      default: () => [
        h(NButton, { size: 'small', quaternary: true, type: 'primary', onClick: () => openPlanEdit(row) }, {
          default: () => '编辑',
          icon: () => h(NIcon, null, { default: () => h(CreateOutline) }),
        }),
        h(NButton, { size: 'small', quaternary: true, type: 'error', onClick: () => handlePlanDelete(row) }, {
          default: () => '删除',
          icon: () => h(NIcon, null, { default: () => h(TrashOutline) }),
        }),
      ],
    }),
  },
]

// ==================== Tab 2: 会员记录 ====================
const memberLoading = ref(false)
const members = ref<Membership[]>([])
const memberTotal = ref(0)
const memberPage = ref(1)
const memberPageSize = ref(10)
const memberSearchStatus = ref<MembershipStatus | null>(null)
const memberSearchSource = ref<MembershipSource | null>(null)
const memberSearchUserId = ref<string>('')
const memberCheckedRowKeys = ref<number[]>([])

// Grant 弹窗
const grantModalShow = ref(false)
const grantSaving = ref(false)
const grantForm = ref<{ userId: number | null; planId: number | null; days: number | null; note: string }>({
  userId: null, planId: null, days: null, note: '',
})
const userOptions = ref<{ label: string; value: number }[]>([])

// 跟随选中套餐自动同步默认天数（仅当用户没手动改过、且 days 为 null 时）
const selectedPlan = computed(() => plans.value.find((p) => p.id === grantForm.value.planId) || null)
const grantDaysPlaceholder = computed(() => {
  const p = selectedPlan.value
  if (!p) return '请先选套餐'
  return p.durationDays === 0 ? '套餐为终身（留空=终身）' : `套餐默认 ${p.durationDays} 天`
})
const grantDaysPreview = computed(() => {
  const days = grantForm.value.days
  if (days === 0) return '终身有效'
  if (days && days > 0) return `${days} 天`
  const p = selectedPlan.value
  if (!p) return '-'
  return p.durationDays === 0 ? '终身有效' : `${p.durationDays} 天（套餐默认）`
})

// 用户改 planId 时把 days 重置为"用套餐默认"（null）
function handleGrantPlanChange() {
  grantForm.value.days = null
}

const memberStatusTagType: Record<MembershipStatus, 'success' | 'default' | 'warning'> = {
  active: 'success',
  expired: 'default',
  cancelled: 'warning',
}
const memberStatusLabel: Record<MembershipStatus, string> = {
  active: '生效中',
  expired: '已过期',
  cancelled: '已取消',
}
const memberSourceLabel: Record<MembershipSource, string> = {
  admin: '手动开通',
  code: '兑换码',
  payment: '支付',
}

const statusFilterOptions = [
  { label: '全部', value: null },
  { label: '生效中', value: 'active' },
  { label: '已过期', value: 'expired' },
  { label: '已取消', value: 'cancelled' },
] as unknown as SelectOption[]
const sourceFilterOptions = [
  { label: '全部', value: null },
  { label: '手动开通', value: 'admin' },
  { label: '兑换码', value: 'code' },
  { label: '支付', value: 'payment' },
] as unknown as SelectOption[]

async function loadMembers() {
  memberLoading.value = true
  try {
    const params: any = { page: memberPage.value, pageSize: memberPageSize.value }
    if (memberSearchStatus.value) params.status = memberSearchStatus.value
    if (memberSearchSource.value) params.source = memberSearchSource.value
    if (memberSearchUserId.value) params.userId = memberSearchUserId.value
    const res = await getMemberships(params)
    const payload = res.data
    if (payload?.list) {
      members.value = payload.list
      memberTotal.value = payload.total
    } else if (Array.isArray(payload)) {
      members.value = payload
      memberTotal.value = payload.length
    }
  } catch (e: any) {
    message.error(e.message || '加载会员记录失败')
  } finally {
    memberLoading.value = false
  }
}

async function loadUserOptions() {
  try {
    const res = await getUsers({ pageSize: 100 })
    const payload = res.data
    const list = Array.isArray(payload) ? payload : (payload?.list || [])
    userOptions.value = list.map((u: any) => ({ label: `${u.nickname}（${u.username}）`, value: u.id }))
  } catch (e: any) {
    message.error(e?.message || '加载用户选项失败')
  }
}

function openGrant() {
  grantForm.value = { userId: null, planId: null, days: null, note: '' }
  grantModalShow.value = true
}

async function handleGrant() {
  if (!grantForm.value.userId || !grantForm.value.planId) {
    message.warning('请选择用户和套餐')
    return false
  }
  if (grantForm.value.days !== null && grantForm.value.days < 0) {
    message.warning('天数不能为负数（0=终身）')
    return false
  }
  grantSaving.value = true
  try {
    await grantMembership({
      userId: grantForm.value.userId,
      planId: grantForm.value.planId,
      ...(grantForm.value.days !== null ? { days: grantForm.value.days } : {}),
      source: 'admin',
      note: grantForm.value.note || undefined,
    })
    message.success('开通成功')
    grantModalShow.value = false
    loadMembers()
  } catch (e: any) {
    message.error(e.message || '开通失败')
    return false
  } finally {
    grantSaving.value = false
  }
}

function handleMemberCancel(row: Membership) {
  const d = dialog.warning({
    title: '确认取消',
    content: `确定取消「${row.user?.nickname || row.userId}」的「${row.plan?.name || row.planId}」订阅？`,
    positiveText: '取消订阅',
    negativeText: '保留',
    onPositiveClick: async () => {
      d.loading = true
      try {
        await updateMembership(row.id, { status: 'cancelled' })
        message.success('已取消')
        loadMembers()
      } catch (e: any) {
        message.error(e.message || '操作失败')
        return false
      }
    },
  })
}

function handleMemberDelete(row: Membership) {
  const d = dialog.warning({
    title: '确认删除',
    content: `确定删除会员记录 #${row.id}？此操作不可恢复。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      d.loading = true
      try {
        await deleteMembership(row.id)
        message.success('删除成功')
        loadMembers()
      } catch (e: any) {
        message.error(e.message || '删除失败')
        return false
      }
    },
  })
}

function handleMemberBatchDelete() {
  if (memberCheckedRowKeys.value.length === 0) {
    message.warning('请先选择要删除的会员记录')
    return
  }
  const d = dialog.warning({
    title: '批量删除',
    content: `确定删除选中的 ${memberCheckedRowKeys.value.length} 条会员记录?此操作不可恢复!`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      d.loading = true
      try {
        await batchDeleteMemberships(memberCheckedRowKeys.value)
        message.success('批量删除成功')
        memberCheckedRowKeys.value = []
        loadMembers()
      } catch (e: any) {
        message.error(e?.message || '批量删除失败')
        return false
      }
    },
  })
}

function handleMemberSearch() {
  memberPage.value = 1
  loadMembers()
}

function handleMemberReset() {
  memberSearchStatus.value = null
  memberSearchSource.value = null
  memberSearchUserId.value = ''
  memberPage.value = 1
  loadMembers()
}

function handleMemberPageChange(p: number) {
  memberPage.value = p
  loadMembers()
}
function handleMemberPageSizeChange(s: number) {
  memberPageSize.value = s
  memberPage.value = 1
  loadMembers()
}

const memberColumns: DataTableColumns<Membership> = [
  { type: 'selection', width: 40 },
  { title: 'ID', key: 'id', width: 60 },
  {
    title: '用户', key: 'userId', width: 140,
    render: (row) => row.user?.nickname || row.user?.username || `#${row.userId}`,
  },
  {
    title: '套餐', key: 'planId', width: 140, ellipsis: { tooltip: true },
    render: (row) => {
      const p = row.plan
      if (!p) return `#${row.planId}`
      return h('span', null, `${p.name}`)
    },
  },
  {
    title: '等级', key: 'level', width: 80,
    render: (row) => {
      const lvl = row.plan?.level
      return lvl ? h(NTag, { size: 'small', type: levelTagType[lvl], bordered: false }, { default: () => levelLabel[lvl] }) : '-'
    },
  },
  {
    title: '开始时间', key: 'startedAt', width: 180,
    render: (row) => new Date(row.startedAt).toLocaleString('zh-CN'),
  },
  {
    title: '到期时间', key: 'expiresAt', width: 180,
    render: (row) => row.expiresAt ? new Date(row.expiresAt).toLocaleString('zh-CN') : '终身',
  },
  {
    title: '状态', key: 'status', width: 90,
    render: (row) => h(NTag, { size: 'small', type: memberStatusTagType[row.status], bordered: false }, { default: () => memberStatusLabel[row.status] }),
  },
  {
    title: '来源', key: 'source', width: 90,
    render: (row) => memberSourceLabel[row.source],
  },
  { title: '备注', key: 'note', minWidth: 120, ellipsis: { tooltip: true }, render: (row) => row.note || '-' },
  {
    title: '操作', key: 'actions', width: 170, fixed: 'right',
    render: (row) => h(NSpace, { size: 'small', wrap: false }, {
      default: () => [
        row.status === 'active'
          ? h(NButton, { size: 'small', quaternary: true, type: 'warning', onClick: () => handleMemberCancel(row) }, {
              default: () => '取消',
              icon: () => h(NIcon, null, { default: () => h(BanOutline) }),
            })
          : null,
        h(NButton, { size: 'small', quaternary: true, type: 'error', onClick: () => handleMemberDelete(row) }, {
          default: () => '删除',
          icon: () => h(NIcon, null, { default: () => h(TrashOutline) }),
        }),
      ],
    }),
  },
]

// 套餐下拉（用于开通弹窗）
const planOptions = computed(() => plans.value
  .filter((p) => p.isActive)
  .map((p) => ({ label: `${p.name}（${levelLabel[p.level]}）`, value: p.id })))

onMounted(() => {
  loadPlans()
  loadMembers()
  loadUserOptions()
})
</script>

<template>
  <div class="page-wrapper">
    <n-tabs v-model:value="activeTab" type="line" animated>
      <!-- ============ Tab 1: 套餐管理 ============ -->
      <n-tab-pane name="plans" tab="套餐管理">
        <div class="page-header">
          <h2 class="page-title">套餐管理</h2>
          <n-space :size="8" align="center">
            <n-button :disabled="planCheckedRowKeys.length === 0" type="error" @click="handlePlanBatchDelete">
              <template #icon><n-icon><TrashOutline /></n-icon></template>
              批量删除
            </n-button>
            <n-button type="primary" @click="openPlanCreate">
              <template #icon><n-icon><AddOutline /></n-icon></template>
              新建套餐
            </n-button>
          </n-space>
        </div>
        <div class="table-section">
          <n-data-table
            :columns="planColumns"
            :data="plans"
            :loading="planLoading"
            :bordered="false"
            :scroll-x="1360"
            :row-key="(row: Plan) => row.id"
            @update:checked-row-keys="(keys: any) => planCheckedRowKeys = keys"
          />
        </div>
      </n-tab-pane>

      <!-- ============ Tab 2: 会员记录 ============ -->
      <n-tab-pane name="memberships" tab="会员记录">
        <div class="page-header">
          <h2 class="page-title">会员记录</h2>
          <n-space :size="8" align="center">
            <n-button :disabled="memberCheckedRowKeys.length === 0" type="error" @click="handleMemberBatchDelete">
              <template #icon><n-icon><TrashOutline /></n-icon></template>
              批量删除
            </n-button>
            <n-button type="primary" @click="openGrant">
              <template #icon><n-icon><GiftOutline /></n-icon></template>
              手动开通
            </n-button>
          </n-space>
        </div>

        <n-space class="search-bar" :size="12" align="center">
          <n-input v-model:value="memberSearchUserId" placeholder="用户ID" clearable style="width: 120px" @keyup.enter="handleMemberSearch" />
          <n-select v-model:value="memberSearchStatus" :options="statusFilterOptions" placeholder="状态" style="width: 120px" clearable />
          <n-select v-model:value="memberSearchSource" :options="sourceFilterOptions" placeholder="来源" style="width: 120px" clearable />
          <n-button type="primary" @click="handleMemberSearch">
            <template #icon><n-icon><SearchOutline /></n-icon></template>
            搜索
          </n-button>
          <n-button @click="handleMemberReset">
            <template #icon><n-icon><RefreshOutline /></n-icon></template>
            重置
          </n-button>
        </n-space>

        <div class="table-section">
          <n-data-table
            :columns="memberColumns"
            :data="members"
            :loading="memberLoading"
            :bordered="false"
            :scroll-x="1380"
            :row-key="(row: Membership) => row.id"
            @update:checked-row-keys="(keys: any) => memberCheckedRowKeys = keys"
          />
          <div class="pagination-wrap" v-if="memberTotal > 0">
            <n-pagination
              :page="memberPage"
              :page-size="memberPageSize"
              :page-sizes="[10, 20, 50]"
              :item-count="memberTotal"
              show-size-picker
              @update:page="handleMemberPageChange"
              @update:page-size="handleMemberPageSizeChange"
            />
          </div>
        </div>
      </n-tab-pane>
    </n-tabs>

    <!-- ============ 套餐编辑弹窗 ============ -->
    <n-modal
      v-model:show="planModalShow"
      preset="dialog"
      :title="planEditingId ? '编辑套餐' : '新建套餐'"
      :positive-text="planSaving ? '提交中...' : '确认'"
      :negative-text="planSaving ? undefined : '取消'"
      :loading="planSaving"
      @positive-click="handlePlanSave"
      style="width: 600px;"
    >
      <n-form ref="planFormRef" :model="planForm" :rules="planRules" label-placement="top">
        <n-form-item label="套餐名称" path="name">
          <n-input v-model:value="planForm.name" placeholder="如：专业版月付" />
        </n-form-item>
        <n-form-item label="Slug" path="slug">
          <n-input v-model:value="planForm.slug" :disabled="!!planEditingId" placeholder="pro_monthly（创建后不可修改）" />
        </n-form-item>
        <n-form-item label="权益等级" path="level">
          <n-select v-model:value="planForm.level" :options="levelOptions" />
        </n-form-item>
        <n-space :size="12">
          <n-form-item label="有效期（天，0=终身）" path="durationDays">
            <n-input-number v-model:value="planForm.durationDays" :min="0" :step="1" style="width: 180px;" />
          </n-form-item>
          <n-form-item label="价格（元）" path="priceCents">
            <n-input-number v-model:value="planForm.priceCents" :min="0" :step="1" :precision="2" style="width: 180px;" />
          </n-form-item>
        </n-space>
        <n-form-item label="权益列表">
          <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
            <n-space :size="4">
              <n-tag v-for="(b, idx) in planForm.benefits" :key="idx" closable size="small" @close="removeBenefit(idx)">{{ b }}</n-tag>
            </n-space>
            <n-input v-model:value="planForm.benefitsInput" placeholder="输入权益文字后按回车添加" @keyup.enter="addBenefit" />
          </div>
        </n-form-item>
        <n-form-item label="描述">
          <n-input v-model:value="planForm.description" type="textarea" :rows="2" placeholder="可选" />
        </n-form-item>
        <n-space :size="12">
          <n-form-item label="排序（升序）">
            <n-input-number v-model:value="planForm.sort" :min="0" style="width: 180px;" />
          </n-form-item>
          <n-form-item label="上架">
            <n-switch v-model:value="planForm.isActive" />
          </n-form-item>
        </n-space>
      </n-form>
    </n-modal>

    <!-- ============ 手动开通弹窗 ============ -->
    <n-modal
      v-model:show="grantModalShow"
      preset="dialog"
      title="手动开通会员"
      :positive-text="grantSaving ? '提交中...' : '开通'"
      :negative-text="grantSaving ? undefined : '取消'"
      :loading="grantSaving"
      @positive-click="handleGrant"
      style="width: 500px;"
    >
      <n-form label-placement="top">
        <n-form-item label="选择用户" required>
          <n-select
            v-model:value="grantForm.userId"
            :options="userOptions"
            filterable
            placeholder="搜索用户名/昵称"
          />
        </n-form-item>
        <n-form-item label="选择套餐" required>
          <n-select
            v-model:value="grantForm.planId"
            :options="planOptions"
            placeholder="仅显示已上架套餐"
            @update:value="handleGrantPlanChange"
          />
        </n-form-item>
        <n-form-item label="开通时长（天，留空用套餐默认）">
          <n-input-number
            v-model:value="grantForm.days"
            :min="0"
            :step="1"
            :placeholder="grantDaysPlaceholder"
            style="width: 100%;"
          >
            <template #suffix>天</template>
          </n-input-number>
          <p style="font-size: 12px; color: #999; margin: 4px 0 0;">
            当前结果：{{ grantDaysPreview }}（0 = 终身有效）
          </p>
        </n-form-item>
        <n-form-item label="备注">
          <n-input v-model:value="grantForm.note" placeholder="可选，如：管理员赠送" />
        </n-form-item>
        <p style="font-size: 12px; color: #999; margin: 0;">
          说明：同一用户同一套餐的活跃订阅会在原到期时间基础上向后延期（续期逻辑）。
        </p>
      </n-form>
    </n-modal>
  </div>
</template>

<style scoped>
</style>
