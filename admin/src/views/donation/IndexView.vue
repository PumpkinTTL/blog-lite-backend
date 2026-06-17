<script setup lang="ts">
import { ref, h, onMounted } from 'vue'
import {
  NCard, NButton, NDataTable, NSpace, NInput, NIcon, NTag, NPagination, NTooltip,
  NModal, NForm, NFormItem, NInputNumber, NSelect, NRadioGroup, NRadioButton,
  NGrid, NGi, useMessage, useDialog,
} from 'naive-ui'
import type { DataTableColumns, FormInst, FormRules, SelectOption } from 'naive-ui'
import {
  SearchOutline, RefreshOutline, AddOutline, TrashOutline,
  DownloadOutline, EyeOutline, EyeOffOutline, CashOutline,
  CheckmarkCircleOutline, TimeOutline, HeartOutline,
  CreateOutline, CopyOutline,
} from '@vicons/ionicons5'
import {
  getDonationList, getDonationStats, createDonation, updateDonation,
  deleteDonation, batchDeleteDonations, toggleDonationStatus, toggleDonationVisible,
  exportDonations,
} from '../../api/donation'
import type { Donation, CreateDonationData, DonationStats } from '../../api/donation'

const message = useMessage()
const dialog = useDialog()

// ── SVG icons (from simpleicons.org / cryptologos.cc, inline) ──
// WeChat
const WechatSvg = () => h('svg', { viewBox: '0 0 24 24', width: 15, height: 15, fill: '#07C160' }, [
  h('path', { d: 'M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z' }),
])
// Alipay
const AlipaySvg = () => h('svg', { viewBox: '0 0 24 24', width: 15, height: 15, fill: '#1677FF' }, [
  h('path', { d: 'M19.695 15.07c3.426 1.158 4.203 1.22 4.203 1.22V3.846c0-2.124-1.705-3.845-3.81-3.845H3.914C1.808.001.102 1.722.102 3.846v16.31c0 2.123 1.706 3.845 3.813 3.845h16.173c2.105 0 3.81-1.722 3.81-3.845v-.157s-6.19-2.602-9.315-4.119c-2.096 2.602-4.8 4.181-7.607 4.181-4.75 0-6.361-4.19-4.112-6.949.49-.602 1.324-1.175 2.617-1.497 2.025-.502 5.247.313 8.266 1.317a16.796 16.796 0 0 0 1.341-3.302H5.781v-.952h4.799V6.975H4.77v-.953h5.81V3.591s0-.409.411-.409h2.347v2.84h5.744v.951h-5.744v1.704h4.69a19.453 19.453 0 0 1-1.986 5.06c1.424.52 2.702 1.011 3.654 1.333m-13.81-2.032c-.596.06-1.71.325-2.321.869-1.83 1.608-.735 4.55 2.968 4.55 2.151 0 4.301-1.388 5.99-3.61-2.403-1.182-4.438-2.028-6.637-1.809' }),
])
// TRON (TRC20) — official logo from cryptologos.cc
const TronSvg = () => h('svg', { viewBox: '0 0 64 64', width: 15, height: 15, fill: '#FF060A' }, [
  h('path', { d: 'M61.55 19.28c-3-2.77-7.15-7-10.53-10l-.2-.14a3.82 3.82 0 0 0-1.11-.62l0 0C41.56 7 3.63-.09 2.89 0a1.4 1.4 0 0 0-.58.22L2.12.37a2.23 2.23 0 0 0-.52.84l-.05.13v.71l0 .11C5.82 14.05 22.68 53 26 62.14c.2.62.58 1.8 1.29 1.86h.16c.38 0 2-2.14 2-2.14S58.41 26.74 61.34 23a9.46 9.46 0 0 0 1-1.48A2.41 2.41 0 0 0 61.55 19.28zM36.88 23.37L49.24 13.12l7.25 6.68zm-4.8-.67L10.8 5.26l34.43 6.35zM34 27.27l21.78-3.51-24.9 30zM7.91 7L30.3 26 27.06 53.78z' }),
])
// BNB Chain (BSC) — official logo from simpleicons.org
const BscSvg = () => h('svg', { viewBox: '0 0 24 24', width: 15, height: 15, fill: '#F0B90B' }, [
  h('path', { d: 'M5.631 3.676 12.001 0l6.367 3.676-2.34 1.358L12 2.716 7.972 5.034l-2.34-1.358Zm12.737 4.636-2.34-1.358L12 9.272 7.972 6.954l-2.34 1.358v2.716l4.026 2.318v4.636L12 19.341l2.341-1.359v-4.636l4.027-2.318V8.312Zm0 7.352v-2.716l-2.34 1.358v2.716l2.34-1.358Zm1.663.96-4.027 2.318v2.717l6.368-3.677V10.63l-2.34 1.358v4.636Zm-2.34-10.63 2.34 1.358v2.716l2.341-1.358V5.994l-2.34-1.358-2.342 1.358ZM9.657 19.926v2.716L12 24l2.341-1.358v-2.716l-2.34 1.358-2.343-1.358Zm-4.027-4.262 2.341 1.358v-2.716l-2.34-1.358v2.716Zm4.027-9.67L12 7.352l2.341-1.358-2.34-1.358-2.343 1.358Zm-5.69 1.358L6.31 5.994 3.968 4.636l-2.34 1.358V8.71l2.34 1.358V7.352Zm0 4.636-2.34-1.358v7.352l6.368 3.677v-2.717l-4.028-2.318v-4.636Z' }),
])
// Polygon (POL) — official logo from simpleicons.org
const PolSvg = () => h('svg', { viewBox: '0 0 24 24', width: 15, height: 15, fill: '#8247E5' }, [
  h('path', { d: 'm17.82 16.342 5.692-3.287A.98.98 0 0 0 24 12.21V5.635a.98.98 0 0 0-.488-.846l-5.693-3.286a.98.98 0 0 0-.977 0L11.15 4.789a.98.98 0 0 0-.489.846v11.747L6.67 19.686l-3.992-2.304v-4.61l3.992-2.304 2.633 1.52V8.896L7.158 7.658a.98.98 0 0 0-.977 0L.488 10.945a.98.98 0 0 0-.488.846v6.573a.98.98 0 0 0 .488.847l5.693 3.286a.981.981 0 0 0 .977 0l5.692-3.286a.98.98 0 0 0 .489-.846V6.618l.072-.041 3.92-2.263 3.99 2.305v4.609l-3.99 2.304-2.63-1.517v3.092l2.14 1.236a.981.981 0 0 0 .978 0v-.001Z' }),
])
// 加密货币通用 icon (钱包)
const CryptoSvg = () => h('svg', { viewBox: '0 0 24 24', width: 15, height: 15, fill: '#F59E0B' }, [
  h('path', { d: 'M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6zm2 0v1.5l6 4.5 6-4.5V6H4zm0 4.5V18h16v-7.5l-6 4.5-6-4.5z' }),
])
// 其他支付 icon (现金)
const OtherSvg = () => h('svg', { viewBox: '0 0 24 24', width: 15, height: 15, fill: '#6B7280' }, [
  h('path', { d: 'M2 4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h20a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H2zm1 2h18v12H3V6zm3 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm4 1a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-6z' }),
])
const payMethodIconMap: Record<string, () => any> = { wechat: WechatSvg, alipay: AlipaySvg, crypto: CryptoSvg, other: OtherSvg }
const cryptoIconMap: Record<string, () => any> = { TRC20: TronSvg, BSC: BscSvg, POL: PolSvg }

