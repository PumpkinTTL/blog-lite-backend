<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { NSpin, NIcon, NEmpty, NButton } from 'naive-ui'
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
  TrendingUpOutline,
  CashOutline,
  WalletOutline,
  CreateOutline,
  CodeOutline,
  GiftOutline,
  TimeOutline,
  PulseOutline,
} from '@vicons/ionicons5'
import * as echarts from 'echarts/core'
import { LineChart, PieChart, BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { getDashboardStats } from '../../api/dashboard'
import type { DashboardStats } from '../../api/dashboard'
import { isDark } from '../../theme'

echarts.use([
  LineChart, PieChart, BarChart,
  GridComponent, TooltipComponent, LegendComponent,
  CanvasRenderer,
])

const router = useRouter()
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

// ========== 问候 ==========
const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 9) return '早上好'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
})
const todayStr = computed(() => {
  const d = new Date()
  const week = ['日', '一', '二', '三', '四', '五', '六']
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${week[d.getDay()]}`
})

// ========== 快捷操作 ==========
const quickActions = [
  { label: '写文章', icon: CreateOutline, path: '/posts/create', gradient: 'linear-gradient(135deg, #3B82F6, #2563EB)' },
  { label: '用户管理', icon: PeopleOutline, path: '/users', gradient: 'linear-gradient(135deg, #8B5CF6, #6D28D9)' },
  { label: '激活码', icon: CodeOutline, path: '/codes', gradient: 'linear-gradient(135deg, #F59E0B, #D97706)' },
  { label: '手动开通', icon: GiftOutline, path: '/memberships', gradient: 'linear-gradient(135deg, #EC4899, #DB2777)' },
]

// ========== 指标卡片 ==========
type CardKey = 'postCount' | 'publishedCount' | 'categoryCount' | 'tagCount'
  | 'userCount' | 'pendingCommentCount' | 'likeCount' | 'favoriteCount' | 'totalViews'

interface StatCard {
  label: string; key: CardKey; icon: any
  color: string; gradient: string; link?: string
}

const statCards: StatCard[] = [
  { label: '文章总数', key: 'postCount', icon: DocumentTextOutline, color: '#3B82F6', gradient: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(37,99,235,0.06))', link: '/posts' },
  { label: '已发布', key: 'publishedCount', icon: PaperPlaneOutline, color: '#06B6D4', gradient: 'linear-gradient(135deg, rgba(6,182,212,0.15), rgba(14,165,233,0.06))' },
  { label: '用户', key: 'userCount', icon: PeopleOutline, color: '#EC4899', gradient: 'linear-gradient(135deg, rgba(236,72,153,0.15), rgba(219,39,119,0.06))', link: '/users' },
  { label: '总阅读', key: 'totalViews', icon: EyeOutline, color: '#10B981', gradient: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(5,150,105,0.06))' },
  { label: '分类', key: 'categoryCount', icon: FolderOutline, color: '#8B5CF6', gradient: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(109,40,217,0.06))', link: '/categories' },
  { label: '标签', key: 'tagCount', icon: PricetagsOutline, color: '#F59E0B', gradient: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(217,119,6,0.06))', link: '/tags' },
  { label: '待审评论', key: 'pendingCommentCount', icon: ChatbubblesOutline, color: '#EF4444', gradient: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(220,38,38,0.06))' },
  { label: '点赞', key: 'likeCount', icon: HeartOutline, color: '#F43F5E', gradient: 'linear-gradient(135deg, rgba(244,63,94,0.15), rgba(225,29,72,0.06))' },
  { label: '收藏', key: 'favoriteCount', icon: StarOutline, color: '#F59E0B', gradient: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(217,119,6,0.06))' },
]

// ========== 捐赠 ==========
const primaryDonation = computed(() => {
  const list = stats.value.donationTotalAmount || []
  return list.find((d: any) => d.currency === 'CNY') || list[0] || null
})

// ========== 图表 ==========
let trendChart: echarts.ECharts | null = null
let pieChart: echarts.ECharts | null = null
let barChart: echarts.ECharts | null = null
const trendEl = ref<HTMLElement | null>(null)
const pieEl = ref<HTMLElement | null>(null)
const barEl = ref<HTMLElement | null>(null)

const lastRefresh = ref(new Date())

async function loadStats() {
  loading.value = true
  try {
    const res = await getDashboardStats()
    if (res.data) { stats.value = res.data; await nextTick(); renderCharts() }
  } catch (e) {
    console.error('获取统计数据失败:', e)
  } finally {
    loading.value = false
  }
}

// ========== 主题 ==========
function axisColor() { return isDark.value ? 'rgba(148,163,184,0.15)' : 'rgba(0,0,0,0.06)' }
function textColor() { return isDark.value ? '#94A3B8' : '#94A3B8' }
function tooltipBg() { return isDark.value ? 'rgba(15,23,42,0.96)' : 'rgba(255,255,255,0.96)' }
function tooltipBorder() { return isDark.value ? 'rgba(71,85,105,0.5)' : 'rgba(203,213,225,0.8)' }
function cardBg() { return isDark.value ? 'rgba(30,41,59,0.7)' : 'rgba(255,255,255,0.8)' }

function fmtNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

// ========== 趋势图 ==========
function renderTrendChart() {
  if (!trendEl.value) return
  if (!trendChart) trendChart = echarts.init(trendEl.value)
  const trend = stats.value.interactionTrend
  const grid = { left: 44, right: 24, top: 48, bottom: 32 }
  trendChart.setOption({
    tooltip: {
      trigger: 'axis',
      backgroundColor: tooltipBg(),
      borderColor: tooltipBorder(),
      textStyle: { color: textColor(), fontSize: 12 },
      extraCssText: 'backdrop-filter: blur(12px); border-radius: 12px; padding: 12px 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.12);',
    },
    legend: { top: 8, right: 0, textStyle: { color: textColor(), fontSize: 11 }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 },
    grid,
    xAxis: {
      type: 'category', data: trend.map((t: any) => t.date.slice(5)),
      axisLine: { lineStyle: { color: axisColor() } },
      axisLabel: { color: textColor(), fontSize: 11 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value', minInterval: 1,
      axisLine: { show: false },
      axisLabel: { color: textColor(), fontSize: 11 },
      splitLine: { lineStyle: { color: axisColor(), type: 'dashed' } },
    },
    series: [
      {
        name: '点赞', type: 'line', smooth: true, symbol: 'circle', symbolSize: 5,
        data: trend.map((t: any) => t.likeCount),
        itemStyle: { color: '#F43F5E' }, lineStyle: { color: '#F43F5E', width: 2.5 },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(244,63,94,0.18)' }, { offset: 1, color: 'rgba(244,63,94,0)' }]) },
      },
      {
        name: '收藏', type: 'line', smooth: true, symbol: 'circle', symbolSize: 5,
        data: trend.map((t: any) => t.favoriteCount),
        itemStyle: { color: '#F59E0B' }, lineStyle: { color: '#F59E0B', width: 2.5 },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(245,158,11,0.18)' }, { offset: 1, color: 'rgba(245,158,11,0)' }]) },
      },
    ],
  })
}

// ========== 饼图 ==========
function renderPieChart() {
  if (!pieEl.value) return
  if (!pieChart) pieChart = echarts.init(pieEl.value)
  const dist = stats.value.postStatusDist
  const palette = ['#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#EF4444', '#EC4899']
  pieChart.setOption({
    tooltip: {
      trigger: 'item', formatter: '{b}: {c} ({d}%)',
      backgroundColor: tooltipBg(), borderColor: tooltipBorder(),
      textStyle: { color: textColor(), fontSize: 12 },
      extraCssText: 'backdrop-filter: blur(12px); border-radius: 12px;',
    },
    legend: { bottom: 0, textStyle: { color: textColor(), fontSize: 11 }, icon: 'circle', itemWidth: 8, itemHeight: 8 },
    color: palette,
    series: [{
      type: 'pie', radius: ['52%', '78%'], center: ['50%', '43%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 6, borderColor: cardBg(), borderWidth: 3 },
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold', color: textColor() } },
      data: dist,
    }],
  })
}

// ========== 柱状图 ==========
function renderBarChart() {
  if (!barEl.value) return
  if (!barChart) barChart = echarts.init(barEl.value)
  const posts = stats.value.topPosts
  if (!posts.length) return
  barChart.setOption({
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      backgroundColor: tooltipBg(), borderColor: tooltipBorder(),
      textStyle: { color: textColor(), fontSize: 12 },
      extraCssText: 'backdrop-filter: blur(12px); border-radius: 12px;',
    },
    grid: { left: 8, right: 40, top: 12, bottom: 24 },
    xAxis: {
      type: 'value',
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: textColor(), fontSize: 10 },
      splitLine: { lineStyle: { color: axisColor(), type: 'dashed' } },
    },
    yAxis: {
      type: 'category', inverse: true,
      data: posts.map((p: any) => p.title.length > 8 ? p.title.slice(0, 8) + '…' : p.title),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: textColor(), fontSize: 11 },
    },
    series: [{
      type: 'bar',
      data: posts.map((p: any, i: number) => ({
        value: p.viewCount,
        itemStyle: {
          borderRadius: [0, 8, 8, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: '#3B82F6' },
            { offset: 1, color: '#818CF8' },
          ]),
        },
      })),
      barWidth: 22,
      label: { show: true, position: 'right', color: textColor(), fontSize: 10, formatter: '{c}' },
    }],
  })
}

function renderCharts() { renderTrendChart(); renderPieChart(); renderBarChart() }
function handleResize() { trendChart?.resize(); pieChart?.resize(); barChart?.resize() }

async function refreshAll() { await loadStats(); lastRefresh.value = new Date() }

watch(isDark, () => nextTick(renderCharts))

onMounted(() => { loadStats(); window.addEventListener('resize', handleResize) })
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  trendChart?.dispose(); pieChart?.dispose(); barChart?.dispose()
})
</script>

<template>
  <div class="page-wrapper" :class="{ dark: isDark }">
    <!-- ===== 欢迎区 ===== -->
    <div class="welcome-bar">
      <div class="welcome-left">
        <h1 class="welcome-hi">
          {{ greeting }}，冬天
          <span class="welcome-wave">👋</span>
        </h1>
        <p class="welcome-meta">
          <n-icon :size="14"><TimeOutline /></n-icon>
          {{ todayStr }}
          <span v-if="lastRefresh" class="refresh-time">· 更新于 {{ lastRefresh.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}</span>
        </p>
      </div>
      <div class="welcome-actions">
        <n-button size="small" :loading="loading" @click="refreshAll" secondary round class="refresh-btn">
          <template #icon><n-icon><RefreshOutline /></n-icon></template>
          刷新
        </n-button>
      </div>
    </div>

    <n-spin :show="loading">
      <div class="dash-body">

        <!-- ===== 捐赠横幅 + 快捷操作 同排 ===== -->
        <div class="top-row">
          <div class="donation-banner" @click="router.push('/donations')">
            <div class="donation-icon">
              <n-icon :size="24" color="#fff"><WalletOutline /></n-icon>
            </div>
            <div class="donation-mid">
              <div class="donation-num">
                {{ primaryDonation ? (primaryDonation.currency === 'CNY' ? '¥' : '$') + primaryDonation.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '¥0.00' }}
              </div>
              <div class="donation-desc">累计捐赠 · {{ stats.donationCount ?? 0 }} 笔</div>
            </div>
            <div class="donation-arrow">→</div>
          </div>

          <div class="quick-row">
            <div
              v-for="act in quickActions"
              :key="act.path"
              class="quick-chip"
              @click="router.push(act.path)"
            >
              <div class="qc-icon" :style="{ background: act.gradient }">
                <n-icon :size="16" color="#fff"><component :is="act.icon" /></n-icon>
              </div>
              <span class="qc-label">{{ act.label }}</span>
            </div>
          </div>
        </div>

        <!-- ===== 指标卡 3x3 ===== -->
        <div class="stat-grid">
          <div
            v-for="s in statCards"
            :key="s.key"
            class="stat-card"
            :class="{ clickable: !!s.link }"
            :style="{ '--c': s.color }"
            @click="s.link && router.push(s.link)"
          >
            <div class="sc-icon">
              <n-icon :size="20"><component :is="s.icon" /></n-icon>
            </div>
            <div class="sc-num">{{ fmtNum(stats[s.key]) }}</div>
            <div class="sc-label">{{ s.label }}</div>
            <div class="sc-bg" :style="{ background: s.gradient }"></div>
          </div>
        </div>

        <!-- ===== 图表区 ===== -->
        <div class="chart-row">
          <div class="card glass">
            <div class="card-head">
              <div class="card-title">
                <span class="ct-dot" style="--cd:#3B82F6"></span>
                <span>7 天互动趋势</span>
              </div>
              <span class="card-tag">点赞 / 收藏</span>
            </div>
            <div ref="trendEl" class="chart-box"></div>
          </div>
          <div class="card glass">
            <div class="card-head">
              <div class="card-title">
                <span class="ct-dot" style="--cd:#8B5CF6"></span>
                <span>文章状态分布</span>
              </div>
              <span class="card-tag">共 {{ stats.postCount }} 篇</span>
            </div>
            <div ref="pieEl" class="chart-box"></div>
          </div>
        </div>

        <!-- ===== 底部 ===== -->
        <div class="bottom-row">
          <div class="card glass">
            <div class="card-head">
              <div class="card-title">
                <span class="ct-dot" style="--cd:#EF4444"></span>
                <span>热门文章 TOP 5</span>
              </div>
              <n-button text type="primary" size="small" @click="router.push('/posts')">查看全部 →</n-button>
            </div>
            <div v-if="!stats.topPosts.length" class="empty"><n-empty description="暂无数据" /></div>
            <ul v-else class="rank-list">
              <li
                v-for="(p, i) in stats.topPosts"
                :key="p.id"
                class="rank-item"
                @click="router.push(`/posts/${p.id}/edit`)"
              >
                <span class="r-no" :class="{ podium: i < 3 }" :style="i === 0 ? '--rp:#EF4444' : i === 1 ? '--rp:#F59E0B' : i === 2 ? '--rp:#10B981' : ''">
                  {{ i + 1 }}
                </span>
                <span class="r-title">{{ p.title }}</span>
                <span class="r-meta">
                  <n-icon :size="13"><EyeOutline /></n-icon>{{ fmtNum(p.viewCount) }}
                  <n-icon :size="13" style="margin-left:10px"><HeartOutline /></n-icon>{{ fmtNum(p.likeCount) }}
                </span>
              </li>
            </ul>
          </div>
          <div class="card glass">
            <div class="card-head">
              <div class="card-title">
                <span class="ct-dot" style="--cd:#8B5CF6"></span>
                <span>阅读量排行</span>
              </div>
            </div>
            <div ref="barEl" class="chart-box" style="height:240px"></div>
          </div>
        </div>

      </div>
    </n-spin>
  </div>
</template>

<style scoped>
/* ===== Dashboard overrides common page-wrapper ===== */
.page-wrapper {
  min-height: 100%;
  overflow: visible; /* dashboard needs full visibility for charts */
}

/* ===== 欢迎区 ===== */
.welcome-bar {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 24px;
}
.welcome-hi {
  font-size: 24px; font-weight: 700; color: var(--n-text-color);
  margin: 0 0 4px 0; letter-spacing: -0.01em;
}
.welcome-wave { display: inline-block; animation: wave 1.8s infinite; transform-origin: 70% 70%; }
@keyframes wave {
  0%,100% { transform: rotate(0deg); }
  25% { transform: rotate(18deg); }
  50% { transform: rotate(-8deg); }
  75% { transform: rotate(14deg); }
}
.welcome-meta {
  font-size: 13px; color: var(--n-text-color-3);
  margin: 0; display: flex; align-items: center; gap: 6px;
}
.refresh-time { opacity: 0.6; }

/* ===== 主内容 ===== */
.dash-body { display: flex; flex-direction: column; gap: 20px; }

/* ===== 顶部行：捐赠 + 快捷操作 ===== */
.top-row {
  display: flex; gap: 16px; align-items: stretch;
}
@media (max-width: 900px) { .top-row { flex-direction: column; } }

.donation-banner {
  flex: 1;
  display: flex; align-items: center; gap: 16px;
  padding: 18px 22px;
  border-radius: 16px;
  background: linear-gradient(135deg, #059669 0%, #10B981 50%, #34D399 100%);
  color: #fff; cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 4px 24px rgba(16,185,129,0.3);
}
.donation-banner:hover { transform: translateY(-2px); box-shadow: 0 6px 32px rgba(16,185,129,0.4); }
.donation-icon {
  width: 44px; height: 44px; border-radius: 12px;
  background: rgba(255,255,255,0.2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.donation-mid { flex: 1; min-width: 0; }
.donation-num { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; }
.donation-desc { font-size: 12px; opacity: 0.85; margin-top: 2px; }
.donation-arrow { font-size: 16px; opacity: 0.7; flex-shrink: 0; }

.quick-row { display: flex; gap: 10px; }
@media (max-width: 700px) { .quick-row { flex-wrap: wrap; } }
.quick-chip {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 14px 18px; border-radius: 14px; cursor: pointer;
  background: var(--n-card-color, #fff);
  border: 1px solid var(--n-border-color, rgba(0,0,0,0.06));
  transition: all 0.2s;
  min-width: 72px;
}
.dark .quick-chip { background: rgba(30,41,59,0.6); border-color: rgba(71,85,105,0.3); }
.quick-chip:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.08); }
.dark .quick-chip:hover { box-shadow: 0 6px 20px rgba(0,0,0,0.3); }
.qc-icon {
  width: 36px; height: 36px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
.qc-label { font-size: 12px; font-weight: 600; color: var(--n-text-color); }

/* ===== 指标卡 3x3 ===== */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
@media (max-width: 900px) { .stat-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 540px) { .stat-grid { grid-template-columns: 1fr; } }

.stat-card {
  --c: #3B82F6;
  position: relative;
  display: flex; flex-direction: column; align-items: flex-start; gap: 10px;
  padding: 20px 22px; border-radius: 16px;
  background: var(--n-card-color, #fff);
  border: 1px solid var(--n-border-color, rgba(0,0,0,0.06));
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden; cursor: default;
}
.stat-card.clickable { cursor: pointer; }
.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(0,0,0,0.1);
  border-color: var(--c);
}
.stat-card .sc-bg {
  position: absolute; inset: 0; opacity: 0; transition: opacity 0.25s;
  pointer-events: none;
}
.stat-card:hover .sc-bg { opacity: 1; }

.sc-icon {
  width: 42px; height: 42px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  color: var(--c);
  background: color-mix(in srgb, var(--c) 12%, transparent);
}
.sc-num {
  font-size: 28px; font-weight: 800; color: var(--n-text-color);
  line-height: 1; font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.sc-label {
  font-size: 13px; color: var(--n-text-color-3); font-weight: 500;
}

/* ===== 卡片基类（glass） ===== */
.card.glass {
  background: var(--n-card-color, #fff);
  border-radius: 18px;
  padding: 24px;
  border: 1px solid var(--n-border-color, rgba(0,0,0,0.06));
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  transition: box-shadow 0.2s;
}
.card.glass:hover {
  box-shadow: 0 8px 28px rgba(0,0,0,0.07);
}

.card-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 16px;
}
.card-title {
  display: flex; align-items: center; gap: 10px;
  font-size: 15px; font-weight: 600; color: var(--n-text-color);
}
.ct-dot {
  --cd: #3B82F6;
  display: inline-block; width: 8px; height: 8px;
  border-radius: 4px; background: var(--cd);
  box-shadow: 0 0 8px var(--cd);
}
.card-tag {
  font-size: 11px; color: var(--n-text-color-3);
  background: var(--n-fill-color, rgba(0,0,0,0.04));
  padding: 3px 10px; border-radius: 20px;
}

.chart-box { width: 100%; height: 280px; }

/* ===== 图表 & 底部行 ===== */
.chart-row {
  display: grid; grid-template-columns: 7fr 5fr; gap: 20px;
}
@media (max-width: 1100px) { .chart-row { grid-template-columns: 1fr; } }

.bottom-row {
  display: grid; grid-template-columns: 1fr 1fr; gap: 20px;
}
@media (max-width: 1100px) { .bottom-row { grid-template-columns: 1fr; } }

.empty { padding: 40px 0; }

/* ===== 排行列表 ===== */
.rank-list { list-style: none; margin: 0; padding: 0; }
.rank-item {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px; margin: 0 -14px;
  border-radius: 10px; cursor: pointer;
  transition: background 0.15s;
}
.rank-item:hover { background: var(--n-color-hover, rgba(59,130,246,0.06)); }
.r-no {
  flex-shrink: 0; width: 26px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 8px;
  font-size: 12px; font-weight: 700;
  color: var(--n-text-color-3);
  background: var(--n-fill-color, rgba(0,0,0,0.05));
}
.r-no.podium {
  color: #fff; background: var(--rp, #3B82F6);
  box-shadow: 0 2px 8px var(--rp, #3B82F6);
}
.r-title {
  flex: 1; min-width: 0;
  font-size: 13px; color: var(--n-text-color); font-weight: 500;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.r-meta {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 12px; color: var(--n-text-color-3);
  font-variant-numeric: tabular-nums; flex-shrink: 0;
}
</style>
