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

const donation = computed(() => {
  const list = stats.value.donationTotalAmount || []
  return list.find((d: any) => d.currency === 'CNY') || list[0] || null
})

// === 图表 ===
function renderTrendChart() {
  if (!trendEl.value) return
  if (!trendChart) trendChart = echarts.init(trendEl.value)
  const trend = stats.value.interactionTrend
  const tc = textColor()
  trendChart.setOption({
    animation: true, animationDuration: 600,
    tooltip: { trigger: 'axis', backgroundColor: tooltipBg(), borderColor: '#E2E8F0', textStyle: { color: '#1E293B', fontSize: 12 }, extraCssText: 'border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.08);' },
    legend: { data: ['点赞', '收藏'], top: 4, right: 4, itemGap: 12, textStyle: { color: tc, fontSize: 11 }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 },
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
    legend: { data: ['金额', '笔数'], top: 4, right: 4, itemGap: 12, textStyle: { color: tc, fontSize: 11 }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 },
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
    <n-spin :show="loading">
      <div class="dash-body">

        <!-- === Compact Header === -->
        <div class="compact-header">
          <div class="ch-left">
            <h1 class="ch-title">仪表盘</h1>
            <span class="ch-greeting">{{ getGreeting() }}，{{ username }}</span>
            <span class="ch-date">{{ getTodayDate() }}</span>
          </div>
          <div class="ch-actions">
            <n-button size="small" quaternary @click="router.push('/posts/create')">
              <template #icon><n-icon size="14"><CreateOutline /></n-icon></template>
              写文章
            </n-button>
            <n-button size="small" quaternary @click="router.push('/membership')">
              <template #icon><n-icon size="14"><GiftOutline /></n-icon></template>
              会员
            </n-button>
            <n-button size="small" :loading="loading" @click="loadStats" quaternary>
              <template #icon><n-icon size="14"><RefreshOutline /></n-icon></template>
            </n-button>
          </div>
        </div>

        <!-- === Compact Stats Grid (4 columns) === -->
        <div class="stats-grid">
          <!-- Row 1: Core content stats -->
          <div class="stat-box clickable" @click="router.push('/posts')">
            <div class="sb-icon" style="color:#2563EB;background:rgba(37,99,235,0.1)"><n-icon size="16"><DocumentTextOutline /></n-icon></div>
            <div class="sb-body">
              <span class="sb-val">{{ fmtNum(stats.postCount) }}</span>
              <span class="sb-label">文章</span>
            </div>
          </div>
          <div class="stat-box clickable" @click="router.push('/posts')">
            <div class="sb-icon" style="color:#0891B2;background:rgba(8,145,178,0.1)"><n-icon size="16"><PaperPlaneOutline /></n-icon></div>
            <div class="sb-body">
              <span class="sb-val">{{ fmtNum(stats.publishedCount) }}</span>
              <span class="sb-label">已发布</span>
            </div>
          </div>
          <div class="stat-box clickable" @click="router.push('/posts')">
            <div class="sb-icon" style="color:#6B7280;background:rgba(107,114,128,0.1)"><n-icon size="16"><CreateOutline /></n-icon></div>
            <div class="sb-body">
              <span class="sb-val">{{ fmtNum(stats.draftCount) }}</span>
              <span class="sb-label">草稿</span>
            </div>
          </div>
          <div class="stat-box">
            <div class="sb-icon" style="color:#7C3AED;background:rgba(124,58,237,0.1)"><n-icon size="16"><FolderOutline /></n-icon></div>
            <div class="sb-body">
              <span class="sb-val">{{ fmtNum(stats.categoryCount) }}</span>
              <span class="sb-label">分类</span>
            </div>
          </div>

          <!-- Row 2: User & interaction -->
          <div class="stat-box">
            <div class="sb-icon" style="color:#D97706;background:rgba(217,119,6,0.1)"><n-icon size="16"><PricetagsOutline /></n-icon></div>
            <div class="sb-body">
              <span class="sb-val">{{ fmtNum(stats.tagCount) }}</span>
              <span class="sb-label">标签</span>
            </div>
          </div>
          <div class="stat-box clickable" @click="router.push('/users')">
            <div class="sb-icon" style="color:#DB2777;background:rgba(219,39,119,0.1)"><n-icon size="16"><PeopleOutline /></n-icon></div>
            <div class="sb-body">
              <span class="sb-val">{{ fmtNum(stats.userCount) }}</span>
              <span class="sb-label">用户</span>
            </div>
          </div>
          <div class="stat-box clickable" @click="router.push('/comments')">
            <div class="sb-icon" style="color:#DC2626;background:rgba(220,38,38,0.1)"><n-icon size="16"><ChatbubblesOutline /></n-icon></div>
            <div class="sb-body">
              <span class="sb-val">{{ fmtNum(stats.pendingCommentCount) }}</span>
              <span class="sb-label">待审</span>
            </div>
          </div>
          <div class="stat-box">
            <div class="sb-icon" style="color:#059669;background:rgba(5,150,105,0.1)"><n-icon size="16"><EyeOutline /></n-icon></div>
            <div class="sb-body">
              <span class="sb-val">{{ fmtNum(stats.totalViews) }}</span>
              <span class="sb-label">阅读</span>
            </div>
          </div>

          <!-- Row 3: Engagement -->
          <div class="stat-box">
            <div class="sb-icon" style="color:#E11D48;background:rgba(225,29,72,0.1)"><n-icon size="16"><HeartOutline /></n-icon></div>
            <div class="sb-body">
              <span class="sb-val">{{ fmtNum(stats.likeCount) }}</span>
              <span class="sb-label">点赞</span>
            </div>
          </div>
          <div class="stat-box">
            <div class="sb-icon" style="color:#CA8A04;background:rgba(202,138,4,0.1)"><n-icon size="16"><StarOutline /></n-icon></div>
            <div class="sb-body">
              <span class="sb-val">{{ fmtNum(stats.favoriteCount) }}</span>
              <span class="sb-label">收藏</span>
            </div>
          </div>
          <div v-if="donation && stats.donationCount > 0" class="stat-box clickable" @click="router.push('/donations')">
            <div class="sb-icon" style="color:#059669;background:rgba(5,150,105,0.1)"><n-icon size="16"><CashOutline /></n-icon></div>
            <div class="sb-body">
              <span class="sb-val">{{ donation.currency === 'CNY' ? '¥' : '$' }}{{ donation.amount }}</span>
              <span class="sb-label">捐赠</span>
            </div>
          </div>
          <div v-else class="stat-box empty"></div>
        </div>

        <!-- === Charts Row === -->
        <div class="charts-row">
          <div class="chart-box">
            <div class="chart-hd"><span>7天互动</span></div>
            <div ref="trendEl" class="chart-canvas" />
          </div>
          <div class="chart-box">
            <div class="chart-hd"><span>文章状态</span></div>
            <div ref="pieEl" class="chart-canvas" />
          </div>
          <div v-if="stats.donationTrend.length > 0" class="chart-box">
            <div class="chart-hd"><span>捐赠趋势</span></div>
            <div ref="donEl" class="chart-canvas" />
          </div>
        </div>

        <!-- === Bottom Lists === -->
        <div class="lists-row">
          <div class="list-box">
            <div class="list-hd"><span>热门文章</span><a @click="router.push('/posts')">全部</a></div>
            <div v-if="stats.topPosts.length === 0" class="list-empty">暂无数据</div>
            <div v-for="(p, i) in stats.topPosts.slice(0, 5)" :key="p.id" class="list-item" @click="router.push(`/posts/${p.id}/edit`)">
              <span class="li-rank" :class="'r'+(i+1)">{{ i+1 }}</span>
              <span class="li-title">{{ p.title }}</span>
              <span class="li-meta"><n-icon size="10"><EyeOutline /></n-icon>{{ fmtNum(p.viewCount) }}</span>
            </div>
          </div>
          <div class="list-box">
            <div class="list-hd"><span>最近注册</span></div>
            <div v-if="stats.recentUsers.length === 0" class="list-empty">暂无数据</div>
            <div v-for="u in stats.recentUsers.slice(0, 5)" :key="u.id" class="list-item">
              <n-avatar :size="24" round :style="{ background: 'var(--n-fill-color)', fontSize: '12px' }">
                {{ (u.nickname || u.username).charAt(0).toUpperCase() }}
              </n-avatar>
              <span class="li-name">{{ u.nickname || u.username }}</span>
              <span class="li-time">{{ timeAgo(u.createdAt) }}</span>
            </div>
          </div>
        </div>

      </div>
    </n-spin>
  </div>
</template>

<style scoped>
.dash { min-height: 100%; }
.dash-body { padding: 16px; display: flex; flex-direction: column; gap: 12px; }

/* === Compact Header === */
.compact-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 0;
}
.ch-left { display: flex; align-items: baseline; gap: 16px; }
.ch-title { margin: 0; font-size: 18px; font-weight: 700; color: var(--n-text-color); }
.ch-greeting { font-size: 13px; color: var(--n-text-color-2); }
.ch-date { font-size: 12px; color: var(--n-text-color-3); }
.ch-actions { display: flex; gap: 4px; }

/* === Stats Grid (4 columns, tight) === */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
.stat-box {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
}
.stat-box.clickable { cursor: pointer; }
.stat-box.clickable:hover { border-color: var(--n-primary-color); }
.stat-box.empty { background: transparent; border: none; }
.sb-icon {
  width: 32px; height: 32px;
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.sb-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sb-val { font-size: 18px; font-weight: 700; color: var(--n-text-color); line-height: 1; }
.sb-label { font-size: 11px; color: var(--n-text-color-3); }

/* === Charts === */
.charts-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.chart-box {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 12px;
}
.chart-hd {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px; font-weight: 600; color: var(--n-text-color);
}
.chart-canvas { width: 100%; height: 200px; }

/* === Lists === */
.lists-row {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 12px;
}
.list-box {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 12px;
}
.list-hd {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px; font-weight: 600; color: var(--n-text-color);
}
.list-hd a { font-size: 11px; color: #2563EB; cursor: pointer; }
.list-hd a:hover { text-decoration: underline; }
.list-empty { padding: 20px 0; text-align: center; font-size: 12px; color: var(--n-text-color-3); }
.list-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--n-border-color);
  cursor: pointer;
}
.list-item:last-child { border-bottom: none; }
.list-item:hover { background: var(--n-fill-color); margin: 0 -12px; padding: 8px 12px; border-radius: 6px; }
.li-rank {
  width: 18px; height: 18px;
  border-radius: 4px;
  background: var(--n-fill-color);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 600; color: #6B7280;
  flex-shrink: 0;
}
.li-rank.r1 { background: #FEF3C7; color: #B45309; }
.li-rank.r2 { background: #E5E7EB; color: #374151; }
.li-rank.r3 { background: #FEF2F2; color: #991B1B; }
.li-title { flex: 1; min-width: 0; font-size: 12px; color: var(--n-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.li-meta { font-size: 10px; color: var(--n-text-color-3); display: flex; align-items: center; gap: 3px; flex-shrink: 0; }
.li-name { flex: 1; min-width: 0; font-size: 12px; color: var(--n-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.li-time { font-size: 10px; color: var(--n-text-color-3); flex-shrink: 0; }

/* === Responsive === */
@media (max-width: 1200px) {
  .stats-grid { grid-template-columns: repeat(3, 1fr); }
  .charts-row { grid-template-columns: 1fr; }
  .lists-row { grid-template-columns: 1fr; }
}
@media (max-width: 700px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .compact-header { flex-direction: column; align-items: flex-start; gap: 8px; }
}
</style>