// ── 列表状态 ──
const loading = ref(false)
const donationList = ref<Donation[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(5)
const searchId = ref('')
const searchKeyword = ref('')
const filterStatus = ref<string | null>(null)
const filterPayMethod = ref<string | null>(null)
const checkedRowKeys = ref<number[]>([])

// ── 统计状态 ──
const stats = ref<DonationStats | null>(null)

// ── 弹窗状态 ──
const showModal = ref(false)
const editingId = ref<number | null>(null)
const formRef = ref<FormInst | null>(null)
const formLoading = ref(false)
/** 状态切换中的捐赠 id（确认/取消确认按钮 loading） */
const togglingId = ref<number | null>(null)
/** 展示切换中的捐赠 id（眼睛按钮 loading） */
const togglingVisibleId = ref<number | null>(null)
/** 导出 CSV 中（导出按钮 loading） */
const exporting = ref(false)
const formData = ref<Omit<CreateDonationData, 'status'> & { status: number }>({
  donorName: '', amount: 0, currency: 'CNY', payMethod: 'wechat', status: 1, isVisible: 1, sortOrder: 0,
})

const formRules: FormRules = {
  donorName: { required: true, message: '请输入捐赠者昵称', trigger: 'blur' },
  amount: { required: true, type: 'number', message: '请输入金额', trigger: 'blur' },
  payMethod: { required: true, message: '请选择支付方式', trigger: 'change' },
}

// ── 选项 ──
const payMethodOptions: SelectOption[] = [
  { label: '微信', value: 'wechat' },
  { label: '支付宝', value: 'alipay' },
  { label: '加密货币', value: 'crypto' },
  { label: '其他', value: 'other' },
]
const cryptoNetworkOptions: SelectOption[] = [
  { label: 'TRC20', value: 'TRC20' },
  { label: 'BSC', value: 'BSC' },
  { label: 'POL', value: 'POL' },
]
const statusFilterOptions = [
  { label: '全部状态', value: null },
  { label: '待确认', value: 'pending' },
  { label: '已确认', value: 'confirmed' },
  { label: '已退款', value: 'refunded' },
] as unknown as SelectOption[]
const payMethodFilterOptions = [
  { label: '全部方式', value: null },
  ...payMethodOptions,
] as unknown as SelectOption[]

const payMethodLabel: Record<string, string> = { wechat: '微信', alipay: '支付宝', crypto: '加密货币', other: '其他' }
const statusLabel: Record<string, string> = { '0': '待确认', '1': '已确认', '2': '已退款', pending: '待确认', confirmed: '已确认', refunded: '已退款' }
const statusColor: Record<string, string> = { '0': 'warning', '1': 'success', '2': 'error', pending: 'warning', confirmed: 'success', refunded: 'error' }

// ── 统计卡片配置 ──
const statCards = [
  { label: '总记录', key: 'total' as const, icon: HeartOutline, color: '#F43F5E' },
  { label: '已确认', key: 'confirmed' as const, icon: CheckmarkCircleOutline, color: '#10B981' },
  { label: '待确认', key: 'pending' as const, icon: TimeOutline, color: '#F59E0B' },
  { label: '已确认金额', key: 'totalAmount' as const, icon: CashOutline, color: '#6366F1', suffix: 'CNY' },
]

// ── 数据加载 ──
async function loadList() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value }
    if (searchId.value) params.id = searchId.value
    if (searchKeyword.value) params.keyword = searchKeyword.value
    if (filterStatus.value !== null) params.status = filterStatus.value
    if (filterPayMethod.value) params.payMethod = filterPayMethod.value
    const res = await getDonationList(params)
    total.value = res.data.total
    donationList.value = res.data.list
  } catch (e: any) { message.error(e?.message || '加载列表失败') }
  finally { loading.value = false }
}

