<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { NSpin, NIcon, NEmpty, NButton, NTag, NGrid, NGi, NCard, NSkeleton, NAvatar } from 'naive-ui'
import {
  DocumentTextOutline,
  PaperPlaneOutline,
  FolderOutline,
  PricetagsOutline,
  ImagesOutline,
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
  AddOutline,
  CodeOutline,
  GiftOutline,
  TimeOutline,
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
  LineChart,
  PieChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
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

// ========== 问候语 & 日期 ==========
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

// ========== 指标卡片定义 ==========
type CardKey = 'postCount' | 'publishedCount' | 'categoryCount' | 'tagCount'
  | 'userCount' | 'pendingCommentCount' | 'likeCount' | 'favoriteCount' | 'totalViews'

interface StatCard {
  label: string; key: CardKey; icon: any; color: string; bg: string; link?: string
}

const statCards: StatCard[] = [
  { label: '文章总数', key: 'postCount', icon: DocumentTextOutline, color: '#3B82F6', bg: 'rgba(59,130,246,0.08)', link: '/posts' },
  { label: '已发布', key: 'publishedCount', icon: PaperPlaneOutline, color: '#06B6D4', bg: 'rgba(6,182,212,0.08)' },
  { label: '分类', key: 'categoryCount', icon: FolderOutline, color: '#8B5CF6', bg: 'rgba(139,92,246,0.08)', link: '/categories' },
  { label: '标签', key: 'tagCount', icon: PricetagsOutline, color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', link: '/tags' },
  { label: '用户', key: 'userCount', icon: PeopleOutline, color: '#EC4899', bg: 'rgba(236,72,153,0.08)', link: '/users' },
  { label: '待审评论', key: 'pendingCommentCount', icon: ChatbubblesOutline, color: '#EF4444', bg: 'rgba(239,68,68,0.08)' },
  { label: '总点赞', key: 'likeCount', icon: HeartOutline, color: '#F43F5E', bg: 'rgba(244,63,94,0.08)' },
  { label: '总收藏', key: 'favoriteCount', icon: StarOutline, color: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
  { label: '总阅读', key: 'totalViews', icon: EyeOutline, color: '#10B981', bg: 'rgba(16,185,129,0.08)' },
]

// ========== 快捷操作 ==========
const quickActions = [
  { label: '写文章', icon: CreateOutline, path: '/posts/create', color: '#3B82F6' },
  { label: '管理用户', icon: PeopleOutline, path: '/users', color: '#8B5CF6' },
  { label: '创建激活码', icon: CodeOutline, path: '/codes', color: '#F59E0B' },
  { label: '手动开通', icon: GiftOutline, path: '/memberships', color: '#EC4899' },
]

// ========== 捐赠数据 ==========
const primaryDonation = computed(() => {
  const list = stats.value.donationTotalAmount || []
  return list.find((d: any) => d.currency === 'CNY') || list[0] || null
})

// ========== 图表实例 ==========
let trendChart: echarts.ECharts | null = null
let pieChart: echarts.ECharts | null = null
let barChart: echarts.ECharts | null = null
const trendEl = ref<HTMLElement | null>(null)
const pieEl = ref<HTMLElement | null>(null)
const barEl = ref<HTMLElement | null>(null)

async function loadStats() {
  loading.value = true
  try {
    const res = await getDashboardStats()
    if (res.data) {
      stats.value = res.data
      await nextTick()
      renderCharts()
    }
  } catch (e) {
    console.error('获取统计数据失败:', e)
  } finally {
    loading.value = false
  }
}

// ========== 主题颜色 ==========
function getAxisLineColor() { return isDark.value ? '#334155' : '#E2E8F0' }
function getTextColor() { return isDark.value ? '#CBD5E1' : '#64748B' }
function getTooltipBg() { return isDark.value ? '#1E293B' : '#FFFFFF' }

// ========== Figure minificator ==========
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
  const axisColor = getAxisLineColor()
  const textColor = getTextColor()
  trendChart.setOption({
    tooltip: {
      trigger: 'axis',
      backgroundColor: getTooltipBg(),
      borderColor: axisColor,
      textStyle: { color: textColor, fontSize: 12 },
      extraCssText: 'box-shadow: 0 4px 16px rgba(0,0,0,0.08); border-radius: 10px; padding: 10px 14px;',
    },
    legend: {
      data: ['点赞', '收藏'], top: 8, right: 0,
      textStyle: { color: textColor, fontSize: 12 },
      icon: 'roundRect', itemWidth: 12, itemHeight: 8,
    },
    grid: { left: 44, right: 20, top: 44, bottom: 32 },
    xAxis: {
      type: 'category',
      data: trend.map((t: any) => t.date.slice(5)),
      axisLine: { lineStyle: { color: axisColor } },
      axisLabel: { color: textColor, fontSize: 11 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value', minInterval: 1,
      axisLine: { show: false },
      axisLabel: { color: textColor, fontSize: 11 },
      splitLine: { lineStyle: { color: axisColor, type: 'dashed' } },
      nameTextStyle: { color: textColor, fontSize: 11 },
    },
    series: [
      {
        name: '点赞', type: 'line', smooth: true, symbol: 'circle', symbolSize: 6,
        data: trend.map((t: any) => t.likeCount),
        itemStyle: { color: '#F43F5E' },
        lineStyle: { color: '#F43F5E', width: 2.5 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(244,63,94,0.2)' },
            { offset: 1, color: 'rgba(244,63,94,0)' },
          ]),
        },
      },
      {
        name: '收藏', type: 'line', smooth: true, symbol: 'circle', symbolSize: 6,
        data: trend.map((t: any) => t.favoriteCount),
        itemStyle: { color: '#F59E0B' },
        lineStyle: { color: '#F59E0B', width: 2.5 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(245,158,11,0.2)' },
            { offset: 1, color: 'rgba(245,158,11,0)' },
          ]),
        },
      },
    ],
  })
}

