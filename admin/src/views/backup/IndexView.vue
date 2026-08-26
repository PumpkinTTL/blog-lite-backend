<script setup lang="ts">
import { ref, h, onMounted, watch } from 'vue'
import {
  NButton, NDataTable, NSpace, NInput, NIcon, NModal, NForm, NFormItem, NTag,
  NSelect, NPagination, NInputNumber, NSwitch, NTabs, NTabPane, NPopconfirm, useMessage,
} from 'naive-ui'
import type { DataTableColumns, FormInst, FormRules, SelectOption } from 'naive-ui'
import {
  AddOutline, TrashOutline, CreateOutline, RefreshOutline, DownloadOutline,
  CheckmarkCircleOutline, PlayOutline, CloudUploadOutline,
} from '@vicons/ionicons5'
import {
  getBackupLogs, runBackup, verifyBackup, deleteBackupLog, downloadBackup,
  getSchedules, createSchedule, updateSchedule, deleteSchedule, runBySchedule,
  type BackupLog, type BackupSchedule,
} from '../../api/backup'

const message = useMessage()

// ══════════════ Tab 控制 ══════════════
const activeTab = ref<'logs' | 'schedules'>('logs')

// ══════════════ 备份历史 ══════════════
const logsLoading = ref(false)
const logs = ref<BackupLog[]>([])
const logsTotal = ref(0)
const logsPage = ref(1)
const logsPageSize = ref(10)
const runningBackup = ref(false)
/** 正在校验的记录 id（按钮 loading 用），同一时刻只校验一条 */
const verifyingId = ref<number | null>(null)
/** 正在删除的记录 id（按钮 loading 用） */
const deletingLogId = ref<number | null>(null)
/** 正在下载的记录 id（按钮 loading 用，下载是 302 跳转，给个短暂反馈） */
const downloadingId = ref<number | null>(null)

async function loadLogs() {
  logsLoading.value = true
  try {
    const res = await getBackupLogs({ page: logsPage.value, pageSize: logsPageSize.value })
    const payload = res.data
    const list = payload?.list || []
    const total = payload?.total || 0
    // 分页越界回退：当前页空了，且不是第一页，自动回退到上一页重载
    // （删除最后一条后常见的边界，否则用户看到空白页）
    if (list.length === 0 && logsPage.value > 1 && total > 0) {
      logsPage.value = Math.max(1, Math.ceil(total / logsPageSize.value))
      logsLoading.value = false
      return loadLogs()
    }
    logs.value = list
    logsTotal.value = total
  } catch (e: any) {
    message.error(e?.message || '加载历史失败')
  } finally {
    logsLoading.value = false
  }
}

async function handleRunBackup() {
  if (runningBackup.value) return
  runningBackup.value = true
  // 动态文案 toast：naive-ui message 不支持改 type，但可改 content
  const m = message.loading('正在触发备份…', { duration: 0 })
  try {
    const res = await runBackup()
    const logId = (res as any)?.data?.id
    if (!logId) {
      m.destroy()
      message.error('备份触发失败：未返回记录 ID')
      return
    }
    // 轮询该记录状态，进度文案随时间推移变化，避免用户以为卡死
    const stages = [
      { at: 0, text: '正在导出数据库（mysqldump）…' },
      { at: 6, text: '正在压缩（gzip）…' },
      { at: 12, text: '正在上传到 R2…' },
      { at: 25, text: '仍在上传，备份文件较大请耐心等待…' },
    ]
    let done = false
    let result: any = null
    for (let i = 0; i < 45; i++) { // 最多 90 秒
      await new Promise((r) => setTimeout(r, 2000))
      const stage = [...stages].reverse().find((s) => i >= s.at)
      m.content = `${stage?.text || '备份进行中…'}（${(i + 1) * 2}s）`
      const logRes = await getBackupLogs({ page: 1, pageSize: 1 })
      const latest = (logRes as any)?.data?.list?.[0]
      if (latest && latest.id === logId && latest.status !== 'running') {
        done = true
        result = latest
        break
      }
    }
    m.destroy()
    if (!done) {
      message.warning('备份仍在后台进行，请稍后刷新查看')
    } else if (result.status === 'success') {
      const sizeStr = formatSize(result.size)
      const durStr = formatDuration(result.durationMs)
      message.success(`备份成功！${sizeStr}，耗时 ${durStr}${result.r2Verified ? '，R2 已校验' : ''}`)
    } else {
      message.error(`备份失败：${result.errorMessage || '未知错误'}`)
    }
    loadLogs()
  } catch (e: any) {
    m.destroy()
    message.error(e?.message || '触发失败')
  } finally {
    runningBackup.value = false
  }
}

