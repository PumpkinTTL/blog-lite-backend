<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { NSpin, NIcon, NButton, NCard, NAvatar, useMessage } from 'naive-ui'
import {
  DocumentTextOutline, PaperPlaneOutline, PeopleOutline,
  ChatbubblesOutline, HeartOutline, StarOutline, EyeOutline,
  RefreshOutline, CashOutline, CreateOutline, GiftOutline,
} from '@vicons/ionicons5'
import * as echarts from 'echarts/core'
import { LineChart, PieChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, GraphicComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { getDashboardStats } from '../../api/dashboard'
import type { DashboardStats } from '../../api/dashboard'
import { isDark } from '../../theme'
import { useAuth } from '../../stores/auth'

echarts.use([LineChart, PieChart, BarChart, GridComponent, TooltipComponent, LegendComponent, GraphicComponent, CanvasRenderer])

const router = useRouter()
const { displayName } = useAuth()
const message = useMessage()
const loading = ref(true)
const stats = ref<DashboardStats>({
  postCount: 0, publishedCount: 0, draftCount: 0, categoryCount: 0, tagCount: 0, mediaCount: 0,
  userCount: 0, pendingCommentCount: 0, likeCount: 0, favoriteCount: 0, totalViews: 0,
  donationCount: 0, donationTotalAmount: [], donationStatusDist: [], donationPayMethodDist: [],
  donationTrend: [], topPosts: [], recentUsers: [], postStatusDist: [], interactionTrend: [],
})

const username = computed(() => displayName.value)

let tcInst: echarts.ECharts | null = null, pcInst: echarts.ECharts | null = null, dcInst: echarts.ECharts | null = null
const tcEl = ref<HTMLElement | null>(null), pcEl = ref<HTMLElement | null>(null), dcEl = ref<HTMLElement | null>(null)

async function load() {
  loading.value = true
  try { const r = await getDashboardStats(); if (r.data) { stats.value = r.data; await nextTick(); draw() } }
  catch (e: any) { message.error(e?.message || '加载失败') }
  finally { loading.value = false }
}

function aC() { return isDark.value ? '#334155' : '#E2E8F0' }
function tC() { return isDark.value ? '#94A3B8' : '#64748B' }
function tbB() { return isDark.value ? '#1E293B' : '#FFFFFF' }

const greet = (() => { const h = new Date().getHours(); return h < 12 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好' })()
const today = (() => { const d = new Date(); const w = ['日','一','二','三','四','五','六']; return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 星期${w[d.getDay()]}` })()
const fmt = (n: any) => { if (n == null || n === 0) return '0'; if (n >= 1e4) return (n / 1e4).toFixed(1) + 'w'; if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k'; return String(n) }
const ago = (s: string) => { const m = Math.floor((Date.now() - new Date(s).getTime()) / 6e4); if (m < 1) return '刚刚'; if (m < 60) return m + '分钟前'; const h = Math.floor(m / 60); if (h < 24) return h + '小时前'; return Math.floor(h / 24) + '天前' }

const statCards = [
  { key: 'postCount', label: '文章', icon: DocumentTextOutline, color: '#3B82F6', bg: '#EFF6FF', to: '/posts' },
  { key: 'publishedCount', label: '已发布', icon: PaperPlaneOutline, color: '#0891B2', bg: '#ECFEFF' },
  { key: 'totalViews', label: '阅读', icon: EyeOutline, color: '#10B981', bg: '#ECFDF5' },
  { key: 'userCount', label: '用户', icon: PeopleOutline, color: '#8B5CF6', bg: '#F5F3FF' },
  { key: 'likeCount', label: '点赞', icon: HeartOutline, color: '#F43F5E', bg: '#FFF1F2' },
  { key: 'favoriteCount', label: '收藏', icon: StarOutline, color: '#F59E0B', bg: '#FFFBEB' },
  { key: 'pendingCommentCount', label: '待审评论', icon: ChatbubblesOutline, color: '#EF4444', bg: '#FEF2F2', to: '/comments', zeroMuted: true },
  { key: 'donation', label: '捐赠', icon: CashOutline, color: '#059669', bg: '#ECFDF5', to: '/donations', value: (s: any) => s.donation && s.donationCount > 0 ? `${s.donation.currency === 'CNY' ? '¥' : '$'}${s.donation.amount}` : '-', accent: (s: any) => s.donation && s.donationCount > 0 },
]

function statValue(card: typeof statCards[0]) {
  if (card.value) return card.value(stats.value)
  const v = (stats.value as any)[card.key]
  return fmt(v)
}

function drawTrend() {
  if (!tcEl.value) return; if (!tcInst) tcInst = echarts.init(tcEl.value)
  const d = stats.value.interactionTrend, tc = tC()
  tcInst.setOption({
    animation: true,
    tooltip: { trigger: 'axis', backgroundColor: tbB(), borderColor: '#E2E8F0', textStyle: { color: '#0F172A', fontSize: 12 }, extraCssText: 'border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.08)' },
    legend: { data: ['点赞','收藏'], top: 0, right: 0, itemGap: 12, textStyle: { color: tc, fontSize: 11 }, icon: 'roundRect', itemWidth: 10, itemHeight: 6 },
    grid: { left: 38, right: 12, top: 34, bottom: 22 },
    xAxis: { type: 'category', data: d.map((t: any) => t.date.slice(5)), axisLine: { show: false }, axisLabel: { color: tc, fontSize: 10 }, axisTick: { show: false } },
    yAxis: { type: 'value', minInterval: 1, axisLine: { show: false }, axisLabel: { color: tc, fontSize: 10 }, splitLine: { lineStyle: { color: aC(), type: 'dashed' } } },
    series: [
      { name: '点赞', type: 'line', smooth: true, symbol: 'circle', symbolSize: 3, data: d.map((t: any) => t.likeCount), itemStyle: { color: '#F43F5E' }, lineStyle: { color: '#F43F5E', width: 2 }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(244,63,94,0.08)' }, { offset: 1, color: 'rgba(244,63,94,0)' }]) } },
      { name: '收藏', type: 'line', smooth: true, symbol: 'circle', symbolSize: 3, data: d.map((t: any) => t.favoriteCount), itemStyle: { color: '#F59E0B' }, lineStyle: { color: '#F59E0B', width: 2 }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(245,158,11,0.08)' }, { offset: 1, color: 'rgba(245,158,11,0)' }]) } },
    ],
  })
}
function drawPie() {
  if (!pcEl.value) return; if (!pcInst) pcInst = echarts.init(pcEl.value)
  const d = stats.value.postStatusDist, total = d.reduce((s: number, x: any) => s + x.value, 0), tc = tC()
  pcInst.setOption({
    animation: true,
    tooltip: { trigger: 'item', formatter: '{b}: {c}篇({d}%)', backgroundColor: tbB(), borderColor: '#E2E8F0', textStyle: { color: '#0F172A', fontSize: 12 }, extraCssText: 'border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.08)' },
    legend: { bottom: 2, textStyle: { color: tc, fontSize: 10 }, icon: 'circle', itemWidth: 6, itemHeight: 6, itemGap: 10 },
    color: ['#3B82F6','#94A3B8','#F59E0B','#8B5CF6','#10B981','#EF4444'],
    graphic: { type: 'text', left: 'center', top: '36%', style: { text: `共${total}篇`, textAlign: 'center', fill: tc, fontSize: 13, fontWeight: 600 } },
    series: [{ type: 'pie', radius: ['52%','76%'], center: ['50%','44%'], itemStyle: { borderRadius: 4, borderColor: tbB(), borderWidth: 2 }, label: { show: false }, emphasis: { scaleSize: 6, label: { show: true, fontSize: 12, fontWeight: 'bold' } }, data: d }],
  })
}
function drawDon() {
  if (!dcEl.value) return; if (!dcInst) dcInst = echarts.init(dcEl.value)
  const d = stats.value.donationTrend, tc = tC()
  dcInst.setOption({
    animation: true,
    tooltip: { trigger: 'axis', backgroundColor: tbB(), borderColor: '#E2E8F0', textStyle: { color: '#0F172A', fontSize: 12 }, extraCssText: 'border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.08)' },
    legend: { data: ['金额','笔数'], top: 0, right: 0, itemGap: 12, textStyle: { color: tc, fontSize: 11 }, icon: 'roundRect', itemWidth: 10, itemHeight: 6 },
    grid: { left: 40, right: 44, top: 34, bottom: 22 },
    xAxis: { type: 'category', data: d.map((t: any) => t.date.slice(5)), axisLine: { show: false }, axisLabel: { color: tc, fontSize: 10 }, axisTick: { show: false } },
    yAxis: [
      { type: 'value', axisLine: { show: false }, axisLabel: { color: tc, fontSize: 10 }, splitLine: { lineStyle: { color: aC(), type: 'dashed' } } },
      { type: 'value', axisLine: { show: false }, axisLabel: { color: tc, fontSize: 10 }, splitLine: { show: false } },
    ],
    series: [
      { name: '金额', type: 'line', smooth: true, symbol: 'circle', symbolSize: 3, yAxisIndex: 0, data: d.map((t: any) => t.amount), itemStyle: { color: '#10B981' }, lineStyle: { color: '#10B981', width: 2 }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(16,185,129,0.08)' }, { offset: 1, color: 'rgba(16,185,129,0)' }]) } },
      { name: '笔数', type: 'bar', yAxisIndex: 1, data: d.map((t: any) => t.count), itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#F59E0B' }, { offset: 1, color: '#FDE68A' }]), borderRadius: [3, 3, 0, 0] }, barWidth: 12, barGap: '40%' },
    ],
  })
}
function draw() { drawTrend(); drawPie(); drawDon() }
watch(isDark, () => nextTick(draw))
onMounted(() => { load(); addEventListener('resize', () => { tcInst?.resize(); pcInst?.resize(); dcInst?.resize() }) })
onBeforeUnmount(() => { tcInst?.dispose(); pcInst?.dispose(); dcInst?.dispose() })
</script>

<template>
  <div class="dash">
    <n-spin :show="loading">
      <div class="dash-body">

        <!-- Header -->
        <div class="dash-hdr">
          <div>
            <h1 class="dash-title">{{ greet }}，{{ username }}</h1>
            <p class="dash-date">{{ today }}</p>
          </div>
          <div class="dash-acts">
            <n-button size="small" type="primary" @click="router.push('/posts/create')">
              <template #icon><n-icon size="14"><CreateOutline /></n-icon></template>写文章
            </n-button>
            <n-button size="small" @click="router.push('/membership')" quaternary>
              <template #icon><n-icon size="14"><GiftOutline /></n-icon></template>会员
            </n-button>
            <n-button size="small" :loading="loading" @click="load" quaternary>
              <template #icon><n-icon size="14"><RefreshOutline /></n-icon></template>
            </n-button>
          </div>
        </div>

        <!-- KPI Cards -->
        <div class="kpi-grid">
          <div
            v-for="card in statCards" :key="card.label"
            class="kpi-card"
            :class="{ clickable: !!card.to }"
            @click="card.to && router.push(card.to)"
          >
            <div class="kpi-icon" :style="{ background: card.bg, color: card.color }">
              <n-icon size="24"><component :is="card.icon" /></n-icon>
            </div>
            <div class="kpi-num" :class="{ muted: card.zeroMuted && !(stats as any)[card.key], accent: card.accent && card.accent(stats) }">
              {{ statValue(card) }}
            </div>
            <div class="kpi-label">{{ card.label }}</div>
          </div>
        </div>

        <!-- Section Divider -->
        <div class="sec-bar">
          <span class="sec-text">数据趋势</span>
          <span class="sec-line"></span>
        </div>

        <!-- Charts -->
        <div class="chart-row">
          <n-card size="small" :bordered="false">
            <template #header><span class="card-hd">7 天互动趋势</span></template>
            <div ref="tcEl" class="chart-box"></div>
          </n-card>
          <n-card size="small" :bordered="false">
            <template #header>
              <span class="card-hd">文章状态分布</span>
            </template>
            <template #header-extra>
              <span class="card-hd-extra">共 {{ stats.postCount }} 篇</span>
            </template>
            <div ref="pcEl" class="chart-box"></div>
          </n-card>
          <n-card size="small" :bordered="false">
            <template #header><span class="card-hd">捐赠趋势</span></template>
            <div ref="dcEl" class="chart-box"></div>
          </n-card>
        </div>

        <!-- Bottom Lists -->
        <div class="list-row">
          <n-card size="small" :bordered="false">
            <template #header>
              <span class="card-hd">热门文章</span>
            </template>
            <template #header-extra>
              <span class="link-text" @click="router.push('/posts')">全部</span>
            </template>
            <div v-if="!stats.topPosts.length" class="empty-tip">暂无数据</div>
            <div
              v-for="(p, i) in stats.topPosts.slice(0, 5)" :key="p.id"
              class="list-item"
              @click="router.push(`/posts/${p.id}/edit`)"
            >
              <span class="rank-badge" :class="'rank-' + (i + 1)">{{ i + 1 }}</span>
              <span class="list-title">{{ p.title }}</span>
              <span class="list-meta">{{ fmt(p.viewCount) }} 阅读 · {{ fmt(p.likeCount) }} 赞</span>
            </div>
          </n-card>
          <n-card size="small" :bordered="false">
            <template #header>
              <span class="card-hd">最近注册</span>
            </template>
            <div v-if="!stats.recentUsers.length" class="empty-tip">暂无数据</div>
            <div
              v-for="u in stats.recentUsers.slice(0, 5)" :key="u.id"
              class="list-item"
            >
              <n-avatar :size="24" round class="user-av">{{ (u.nickname || u.username).charAt(0).toUpperCase() }}</n-avatar>
              <span class="list-title">{{ u.nickname || u.username }}</span>
              <span class="list-meta">{{ ago(u.createdAt) }}</span>
            </div>
          </n-card>
        </div>

      </div>
    </n-spin>
  </div>
</template>

<style scoped>
/* ===== Page ===== */
.dash {
  min-height: 100%;
  padding: 20px 24px 32px;
  background: var(--n-body-color);
}
.dash-body {
  max-width: 1320px;
  display: flex; flex-direction: column; gap: 24px;
}

/* ===== Header ===== */
.dash-hdr {
  display: flex; align-items: flex-start; justify-content: space-between;
}
.dash-title {
  margin: 0;
  font-size: 20px; font-weight: 700;
  color: var(--n-text-color);
  letter-spacing: -0.02em;
}
.dash-date {
  margin: 4px 0 0;
  font-size: 12.5px; color: var(--n-text-color-3);
}
.dash-acts {
  display: flex; gap: 6px; align-items: center; flex-shrink: 0;
}

/* ===== KPI Grid — Bento-inspired modular cards ===== */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}
.kpi-card {
  background: var(--n-card-color);
  border-radius: 16px;
  padding: 20px 16px 16px;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.02);
  transition: box-shadow .2s, transform .2s;
}
.kpi-card.clickable { cursor: pointer; }
.kpi-card.clickable:hover {
  box-shadow: 0 4px 16px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04);
  transform: translateY(-1px);
}
.kpi-icon {
  width: 52px; height: 52px;
  border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.kpi-num {
  font-size: 30px; font-weight: 700;
  color: var(--n-text-color);
  line-height: 1; letter-spacing: -0.02em;
}
.kpi-num.muted { color: var(--n-text-color-3); }
.kpi-num.accent { color: #059669; }
.kpi-label {
  font-size: 12px; font-weight: 500;
  color: var(--n-text-color-3);
}

/* ===== Section Divider ===== */
.sec-bar {
  display: flex; align-items: center; gap: 14px;
}
.sec-text {
  font-size: 14px; font-weight: 700;
  color: var(--n-text-color);
  flex-shrink: 0;
}
.sec-line {
  flex: 1; height: 1px;
  background: var(--n-divider-color, var(--n-border-color));
}

/* ===== Chart Row ===== */
.chart-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.chart-box {
  width: 100%; height: 220px;
}
.card-hd {
  font-size: 13px; font-weight: 600;
  color: var(--n-text-color);
}
.card-hd-extra {
  font-size: 11px; color: var(--n-text-color-3);
}

/* ===== List Row ===== */
.list-row {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 16px;
}
.link-text {
  font-size: 12px; font-weight: 500;
  color: var(--n-primary-color); cursor: pointer;
}
.link-text:hover { text-decoration: underline; }
.empty-tip {
  padding: 28px; text-align: center;
  font-size: 12px; color: var(--n-text-color-3);
}
.list-item {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 0;
  cursor: pointer;
  border-bottom: 1px solid var(--n-border-color);
}
.list-item:last-child { border-bottom: none; }
.rank-badge {
  width: 22px; height: 22px; border-radius: 5px;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; flex-shrink: 0;
  background: var(--n-fill-color);
  color: var(--n-text-color-3);
}
.rank-badge.rank-1 { background: #FEF3C7; color: #B45309; }
.rank-badge.rank-2 { background: #E5E7EB; color: #374151; }
.rank-badge.rank-3 { background: #FEE2E2; color: #991B1B; }
.list-title {
  flex: 1; min-width: 0;
  font-size: 12.5px; color: var(--n-text-color);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.list-meta {
  font-size: 11px; color: var(--n-text-color-3); flex-shrink: 0;
}
.user-av {
  background: var(--n-fill-color) !important; flex-shrink: 0;
}

/* ===== Responsive ===== */
@media (max-width: 1200px) {
  .kpi-grid { grid-template-columns: repeat(4, 1fr); }
}
@media (max-width: 900px) {
  .dash { padding: 16px 12px 24px; }
  .kpi-grid { grid-template-columns: repeat(3, 1fr); }
  .chart-row { grid-template-columns: 1fr; }
  .list-row { grid-template-columns: 1fr; }
  .chart-box { height: 200px; }
}
@media (max-width: 640px) {
  .kpi-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .kpi-card { padding: 16px 10px 12px; }
  .kpi-num { font-size: 24px; }
  .kpi-icon { width: 42px; height: 42px; }
}
</style>