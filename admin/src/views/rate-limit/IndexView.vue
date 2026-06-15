<script setup lang="ts">
import { ref, h, onMounted } from 'vue'
import { NCard, NFormItem, NInputNumber, NButton, NSpace, NSpin, NAlert, NDataTable, NTag, useMessage } from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { getRateLimitConfig, updateRateLimitConfig } from '../../api/rate-limit'
import type { RateLimitConfig, RateRule } from '../../api/rate-limit'

const message = useMessage()
const loading = ref(false)
const saving = ref(false)

const defaultLimit = ref(100)
const defaultTtl = ref(60000)
const rules = ref<RateRule[]>([])

async function load() {
  loading.value = true
  try {
    const res = await getRateLimitConfig()
    const cfg: RateLimitConfig = res.data
    defaultLimit.value = cfg.default.limit
    defaultTtl.value = cfg.default.ttl
    rules.value = cfg.rules || []
  } catch (e: any) {
    message.error(e?.message || '加载限流配置失败')
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  if (!defaultLimit.value || defaultLimit.value < 1) {
    message.warning('全局请求次数必须大于 0')
    return
  }
  if (!defaultTtl.value || defaultTtl.value < 1000) {
    message.warning('全局时间窗口至少 1000ms')
    return
  }
  saving.value = true
  try {
    await updateRateLimitConfig({
      defaultLimit: defaultLimit.value,
      defaultTtl: defaultTtl.value,
      rules: rules.value.map(r => ({
        routeKey: r.routeKey,
        label: r.label,
        limit: r.limit,
        ttl: r.ttl,
      })),
    })
    message.success('配置已保存并即时生效')
  } catch (e: any) {
    message.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

function formatTtl(ttl: number): string {
  if (ttl >= 3600000) return `${ttl / 3600000} 小时`
  if (ttl >= 60000) return `${ttl / 60000} 分钟`
  return `${ttl / 1000} 秒`
}

const columns: DataTableColumns<RateRule> = [
  {
    title: '接口', key: 'label', width: 160,
    render: (row) => [
      row.label,
    ],
  },
  {
    title: '路由标识', key: 'routeKey', width: 240, ellipsis: { tooltip: true },
    render: (row) => row.routeKey,
  },
  {
    title: '请求次数', key: 'limit', width: 140,
    render: (row) => h(NInputNumber, {
      value: row.limit,
      min: 1,
      step: 1,
      size: 'small',
      style: 'width: 110px',
      'onUpdate:value': (v: number | null) => { row.limit = v ?? 1 },
    }),
  },
  {
    title: '时间窗口', key: 'ttl', width: 160,
    render: (row) => h(NInputNumber, {
      value: row.ttl,
      min: 1000,
      step: 1000,
      size: 'small',
      style: 'width: 130px',
      'onUpdate:value': (v: number | null) => { row.ttl = v ?? 60000 },
    }, { suffix: () => 'ms' }),
  },
  {
    title: '当前规则', key: 'summary',
    render: (row) => h(NTag, { size: 'small', type: 'warning', bordered: false }, { default: () => `${row.limit} 次 / ${formatTtl(row.ttl)}` }),
  },
]

onMounted(load)
</script>

<template>
  <div class="page-wrapper">
    <div class="page-header">
      <h2 class="page-title">限流配置</h2>
      <n-button type="primary" :loading="saving" @click="handleSave">保存并即时生效</n-button>
    </div>

    <n-spin :show="loading">
      <n-space vertical :size="16">
        <n-alert type="success" :bordered="false">
          配置保存后立即生效，无需重启服务。<br />
          全局默认对所有接口生效；下方敏感接口的阈值单独覆盖全局默认。
        </n-alert>

        <n-card title="全局默认" :bordered="false" class="rl-card">
          <n-space :size="24" align="center">
            <n-form-item label="请求次数上限（limit）" :show-feedback="false">
              <n-input-number v-model:value="defaultLimit" :min="1" :step="10" style="width: 200px">
                <template #suffix>次</template>
              </n-input-number>
            </n-form-item>
            <n-form-item label="时间窗口（ttl）" :show-feedback="false">
              <n-input-number v-model:value="defaultTtl" :min="1000" :step="1000" style="width: 200px">
                <template #suffix>毫秒</template>
              </n-input-number>
            </n-form-item>
            <n-tag size="small" type="info" :bordered="false">
              即每 {{ formatTtl(defaultTtl) }} 最多 {{ defaultLimit }} 次
            </n-tag>
          </n-space>
        </n-card>

        <n-card title="敏感接口（单独覆盖全局默认）" :bordered="false" class="rl-card">
          <n-data-table
            :columns="columns"
            :data="rules"
            :bordered="false"
            :scroll-x="820"
            :row-key="(row: any) => row.routeKey"
          />
        </n-card>
      </n-space>
    </n-spin>
  </div>
</template>

<style scoped>
.rl-card { border-radius: 12px; }
</style>