async function loadStats() {
  try { const res = await getDonationStats(); stats.value = res.data } catch { /* */ }
}

function handleSearch() { page.value = 1; loadList() }
function handleReset() {
  searchId.value = ''; searchKeyword.value = ''; filterStatus.value = null; filterPayMethod.value = null
  page.value = 1; loadList()
}
function handlePageChange(p: number) { page.value = p; loadList() }
function handlePageSizeChange(s: number) { pageSize.value = s; page.value = 1; loadList() }

// ── 弹窗操作 ──
function openCreateModal() {
  editingId.value = null
  formData.value = { donorName: '', amount: 0, currency: 'CNY', payMethod: 'wechat', status: 1, isVisible: 1, sortOrder: 0 }
  showModal.value = true
}

function openEditModal(row: Donation) {
  editingId.value = row.id
  formData.value = {
    donorName: row.donorName,
    donorAvatar: row.donorAvatar || undefined,
    donorEmail: row.donorEmail || undefined,
    amount: Number(row.amount),
    currency: row.currency,
    payMethod: row.payMethod,
    cryptoNetwork: row.cryptoNetwork || undefined,
    cryptoTxHash: row.cryptoTxHash || undefined,
    cryptoFrom: row.cryptoFrom || undefined,
    cryptoTo: row.cryptoTo || undefined,
    message: row.message || undefined,
    tradeNo: row.tradeNo || undefined,
    status: Number(row.status as any) || 0,
    isVisible: row.isVisible,
    sortOrder: row.sortOrder,
    remark: row.remark || undefined,
  }
  showModal.value = true
}