// ========== 饼图（文章状态分布） ==========
function renderPieChart() {
  if (!pieEl.value) return
  if (!pieChart) pieChart = echarts.init(pieEl.value)
  const dist = stats.value.postStatusDist
  const textColor = getTextColor()
  const palette = ['#3B82F6', '#94A3B8', '#F59E0B', '#8B5CF6', '#10B981', '#EF4444']
  pieChart.setOption({
    tooltip: {
      trigger: 'item', formatter: '{b}: {c} ({d}%)',
      backgroundColor: getTooltipBg(), borderColor: getAxisLineColor(),
      textStyle: { color: textColor, fontSize: 12 },
      extraCssText: 'box-shadow: 0 4px 16px rgba(0,0,0,0.08); border-radius: 10px;',
    },
    legend: { bottom: 0, textStyle: { color: textColor, fontSize: 12 }, icon: 'circle', itemWidth: 8, itemHeight: 8 },
    color: palette,
    series: [{
      type: 'pie', radius: ['50%', '75%'], center: ['50%', '44%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 6, borderColor: getTooltipBg(), borderWidth: 2 },
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold', color: textColor } },
      data: dist,
    }],
  })
}

// ========== 柱状图（TOP 5 文章阅读量） ==========
function renderBarChart() {
  if (!barEl.value) return
  if (!barChart) barChart = echarts.init(barEl.value)
  const posts = stats.value.topPosts
  const textColor = getTextColor()
  const axisColor = getAxisLineColor()
  barChart.setOption({
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      backgroundColor: getTooltipBg(), borderColor: axisColor,
      textStyle: { color: textColor, fontSize: 12 },
      extraCssText: 'box-shadow: 0 4px 16px rgba(0,0,0,0.08); border-radius: 10px;',
    },
    grid: { left: 12, right: 40, top: 8, bottom: 24 },
    xAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: textColor, fontSize: 10 },
      splitLine: { lineStyle: { color: axisColor, type: 'dashed' } },
    },
    yAxis: {
      type: 'category', inverse: true,
      data: posts.map((p: any) => p.title.length > 10 ? p.title.slice(0, 10) + '...' : p.title),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: textColor, fontSize: 11 },
    },
    series: [{
      type: 'bar',
      data: posts.map((p: any, i: number) => ({
        value: p.viewCount,
        itemStyle: {
          borderRadius: [0, 6, 6, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: '#3B82F6' },
            { offset: 1, color: '#8B5CF6' },
          ]),
        },
      })),
      barWidth: 20,
      label: { show: true, position: 'right', color: textColor, fontSize: 10 },
    }],
  })
}