async function handleVerify(id: number) {
  if (verifyingId.value !== null) return // 防止并发
  verifyingId.value = id
  try {
    const res = await verifyBackup(id)
    const verified = (res as any)?.data?.verified ?? true
    if (verified) {
      message.success('校验通过：R2 文件存在')
    } else {
      message.error('校验失败：R2 文件不存在')
    }
    loadLogs()
  } catch (e: any) {
    message.error(e?.message || '校验失败：R2 文件不存在')
  } finally {
    verifyingId.value = null
  }
}

async function handleDownload(id: number) {
  if (downloadingId.value !== null) return
  downloadingId.value = id
  const m = message.loading('正在下载备份…', { duration: 0 })
  try {
    // fetch blob 携带 Authorization（此前 window.open 带不上 header，实际永远 401）
    await downloadBackup(id)
    m.destroy()
    message.success('备份已开始下载')
  } catch (e: any) {
    m.destroy()
    message.error(e?.message || '下载失败')
  } finally {
    downloadingId.value = null
  }
}

async function handleDeleteLog(id: number) {
  if (deletingLogId.value !== null) return
  deletingLogId.value = id
  try {
    await deleteBackupLog(id)
    message.success('已删除')
    loadLogs()
  } catch (e: any) {
    message.error(e?.message || '删除失败')
  } finally {
    deletingLogId.value = null
  }
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}

function formatDuration(ms: number | null): string {
  if (!ms) return '-'
  if (ms < 1000) return ms + 'ms'
  return (ms / 1000).toFixed(1) + 's'
}

