<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { NSpin, NIcon, NButton, useMessage } from 'naive-ui'
import {
  DocumentTextOutline,
  PaperPlaneOutline,
  FolderOutline,
  PricetagsOutline,
  PeopleOutline,
  ChatbubblesOutline,
  HeartOutline,
  StarOutline,
  EyeOutline,
  RefreshOutline,
  CashOutline,
  CreateOutline,
  GiftOutline,
} from '@vicons/ionicons5'
import * as echarts from 'echarts/core'
import { LineChart, PieChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { getDashboardStats } from '../../api/dashboard'
import type { DashboardStats } from '../../api/dashboard'
import { isDark } from '../../theme'

echarts.use([LineChart, PieChart, BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const router = useRouter()
const message = useMessage()
const loading = ref(true)
const stats = ref<DashboardStats>({
  postCount: 0, publishedCount: 0, draftCount: 0,
  categoryCount: 0, tagCount: 0, mediaCount: 0,
  userCount: 0, pendingCommentCount: 0, likeCount: 0,
  favoriteCount: 0, totalViews: 0,
  donationCount: 0, donationTotalAmount: [], donationStatusDist: [],
  donationPayMethodDist: [], donationTrend: [],
  topPosts: [], recentUsers: [], postStatusDist: [],
  interactionTrend: [],
})

type CardKey = 'postCount' | 'publishedCount' | 'categoryCount' | 'tagCount'
  | 'userCount' | 'pendingCommentCount' | 'likeCount' | 'favoriteCount' | 'totalViews'

const cards: { label: string; key: CardKey; icon: any; color: string }[] = [
  { label: '文章总数', key: 'postCount', icon: DocumentTextOutline, color: '#1E40AF' },
  { label: '已发布', key: 'publishedCount', icon: PaperPlaneOutline, color: '#3B82F6' },
  { label: '分类', key: 'categoryCount', icon: FolderOutline, color: '#6366F1' },
  { label: '标签', key: 'tagCount', icon: PricetagsOutline, color: '#F59E0B' },
  { label: '用户', key: 'userCount', icon: PeopleOutline, color: '#EC4899' },
  { label: '待审评论', key: 'pendingCommentCount', icon: ChatbubblesOutline, color: '#EF4444' },
  { label: '总点赞', key: 'likeCount', icon: HeartOutline, color: '#F43F5E' },
  { label: '总收藏', key: 'favoriteCount', icon: StarOutline, color: '#F59E0B' },
  { label: '总阅读', key: 'totalViews', icon: EyeOutline, color: '#10B981' },
]

const donation = computed(() => {
  const list = stats.value.donationTotalAmount || []
  return list.find((d: any) => d.currency === 'CNY') || list[0] || null
})

let trendChart: echarts.ECharts | null = null
let pieChart: echarts.ECharts | null = null
let donChart: echarts.ECharts | null = null
const trendEl = ref<HTMLElement | null>(null)
const pieEl = ref<HTMLElement | null>(null)
const donEl = ref<HTMLElement | null>(null)

async function loadStats() {
  loading.value = true
  try {
    const res = await getDashboardStats()
    if (res.data) { stats.value = res.data; await nextTick(); renderCharts() }
  } catch (e: any) { message.error(e?.message || '加载统计数据失败') }
  finally { loading.value = false }
}

function axisColor() { return isDark.value ? '#334155' : '#E2E8F0' }
function textColor() { return isDark.value ? '#CBD5E1' : '#64748B' }
function tooltipBg() { return isDark.value ? '#1E293B' : '#FFFFFF' }



function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return '早上好'
  if (hour >= 12 && hour < 14) return '中午好'
  if (hour >= 14 && hour < 18) return '下午好'
  return '晚上好'
}

function getTodayDate(): string {
  const d = new Date()
  const weeks = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${weeks[d.getDay()]}`
}

function fmtNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

function renderTrendChart() {
  if (!trendEl.value) return
  if (!trendChart) trendChart = echarts.init(trendEl.value)
  const trend = stats.value.interactionTrend
  const tc = textColor()
  trendChart.setOption({
    animation: true, animationDuration: 600,
    tooltip: { trigger: 'axis', backgroundColor: tooltipBg(), borderColor: '#E2E8F0', textStyle: { color: tc, fontSize: 12 }, extraCssText: 'border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.08);' },
    legend: { data: ['点赞', '收藏'], top: 6, right: 6, itemGap: 16, textStyle: { color: tc, fontSize: 12 }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 },
    grid: { left: 40, right: 20, top: 40, bottom: 28 },
    xAxis: { type: 'category', data: trend.map((t: any) => t.date.slice(5)), axisLine: { lineStyle: { color: axisColor() } }, axisLabel: { color: tc, fontSize: 11 }, axisTick: { show: false } },
    yAxis: { type: 'value', minInterval: 1, axisLine: { show: false }, axisLabel: { color: tc, fontSize: 11 }, splitLine: { lineStyle: { color: axisColor(), type: 'dashed' } } },
    series: [
      { name: '点赞', type: 'line', smooth: true, symbol: 'circle', symbolSize: 5, data: trend.map((t: any) => t.likeCount), itemStyle: { color: '#F43F5E' }, lineStyle: { color: '#F43F5E', width: 2.5 }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(244,63,94,0.12)' }, { offset: 1, color: 'rgba(244,63,94,0)' }]) } },
      { name: '收藏', type: 'line', smooth: true, symbol: 'circle', symbolSize: 5, data: trend.map((t: any) => t.favoriteCount), itemStyle: { color: '#F59E0B' }, lineStyle: { color: '#F59E0B', width: 2.5 }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(245,158,11,0.12)' }, { offset: 1, color: 'rgba(245,158,11,0)' }]) } },
    ],
  })
}

function renderPieChart() {
  if (!pieEl.value) return
  if (!pieChart) pieChart = echarts.init(pieEl.value)
  const dist = stats.value.postStatusDist
  const total = dist.reduce((s: number, d: any) => s + d.value, 0)
  const palette = ['#2563EB', '#94A3B8', '#F59E0B', '#8B5CF6', '#10B981', '#EF4444']
  const tc = textColor()
  pieChart.setOption({
    animation: true, animationDuration: 600,
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)', backgroundColor: tooltipBg(), borderColor: '#E2E8F0', textStyle: { color: tc, fontSize: 12 }, extraCssText: 'border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.08);' },
    legend: { bottom: 4, textStyle: { color: tc, fontSize: 11 }, icon: 'circle', itemWidth: 8, itemHeight: 8 },
    color: palette,
    graphic: { type: 'text', left: 'center', top: '36%', style: { text: `共${total}篇`, textAlign: 'center', fill: tc, fontSize: 13, fontWeight: 600 } },
    series: [{
      type: 'pie', radius: ['52%', '76%'], center: ['50%', '44%'],
      itemStyle: { borderRadius: 5, borderColor: tooltipBg(), borderWidth: 3 },
      label: { show: false },
      emphasis: { scaleSize: 6, label: { show: true, fontSize: 13, fontWeight: 'bold' } },
      data: dist,
    }],
  })
}

function renderDonChart() {
  if (!donEl.value) return
  if (!donChart) donChart = echarts.init(donEl.value)
  const data = stats.value.donationTrend
  const tc = textColor()
  donChart.setOption({
    animation: true, animationDuration: 600,
    tooltip: { trigger: 'axis', backgroundColor: tooltipBg(), borderColor: '#E2E8F0', textStyle: { color: tc, fontSize: 12 }, extraCssText: 'border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.08);' },
    legend: { data: ['金额', '笔数'], top: 6, right: 6, itemGap: 16, textStyle: { color: tc, fontSize: 11 }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 },
    grid: { left: 44, right: 48, top: 38, bottom: 28 },
    xAxis: { type: 'category', data: data.map((t: any) => t.date.slice(5)), axisLine: { lineStyle: { color: axisColor() } }, axisLabel: { color: tc, fontSize: 11 }, axisTick: { show: false } },
    yAxis: [
      { type: 'value', axisLine: { show: false }, axisLabel: { color: tc, fontSize: 11 }, splitLine: { lineStyle: { color: axisColor(), type: 'dashed' } } },
      { type: 'value', axisLine: { show: false }, axisLabel: { color: tc, fontSize: 11 }, splitLine: { show: false } },
    ],
    series: [
      { name: '金额', type: 'line', smooth: true, symbol: 'circle', symbolSize: 5, yAxisIndex: 0, data: data.map((t: any) => t.amount), itemStyle: { color: '#10B981' }, lineStyle: { color: '#10B981', width: 2.5 }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(16,185,129,0.12)' }, { offset: 1, color: 'rgba(16,185,129,0)' }]) } },
      { name: '笔数', type: 'bar', yAxisIndex: 1, data: data.map((t: any) => t.count), itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#F59E0B' }, { offset: 1, color: '#FCD34D' }]), borderRadius: [3, 3, 0, 0] }, barWidth: 14, barGap: '40%' },
    ],
  })
}

function renderCharts() { renderTrendChart(); renderPieChart(); renderDonChart() }
function handleResize() { trendChart?.resize(); pieChart?.resize(); donChart?.resize() }
watch(isDark, () => nextTick(renderCharts))

onMounted(() => { loadStats(); window.addEventListener('resize', handleResize) })
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  trendChart?.dispose(); pieChart?.dispose(); donChart?.dispose()
})
</script>

<template>
  <div class="dash" :class="{ 'is-dark': isDark }">
    <div class="dash-bar">
      <div class="dash-left">
        <span class="dash-title">数据概览</span>
        <n-button text size="tiny" style="color:#3B82F6;gap:4px;margin-left:16px" @click="router.push('/posts/create')">
          <n-icon size="14"><CreateOutline /></n-icon>写文章
        </n-button>
        <n-button text size="tiny" style="color:#8B5CF6;gap:4px;margin-left:8px" @click="router.push('/membership')">
          <n-icon size="14"><GiftOutline /></n-icon>开通会员
        </n-button>
      </div>
      <n-button size="small" :loading="loading" @click="loadStats" quaternary>
        <template #icon><n-icon><RefreshOutline /></n-icon></template>
        刷新
      </n-button>
    </div>

    <n-spin :show="loading">
      <div class="dash-body">

        <!-- greeting card -->
        <div class="card greeting-card">
          <div class="greeting-content">
            <h3 class="greeting-title">{{ getGreeting() }}，Admin</h3>
            <p class="greeting-desc">欢迎回来！今天系统运行状况良好，继续创作优秀的内容吧。</p>
          </div>
          <div class="greeting-date">
            <span class="g-date-text">{{ getTodayDate() }}</span>
          </div>
        </div>

        <!-- metrics card -->
        <div class="card metrics">
          <!-- donation row -->
          <div class="metric-hero" @click="router.push('/donations')">
            <div class="mh-icon" style="color:#10B981"><n-icon size="22"><CashOutline /></n-icon></div>
            <div class="mh-data">
              <div class="mh-val">{{ donation ? (donation.currency === 'CNY' ? '¥' : '$') + donation.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '¥0.00' }}</div>
              <div class="mh-label">累计捐赠 · {{ stats.donationCount ?? 0 }} 笔</div>
            </div>
          </div>
          <div class="divider"></div>
          <!-- metric grid -->
          <div class="metric-grid">
            <div v-for="c in cards" :key="c.key" class="metric">
              <div class="m-icon" :style="{ color: c.color }">
                <n-icon size="18"><component :is="c.icon" /></n-icon>
              </div>
              <div class="m-body">
                <div class="m-val">{{ fmtNum(stats[c.key]) }}</div>
                <div class="m-label">{{ c.label }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- charts 3-col -->
        <div class="chart-row">
          <div class="card">
            <div class="card-hd">
              <span class="card-title">7 天互动趋势</span>
            </div>
            <div ref="trendEl" class="chart-box"></div>
          </div>
          <div class="card">
            <div class="card-hd">
              <span class="card-title">文章状态分布</span>
              <span class="card-tag">共 {{ stats.postCount }} 篇</span>
            </div>
            <div ref="pieEl" class="chart-box"></div>
          </div>
          <div class="card">
            <div class="card-hd">
              <span class="card-title">捐赠趋势</span>
            </div>
            <div ref="donEl" class="chart-box"></div>
          </div>
        </div>



      </div>
    </n-spin>
  </div>
</template>

<style scoped>
.dash { min-height: 100%; }
.dash-body { display: flex; flex-direction: column; gap: 16px; }

/* greeting card */
.greeting-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.06) 0%, rgba(96, 165, 250, 0.02) 100%);
  border: 1px solid var(--n-border-color);
  padding: 24px;
  gap: 16px;
}

.is-dark .greeting-card {
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.12) 0%, rgba(30, 41, 59, 0.5) 100%);
}

.greeting-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.greeting-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--n-text-color);
}

.greeting-desc {
  margin: 0;
  font-size: 13px;
  color: var(--n-text-color-3);
}

.greeting-date {
  display: flex;
  align-items: center;
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  padding: 8px 16px;
  border-radius: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
}

.g-date-text {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--n-text-color-2);
}

@media (max-width: 600px) {
  .greeting-card {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  .greeting-date {
    align-self: flex-start;
  }
}

/* header bar */
.dash-bar {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 16px;
}
.dash-left { display: flex; align-items: center; }
.dash-title { font-size: 18px; font-weight: 700; color: var(--n-text-color); }

/* card */
.card {
  background: var(--n-card-color);
  border-radius: 12px; padding: 20px;
  border: 1px solid var(--n-border-color);
}
.card-hd {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px;
}
.card-title { font-size: 14px; font-weight: 600; color: var(--n-text-color); }
.card-tag { font-size: 11px; color: var(--n-text-color-3); }

/* metrics card */
.metrics { padding: 20px 24px; }
.metric-hero {
  display: flex; align-items: center; gap: 14px;
  padding: 2px 8px; margin: -2px -8px; border-radius: 8px;
  cursor: pointer; transition: background 0.15s;
}
.metric-hero:hover { background: var(--n-color-hover); }
.mh-icon { flex-shrink: 0; }
.mh-data { min-width: 0; }
.mh-val { font-size: 24px; font-weight: 700; color: var(--n-text-color); letter-spacing: -0.01em; }
.mh-label { font-size: 12px; color: var(--n-text-color-3); margin-top: 2px; }

.divider {
  height: 1px; background: var(--n-divider-color);
  margin: 16px 0;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}
.metric {
  display: flex; align-items: center; gap: 10px;
}
.m-icon {
  flex-shrink: 0; width: 34px; height: 34px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 8px;
  background: var(--n-fill-color);
}
.m-body { min-width: 0; }
.m-val { font-size: 20px; font-weight: 700; color: var(--n-text-color); line-height: 1.1; }
.m-label { font-size: 11px; color: var(--n-text-color-3); margin-top: 2px; }

/* charts */
.chart-row {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
}
@media (max-width: 1400px) { .chart-row { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 900px) { .chart-row { grid-template-columns: 1fr; } }
.chart-box { width: 100%; height: 230px; }

</style>
