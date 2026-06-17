<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { NSpin, NIcon, NButton, useMessage, NAvatar } from 'naive-ui'
import {
  DocumentTextOutline, PaperPlaneOutline, FolderOutline, PricetagsOutline,
  PeopleOutline, ChatbubblesOutline, HeartOutline, StarOutline, EyeOutline,
  RefreshOutline, CashOutline, CreateOutline, GiftOutline,
} from '@vicons/ionicons5'
import * as echarts from 'echarts/core'
import { LineChart, PieChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, GraphicComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { getDashboardStats } from '../../api/dashboard'
import type { DashboardStats } from '../../api/dashboard'
import { isDark } from '../../theme'

echarts.use([LineChart, PieChart, BarChart, GridComponent, TooltipComponent, LegendComponent, GraphicComponent, CanvasRenderer])

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

// === 用户名 ===
const username = computed(() => {
  const raw = localStorage.getItem('userInfo') || sessionStorage.getItem('userInfo')
  if (raw) {
    try { const u = JSON.parse(raw); return u.username || u.name || u.nickname || 'Admin' }
    catch { /* */ }
  }
  return 'Admin'
})

// === 快捷指标 ===
interface StatCard {
  label: string; key: keyof DashboardStats; icon: any
  color: string; bg: string; link?: string
}
const statCards: StatCard[] = [
  { label: '文章总数', key: 'postCount', icon: DocumentTextOutline, color: '#2563EB', bg: 'rgba(37,99,235,0.08)', link: '/posts' },
  { label: '已发布', key: 'publishedCount', icon: PaperPlaneOutline, color: '#0891B2', bg: 'rgba(8,145,178,0.08)', link: '/posts' },
  { label: '草稿', key: 'draftCount', icon: CreateOutline, color: '#6B7280', bg: 'rgba(107,114,128,0.08)', link: '/posts' },
  { label: '分类', key: 'categoryCount', icon: FolderOutline, color: '#7C3AED', bg: 'rgba(124,58,237,0.08)' },
  { label: '标签', key: 'tagCount', icon: PricetagsOutline, color: '#D97706', bg: 'rgba(217,119,6,0.08)' },
  { label: '用户', key: 'userCount', icon: PeopleOutline, color: '#DB2777', bg: 'rgba(219,39,119,0.08)' },
  { label: '待审评论', key: 'pendingCommentCount', icon: ChatbubblesOutline, color: '#DC2626', bg: 'rgba(220,38,38,0.08)', link: '/comments' },
  { label: '总点赞', key: 'likeCount', icon: HeartOutline, color: '#E11D48', bg: 'rgba(225,29,72,0.08)' },
  { label: '总收藏', key: 'favoriteCount', icon: StarOutline, color: '#CA8A04', bg: 'rgba(202,138,4,0.08)' },
  { label: '总阅读', key: 'totalViews', icon: EyeOutline, color: '#059669', bg: 'rgba(5,150,105,0.08)' },
]

const donation = computed(() => {
  const list = stats.value.donationTotalAmount || []
  return list.find((d: any) => d.currency === 'CNY') || list[0] || null
})

// === ECharts refs ===
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
    if (res.data) stats.value = res.data
  } catch (e: any) { message.error(e?.message || '加载统计数据失败') }
  finally { loading.value = false }
  await nextTick()
  renderCharts()
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
function fmtNum(n: number | undefined | null): string {
  if (n == null) return '0'
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  return `${Math.floor(h / 24)} 天前`
}