const logColumns: DataTableColumns<BackupLog> = [
  { title: 'ID', key: 'id', width: 60 },
  {
    title: '状态', key: 'status', width: 100,
    render: (row) => {
      const map = {
        running: { type: 'info', label: '进行中' },
        success: { type: 'success', label: '成功' },
        failed: { type: 'error', label: '失败' },
      } as const
      const m = map[row.status]
      return h(NTag, { size: 'small', type: m.type, bordered: false }, { default: () => m.label })
    },
  },
  {
    title: '触发', key: 'trigger', width: 90,
    render: (row) => row.trigger === 'manual' ? '手动' : (row.scheduleName || '定时'),
  },
  {
    title: 'R2 文件', key: 'r2Key', width: 220, ellipsis: { tooltip: true },
    render: (row) => row.r2Key
      ? h('span', { style: 'font-family:monospace;font-size:12px;color:#6366f1' }, row.r2Key)
      : '-',
  },
  { title: '大小', key: 'size', width: 90, render: (row) => formatSize(row.size) },
  { title: '耗时', key: 'durationMs', width: 80, render: (row) => formatDuration(row.durationMs) },
  {
    title: 'R2', key: 'r2Verified', width: 70,
    render: (row) => row.status === 'success'
      ? h(NTag, { size: 'small', type: row.r2Verified ? 'success' : 'warning', bordered: false }, { default: () => row.r2Verified ? '已校验' : '未校验' })
      : '-',
  },
  { title: '时间', key: 'createdAt', width: 160, render: (row) => new Date(row.createdAt).toLocaleString('zh-CN') },
  {
    title: '错误', key: 'errorMessage', width: 150, ellipsis: { tooltip: true },
    render: (row) => row.errorMessage ? h('span', { style: 'color:#ef4444;font-size:12px' }, row.errorMessage) : '-',
  },
  {
    title: '操作', key: 'actions', width: 200, fixed: 'right',
    render: (row) => h(NSpace, { size: 'small', wrap: false }, {
      default: () => {
        const busy = verifyingId.value !== null || deletingLogId.value !== null || downloadingId.value !== null
        return [
          row.status === 'success'
            ? h(NButton, {
                size: 'small', quaternary: true, type: 'primary',
                loading: downloadingId.value === row.id,
                disabled: busy && downloadingId.value !== row.id,
                onClick: () => handleDownload(row.id),
              },
                { default: () => '下载', icon: () => h(NIcon, null, { default: () => h(DownloadOutline) }) })
            : null,
          row.status === 'success'
            ? h(NButton, {
                size: 'small', quaternary: true, type: 'info',
                loading: verifyingId.value === row.id,
                disabled: busy && verifyingId.value !== row.id,
                onClick: () => handleVerify(row.id),
              },
                { default: () => '校验', icon: () => h(NIcon, null, { default: () => h(CheckmarkCircleOutline) }) })
            : null,
          // ⚠ 后端删除记录会连带物理删除 R2 备份文件——必须二次确认
          h(NPopconfirm, { onPositiveClick: () => handleDeleteLog(row.id) }, {
            trigger: () => h(NButton, {
              size: 'small', quaternary: true, type: 'error',
              loading: deletingLogId.value === row.id,
              disabled: busy && deletingLogId.value !== row.id,
            },
              { default: () => '删除', icon: () => h(NIcon, null, { default: () => h(TrashOutline) }) }),
            default: () => '将同时从 R2 删除该备份文件，且不可恢复！确定删除？',
          }),
        ]
      },
    }),
  },
]

// ══════════════ 定时器管理 ══════════════
const schedulesLoading = ref(false)
const schedules = ref<BackupSchedule[]>([])
/** 正在切换启用状态的定时器 id（按钮 loading 用） */
const togglingId = ref<string | null>(null)
/** 正在执行备份的定时器 id（按钮 loading 用） */
const runningScheduleId = ref<string | null>(null)
/** 正在删除的定时器 id（按钮 loading 用） */
const deletingScheduleId = ref<string | null>(null)
/** 保存中（弹窗提交按钮 loading） */
const savingSchedule = ref(false)

async function loadSchedules() {
  schedulesLoading.value = true
  try {
    const res = await getSchedules()
    schedules.value = res.data || []
  } catch (e: any) {
    message.error(e?.message || '加载定时器失败')
  } finally {
    schedulesLoading.value = false
  }
}

const typeOptions = [
  { label: '每 N 分钟', value: 'interval' },
  { label: '每天', value: 'daily' },
  { label: '每周', value: 'weekly' },
] as unknown as SelectOption[]

const weekdayOptions = [
  { label: '周日', value: 0 },
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
] as unknown as SelectOption[]

// 定时器弹窗
const showScheduleModal = ref(false)
const editingScheduleId = ref<string | null>(null)
const scheduleFormRef = ref<FormInst | null>(null)
const scheduleForm = ref<any>({
  name: '',
  enabled: true,
  type: 'daily',
  intervalMinutes: 60,
  hour: 3,
  minute: 0,
  dayOfWeek: 1,
  retainDays: 30,
})

const scheduleRules: FormRules = {
  name: [{ required: true, message: '请输入名称', trigger: ['input', 'blur'] }],
  retainDays: [{ required: true, type: 'number', message: '请输入保留天数', trigger: ['blur'] }],
}

function describeSchedule(s: BackupSchedule): string {
  switch (s.type) {
    case 'interval': return `每 ${s.intervalMinutes} 分钟`
    case 'daily': return `每天 ${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`
    case 'weekly': {
      const wd = weekdayOptions.find(w => w.value === s.dayOfWeek)?.label || '?'
      return `每${wd} ${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`
    }
  }
}