async function handleSubmit() {
  try { await formRef.value?.validate() } catch { return }
  formLoading.value = true
  try {
    // status 字段在表单内为数字（0/1/2），与 API 类型字符串不一致，
    // 后端按字符串处理但前端历史代码用数字索引——保持现状以兼容
    const payload = formData.value as unknown as CreateDonationData
    if (editingId.value) {
      await updateDonation(editingId.value, payload)
      message.success('更新成功')
    } else {
      await createDonation(payload)
      message.success('创建成功')
    }
    showModal.value = false; loadList(); loadStats()
  } catch (e: any) { message.error(e.message || '操作失败') }
  finally { formLoading.value = false }
}

function handleDelete(row: Donation) {
  const d = dialog.warning({
    title: '确认删除', content: `确定删除「${row.donorName}」的捐赠记录？`,
    positiveText: '删除', negativeText: '取消',
    onPositiveClick: async () => {
      d.loading = true
      try { await deleteDonation(row.id); message.success('删除成功'); loadList(); loadStats() }
      catch (e: any) { message.error(e.message || '删除失败'); return false }
    },
  })
}

function handleBatchDelete() {
  if (checkedRowKeys.value.length === 0) {
    message.warning('请先选择要删除的记录')
    return
  }
  const d = dialog.warning({
    title: '批量删除',
    content: `确定删除选中的 ${checkedRowKeys.value.length} 条捐赠记录?此操作不可恢复!`,
    positiveText: '删除', negativeText: '取消',
    onPositiveClick: async () => {
      d.loading = true
      try {
        await batchDeleteDonations(checkedRowKeys.value)
        message.success('批量删除成功')
        checkedRowKeys.value = []
        loadList(); loadStats()
      } catch (e: any) { message.error(e?.message || '批量删除失败'); return false }
    },
  })
}

/** 状态切换（确认/取消确认） */
async function handleToggleStatus(row: Donation) {
  if (togglingId.value !== null) return
  togglingId.value = row.id
  try {
    await toggleDonationStatus(row.id)
    loadList(); loadStats()
  } catch (e: any) {
    message.error(e?.message || '操作失败')
  } finally {
    togglingId.value = null
  }
}

/** 展示切换 */
async function handleToggleVisible(row: Donation) {
  if (togglingVisibleId.value !== null) return
  togglingVisibleId.value = row.id
  try {
    await toggleDonationVisible(row.id)
    loadList()
  } catch (e: any) {
    message.error(e?.message || '操作失败')
  } finally {
    togglingVisibleId.value = null
  }
}

/** 导出 CSV */
async function handleExport() {
  if (exporting.value) return
  exporting.value = true
  try {
    await exportDonations()
  } catch (e: any) {
    message.error(e?.message || '导出失败')
  } finally {
    exporting.value = false
  }
}

