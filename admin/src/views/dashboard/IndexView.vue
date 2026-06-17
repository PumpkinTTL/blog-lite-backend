<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { NSpin, NIcon, NButton, useMessage } from 'naive-ui'
import {
  DocumentTextOutline, CreateOutline, PeopleOutline,
  ChatbubblesOutline, HeartOutline, StarOutline, EyeOutline,
  RefreshOutline, CashOutline, GiftOutline, ChevronForwardOutline,
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

const username = computed(() => {
  try { const u = JSON.parse(localStorage.getItem('userInfo') || sessionStorage.getItem('userInfo') || '{}'); return u.username || u.name || u.nickname || 'Admin' } catch { return 'Admin' }
})

const donation = computed(() => {
  const list = stats.value.donationTotalAmount || []
  return list.find((d: any) => d.currency === 'CNY') || list[0] || null
})

// === Charts ===
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

function aColor() { return isDark.value ? '#334155' : '#E2E8F0' }
function tColor() { return isDark.value ? '#94A3B8' : '#64748B' }
function bgColor() { return isDark.value ? '#1E293B' : '#FFFFFF' }

function fmtNum(n: number | undefined | null): string {
  if (n == null) return '0'
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}
function timeAgo(s: string): string {
  const m = Math.floor((Date.now() - new Date(s).getTime()) / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return m + '分钟前'
  const h = Math.floor(m / 60)
  if (h < 24) return h + '小时前'
  return Math.floor(h / 24) + '天前'
}
function getGreeting(): string {
  const h = new Date().getHours()
  return h < 12 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好'
}

function renderTrendChart() {
  if (!trendEl.value) return
  if (!trendChart) trendChart = echarts.init(trendEl.value)
  const d = stats.value.interactionTrend
  const tc = tColor()
  trendChart.setOption({
    animation: true, animationDuration: 600,
    tooltip: { trigger: 'axis', backgroundColor: bgColor(), borderColor: '#E2E8F0', textStyle: { color: '#0F172A', fontSize: 12 }, extraCssText: 'border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.08);' },
    legend: { data: ['点赞', '收藏'], top: 0, right: 0, itemGap: 12, textStyle: { color: tc, fontSize: 11, fontWeight: 500 }, icon: 'roundRect', itemWidth: 10, itemHeight: 6 },
    grid: { left: 40, right: 12, top: 36, bottom: 24 },
    xAxis: { type: 'category', data: d.map((t: any) => t.date.slice(5)), axisLine: { show: false }, axisLabel: { color: tc, fontSize: 10 }, axisTick: { show: false } },
    yAxis: { type: 'value', minInterval: 1, axisLine: { show: false }, axisLabel: { color: tc, fontSize: 10 }, splitLine: { lineStyle: { color: aColor(), type: 'dashed' } } },
    series: [
      { name: '点赞', type: 'line', smooth: true, symbol: 'circle', symbolSize: 3, data: d.map((t: any) => t.likeCount), itemStyle: { color: '#F43F5E' }, lineStyle: { color: '#F43F5E', width: 2 }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(244,63,94,0.08)' }, { offset: 1, color: 'rgba(244,63,94,0)' }]) } },
      { name: '收藏', type: 'line', smooth: true, symbol: 'circle', symbolSize: 3, data: d.map((t: any) => t.favoriteCount), itemStyle: { color: '#F59E0B' }, lineStyle: { color: '#F59E0B', width: 2 }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(245,158,11,0.08)' }, { offset: 1, color: 'rgba(245,158,11,0)' }]) } },
    ],
  })
}

function renderPieChart() {
  if (!pieEl.value) return
  if (!pieChart) pieChart = echarts.init(pieEl.value)
  const d = stats.value.postStatusDist
  const total = d.reduce((s: number, x: any) => s + x.value, 0)
  const palette = ['#3B82F6', '#94A3B8', '#F59E0B', '#8B5CF6', '#10B981', '#EF4444']
  const tc = tColor()
  pieChart.setOption({
    animation: true, animationDuration: 600,
    tooltip: { trigger: 'item', formatter: '{b}: {c} 篇 ({d}%)', backgroundColor: bgColor(), borderColor: '#E2E8F0', textStyle: { color: '#0F172A', fontSize: 12 }, extraCssText: 'border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.08);' },
    legend: { orient: 'vertical', top: 'center', left: 10, textStyle: { color: tc, fontSize: 11 }, icon: 'circle', itemWidth: 6, itemHeight: 6, itemGap: 10 },
    color: palette,
    graphic: { type: 'text', left: 'center', top: '42%', style: { text: `共${total}篇`, textAlign: 'center', fill: isDark.value ? '#94A3B8' : '#94A3B8', fontSize: 24, fontWeight: 700 } },
    series: [{ type: 'pie', radius: ['55%', '78%'], center: ['62%', '50%'], itemStyle: { borderRadius: 6, borderColor: bgColor(), borderWidth: 3 }, label: { show: false }, emphasis: { scaleSize: 6, label: { show: true, fontSize: 13, fontWeight: 'bold' } }, data: d }],
  })
}

function renderDonChart() {
  if (!donEl.value) return
  if (!donChart) donChart = echarts.init(donEl.value)
  const d = stats.value.donationTrend
  const tc = tColor()
  donChart.setOption({
    animation: true, animationDuration: 600,
    tooltip: { trigger: 'axis', backgroundColor: bgColor(), borderColor: '#E2E8F0', textStyle: { color: '#0F172A', fontSize: 12 }, extraCssText: 'border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.08);' },
    legend: { data: ['金额', '笔数'], top: 0, right: 0, itemGap: 12, textStyle: { color: tc, fontSize: 11, fontWeight: 500 }, icon: 'roundRect', itemWidth: 10, itemHeight: 6 },
    grid: { left: 44, right: 48, top: 36, bottom: 24 },
    xAxis: { type: 'category', data: d.map((t: any) => t.date.slice(5)), axisLine: { show: false }, axisLabel: { color: tc, fontSize: 10 }, axisTick: { show: false } },
    yAxis: [
      { type: 'value', axisLine: { show: false }, axisLabel: { color: tc, fontSize: 10 }, splitLine: { lineStyle: { color: aColor(), type: 'dashed' } } },
      { type: 'value', axisLine: { show: false }, axisLabel: { color: tc, fontSize: 10 }, splitLine: { show: false } },
    ],
    series: [
      { name: '金额', type: 'line', smooth: true, symbol: 'circle', symbolSize: 3, yAxisIndex: 0, data: d.map((t: any) => t.amount), itemStyle: { color: '#10B981' }, lineStyle: { color: '#10B981', width: 2 }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(16,185,129,0.08)' }, { offset: 1, color: 'rgba(16,185,129,0)' }]) } },
      { name: '笔数', type: 'bar', yAxisIndex: 1, data: d.map((t: any) => t.count), itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#F59E0B' }, { offset: 1, color: '#FDE68A' }]), borderRadius: [3, 3, 0, 0] }, barWidth: 12, barGap: '40%' },
    ],
  })
}

function renderCharts() { renderTrendChart(); renderPieChart(); renderDonChart() }
watch(isDark, () => nextTick(renderCharts))
onMounted(() => { loadStats(); window.addEventListener('resize', () => { trendChart?.resize(); pieChart?.resize(); donChart?.resize() }) })
onBeforeUnmount(() => { trendChart?.dispose(); pieChart?.dispose(); donChart?.dispose() })
</script>

<template>
  <div class="dash">

    <n-spin :show="loading">
      <div class="wrap">

        <!-- ===== Header ===== -->
        <div class="header">
          <div>
            <h1 class="h-title">{{ getGreeting() }}，{{ username }}</h1>
            <p class="h-sub">这是你的博客数据概览</p>
          </div>
          <div class="h-btns">
            <n-button size="small" type="primary" @click="router.push('/posts/create')">
              <template #icon><n-icon size="16"><CreateOutline /></n-icon></template>
              写文章
            </n-button>
            <n-button size="small" @click="router.push('/membership')">
              <template #icon><n-icon size="16"><GiftOutline /></n-icon></template>
            </n-button>
            <n-button size="small" :loading="loading" @click="loadStats" quaternary>
              <template #icon><n-icon size="16"><RefreshOutline /></n-icon></template>
            </n-button>
          </div>
        </div>

        <!-- ===== KPI Cards Row ===== -->
        <div class="kpi-row">
          <!-- Content group -->
          <div class="kpi">
            <div class="kpi-icon" style="background:rgba(59,130,246,0.1);color:#3B82F6"><DocumentTextOutline /></div>
            <div class="kpi-data">
              <div class="kpi-num">{{ fmtNum(stats.postCount) }}</div>
              <div class="kpi-text">文章<span class="kpi-sub">{{ stats.publishedCount }} 已发布</span></div>
            </div>
          </div>
          <div class="kpi">
            <div class="kpi-icon" style="background:rgba(139,92,246,0.1);color:#8B5CF6"><DocumentTextOutline /></div>
            <div class="kpi-data">
              <div class="kpi-num">{{ fmtNum(stats.draftCount) }}</div>
              <div class="kpi-text">草稿</div>
            </div>
          </div>
          <div class="kpi">
            <div class="kpi-icon" style="background:rgba(249,115,22,0.1);color:#F97316"><EyeOutline /></div>
            <div class="kpi-data">
              <div class="kpi-num">{{ fmtNum(stats.totalViews) }}</div>
              <div class="kpi-text">总阅读</div>
            </div>
          </div>
          <div class="kpi">
            <div class="kpi-icon" style="background:rgba(16,185,129,0.1);color:#10B981"><PeopleOutline /></div>
            <div class="kpi-data">
              <div class="kpi-num">{{ fmtNum(stats.userCount) }}</div>
              <div class="kpi-text">用户</div>
            </div>
          </div>

          <!-- Engagement group -->
          <div class="kpi">
            <div class="kpi-icon" style="background:rgba(244,63,94,0.1);color:#F43F5E"><HeartOutline /></div>
            <div class="kpi-data">
              <div class="kpi-num">{{ fmtNum(stats.likeCount) }}</div>
              <div class="kpi-text">点赞</div>
            </div>
          </div>
          <div class="kpi">
            <div class="kpi-icon" style="background:rgba(245,158,11,0.1);color:#F59E0B"><StarOutline /></div>
            <div class="kpi-data">
              <div class="kpi-num">{{ fmtNum(stats.favoriteCount) }}</div>
              <div class="kpi-text">收藏</div>
            </div>
          </div>
          <div class="kpi clickable" @click="router.push('/comments')">
            <div class="kpi-icon" style="background:rgba(239,68,68,0.1);color:#EF4444"><ChatbubblesOutline /></div>
            <div class="kpi-data">
              <div class="kpi-num">{{ fmtNum(stats.pendingCommentCount) }}</div>
              <div class="kpi-text">待审评论</div>
            </div>
          </div>

          <!-- Donation -->
          <div v-if="donation && stats.donationCount > 0" class="kpi clickable" @click="router.push('/donations')">
            <div class="kpi-icon" style="background:rgba(16,185,129,0.1);color:#10B981"><CashOutline /></div>
            <div class="kpi-data">
              <div class="kpi-num">{{ donation.currency === 'CNY' ? '¥' : '$' }}{{ donation.amount }}</div>
              <div class="kpi-text">捐赠<span class="kpi-sub">共 {{ stats.donationCount }} 笔</span></div>
            </div>
          </div>
        </div>

        <!-- ===== Charts ===== -->
        <div class="chart-row">
          <div class="ch-card c2">
            <div class="ch-head">
              <span class="ch-title">互动趋势</span>
              <span class="ch-badge">7 天</span>
            </div>
            <div ref="trendEl" class="ch-body"></div>
          </div>
          <div class="ch-card c1">
            <div class="ch-head">
              <span class="ch-title">文章分布</span>
            </div>
            <div ref="pieEl" class="ch-body"></div>
          </div>
          <div v-if="stats.donationTrend.length" class="ch-card c1">
            <div class="ch-head">
              <span class="ch-title">捐赠趋势</span>
            </div>
            <div ref="donEl" class="ch-body"></div>
          </div>
        </div>

        <!-- ===== Content Row ===== -->
        <div class="bot-row">
          <!-- Top Posts -->
          <div class="bot-card">
            <div class="bot-head">
              <span class="bot-title">热门文章</span>
              <span class="bot-link" @click="router.push('/posts')">查看全部 <n-icon size="12"><ChevronForwardOutline /></n-icon></span>
            </div>
            <div v-if="!stats.topPosts.length" class="bot-empty">暂无数据</div>
            <div v-for="(p, i) in stats.topPosts.slice(0, 6)" :key="p.id" class="bp-item" @click="router.push(`/posts/${p.id}/edit`)">
              <span class="bp-rank">{{ i + 1 }}</span>
              <div class="bp-info">
                <span class="bp-name">{{ p.title }}</span>
                <span class="bp-stat">{{ fmtNum(p.viewCount) }} 阅读 · {{ fmtNum(p.likeCount) }} 赞</span>
              </div>
            </div>
          </div>

          <!-- Recent Users -->
          <div class="bot-card">
            <div class="bot-head">
              <span class="bot-title">最近注册</span>
            </div>
            <div v-if="!stats.recentUsers.length" class="bot-empty">暂无数据</div>
            <div v-for="u in stats.recentUsers.slice(0, 6)" :key="u.id" class="bu-item">
              <div class="bu-ava">{{ (u.nickname || u.username).charAt(0).toUpperCase() }}</div>
              <div class="bu-info">
                <span class="bu-name">{{ u.nickname || u.username }}</span>
                <span class="bu-time">{{ timeAgo(u.createdAt) }}</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </n-spin>

  </div>
</template>

<style scoped>
/* ===== Base ===== */
.dash { padding: 8px; }
.wrap { display: flex; flex-direction: column; gap: 18px; }

/* ===== Header ===== */
.header {
  display: flex; align-items: center; justify-content: space-between;
}
.h-title { margin: 0; font-size: 20px; font-weight: 700; color: var(--n-text-color); letter-spacing: -0.02em; }
.h-sub { margin: 4px 0 0; font-size: 13px; color: var(--n-text-color-3); }
.h-btns { display: flex; gap: 6px; align-items: center; }

/* ===== KPI Row ===== */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.kpi {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 12px;
  padding: 16px;
  display: flex; gap: 14px; align-items: center;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.kpi.clickable { cursor: pointer; }
.kpi.clickable:hover { border-color: var(--n-primary-color); box-shadow: 0 2px 12px rgba(37,99,235,0.06); }
.kpi-icon {
  width: 40px; height: 40px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.kpi-icon :deep(svg) { width: 20px; height: 20px; }
.kpi-data { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.kpi-num { font-size: 22px; font-weight: 700; color: var(--n-text-color); line-height: 1.1; letter-spacing: -0.01em; }
.kpi-text { font-size: 12px; color: var(--n-text-color-3); font-weight: 500; }
.kpi-sub { color: var(--n-text-color-3); margin-left: 6px; font-weight: 400; }

/* ===== Charts ===== */
.chart-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 12px;
}
.ch-card {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 12px;
  padding: 16px;
}
.ch-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.ch-title { font-size: 13px; font-weight: 600; color: var(--n-text-color); }
.ch-badge { font-size: 10px; font-weight: 600; color: #6366F1; background: rgba(99,102,241,0.08); padding: 2px 8px; border-radius: 10px; }
.ch-body { width: 100%; height: 200px; }

/* ===== Bottom Row ===== */
.bot-row {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 12px;
}
.bot-card {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 12px;
  padding: 0;
}
.bot-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px 0;
  margin-bottom: 10px;
}
.bot-title { font-size: 13px; font-weight: 600; color: var(--n-text-color); }
.bot-link { font-size: 12px; color: #3B82F6; cursor: pointer; display: flex; align-items: center; gap: 2px; }
.bot-link:hover { text-decoration: underline; }
.bot-empty { padding: 24px; text-align: center; font-size: 12px; color: var(--n-text-color-3); }

/* Popular post item */
.bp-item {
  display: flex; gap: 12px; padding: 10px 16px;
  cursor: pointer; transition: background 0.15s;
}
.bp-item:hover { background: var(--n-fill-color); }
.bp-rank {
  width: 20px; height: 20px; border-radius: 5px;
  background: var(--n-fill-color);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600; color: var(--n-text-color-3);
  flex-shrink: 0;
}
.bp-item:first-child .bp-rank { background: #FEF3C7; color: #B45309; }
.bp-item:nth-child(2) .bp-rank { background: #E5E7EB; color: #374151; }
.bp-item:nth-child(3) .bp-rank { background: #FEE2E2; color: #991B1B; }
.bp-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.bp-name { font-size: 13px; color: var(--n-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bp-stat { font-size: 11px; color: var(--n-text-color-3); }

/* User item */
.bu-item {
  display: flex; gap: 10px; padding: 10px 16px; align-items: center;
}
.bu-ava {
  width: 28px; height: 28px; border-radius: 8px;
  background: var(--n-fill-color);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 600; color: var(--n-text-color-2);
  flex-shrink: 0;
}
.bu-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.bu-name { font-size: 12px; color: var(--n-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bu-time { font-size: 10px; color: var(--n-text-color-3); }

/* ===== Responsive ===== */
@media (max-width: 1400px) {
  .chart-row { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 1200px) {
  .kpi-row { grid-template-columns: repeat(3, 1fr); }
  .bot-row { grid-template-columns: 1fr; }
}
@media (max-width: 900px) {
  .kpi-row { grid-template-columns: repeat(2, 1fr); }
  .chart-row { grid-template-columns: 1fr; }
}
</style>