function openCreateSchedule() {
  editingScheduleId.value = null
  scheduleForm.value = {
    name: '', enabled: true, type: 'daily',
    intervalMinutes: 60, hour: 3, minute: 0, dayOfWeek: 1, retainDays: 30,
  }
  showScheduleModal.value = true
}

function openEditSchedule(row: BackupSchedule) {
  editingScheduleId.value = row.id
  scheduleForm.value = { ...row }
  showScheduleModal.value = true
}

async function handleSaveSchedule() {
  if (savingSchedule.value) return
  try {
    await scheduleFormRef.value?.validate()
  } catch {
    return
  }
  savingSchedule.value = true
  try {
    const f = scheduleForm.value
    const payload = {
      name: f.name,
      type: f.type,
      enabled: f.enabled,
      retainDays: f.retainDays,
      ...(f.type === 'interval' ? { intervalMinutes: f.intervalMinutes } : {}),
      ...(f.type === 'daily' || f.type === 'weekly' ? { hour: f.hour, minute: f.minute } : {}),
      ...(f.type === 'weekly' ? { dayOfWeek: f.dayOfWeek } : {}),
    }
    if (editingScheduleId.value) {
      await updateSchedule(editingScheduleId.value, payload)
      message.success('已更新')
    } else {
      await createSchedule(payload)
      message.success('已创建')
    }
    showScheduleModal.value = false
    loadSchedules()
  } catch (e: any) {
    message.error(e?.message || '保存失败')
  } finally {
    savingSchedule.value = false
  }
}

async function handleToggleSchedule(row: BackupSchedule) {
  if (togglingId.value !== null) return
  togglingId.value = row.id
  try {
    // 后端 update 会返回 normalize 后的完整对象（含兜底字段），
    // 直接用它替换本地行，避免全表 reload 闪烁，也保证字段完整
    const res = await updateSchedule(row.id, { enabled: !row.enabled })
    const updated = (res as any)?.data as BackupSchedule | undefined
    const idx = schedules.value.findIndex(s => s.id === row.id)
    if (idx >= 0 && updated) {
      schedules.value[idx] = updated
    } else {
      // 兜底：后端没返回完整对象就刷新
      await loadSchedules()
    }
    message.success(row.enabled ? '已暂停' : '已启用')
  } catch (e: any) {
    message.error(e?.message || '操作失败')
  } finally {
    togglingId.value = null
  }
}

async function handleRunSchedule(id: string) {
  if (runningScheduleId.value) return
  runningScheduleId.value = id
  const m = message.loading('正在触发备份…', { duration: 0 })
  try {
    const res = await runBySchedule(id)
    const logId = (res as any)?.data?.id
    let done = false
    let result: any = null
    if (logId) {
      const stages = [
        { at: 0, text: '正在导出数据库（mysqldump）…' },
        { at: 6, text: '正在压缩（gzip）…' },
        { at: 12, text: '正在上传到 R2…' },
        { at: 25, text: '仍在上传，备份文件较大请耐心等待…' },
      ]
      for (let i = 0; i < 45; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        const stage = [...stages].reverse().find((s) => i >= s.at)
        m.content = `${stage?.text || '备份进行中…'}（${(i + 1) * 2}s）`
        const logRes = await getBackupLogs({ page: 1, pageSize: 1 })
        const latest = (logRes as any)?.data?.list?.[0]
        if (latest && latest.id === logId && latest.status !== 'running') {
          done = true
          result = latest
          break
        }
      }
    }
    m.destroy()
    if (!done) {
      message.warning('备份仍在后台进行，请稍后刷新查看')
    } else if (result.status === 'success') {
      const sizeStr = formatSize(result.size)
      const durStr = formatDuration(result.durationMs)
      message.success(`备份成功！${sizeStr}，耗时 ${durStr}${result.r2Verified ? '，R2 已校验' : ''}`)
    } else {
      message.error(`备份失败：${result.errorMessage || '未知错误'}`)
    }
    if (activeTab.value === 'logs') loadLogs()
  } catch (e: any) {
    m.destroy()
    message.error(e?.message || '触发失败')
  } finally {
    runningScheduleId.value = null
  }
}

