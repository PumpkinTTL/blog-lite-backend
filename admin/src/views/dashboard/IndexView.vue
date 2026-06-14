<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { NSpin, NIcon, NEmpty, NButton, NAvatar } from 'naive-ui'
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
  CreateOutline,
  GiftOutline,
  TimeOutline,
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
  } catch (e) { console.error(e) }
  finally { loading.value = false }
}

function axisColor() { return isDark.value ? '#334155' : '#E2E8F0' }
function textColor() { return isDark.value ? '#CBD5E1' : '#64748B' }
function tooltipBg() { return isDark.value ? '#1E293B' : '#FFFFFF' }

function getAvatarStyle(username: string) {
  const darkThemes = [
    { bg: 'rgba(59, 130, 246, 0.2)', color: '#60A5FA' },   // Blue
    { bg: 'rgba(236, 72, 153, 0.2)', color: '#F472B6' },  // Pink
    { bg: 'rgba(16, 185, 129, 0.2)', color: '#34D399' },  // Emerald
    { bg: 'rgba(245, 158, 11, 0.2)', color: '#FBBF24' },  // Amber
    { bg: 'rgba(139, 92, 246, 0.2)', color: '#A78BFA' },  // Purple
    { bg: 'rgba(239, 68, 68, 0.2)', color: '#F87171' },    // Red
    { bg: 'rgba(6, 182, 212, 0.2)', color: '#22D3EE' },    // Cyan
  ]
  const lightThemes = [
    { bg: 'rgba(59, 130, 246, 0.1)', color: '#2563EB' },   // Blue
    { bg: 'rgba(236, 72, 153, 0.1)', color: '#DB2777' },  // Pink
    { bg: 'rgba(16, 185, 129, 0.1)', color: '#059669' },  // Emerald
    { bg: 'rgba(245, 158, 11, 0.1)', color: '#D97706' },  // Amber
    { bg: 'rgba(139, 92, 246, 0.1)', color: '#7C3AED' },  // Purple
    { bg: 'rgba(239, 68, 68, 0.1)', color: '#DC2626' },    // Red
    { bg: 'rgba(6, 182, 212, 0.1)', color: '#0891B2' },    // Cyan
  ]
  const themes = isDark.value ? darkThemes : lightThemes
  if (!username) return themes[0]
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % themes.length
  return themes[index]
}

function resolveAvatarUrl(url: string | null): string {
  if (!url) return ''
  if (/^https?:\/\//.test(url)) return url
  const base = import.meta.env.VITE_API_BASE_URL || window.location.origin
  return new URL(url, base).toString()
}

function formatTime(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '昨天'
  if (diffDays < 7) return `${diffDays}天前`
  return `${date.getMonth() + 1}月${date.getDate()}日`
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
  trendChart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: tooltipBg(), borderColor: axisColor(), textStyle: { color: textColor(), fontSize: 12 } },
    legend: { data: ['点赞', '收藏'], top: 8, right: 8, itemGap: 16, textStyle: { color: textColor(), fontSize: 12 }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 },
    grid: { left: 36, right: 16, top: 36, bottom: 28 },
    xAxis: { type: 'category', data: trend.map((t: any) => t.date.slice(5)), axisLine: { lineStyle: { color: axisColor() } }, axisLabel: { color: textColor(), fontSize: 11 }, axisTick: { show: false } },
    yAxis: { type: 'value', minInterval: 1, axisLine: { show: false }, axisLabel: { color: textColor(), fontSize: 11 }, splitLine: { lineStyle: { color: axisColor(), type: 'dashed' } } },
    series: [
      { name: '点赞', type: 'line', smooth: true, symbol: 'circle', symbolSize: 4, data: trend.map((t: any) => t.likeCount), itemStyle: { color: '#F43F5E' }, lineStyle: { color: '#F43F5E', width: 2 } },
      { name: '收藏', type: 'line', smooth: true, symbol: 'circle', symbolSize: 4, data: trend.map((t: any) => t.favoriteCount), itemStyle: { color: '#F59E0B' }, lineStyle: { color: '#F59E0B', width: 2 } },
    ],
  })
}

function renderPieChart() {
  if (!pieEl.value) return
  if (!pieChart) pieChart = echarts.init(pieEl.value)
  const dist = stats.value.postStatusDist
  const palette = ['#1E40AF', '#94A3B8', '#F59E0B', '#6366F1', '#10B981', '#EF4444']
  pieChart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)', backgroundColor: tooltipBg(), borderColor: axisColor(), textStyle: { color: textColor() } },
    legend: { bottom: 0, textStyle: { color: textColor(), fontSize: 12 }, icon: 'circle', itemWidth: 8, itemHeight: 8 },
    color: palette,
    series: [{ type: 'pie', radius: ['45%', '70%'], center: ['50%', '42%'], itemStyle: { borderRadius: 4, borderColor: tooltipBg(), borderWidth: 2 }, label: { show: false }, emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } }, data: dist }],
  })
}