// === 图表 ===
function renderTrendChart() {
  if (!trendEl.value) return
  if (!trendChart) trendChart = echarts.init(trendEl.value)
  const trend = stats.value.interactionTrend
  const tc = textColor()
  trendChart.setOption({
    animation: true, animationDuration: 600,
    tooltip: { trigger: 'axis', backgroundColor: tooltipBg(), borderColor: '#E2E8F0', textStyle: { color: '#1E293B', fontSize: 12 }, extraCssText: 'border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.08);' },
    legend: { data: ['点赞', '收藏'], top: 4, right: 4, itemGap: 16, textStyle: { color: tc, fontSize: 11 }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 },
    grid: { left: 36, right: 16, top: 36, bottom: 24 },
    xAxis: { type: 'category', data: trend.map((t: any) => t.date.slice(5)), axisLine: { lineStyle: { color: axisColor() } }, axisLabel: { color: tc, fontSize: 10 }, axisTick: { show: false } },
    yAxis: { type: 'value', minInterval: 1, axisLine: { show: false }, axisLabel: { color: tc, fontSize: 10 }, splitLine: { lineStyle: { color: axisColor(), type: 'dashed' } } },
    series: [
      { name: '点赞', type: 'line', smooth: true, symbol: 'circle', symbolSize: 4, data: trend.map((t: any) => t.likeCount), itemStyle: { color: '#E11D48' }, lineStyle: { color: '#E11D48', width: 2 }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(225,29,72,0.1)' }, { offset: 1, color: 'rgba(225,29,72,0)' }]) } },
      { name: '收藏', type: 'line', smooth: true, symbol: 'circle', symbolSize: 4, data: trend.map((t: any) => t.favoriteCount), itemStyle: { color: '#D97706' }, lineStyle: { color: '#D97706', width: 2 }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(217,119,6,0.1)' }, { offset: 1, color: 'rgba(217,119,6,0)' }]) } },
    ],
  })
}

function renderPieChart() {
  if (!pieEl.value) return
  if (!pieChart) pieChart = echarts.init(pieEl.value)
  const dist = stats.value.postStatusDist
  const total = dist.reduce((s: number, d: any) => s + d.value, 0)
  const palette = ['#2563EB', '#94A3B8', '#D97706', '#7C3AED', '#059669', '#DC2626']
  const tc = textColor()
  pieChart.setOption({
    animation: true, animationDuration: 600,
    tooltip: { trigger: 'item', formatter: '{b}: {c} 篇 ({d}%)', backgroundColor: tooltipBg(), borderColor: '#E2E8F0', textStyle: { color: '#1E293B', fontSize: 12 }, extraCssText: 'border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.08);' },
    legend: { bottom: 4, textStyle: { color: tc, fontSize: 10 }, icon: 'circle', itemWidth: 6, itemHeight: 6, itemGap: 12 },
    color: palette,
    graphic: { type: 'text', left: 'center', top: '34%', style: { text: `共${total}篇`, textAlign: 'center', fill: tc, fontSize: 13, fontWeight: 600 } },
    series: [{ type: 'pie', radius: ['52%', '76%'], center: ['50%', '44%'], itemStyle: { borderRadius: 4, borderColor: tooltipBg(), borderWidth: 2 }, label: { show: false }, emphasis: { scaleSize: 6, label: { show: true, fontSize: 12, fontWeight: 'bold' } }, data: dist }],
  })
}

function renderDonChart() {
  if (!donEl.value) return
  if (!donChart) donChart = echarts.init(donEl.value)
  const data = stats.value.donationTrend
  const tc = textColor()
  donChart.setOption({
    animation: true, animationDuration: 600,
    tooltip: { trigger: 'axis', backgroundColor: tooltipBg(), borderColor: '#E2E8F0', textStyle: { color: '#1E293B', fontSize: 12 }, extraCssText: 'border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.08);' },
    legend: { data: ['金额', '笔数'], top: 4, right: 4, itemGap: 16, textStyle: { color: tc, fontSize: 11 }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 },
    grid: { left: 40, right: 44, top: 36, bottom: 24 },
    xAxis: { type: 'category', data: data.map((t: any) => t.date.slice(5)), axisLine: { lineStyle: { color: axisColor() } }, axisLabel: { color: tc, fontSize: 10 }, axisTick: { show: false } },
    yAxis: [
      { type: 'value', axisLine: { show: false }, axisLabel: { color: tc, fontSize: 10 }, splitLine: { lineStyle: { color: axisColor(), type: 'dashed' } } },
      { type: 'value', axisLine: { show: false }, axisLabel: { color: tc, fontSize: 10 }, splitLine: { show: false } },
    ],
    series: [
      { name: '金额', type: 'line', smooth: true, symbol: 'circle', symbolSize: 4, yAxisIndex: 0, data: data.map((t: any) => t.amount), itemStyle: { color: '#059669' }, lineStyle: { color: '#059669', width: 2 }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(5,150,105,0.1)' }, { offset: 1, color: 'rgba(5,150,105,0)' }]) } },
      { name: '笔数', type: 'bar', yAxisIndex: 1, data: data.map((t: any) => t.count), itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#D97706' }, { offset: 1, color: '#FDE68A' }]), borderRadius: [3, 3, 0, 0] }, barWidth: 12, barGap: '40%' },
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

    <!-- === Top Bar === -->
    <div class="dash-topbar">
      <div>
        <h1 class="topbar-title">仪表盘</h1>
        <p class="topbar-sub">{{ getTodayDate() }}</p>
      </div>
      <div class="topbar-actions">
        <n-button size="small" quaternary @click="router.push('/posts/create')">
          <template #icon><n-icon size="16"><CreateOutline /></n-icon></template>
          写文章
        </n-button>
        <n-button size="small" quaternary @click="router.push('/membership')">
          <template #icon><n-icon size="16"><GiftOutline /></n-icon></template>
          会员
        </n-button>
        <n-button size="small" :loading="loading" @click="loadStats" quaternary>
          <template #icon><n-icon size="16"><RefreshOutline /></n-icon></template>
        </n-button>
      </div>
    </div>

    <n-spin :show="loading">
    <div class="dash-body">

      <!-- === Welcome Banner === -->
      <div class="welcome-banner">
        <div class="wb-left">
          <p class="wb-greeting">{{ getGreeting() }}，{{ username }}</p>
          <p class="wb-desc">欢迎回到管理后台。共有 <b>{{ stats.postCount }}</b> 篇文章，<b>{{ stats.userCount }}</b> 位用户。</p>
        </div>
        <div class="wb-right">
          <div class="wb-stat">
            <span class="wbs-val">{{ fmtNum(stats.totalViews) }}</span>
            <span class="wbs-label">总阅读量</span>
          </div>
          <div class="wb-stat">
            <span class="wbs-val">{{ fmtNum(stats.likeCount) }}</span>
            <span class="wbs-label">总互动</span>
          </div>
        </div>
      </div>

      <!-- === KPI Cards === -->
      <div class="kpi-grid">
        <div
          v-for="c in statCards" :key="c.key"
          class="kpi-card"
          :class="{ clickable: !!c.link }"
          @click="c.link && router.push(c.link)"
        >
          <div class="kpi-top">
            <span class="kpi-label">{{ c.label }}</span>
            <div class="kpi-icon" :style="{ color: c.color, background: c.bg }">
              <n-icon size="16"><component :is="c.icon" /></n-icon>
            </div>
          </div>
          <div class="kpi-value">{{ fmtNum((stats as any)[c.key]) }}</div>
        </div>
      </div>

      <!-- === Donation Hero (only if has donations) === -->
      <div v-if="donation && stats.donationCount > 0" class="donation-hero" @click="router.push('/donations')">
        <div class="dh-icon">
          <n-icon size="22"><CashOutline /></n-icon>
        </div>
        <div class="dh-body">
          <span class="dh-amount">{{ donation.currency === 'CNY' ? '¥' : '$' }}{{ donation.amount.toLocaleString('zh-CN', { minimumFractionDigits: donation.amount % 1 === 0 ? 0 : 2 }) }}</span>
          <span class="dh-label">累计捐赠</span>
        </div>
        <div class="dh-divider" />
        <div class="dh-body">
          <span class="dh-amount">{{ stats.donationCount }}</span>
          <span class="dh-label">捐赠笔数</span>
        </div>
      </div>

      <!-- === Charts Row === -->
      <div class="section-title">数据趋势</div>
      <div class="chart-row">
        <div class="chart-card">
          <div class="chart-hd">
            <span class="chart-title">7 天互动</span>
          </div>
          <div ref="trendEl" class="chart-box" />
        </div>
        <div class="chart-card">
          <div class="chart-hd">
            <span class="chart-title">文章状态</span>
            <span class="chart-sub">共 {{ stats.postCount }} 篇</span>
          </div>
          <div ref="pieEl" class="chart-box" />
        </div>
        <div class="chart-card" v-if="stats.donationTrend.length > 0">
          <div class="chart-hd">
            <span class="chart-title">捐赠趋势</span>
          </div>
          <div ref="donEl" class="chart-box" />
        </div>
      </div>

      <!-- === Bottom Row: Top Posts + Recent Users === -->
      <div class="bottom-grid">
        <!-- 热门文章 -->
        <div class="chart-card">
          <div class="chart-hd">
            <span class="chart-title">热门文章</span>
            <span class="chart-sub link" @click="router.push('/posts')">全部 →</span>
          </div>
          <div v-if="stats.topPosts.length === 0" class="empty-row">暂无数据</div>
          <div v-for="(p, i) in stats.topPosts.slice(0, 5)" :key="p.id" class="post-row" @click="router.push(`/posts/${p.id}/edit`)">
            <span class="pr-rank" :class="'rank-' + (i + 1)">{{ i + 1 }}</span>
            <div class="pr-info">
              <span class="pr-title">{{ p.title }}</span>
              <span class="pr-meta">
                <n-icon size="11"><EyeOutline /></n-icon> {{ fmtNum(p.viewCount) }}
                <n-icon size="11" style="margin-left:8px"><HeartOutline /></n-icon> {{ fmtNum(p.likeCount) }}
              </span>
            </div>
          </div>
        </div>

        <!-- 新用户 -->
        <div class="chart-card">
          <div class="chart-hd">
            <span class="chart-title">最近注册</span>
          </div>
          <div v-if="stats.recentUsers.length === 0" class="empty-row">暂无数据</div>
          <div v-for="u in stats.recentUsers.slice(0, 5)" :key="u.id" class="user-row">
            <n-avatar :size="28" round :style="{ background: 'var(--n-fill-color)', fontSize: '13px' }">
              {{ (u.nickname || u.username).charAt(0).toUpperCase() }}
            </n-avatar>
            <span class="ur-name">{{ u.nickname || u.username }}</span>
            <span class="ur-time">{{ timeAgo(u.createdAt) }}</span>
          </div>
        </div>
      </div>

    </div>
    </n-spin>
  </div>
</template>

<style scoped>
/* === Base === */
.dash { min-height: 100%; padding-bottom: 40px; }
.dash-body { display: flex; flex-direction: column; gap: 16px; }

/* === Top Bar === */
.dash-topbar {
  display: flex; align-items: flex-start; justify-content: space-between;
  margin-bottom: 20px;
}
.topbar-title { margin: 0; font-size: 22px; font-weight: 700; color: var(--n-text-color); letter-spacing: -0.02em; }
.topbar-sub { margin: 3px 0 0; font-size: 12.5px; color: var(--n-text-color-3); }
.topbar-actions { display: flex; gap: 4px; align-items: center; }

/* === Welcome Banner === */
.welcome-banner {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 24px;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(37,99,235,0.05) 0%, rgba(139,92,246,0.03) 100%);
  border: 1px solid var(--n-border-color);
}
.is-dark .welcome-banner {
  background: linear-gradient(135deg, rgba(37,99,235,0.1) 0%, rgba(139,92,246,0.06) 100%);
}
.wb-left { display: flex; flex-direction: column; gap: 4px; }
.wb-greeting { margin: 0; font-size: 17px; font-weight: 700; color: var(--n-text-color); }
.wb-desc { margin: 0; font-size: 13px; color: var(--n-text-color-3); }
.wb-desc b { color: var(--n-text-color-2); }
.wb-right { display: flex; gap: 28px; }
.wb-stat { text-align: center; }
.wbs-val { display: block; font-size: 18px; font-weight: 700; color: var(--n-text-color); }
.wbs-label { display: block; font-size: 11px; color: var(--n-text-color-3); margin-top: 2px; }

@media (max-width: 600px) {
  .welcome-banner { flex-direction: column; align-items: flex-start; gap: 14px; }
  .wb-right { width: 100%; justify-content: flex-start; }
}

/* === KPI Grid === */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}
.kpi-card {
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  transition: border-color 0.2s, box-shadow 0.2s;
}
.kpi-card.clickable { cursor: pointer; }
.kpi-card.clickable:hover { border-color: var(--n-primary-color); box-shadow: 0 2px 12px rgba(37,99,235,0.06); }
.kpi-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.kpi-label { font-size: 12px; font-weight: 500; color: var(--n-text-color-3); }
.kpi-icon { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
.kpi-value { font-size: 24px; font-weight: 700; color: var(--n-text-color); line-height: 1; }

/* === Donation Hero === */
.donation-hero {
  display: flex; align-items: center; gap: 18px;
  padding: 16px 20px; border-radius: 12px;
  background: linear-gradient(135deg, rgba(5,150,105,0.06) 0%, rgba(52,211,153,0.03) 100%);
  border: 1px solid rgba(5,150,105,0.15);
  cursor: pointer; transition: border-color 0.2s;
}
.donation-hero:hover { border-color: rgba(5,150,105,0.35); }
.dh-icon { width: 40px; height: 40px; border-radius: 10px; background: rgba(5,150,105,0.1); color: #059669; display: flex; align-items: center; justify-content: center; }
.dh-divider { width: 1px; height: 32px; background: rgba(5,150,105,0.1); }
.dh-body { display: flex; flex-direction: column; gap: 2px; }
.dh-amount { font-size: 20px; font-weight: 700; color: var(--n-text-color); }
.dh-label { font-size: 11px; color: var(--n-text-color-3); }

/* === Section Title === */
.section-title { font-size: 14px; font-weight: 600; color: var(--n-text-color-2); padding-top: 4px; }

/* === Chart Card === */
.chart-card {
  background: var(--n-card-color);
  border-radius: 12px; padding: 18px;
  border: 1px solid var(--n-border-color);
}
.chart-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.chart-title { font-size: 13.5px; font-weight: 600; color: var(--n-text-color); }
.chart-sub { font-size: 11px; color: var(--n-text-color-3); }
.chart-sub.link { color: #2563EB; cursor: pointer; }
.chart-sub.link:hover { text-decoration: underline; }
.chart-box { width: 100%; height: 220px; }

/* === Chart Row === */
.chart-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }

/* === Bottom Grid === */
.bottom-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; }
@media (max-width: 900px) { .bottom-grid { grid-template-columns: 1fr; } }

/* === Post Row === */
.post-row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px; border-radius: 8px;
  cursor: pointer; transition: background 0.15s;
}
.post-row:hover { background: var(--n-fill-color); }
.pr-rank { width: 22px; height: 22px; border-radius: 6px; background: var(--n-fill-color); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; color: #6B7280; flex-shrink: 0; }
.pr-rank.rank-1 { background: #FEF3C7; color: #B45309; }
.pr-rank.rank-2 { background: #F1F5F9; color: #64748B; }
.pr-rank.rank-3 { background: #FEF2F2; color: #B45309; }
.pr-info { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.pr-title { font-size: 12.5px; color: var(--n-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pr-meta { font-size: 11px; color: var(--n-text-color-3); display: flex; align-items: center; gap: 2px; }

/* === User Row === */
.user-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; transition: background 0.15s; }
.user-row:hover { background: var(--n-fill-color); }
.ur-name { font-size: 13px; color: var(--n-text-color); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ur-time { font-size: 11px; color: var(--n-text-color-3); flex-shrink: 0; }

/* === Empty === */
.empty-row { padding: 32px 12px; text-align: center; font-size: 12.5px; color: var(--n-text-color-3); }

/* === Responsive === */
@media (max-width: 1600px) { .kpi-grid { grid-template-columns: repeat(5, 1fr); } }
@media (max-width: 1200px) { .kpi-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 700px) { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
</style>