async function handleDeleteSchedule(id: string) {
  if (deletingScheduleId.value) return
  deletingScheduleId.value = id
  try {
    await deleteSchedule(id)
    message.success('已删除')
    loadSchedules()
  } catch (e: any) {
    message.error(e?.message || '删除失败')
  } finally {
    deletingScheduleId.value = null
  }
}

const scheduleColumns: DataTableColumns<BackupSchedule> = [
  { title: '名称', key: 'name', width: 140, ellipsis: { tooltip: true } },
  {
    title: '调度', key: 'schedule', width: 160,
    render: (row) => h('span', { style: 'font-size:13px' }, describeSchedule(row)),
  },
  { title: '保留', key: 'retainDays', width: 80, render: (row) => `${row.retainDays} 天` },
  {
    title: '状态', key: 'enabled', width: 90,
    render: (row) => h(NTag, {
      size: 'small', bordered: false,
      type: row.enabled ? 'success' : 'default',
    }, { default: () => row.enabled ? '启用' : '暂停' }),
  },
  {
    title: '操作', key: 'actions', width: 280, fixed: 'right',
    render: (row) => h(NSpace, { size: 'small', wrap: false }, {
      default: () => {
        const toggling = togglingId.value
        const running = runningScheduleId.value
        const deleting = deletingScheduleId.value
        const busy = !!toggling || !!running || !!deleting
        return [
          h(NButton, {
              size: 'small', quaternary: true, type: row.enabled ? 'warning' : 'success',
              loading: toggling === row.id,
              disabled: busy && toggling !== row.id,
              onClick: () => handleToggleSchedule(row),
            },
            { default: () => row.enabled ? '暂停' : '启用' }),
          h(NButton, {
              size: 'small', quaternary: true, type: 'primary',
              loading: running === row.id,
              disabled: busy && running !== row.id,
              onClick: () => handleRunSchedule(row.id),
            },
            { default: () => '立即执行', icon: () => h(NIcon, null, { default: () => h(PlayOutline) }) }),
          h(NButton, {
              size: 'small', quaternary: true,
              disabled: busy,
              onClick: () => openEditSchedule(row),
            },
            { default: () => '编辑', icon: () => h(NIcon, null, { default: () => h(CreateOutline) }) }),
          h(NPopconfirm, { onPositiveClick: () => handleDeleteSchedule(row.id) }, {
            trigger: () => h(NButton, {
              size: 'small', quaternary: true, type: 'error',
              loading: deleting === row.id,
              disabled: busy && deleting !== row.id,
            },
              { default: () => '删除', icon: () => h(NIcon, null, { default: () => h(TrashOutline) }) }),
            default: () => `确定删除定时器「${row.name}」？`,
          }),
        ]
      },
    }),
  },
]

onMounted(() => {
  loadLogs()
  loadSchedules()
})

// 切 tab 时刷新该 tab 数据（避免显示过期数据，用户不必手动刷新）
// 首次进入已由 onMounted 加载，这里 watch 跳过首次 immediate，只在切换时触发
watch(activeTab, (tab) => {
  if (tab === 'logs') loadLogs()
  else if (tab === 'schedules') loadSchedules()
})
</script>