function renderDonChart() {
  if (!donEl.value) return
  if (!donChart) donChart = echarts.init(donEl.value)
  const data = stats.value.donationTrend
  donChart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: tooltipBg(), borderColor: axisColor(), textStyle: { color: textColor(), fontSize: 12 } },
    legend: { data: ['金额', '笔数'], top: 8, right: 8, itemGap: 16, textStyle: { color: textColor(), fontSize: 12 }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 },
    grid: { left: 44, right: 44, top: 36, bottom: 28 },
    xAxis: { type: 'category', data: data.map((t: any) => t.date.slice(5)), axisLine: { lineStyle: { color: axisColor() } }, axisLabel: { color: textColor(), fontSize: 11 }, axisTick: { show: false } },
    yAxis: [
      { type: 'value', axisLine: { show: false }, axisLabel: { color: textColor(), fontSize: 11 }, splitLine: { lineStyle: { color: axisColor(), type: 'dashed' } } },
      { type: 'value', axisLine: { show: false }, axisLabel: { color: textColor(), fontSize: 11 }, splitLine: { show: false } },
    ],
    series: [
      { name: '金额', type: 'line', smooth: true, symbol: 'circle', symbolSize: 4, data: data.map((t: any) => t.amount), itemStyle: { color: '#10B981' }, lineStyle: { color: '#10B981', width: 2 } },
      { name: '笔数', type: 'bar', yAxisIndex: 1, data: data.map((t: any) => t.count), itemStyle: { color: '#F59E0B', borderRadius: [2, 2, 0, 0] }, barWidth: 12, barGap: '30%' },
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
        <n-button text size="tiny" style="color:#8B5CF6;gap:4px;margin-left:8px" @click="router.push('/memberships')">
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

        <!-- bottom: top posts + recent users -->
        <div class="bottom-row">
          <div class="card">
            <div class="card-hd">
              <span class="card-title">热门文章</span>
              <n-button text type="primary" size="small" @click="router.push('/posts')">查看全部</n-button>
            </div>
            <div v-if="!stats.topPosts.length" class="empty"><n-empty description="暂无数据" /></div>
            <div v-else class="rank">
              <div v-for="(p, i) in stats.topPosts.slice(0, 5)" :key="p.id" class="rank-row" @click="router.push(`/posts/${p.id}/edit`)">
                <span class="r-num" :class="`r-num-${i + 1}`">0{{ i + 1 }}</span>
                <div class="r-info">
                  <span class="r-name">{{ p.title }}</span>
                  <div class="r-sub">
                    <span class="r-slug">/{{ p.slug }}</span>
                    <span class="r-dot">·</span>
                    <span class="r-stat-item">
                      <n-icon size="12" style="margin-right:2px"><EyeOutline /></n-icon>
                      {{ fmtNum(p.viewCount) }} 阅读
                    </span>
                    <span class="r-dot">·</span>
                    <span class="r-stat-item">
                      <n-icon size="11" style="margin-right:2px"><HeartOutline /></n-icon>
                      {{ fmtNum(p.likeCount) }} 点赞
                    </span>
                  </div>
                </div>
                <div class="r-action">
                  <n-button size="tiny" quaternary type="primary" class="r-edit-btn">编辑</n-button>
                </div>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-hd">
              <span class="card-title">最近用户</span>
              <n-button text type="primary" size="small" @click="router.push('/users')">查看全部</n-button>
            </div>
            <div v-if="!stats.recentUsers?.length" class="empty"><n-empty description="暂无数据" /></div>
            <div v-else class="rank">
              <div v-for="u in stats.recentUsers.slice(0, 5)" :key="u.id" class="rank-row" @click="router.push('/users')">
                <n-avatar
                  round
                  :size="34"
                  class="r-av"
                  :src="u.avatar ? resolveAvatarUrl(u.avatar) : undefined"
                  :style="!u.avatar ? {
                    background: getAvatarStyle(u.username).bg,
                    color: getAvatarStyle(u.username).color,
                    fontWeight: '600',
                    fontSize: '14px'
                  } : {}"
                >
                  <template v-if="!u.avatar">
                    {{ (u.nickname || u.username).charAt(0).toUpperCase() }}
                  </template>
                </n-avatar>
                <div class="r-info">
                  <span class="r-name">{{ u.nickname || u.username }}</span>
                  <div class="r-sub">
                    <span class="r-slug">@{{ u.username }}</span>
                    <span class="r-dot">·</span>
                    <span class="r-stat-item">
                      <n-icon size="12" style="margin-right:2px; vertical-align: -1px;"><TimeOutline /></n-icon>
                      {{ formatTime(u.createdAt) }}
                    </span>
                  </div>
                </div>
                <div class="r-action">
                  <n-button size="tiny" quaternary type="primary" class="r-edit-btn">管理</n-button>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </n-spin>
  </div>
</template>

<style scoped>
.dash { min-height: 100%; }
.dash-body { display: flex; flex-direction: column; gap: 16px; }

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

/* bottom 2-col */
.bottom-row {
  display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
}
@media (max-width: 900px) { .bottom-row { grid-template-columns: 1fr; } }

.bottom-row .card { min-height: 320px; }

/* rank */
.empty { padding: 40px 0; }
.rank { display: flex; flex-direction: column; gap: 6px; }
.rank-row {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  background: transparent;
  transition: all 0.2s ease-in-out;
  cursor: pointer;
}
.rank-row:hover {
  background: var(--n-color-hover, rgba(37, 99, 235, 0.04));
}
.r-num {
  font-family: 'Poppins', sans-serif;
  font-size: 15px; font-weight: 700;
  color: var(--n-text-color-3);
  width: 24px; flex-shrink: 0;
  text-align: left;
}
.r-num-1 { color: #F59E0B !important; }
.r-num-2 { color: #94A3B8 !important; }
.r-num-3 { color: #F97316 !important; }
.r-av {
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}
.r-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.r-name {
  font-size: 13.5px; font-weight: 600; color: var(--n-text-color);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.r-sub {
  display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
  font-size: 11px; color: var(--n-text-color-3);
}
.r-slug {
  max-width: 140px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.r-dot {
  color: var(--n-text-color-3); opacity: 0.5; user-select: none;
}
.r-stat-item {
  display: inline-flex; align-items: center; color: var(--n-text-color-3);
}
.r-action {
  opacity: 0; transition: opacity 0.2s ease-in-out; margin-left: auto;
}
.rank-row:hover .r-action {
  opacity: 1;
}
@media (max-width: 768px) {
  .r-action { opacity: 1; }
}
</style>