function renderCharts() {
  renderTrendChart()
  renderPieChart()
  renderBarChart()
}

function handleResize() {
  trendChart?.resize()
  pieChart?.resize()
  barChart?.resize()
}

const lastRefresh = ref(new Date())

async function refreshAll() {
  await loadStats()
  lastRefresh.value = new Date()
}

watch(isDark, () => nextTick(renderCharts))

onMounted(() => {
  loadStats()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  trendChart?.dispose()
  pieChart?.dispose()
  barChart?.dispose()
})
</script>

<template>
  <div class="page-wrapper">
    <!-- ===== 欢迎区 ===== -->
    <div class="welcome-section">
      <div class="welcome-left">
        <h1 class="welcome-greeting">{{ greeting }}，冬天 👋</h1>
        <p class="welcome-date">
          <n-icon :size="14"><TimeOutline /></n-icon>
          {{ todayStr }}
          <span v-if="lastRefresh" class="refresh-hint">
            · 数据更新于 {{ lastRefresh.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}
          </span>
        </p>
      </div>
      <div class="welcome-right">
        <n-button size="small" :loading="loading" @click="refreshAll" secondary round>
          <template #icon><n-icon><RefreshOutline /></n-icon></template>
          刷新数据
        </n-button>
      </div>
    </div>

    <n-spin :show="loading">
      <div class="dash-body">

        <!-- ===== 捐赠摘要横幅 ===== -->
        <div class="donation-banner" @click="router.push('/donations')">
          <div class="donation-icon-wrap">
            <n-icon :size="28" color="#fff"><WalletOutline /></n-icon>
          </div>
          <div class="donation-info">
            <div class="donation-amount">
              <template v-if="primaryDonation">
                {{ primaryDonation.currency === 'CNY' ? '¥' : (primaryDonation.currency === 'USD' ? '$' : '') }}{{ primaryDonation.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
              </template>
              <template v-else>¥0.00</template>
            </div>
            <div class="donation-sub">
              累计捐赠 · {{ stats.donationCount ?? 0 }} 笔
            </div>
          </div>
          <div class="donation-btn">查看详情 →</div>
        </div>

        <!-- ===== 快捷操作 ===== -->
        <div class="quick-actions">
          <div
            v-for="action in quickActions"
            :key="action.path"
            class="action-chip"
            :style="{ '--ac': action.color }"
            @click="router.push(action.path)"
          >
            <div class="action-icon">
              <n-icon :size="18"><component :is="action.icon" /></n-icon>
            </div>
            <span class="action-label">{{ action.label }}</span>
          </div>
        </div>

        <!-- ===== 指标卡片网格 ===== -->
        <div class="stat-grid">
          <div
            v-for="card in statCards"
            :key="card.key"
            class="stat-card"
            :class="{ clickable: !!card.link }"
            :style="{ '--sc': card.color, '--sbg': card.bg }"
            @click="card.link && router.push(card.link)"
          >
            <div class="stat-icon">
              <n-icon :size="20"><component :is="card.icon" /></n-icon>
            </div>
            <div class="stat-body">
              <div class="stat-value">{{ fmtNum(stats[card.key]) }}</div>
              <div class="stat-label">{{ card.label }}</div>
            </div>
          </div>
        </div>

        <!-- ===== 图表区：两列 ===== -->
        <div class="chart-row">
          <!-- 左：互动趋势（7:5 中的 7） -->
          <div class="card chart-card">
            <div class="card-head">
              <div class="card-title">
                <n-icon :size="18" color="#3B82F6"><TrendingUpOutline /></n-icon>
                <span>7 天互动趋势</span>
              </div>
              <span class="card-badge">点赞 / 收藏</span>
            </div>
            <div ref="trendEl" class="chart-box"></div>
          </div>

          <!-- 右：文章状态分布（饼图） -->
          <div class="card chart-card">
            <div class="card-head">
              <div class="card-title">
                <n-icon :size="18" color="#8B5CF6"><FolderOutline /></n-icon>
                <span>文章状态</span>
              </div>
              <span class="card-badge">共 {{ stats.postCount }} 篇</span>
            </div>
            <div ref="pieEl" class="chart-box"></div>
          </div>
        </div>

        <!-- ===== 底部：热门文章 + 阅读量柱状图 ===== -->
        <div class="bottom-row">
          <!-- 热门文章列表 -->
          <div class="card">
            <div class="card-head">
              <div class="card-title">
                <n-icon :size="18" color="#EF4444"><EyeOutline /></n-icon>
                <span>热门文章 TOP 5</span>
              </div>
              <n-button text type="primary" size="small" @click="router.push('/posts')">查看全部 →</n-button>
            </div>
            <div v-if="stats.topPosts.length === 0" class="empty">
              <n-empty description="暂无数据" />
            </div>
            <ul v-else class="rank-list">
              <li
                v-for="(p, i) in stats.topPosts"
                :key="p.id"
                class="rank-item"
                @click="router.push(`/posts/${p.id}/edit`)"
              >
                <span class="rank-no" :class="{ top: i < 3 }">{{ i + 1 }}</span>
                <span class="rank-title">{{ p.title }}</span>
                <span class="rank-meta">
                  <n-icon :size="13"><EyeOutline /></n-icon>{{ fmtNum(p.viewCount) }}
                  <n-icon :size="13" style="margin-left: 10px"><HeartOutline /></n-icon>{{ fmtNum(p.likeCount) }}
                </span>
              </li>
            </ul>
          </div>

          <!-- 阅读量柱状图 -->
          <div class="card chart-card">
            <div class="card-head">
              <div class="card-title">
                <n-icon :size="18" color="#3B82F6"><TrendingUpOutline /></n-icon>
                <span>阅读量排行</span>
              </div>
            </div>
            <div ref="barEl" class="chart-box" style="height: 240px"></div>
          </div>
        </div>

      </div>
    </n-spin>
  </div>
</template>

<style scoped>
/* ===== 欢迎区 ===== */
.welcome-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}
.welcome-greeting {
  font-size: 22px;
  font-weight: 700;
  color: var(--n-text-color);
  margin: 0 0 4px 0;
}
.welcome-date {
  font-size: 13px;
  color: var(--n-text-color-3);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.refresh-hint {
  color: var(--n-text-color-3);
  opacity: 0.7;
}

/* ===== 主内容区 ===== */
.dash-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}

/* ===== 捐赠横幅 ===== */
.donation-banner {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 20px 24px;
  border-radius: 16px;
  background: linear-gradient(135deg, #10B981 0%, #059669 100%);
  color: #fff;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 4px 20px rgba(16, 185, 129, 0.25);
}
.donation-banner:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 28px rgba(16, 185, 129, 0.35);
}
.donation-icon-wrap {
  width: 48px; height: 48px;
  border-radius: 14px;
  background: rgba(255,255,255,0.2);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.donation-info { flex: 1; min-width: 0; }
.donation-amount {
  font-size: 28px; font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.donation-sub {
  font-size: 13px; opacity: 0.85; margin-top: 2px;
}
.donation-btn {
  font-size: 13px; opacity: 0.9; flex-shrink: 0;
  font-weight: 500;
}

/* ===== 快捷操作 ===== */
.quick-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.action-chip {
  --ac: #3B82F6;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 12px;
  cursor: pointer;
  background: var(--n-card-color, #fff);
  border: 1px solid var(--n-border-color, rgba(0,0,0,0.06));
  transition: all 0.2s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.03);
}
.action-chip:hover {
  border-color: var(--ac);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.06);
}
.action-icon {
  width: 32px; height: 32px;
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: var(--ac);
  background: color-mix(in srgb, var(--ac) 10%, transparent);
}
.action-label {
  font-size: 13px; font-weight: 600;
  color: var(--n-text-color);
}

/* ===== 指标卡片网格 ===== */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
@media (max-width: 900px) { .stat-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 540px) { .stat-grid { grid-template-columns: 1fr; } }

.stat-card {
  --sc: #3B82F6; --sbg: rgba(59,130,246,0.08);
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  border-radius: 14px;
  background: var(--n-card-color, #fff);
  border: 1px solid var(--n-border-color, rgba(0,0,0,0.05));
  transition: all 0.25s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.03);
  cursor: default;
}
.stat-card.clickable { cursor: pointer; }
.stat-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.08);
  border-color: var(--sc);
}
.stat-icon {
  width: 42px; height: 42px;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  color: var(--sc);
  background: var(--sbg);
  flex-shrink: 0;
}
.stat-body { min-width: 0; }
.stat-value {
  font-size: 24px; font-weight: 800;
  color: var(--n-text-color);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
.stat-label {
  font-size: 12px; color: var(--n-text-color-3);
  margin-top: 2px; font-weight: 500;
}

/* ===== 卡片基类 ===== */
.card {
  background: var(--n-card-color, #fff);
  border-radius: 16px;
  padding: 24px;
  border: 1px solid var(--n-border-color, rgba(0,0,0,0.05));
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.card:hover {
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.06);
}

/* ===== 图表行 ===== */
.chart-row {
  display: grid;
  grid-template-columns: 7fr 5fr;
  gap: 20px;
}
@media (max-width: 1100px) { .chart-row { grid-template-columns: 1fr; } }

.chart-card { }
.chart-box { width: 100%; height: 270px; }

/* ===== 底部行 ===== */
.bottom-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
@media (max-width: 1100px) { .bottom-row { grid-template-columns: 1fr; } }

/* ===== 卡片头部 ===== */
.card-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 16px;
}
.card-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 15px; font-weight: 600;
  color: var(--n-text-color);
}
.card-badge {
  font-size: 12px; color: var(--n-text-color-3);
  background: var(--n-fill-color, rgba(0,0,0,0.04));
  padding: 2px 10px; border-radius: 20px;
}

/* ===== 空状态 & 排行列表 ===== */
.empty { padding: 40px 0; }
.rank-list { list-style: none; margin: 0; padding: 0; }
.rank-item {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px; margin: 0 -14px;
  border-radius: 10px; cursor: pointer;
  transition: background 0.15s;
}
.rank-item:hover {
  background: var(--n-color-hover, rgba(59, 130, 246, 0.05));
}
.rank-no {
  flex-shrink: 0;
  width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 8px;
  font-size: 12px; font-weight: 700;
  color: var(--n-text-color-3);
  background: var(--n-fill-color, rgba(0,0,0,0.04));
}
.rank-no.top { color: #fff; background: var(--ac, #3B82F6); }
.rank-no.top:nth-child(n) { --ac: #3B82F6; }
.rank-item:nth-child(1) .rank-no.top { --ac: #EF4444; }
.rank-item:nth-child(2) .rank-no.top { --ac: #F59E0B; }
.rank-item:nth-child(3) .rank-no.top { --ac: #10B981; }
.rank-title {
  flex: 1; min-width: 0;
  font-size: 13px; color: var(--n-text-color);
  font-weight: 500;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.rank-meta {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 12px; color: var(--n-text-color-3);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
</style>