// ── 表格列 ──
const columns: DataTableColumns<Donation> = [
  { type: 'selection', width: 40 },
  { title: 'ID', key: 'id', width: 55, align: 'center' },
  { title: '捐赠者', key: 'donorName', width: 110, ellipsis: { tooltip: true } },
  {
    title: '金额', key: 'amount', width: 110,
    render: (row) => h('span', { style: 'font-weight:600;color:#10B981' }, `${row.amount} ${row.currency}`),
  },
  {
    title: '支付方式', key: 'payMethod', width: 140,
    render: (row) => {
      if (row.payMethod === 'crypto' && row.cryptoNetwork) {
        const iconFn = cryptoIconMap[row.cryptoNetwork]
        const chainMap: Record<string, { name: string; code: string }> = {
          TRC20: { name: '波场', code: 'TRC20' },
          BSC: { name: '币安智能链', code: 'BEP20' },
          POL: { name: 'Polygon', code: 'POL' },
        }
        const chain = chainMap[row.cryptoNetwork]
        return h('div', { style: 'display:flex;align-items:center;gap:5px' }, [
          iconFn ? h('span', { style: 'display:inline-flex;flex-shrink:0' }, [iconFn()]) : null,
          h('span', { style: 'font-size:13px;font-weight:500' }, chain?.name || row.cryptoNetwork),
          h('span', { style: 'font-size:11px;color:#94A3B8' }, chain?.code),
        ])
      }
      const iconFn = payMethodIconMap[row.payMethod]
      const label = payMethodLabel[row.payMethod] || row.payMethod
      return h('div', { style: 'display:flex;align-items:center;gap:4px' }, [
        iconFn ? h('span', { style: 'display:inline-flex;flex-shrink:0' }, [iconFn()]) : null,
        h('span', { style: 'font-size:13px' }, label),
      ])
    },
  },
  {
    title: '交易哈希', key: 'cryptoTxHash', width: 160,
    render: (row) => row.cryptoTxHash
      ? h('div', { style: 'display:flex;align-items:center;gap:4px' }, [
          h('span', { style: 'font-family:monospace;font-size:12px;color:#94A3B8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, row.cryptoTxHash),
          h(NTooltip, null, {
            trigger: () => h(NIcon, { size: 14, style: 'cursor:pointer;color:#94A3B8;flex-shrink:0', onClick: () => { if (row.cryptoTxHash) { navigator.clipboard.writeText(row.cryptoTxHash); message.success('已复制') } } }, { default: () => h(CopyOutline) }),
            default: () => '复制交易哈希',
          }),
        ])
      : '-',
  },
  {
    title: '状态', key: 'status', width: 75,
    render: (row) => h(NTag, { size: 'small', type: statusColor[row.status] as any, round: true, bordered: false }, { default: () => statusLabel[row.status] }),
  },
  {
    title: '展示', key: 'isVisible', width: 55, align: 'center',
    render: (row) => h(NButton, {
      size: 'tiny', quaternary: true, type: row.isVisible ? 'success' : 'default',
      loading: togglingVisibleId.value === row.id,
      onClick: () => handleToggleVisible(row),
    }, {
      default: () => h(NIcon, { size: 16 }, { default: () => h(row.isVisible ? EyeOutline : EyeOffOutline) }),
    }),
  },
  {
    title: '留言', key: 'message', width: 130, ellipsis: { tooltip: true },
    render: (row) => row.message || '-',
  },
  {
    title: '创建时间', key: 'createdAt', width: 155,
    render: (row) => new Date(row.createdAt).toLocaleString('zh-CN'),
  },
  {
    title: '操作', key: 'actions', width: 180, fixed: 'right',
    render: (row) => h(NSpace, { size: 4, wrap: false }, {
      default: () => [
        h(NButton, {
          size: 'tiny', quaternary: true,
          onClick: () => openEditModal(row),
        }, { default: () => '编辑', icon: () => h(NIcon, null, { default: () => h(CreateOutline) }) }),
        h(NButton, {
          size: 'tiny', quaternary: true,
          type: row.status === 'confirmed' ? 'warning' : 'success',
          loading: togglingId.value === row.id,
          onClick: () => handleToggleStatus(row),
        }, { default: () => row.status === 'confirmed' ? '取消确认' : '确认' }),
        h(NButton, {
          size: 'tiny', quaternary: true, type: 'error',
          onClick: () => handleDelete(row),
        }, { default: () => '删除', icon: () => h(NIcon, null, { default: () => h(TrashOutline) }) }),
      ],
    }),
  },
]

onMounted(() => { loadList(); loadStats() })
</script>

<template>
  <div class="page-wrapper">
    <!-- 统计 + 搜索 操作区 -->
    <n-card class="panel-card" :bordered="true">
      <!-- 统计卡片 -->
      <n-grid :x-gap="16" :y-gap="16" :cols="4" responsive="screen" item-responsive>
        <n-gi v-for="card in statCards" :key="card.key" span="4 m:2 l:1">
          <div class="stat-card">
            <div class="stat-inner">
              <div class="stat-icon" :style="{ background: card.color + '14', color: card.color }">
                <n-icon :size="24"><component :is="card.icon" /></n-icon>
              </div>
              <div class="stat-info">
                <span class="stat-label">{{ card.label }}</span>
                <span class="stat-value">
                  {{ stats?.[card.key] ?? '-' }}
                  <span v-if="card.suffix" class="stat-suffix">{{ card.suffix }}</span>
                </span>
              </div>
            </div>
          </div>
        </n-gi>
      </n-grid>

      <!-- 按支付方式统计 -->
      <div class="breakdown-row" v-if="stats?.byMethod?.length">
        <div v-for="item in stats.byMethod" :key="item.payMethod" class="breakdown-chip">
          <span class="chip-icon">
            <component :is="payMethodIconMap[item.payMethod]" v-if="payMethodIconMap[item.payMethod]" />
          </span>
          <span class="chip-label">{{ payMethodLabel[item.payMethod] || item.payMethod }}</span>
          <span class="chip-num">{{ item.count }}笔</span>
          <span class="chip-amount">{{ item.totalAmount }}元</span>
        </div>
      </div>

      <n-divider style="margin: 16px 0 12px" />

      <!-- 搜索栏 -->
      <n-space :size="12" align="center">
        <n-input v-model:value="searchId" placeholder="ID" clearable style="width: 80px" @keyup.enter="handleSearch" />
        <n-input v-model:value="searchKeyword" placeholder="搜索昵称/留言/交易号..." clearable @keyup.enter="handleSearch" />
        <n-select v-model:value="filterStatus" :options="statusFilterOptions" style="width: 110px" placeholder="全部状态" />
        <n-select v-model:value="filterPayMethod" :options="payMethodFilterOptions" style="width: 120px" placeholder="全部方式" />
        <n-button type="primary" @click="handleSearch">
          <template #icon><n-icon><SearchOutline /></n-icon></template>
          搜索
        </n-button>
        <n-button @click="handleReset">
          <template #icon><n-icon><RefreshOutline /></n-icon></template>
          重置
        </n-button>
        <n-button type="primary" @click="openCreateModal">
          <template #icon><n-icon><AddOutline /></n-icon></template>
          新增
        </n-button>
        <n-button :loading="exporting" @click="handleExport">
          <template #icon><n-icon><DownloadOutline /></n-icon></template>
          导出CSV
        </n-button>
        <n-button :disabled="checkedRowKeys.length === 0" type="error" @click="handleBatchDelete">
          <template #icon><n-icon><TrashOutline /></n-icon></template>
          批量删除
        </n-button>
      </n-space>
    </n-card>

    <!-- 表格 -->
    <div class="table-section">
      <n-data-table :columns="columns" :data="donationList" :loading="loading" :bordered="false"
        :row-key="(row: Donation) => row.id" :scroll-x="1270"
        @update:checked-row-keys="(keys: any) => checkedRowKeys = keys" />
      <div class="pagination-wrap" v-if="total > 0">
        <n-pagination :page="page" :page-size="pageSize" :page-sizes="[5, 10, 20, 50]" :item-count="total"
          show-size-picker @update:page="handlePageChange" @update:page-size="handlePageSizeChange" />
      </div>
    </div>

    <!-- 新增/编辑弹窗 -->
    <n-modal v-model:show="showModal" preset="card" :title="editingId ? '编辑捐赠' : '新增捐赠'"
      style="width: 600px" :mask-closable="false">
      <n-form ref="formRef" :model="formData" :rules="formRules" label-placement="left" label-width="90">
        <n-form-item label="捐赠者" path="donorName">
          <n-input v-model:value="formData.donorName" placeholder="昵称" />
        </n-form-item>
        <n-form-item label="金额" path="amount">
          <n-input-number v-model:value="formData.amount" :min="0.01" :precision="2" style="width: 200px" />
          <n-select v-model:value="formData.currency" :options="[{ label: 'CNY', value: 'CNY' }, { label: 'USD', value: 'USD' }]"
            style="width: 90px; margin-left: 8px" />
        </n-form-item>
        <n-form-item label="支付方式" path="payMethod">
          <n-radio-group v-model:value="formData.payMethod" name="payMethod">
            <n-radio-button v-for="opt in payMethodOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</n-radio-button>
          </n-radio-group>
        </n-form-item>
        <template v-if="formData.payMethod === 'crypto'">
          <n-form-item label="链网络">
            <n-select v-model:value="formData.cryptoNetwork" :options="cryptoNetworkOptions" placeholder="选择网络" clearable />
          </n-form-item>
          <n-form-item label="交易哈希">
            <n-input v-model:value="formData.cryptoTxHash" placeholder="链上交易哈希" />
          </n-form-item>
          <n-form-item label="发送地址">
            <n-input v-model:value="formData.cryptoFrom" placeholder="发送方钱包地址" />
          </n-form-item>
          <n-form-item label="接收地址">
            <n-input v-model:value="formData.cryptoTo" placeholder="接收方钱包地址" />
          </n-form-item>
        </template>
        <n-form-item label="邮箱">
          <n-input v-model:value="formData.donorEmail" placeholder="可选" />
        </n-form-item>
        <n-form-item label="头像URL">
          <n-input v-model:value="formData.donorAvatar" placeholder="可选" />
        </n-form-item>
        <n-form-item label="流水号">
          <n-input v-model:value="formData.tradeNo" placeholder="第三方交易流水号（可选）" />
        </n-form-item>
        <n-form-item label="留言">
          <n-input v-model:value="formData.message" type="textarea" :rows="2" placeholder="捐赠者留言（可选）" />
        </n-form-item>
        <n-form-item label="状态">
          <n-radio-group v-model:value="formData.status" name="status">
            <n-radio-button :value="0">待确认</n-radio-button>
            <n-radio-button :value="1">已确认</n-radio-button>
            <n-radio-button :value="2">已退款</n-radio-button>
          </n-radio-group>
        </n-form-item>
        <n-form-item label="展示">
          <n-radio-group v-model:value="formData.isVisible" name="isVisible">
            <n-radio-button :value="1">展示</n-radio-button>
            <n-radio-button :value="0">隐藏</n-radio-button>
          </n-radio-group>
        </n-form-item>
        <n-form-item label="排序">
          <n-input-number v-model:value="formData.sortOrder" :min="0" style="width: 120px" />
        </n-form-item>
        <n-form-item label="备注">
          <n-input v-model:value="formData.remark" type="textarea" :rows="2" placeholder="管理员内部备注" />
        </n-form-item>
      </n-form>
      <template #action>
        <n-space justify="end">
          <n-button @click="showModal = false">取消</n-button>
          <n-button type="primary" :loading="formLoading" @click="handleSubmit">{{ editingId ? '保存' : '创建' }}</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.panel-card {
  border-radius: 12px;
}
.stat-card {
  background: rgba(100, 116, 139, 0.04);
  border-radius: 12px;
  padding: 16px;
  transition: background 0.15s;
}
.stat-card:hover {
  background: rgba(100, 116, 139, 0.08);
}
.stat-inner {
  display: flex;
  align-items: center;
  gap: 16px;
}
.stat-icon {
  width: 52px;
  height: 52px;
  min-width: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
}
.stat-info {
  display: flex;
  flex-direction: column;
}
.stat-label {
  font-size: 13px;
  color: #94A3B8;
  margin-bottom: 2px;
}
.stat-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
}
.stat-suffix {
  font-size: 13px;
  font-weight: 400;
  color: #94A3B8;
  margin-left: 4px;
}

.breakdown-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 16px;
}
.breakdown-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  background: rgba(100, 116, 139, 0.06);
  font-size: 13px;
  color: #475569;
  transition: background 0.15s;
}
.breakdown-chip:hover {
  background: rgba(100, 116, 139, 0.1);
}
.chip-icon {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}
.chip-label {
  font-weight: 500;
}
.chip-num {
  color: #6366F1;
  font-weight: 600;
}
.chip-amount {
  color: #10B981;
  font-weight: 600;
}
</style>