<template>
  <div class="page-wrapper">
    <div class="page-header">
      <h2 class="page-title">数据备份</h2>
      <n-button type="primary" :loading="runningBackup" @click="handleRunBackup">
        <template #icon><n-icon><CloudUploadOutline /></n-icon></template>
        立即备份
      </n-button>
    </div>

    <n-tabs v-model:value="activeTab" type="line" animated>
      <!-- ── 备份历史 ── -->
      <n-tab-pane name="logs" tab="备份历史">
        <n-space class="search-bar" :size="12" align="center" justify="end">
          <n-button quaternary :loading="logsLoading" @click="loadLogs">
            <template #icon><n-icon><RefreshOutline /></n-icon></template>
            刷新
          </n-button>
        </n-space>
        <div class="table-section">
          <n-data-table :columns="logColumns" :data="logs" :loading="logsLoading" :bordered="false"
            :scroll-x="1220" :row-key="(row: any) => row.id" />
          <div class="pagination-wrap" v-if="logsTotal > 0">
            <n-pagination :page="logsPage" :page-size="logsPageSize" :page-sizes="[5, 10, 20, 30, 50, 100]"
              :item-count="logsTotal" show-size-picker
              @update:page="(p: number) => { logsPage = p; loadLogs() }"
              @update:page-size="(s: number) => { logsPageSize = s; logsPage = 1; loadLogs() }" />
          </div>
        </div>
      </n-tab-pane>

      <!-- ── 定时器管理 ── -->
      <n-tab-pane name="schedules" tab="定时器配置">
        <n-space class="search-bar" :size="12" align="center">
          <n-button type="primary" @click="openCreateSchedule">
            <template #icon><n-icon><AddOutline /></n-icon></template>
            新建定时器
          </n-button>
          <n-button quaternary :loading="schedulesLoading" @click="loadSchedules">
            <template #icon><n-icon><RefreshOutline /></n-icon></template>
            刷新
          </n-button>
        </n-space>
        <div class="table-section">
          <n-data-table :columns="scheduleColumns" :data="schedules" :loading="schedulesLoading" :bordered="false"
            :scroll-x="750" :row-key="(row: any) => row.id" />
        </div>
      </n-tab-pane>
    </n-tabs>

    <!-- ── 定时器弹窗 ── -->
    <n-modal v-model:show="showScheduleModal" preset="card"
      :title="editingScheduleId ? '编辑定时器' : '新建定时器'"
      style="width: 480px" :mask-closable="false">
      <n-form ref="scheduleFormRef" :model="scheduleForm" :rules="scheduleRules" label-placement="left" label-width="80">
        <n-form-item label="名称" path="name">
          <n-input v-model:value="scheduleForm.name" placeholder="如：每日凌晨备份" />
        </n-form-item>
        <n-form-item label="调度类型">
          <n-select v-model:value="scheduleForm.type" :options="typeOptions" />
        </n-form-item>
        <n-form-item v-if="scheduleForm.type === 'interval'" label="间隔分钟">
          <n-input-number v-model:value="scheduleForm.intervalMinutes" :min="1" :max="10080" style="width: 100%" />
        </n-form-item>
        <template v-if="scheduleForm.type === 'daily' || scheduleForm.type === 'weekly'">
          <n-form-item label="时间">
            <n-space :size="8" align="center">
              <n-input-number v-model:value="scheduleForm.hour" :min="0" :max="23" placeholder="时" style="width: 90px" />
              <span>:</span>
              <n-input-number v-model:value="scheduleForm.minute" :min="0" :max="59" placeholder="分" style="width: 90px" />
            </n-space>
          </n-form-item>
        </template>
        <n-form-item v-if="scheduleForm.type === 'weekly'" label="星期">
          <n-select v-model:value="scheduleForm.dayOfWeek" :options="weekdayOptions" />
        </n-form-item>
        <n-form-item label="保留天数" path="retainDays">
          <n-input-number v-model:value="scheduleForm.retainDays" :min="1" :max="365" style="width: 100%" />
          <template #feedback>超过此天数的备份自动从 R2 删除</template>
        </n-form-item>
        <n-form-item label="启用">
          <n-switch v-model:value="scheduleForm.enabled" />
        </n-form-item>
      </n-form>
      <template #action>
        <n-space justify="end">
          <n-button :disabled="savingSchedule" @click="showScheduleModal = false">取消</n-button>
          <n-button type="primary" :loading="savingSchedule" @click="handleSaveSchedule">{{ editingScheduleId ? '保存' : '创建' }}</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>
