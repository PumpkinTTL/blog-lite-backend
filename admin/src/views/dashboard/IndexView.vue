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
  WalletOutline,
  CreateOutline,
  CodeOutline,
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
  const wk = ['日', '一', '二', '三', '四', '五', '六']
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${wk[d.getDay()]}`
})

const quickActions = [
  { label: '写文章', icon: CreateOutline, path: '/posts/create' },
  { label: '用户管理', icon: PeopleOutline, path: '/users' },
  { label: '激活码', icon: CodeOutline, path: '/codes' },
  { label: '开通会员', icon: GiftOutline, path: '/memberships' },
]

type CardKey = 'postCount' | 'publishedCount' | 'categoryCount' | 'tagCount'
  | 'userCount' | 'pendingCommentCount' | 'likeCount' | 'favoriteCount' | 'totalViews'

const statCards: { label: string; key: CardKey; icon: any; color: string; link?: string }[] = [
  { label: '文章总数', key: 'postCount', icon: DocumentTextOutline, color: '#3B82F6', link: '/posts' },
  { label: '已发布', key: 'publishedCount', icon: PaperPlaneOutline, color: '#06B6D4' },
  { label: '用户', key: 'userCount', icon: PeopleOutline, color: '#EC4899', link: '/users' },
  { label: '总阅读', key: 'totalViews', icon: EyeOutline, color: '#10B981' },
  { label: '分类', key: 'categoryCount', icon: FolderOutline, color: '#8B5CF6', link: '/categories' },
  { label: '标签', key: 'tagCount', icon: PricetagsOutline, color: '#F59E0B', link: '/tags' },
  { label: '待审评论', key: 'pendingCommentCount', icon: ChatbubblesOutline, color: '#EF4444' },
  { label: '点赞', key: 'likeCount', icon: HeartOutline, color: '#F43F5E' },
  { label: '收藏', key: 'favoriteCount', icon: StarOutline, color: '#F59E0B' },
]

const donation = computed(() => {
  const list = stats.value.donationTotalAmount || []
  return list.find((d: any) => d.currency === 'CNY') || list[0] || null
})

// charts
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
  } catch (e) { console.error(e) }
  finally { loading.value = false }
}

function axisColor() { return isDark.value ? '#475569' : '#E2E8F0' }
function textColor() { return isDark.value ? '#CBD5E1' : '#64748B' }
function tooltipBg() { return isDark.value ? '#1E293B' : '#FFFFFF' }

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
    legend: { top: 0, right: 0, textStyle: { color: textColor(), fontSize: 11 }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 },
    grid: { left: 40, right: 20, top: 40, bottom: 28 },
    xAxis: { type: 'category', data: trend.map((t: any) => t.date.slice(5)), axisLine: { lineStyle: { color: axisColor() } }, axisLabel: { color: textColor(), fontSize: 11 }, axisTick: { show: false } },
    yAxis: { type: 'value', minInterval: 1, axisLine: { show: false }, axisLabel: { color: textColor(), fontSize: 11 }, splitLine: { lineStyle: { color: axisColor(), type: 'dashed' } } },
    series: [
      { name: '点赞', type: 'line', smooth: true, symbol: 'none', data: trend.map((t: any) => t.likeCount), itemStyle: { color: '#F43F5E' }, lineStyle: { color: '#F43F5E', width: 2 } },
      { name: '收藏', type: 'line', smooth: true, symbol: 'none', data: trend.map((t: any) => t.favoriteCount), itemStyle: { color: '#F59E0B' }, lineStyle: { color: '#F59E0B', width: 2 } },
    ],
  })
}

function renderPieChart() {
  if (!pieEl.value) return
  if (!pieChart) pieChart = echarts.init(pieEl.value)
  pieChart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)', backgroundColor: tooltipBg(), borderColor: axisColor(), textStyle: { color: textColor(), fontSize: 12 } },
    legend: { bottom: 0, textStyle: { color: textColor(), fontSize: 11 }, icon: 'circle', itemWidth: 8, itemHeight: 8 },
    color: ['#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#EF4444', '#EC4899'],
    series: [{ type: 'pie', radius: ['50%', '75%'], center: ['50%', '43%'], itemStyle: { borderRadius: 4, borderColor: tooltipBg(), borderWidth: 2 }, label: { show: false }, emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } }, data: stats.value.postStatusDist }],
  })
}

function renderBarChart() {
  if (!barEl.value) return
  if (!barChart) barChart = echarts.init(barEl.value)
  const posts = stats.value.topPosts
  if (!posts.length) return
  barChart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: tooltipBg(), borderColor: axisColor(), textStyle: { color: textColor(), fontSize: 12 } },
    grid: { left: 4, right: 40, top: 8, bottom: 20 },
    xAxis: { type: 'value', axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: textColor(), fontSize: 10 }, splitLine: { lineStyle: { color: axisColor(), type: 'dashed' } } },
    yAxis: { type: 'category', inverse: true, data: posts.map((p: any) => p.title.length > 8 ? p.title.slice(0, 8) + '…' : p.title), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: textColor(), fontSize: 11 } },
    series: [{ type: 'bar', data: posts.map((p: any) => ({ value: p.viewCount, itemStyle: { borderRadius: [0, 4, 4, 0], color: '#3B82F6' } })), barWidth: 18, label: { show: true, position: 'right', color: textColor(), fontSize: 10 } }],
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
  <div class="dash">
    <!-- header -->
    <div class="dash-head">
      <div>
        <span class="dash-greet">{{ greeting }}, 冬天</span>
        <span class="dash-date">
          <n-icon :size="13"><TimeOutline /></n-icon>
          {{ todayStr }}
          <span class="dash-update">· 更新于 {{ lastRefresh.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}</span>
        </span>
      </div>
      <n-button size="small" :loading="loading" @click="refreshAll" quaternary>
        <template #icon><n-icon><RefreshOutline /></n-icon></template>
      </n-button>
    </div>

    <n-spin :show="loading">
      <div class="dash-body">

        <!-- row 1: donation + actions -->
        <div class="row top">
          <div class="donation" @click="router.push('/donations')">
            <div class="don-icon"><n-icon :size="18" color="#10B981"><WalletOutline /></n-icon></div>
            <div>
              <div class="don-num">{{ donation ? (donation.currency === 'CNY' ? '¥' : '$') + donation.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '¥0.00' }}</div>
              <div class="don-sub">累计捐赠 · {{ stats.donationCount ?? 0 }} 笔</div>
            </div>
          </div>
          <div class="actions">
            <div v-for="a in quickActions" :key="a.path" class="act" @click="router.push(a.path)">
              <n-icon :size="16"><component :is="a.icon" /></n-icon>
              <span>{{ a.label }}</span>
            </div>
          </div>
        </div>

        <!-- row 2: stat cards 3x3 -->
        <div class="row stats">
          <div v-for="s in statCards" :key="s.key" class="stat" :class="{ link: !!s.link }" @click="s.link && router.push(s.link)">
            <div class="st-icon" :style="{ color: s.color, background: isDark ? s.color + '20' : s.color + '10' }">
              <n-icon :size="18"><component :is="s.icon" /></n-icon>
            </div>
            <div class="st-num">{{ fmtNum(stats[s.key]) }}</div>
            <div class="st-label">{{ s.label }}</div>
          </div>
        </div>

        <!-- row 3: charts 7:5 -->
        <div class="row charts">
          <div class="card">
            <div class="card-hd">
              <span class="card-title">7 天互动趋势</span>
              <span class="card-sub">点赞 / 收藏</span>
            </div>
            <div ref="trendEl" class="chart"></div>
          </div>
          <div class="card">
            <div class="card-hd">
              <span class="card-title">文章状态分布</span>
              <span class="card-sub">共 {{ stats.postCount }} 篇</span>
            </div>
            <div ref="pieEl" class="chart"></div>
          </div>
        </div>

        <!-- row 4: top posts + bar chart -->
        <div class="row bottom">
          <div class="card">
            <div class="card-hd">
              <span class="card-title">热门文章 TOP 5</span>
              <n-button text type="primary" size="small" @click="router.push('/posts')">查看全部</n-button>
            </div>
            <div v-if="!stats.topPosts.length" class="empty"><n-empty description="暂无数据" /></div>
            <div v-else class="rank">
              <div v-for="(p, i) in stats.topPosts" :key="p.id" class="rank-item" @click="router.push(`/posts/${p.id}/edit`)">
                <span class="rank-idx">{{ i + 1 }}</span>
                <span class="rank-title">{{ p.title }}</span>
                <span class="rank-meta">
                  <n-icon :size="12"><EyeOutline /></n-icon>{{ fmtNum(p.viewCount) }}
                  <n-icon :size="12" style="margin-left:8px"><HeartOutline /></n-icon>{{ fmtNum(p.likeCount) }}
                </span>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-hd"><span class="card-title">阅读量排行</span></div>
            <div ref="barEl" class="chart" style="height:220px"></div>
          </div>
        </div>

      </div>
    </n-spin>
  </div>
</template>

<style scoped>
.dash { min-height: 100%; }
.dash-body { display: flex; flex-direction: column; gap: 16px; }

/* header */
.dash-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 20px;
}
.dash-greet { font-size: 20px; font-weight: 700; color: var(--n-text-color); }
.dash-date {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 12px; color: var(--n-text-color-3); margin-left: 12px;
}
.dash-update { opacity: 0.6; }

/* rows */
.row { display: flex; gap: 16px; }
.row.top { align-items: stretch; }
.row.stats { display: grid; grid-template-columns: repeat(3, 1fr); }
.row.charts { display: grid; grid-template-columns: 7fr 5fr; }
.row.bottom { display: grid; grid-template-columns: 1fr 1fr; }
@media (max-width: 900px) { .row.stats { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 540px) { .row.stats { grid-template-columns: 1fr; } }
@media (max-width: 1100px) { .row.charts, .row.bottom { grid-template-columns: 1fr; } }
@media (max-width: 900px) { .row.top { flex-direction: column; } }

/* donation banner */
.donation {
  flex: 1; display: flex; align-items: center; gap: 14px;
  padding: 14px 20px; border-radius: 10px; cursor: pointer;
  border: 1px solid var(--n-border-color, #E5E7EB);
  background: var(--n-card-color, #fff);
}
.donation:hover { border-color: #10B981; }
.don-icon { flex-shrink: 0; }
.don-num { font-size: 22px; font-weight: 700; color: var(--n-text-color); }
.don-sub { font-size: 12px; color: var(--n-text-color-3); margin-top: 2px; }

/* quick actions */
.actions { display: flex; gap: 8px; }
.act {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  padding: 12px 16px; border-radius: 10px; cursor: pointer;
  border: 1px solid var(--n-border-color, #E5E7EB);
  background: var(--n-card-color, #fff);
  min-width: 72px; font-size: 12px;
  color: var(--n-text-color-2); transition: border-color 0.15s;
}
.act:hover { border-color: var(--n-primary-color, #3B82F6); }

/* stat cards */
.stat {
  display: flex; flex-direction: column; gap: 8px;
  padding: 16px 18px; border-radius: 10px;
  border: 1px solid var(--n-border-color, #E5E7EB);
  background: var(--n-card-color, #fff);
  cursor: default; transition: border-color 0.15s;
}
.stat.link { cursor: pointer; }
.stat:hover { border-color: var(--n-primary-color, #3B82F6); }
.st-icon {
  width: 36px; height: 36px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
}
.st-num { font-size: 24px; font-weight: 700; color: var(--n-text-color); line-height: 1; }
.st-label { font-size: 12px; color: var(--n-text-color-3); }

/* card */
.card {
  background: var(--n-card-color, #fff);
  border-radius: 10px; padding: 20px;
  border: 1px solid var(--n-border-color, #E5E7EB);
}
.card-hd {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px;
}
.card-title { font-size: 14px; font-weight: 600; color: var(--n-text-color); }
.card-sub { font-size: 11px; color: var(--n-text-color-3); }
.chart { width: 100%; height: 260px; }
.empty { padding: 40px 0; }

/* rank */
.rank { display: flex; flex-direction: column; gap: 2px; }
.rank-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px; border-radius: 8px; cursor: pointer;
  transition: background 0.15s;
}
.rank-item:hover { background: var(--n-color-hover, rgba(0,0,0,0.03)); }
.rank-idx {
  flex-shrink: 0; width: 22px; text-align: center;
  font-size: 12px; font-weight: 600; color: var(--n-text-color-3);
}
.rank-title {
  flex: 1; min-width: 0; font-size: 13px; color: var(--n-text-color);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.rank-meta {
  display: inline-flex; align-items: center; gap: 2px;
  font-size: 12px; color: var(--n-text-color-3); flex-shrink: 0;
}
</style>
