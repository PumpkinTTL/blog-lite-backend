<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { NSpin, NIcon, NButton, useMessage } from 'naive-ui'
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

// --- stat cards config ---
type StatKey = keyof DashboardStats
interface StatDef { label: string; key: StatKey; icon: any; accent: string; bg: string; link?: string }
const statDefs: StatDef[] = [
  { label: '文章总数', key: 'postCount',     icon: DocumentTextOutline, accent: '#3B82F6', bg: '#EFF6FF', link: '/posts' },
  { label: '已发布',   key: 'publishedCount', icon: PaperPlaneOutline,   accent: '#0891B2', bg: '#ECFEFF', link: '/posts' },
  { label: '草稿',     key: 'draftCount',     icon: CreateOutline,       accent: '#6B7280', bg: '#F9FAFB', link: '/posts' },
  { label: '分类',     key: 'categoryCount',  icon: FolderOutline,       accent: '#7C3AED', bg: '#F5F3FF' },
  { label: '标签',     key: 'tagCount',       icon: PricetagsOutline,    accent: '#D97706', bg: '#FFFBEB' },
  { label: '用户',     key: 'userCount',      icon: PeopleOutline,       accent: '#DB2777', bg: '#FDF2F8' },
  { label: '待审评论', key: 'pendingCommentCount', icon: ChatbubblesOutline, accent: '#DC2626', bg: '#FEF2F2', link: '/comments' },
  { label: '总阅读',   key: 'totalViews',     icon: EyeOutline,          accent: '#059669', bg: '#ECFDF5' },
  { label: '点赞',     key: 'likeCount',      icon: HeartOutline,        accent: '#E11D48', bg: '#FFF1F2' },
  { label: '收藏',     key: 'favoriteCount',  icon: StarOutline,         accent: '#CA8A04', bg: '#FEFCE8' },
]

// --- donation ---
const donation = computed(() => {
  const list = stats.value.donationTotalAmount || []
  return list.find((d: any) => d.currency === 'CNY') || list[0] || null
})

// --- username ---
const username = computed(() => {
  const raw = localStorage.getItem('userInfo') || sessionStorage.getItem('userInfo')
  if (!raw) return 'Admin'
  try { const u = JSON.parse(raw); return u.username || u.name || u.nickname || 'Admin' } catch { return 'Admin' }
})

// --- charts ---
let trendChart: echarts.ECharts | null = null, pieChart: echarts.ECharts | null = null, donChart: echarts.ECharts | null = null
const trendEl = ref<HTMLElement | null>(null), pieEl = ref<HTMLElement | null>(null), donEl = ref<HTMLElement | null>(null)

async function loadStats() { loading.value = true; try { const r = await getDashboardStats(); if (r.data) { stats.value = r.data; await nextTick(); renderCharts() } } catch (e: any) { message.error(e?.message || '加载失败') } finally { loading.value = false } }

function aC() { return isDark.value ? '#334155' : '#E2E8F0' }
function tC() { return isDark.value ? '#94A3B8' : '#64748B' }
function tbBg() { return isDark.value ? '#1E293B' : '#FFFFFF' }

function gGreeting() { const h = new Date().getHours(); return h < 12 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好' }
function gDate() { const d = new Date(); const w = ['日','一','二','三','四','五','六']; return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 星期${w[d.getDay()]}` }
function fmt(n: number | undefined | null): string { if (n == null) return '0'; if (n >= 1e4) return (n/1e4).toFixed(1)+'w'; if (n >= 1e3) return (n/1e3).toFixed(1)+'k'; return String(n) }
function ago(s: string): string { const m = Math.floor((Date.now() - new Date(s).getTime())/6e4); if (m<1) return '刚刚'; if (m<60) return m+'分钟前'; const h=Math.floor(m/60); if (h<24) return h+'小时前'; return Math.floor(h/24)+'天前' }

function renderTrendChart() {
  if (!trendEl.value) return; if (!trendChart) trendChart = echarts.init(trendEl.value)
  const d = stats.value.interactionTrend, tc = tC()
  trendChart.setOption({
    animation: true, animationDuration: 600,
    tooltip: { trigger: 'axis', backgroundColor: tbBg(), borderColor: '#E2E8F0', textStyle: { color: '#0F172A', fontSize: 12 }, extraCssText: 'border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.08);' },
    legend: { data: ['点赞','收藏'], top: 0, right: 0, itemGap: 12, textStyle: { color: tc, fontSize: 11 }, icon: 'roundRect', itemWidth: 10, itemHeight: 6 },
    grid: { left: 36, right: 12, top: 34, bottom: 22 },
    xAxis: { type: 'category', data: d.map((t:any) => t.date.slice(5)), axisLine: { show: false }, axisLabel: { color: tc, fontSize: 10 }, axisTick: { show: false } },
    yAxis: { type: 'value', minInterval: 1, axisLine: { show: false }, axisLabel: { color: tc, fontSize: 10 }, splitLine: { lineStyle: { color: aC(), type: 'dashed' } } },
    series: [
      { name: '点赞', type: 'line', smooth: true, symbol: 'circle', symbolSize: 3, data: d.map((t:any)=>t.likeCount), itemStyle: { color: '#F43F5E' }, lineStyle: { color: '#F43F5E', width: 2 }, areaStyle: { color: new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'rgba(244,63,94,0.08)'},{offset:1,color:'rgba(244,63,94,0)'}]) } },
      { name: '收藏', type: 'line', smooth: true, symbol: 'circle', symbolSize: 3, data: d.map((t:any)=>t.favoriteCount), itemStyle: { color: '#F59E0B' }, lineStyle: { color: '#F59E0B', width: 2 }, areaStyle: { color: new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'rgba(245,158,11,0.08)'},{offset:1,color:'rgba(245,158,11,0)'}]) } },
    ],
  })
}
function renderPieChart() {
  if (!pieEl.value) return; if (!pieChart) pieChart = echarts.init(pieEl.value)
  const d = stats.value.postStatusDist, total = d.reduce((s:number,x:any)=>s+x.value,0), tc = tC()
  pieChart.setOption({
    animation: true, animationDuration: 600,
    tooltip: { trigger: 'item', formatter: '{b}: {c} 篇 ({d}%)', backgroundColor: tbBg(), borderColor: '#E2E8F0', textStyle: { color: '#0F172A', fontSize: 12 }, extraCssText: 'border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.08);' },
    legend: { bottom: 2, textStyle: { color: tc, fontSize: 10 }, icon: 'circle', itemWidth: 6, itemHeight: 6, itemGap: 10 },
    color: ['#3B82F6','#94A3B8','#F59E0B','#8B5CF6','#10B981','#EF4444'],
    graphic: { type: 'text', left: 'center', top: '36%', style: { text: `共${total}篇`, textAlign: 'center', fill: tc, fontSize: 13, fontWeight: 600 } },
    series: [{ type: 'pie', radius: ['52%','76%'], center: ['50%','44%'], itemStyle: { borderRadius: 4, borderColor: tbBg(), borderWidth: 2 }, label: { show: false }, emphasis: { scaleSize: 6, label: { show: true, fontSize: 12, fontWeight: 'bold' } }, data: d }],
  })
}
function renderDonChart() {
  if (!donEl.value) return; if (!donChart) donChart = echarts.init(donEl.value)
  const d = stats.value.donationTrend, tc = tC()
  donChart.setOption({
    animation: true, animationDuration: 600,
    tooltip: { trigger: 'axis', backgroundColor: tbBg(), borderColor: '#E2E8F0', textStyle: { color: '#0F172A', fontSize: 12 }, extraCssText: 'border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.08);' },
    legend: { data: ['金额','笔数'], top: 0, right: 0, itemGap: 12, textStyle: { color: tc, fontSize: 11 }, icon: 'roundRect', itemWidth: 10, itemHeight: 6 },
    grid: { left: 40, right: 44, top: 34, bottom: 22 },
    xAxis: { type: 'category', data: d.map((t:any)=>t.date.slice(5)), axisLine: { show: false }, axisLabel: { color: tc, fontSize: 10 }, axisTick: { show: false } },
    yAxis: [
      { type: 'value', axisLine: { show: false }, axisLabel: { color: tc, fontSize: 10 }, splitLine: { lineStyle: { color: aC(), type: 'dashed' } } },
      { type: 'value', axisLine: { show: false }, axisLabel: { color: tc, fontSize: 10 }, splitLine: { show: false } },
    ],
    series: [
      { name: '金额', type: 'line', smooth: true, symbol: 'circle', symbolSize: 3, yAxisIndex: 0, data: d.map((t:any)=>t.amount), itemStyle: { color: '#10B981' }, lineStyle: { color: '#10B981', width: 2 }, areaStyle: { color: new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'rgba(16,185,129,0.08)'},{offset:1,color:'rgba(16,185,129,0)'}]) } },
      { name: '笔数', type: 'bar', yAxisIndex: 1, data: d.map((t:any)=>t.count), itemStyle: { color: new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'#F59E0B'},{offset:1,color:'#FDE68A'}]), borderRadius: [3,3,0,0] }, barWidth: 12, barGap: '40%' },
    ],
  })
}
function renderCharts() { renderTrendChart(); renderPieChart(); renderDonChart() }
watch(isDark, () => nextTick(renderCharts))
onMounted(() => { loadStats(); addEventListener('resize', () => { trendChart?.resize(); pieChart?.resize(); donChart?.resize() }) })
onBeforeUnmount(() => { trendChart?.dispose(); pieChart?.dispose(); donChart?.dispose() })
</script>

<template>
  <div class="dash">
    <!-- Top bar -->
    <div class="topbar">
      <div class="tb-l">
        <span class="tb-title">数据概览</span>
        <n-button text size="tiny" style="color:#3B82F6;gap:4px;margin-left:16px" @click="router.push('/posts/create')"><n-icon size="14"><CreateOutline /></n-icon>写文章</n-button>
        <n-button text size="tiny" style="color:#8B5CF6;gap:4px;margin-left:8px" @click="router.push('/membership')"><n-icon size="14"><GiftOutline /></n-icon>开通会员</n-button>
      </div>
      <n-button size="small" :loading="loading" @click="loadStats" quaternary><template #icon><n-icon><RefreshOutline /></n-icon></template>刷新</n-button>
    </div>

    <n-spin :show="loading">
      <div class="body">

        <!-- greeting -->
        <div class="greet">
          <div>
            <div class="greet-hi">{{ gGreeting() }}，{{ username }}</div>
            <div class="greet-sub">欢迎回来 · {{ gDate() }}</div>
          </div>
        </div>

        <!-- stat cards row 1: 4 cards -->
        <div class="stat-row">
          <div v-for="s in statDefs.slice(0,4)" :key="s.key"
            class="scard" :class="{ link: !!s.link }"
            @click="s.link && router.push(s.link)"
          >
            <div class="sc-accent" :style="{ background: s.accent }"></div>
            <div class="sc-icon" :style="{ color: s.accent, background: s.bg }">
              <n-icon size="18"><component :is="s.icon" /></n-icon>
            </div>
            <div class="sc-body">
              <div class="sc-num">{{ fmt((stats as any)[s.key]) }}</div>
              <div class="sc-lbl">{{ s.label }}</div>
            </div>
          </div>
        </div>

        <!-- stat cards row 2: 3 cards + donation -->
        <div class="stat-row">
          <div v-for="s in statDefs.slice(4,7)" :key="s.key"
            class="scard" :class="{ link: !!s.link }"
            @click="s.link && router.push(s.link)"
          >
            <div class="sc-accent" :style="{ background: s.accent }"></div>
            <div class="sc-icon" :style="{ color: s.accent, background: s.bg }">
              <n-icon size="18"><component :is="s.icon" /></n-icon>
            </div>
            <div class="sc-body">
              <div class="sc-num">{{ fmt((stats as any)[s.key]) }}</div>
              <div class="sc-lbl">{{ s.label }}</div>
            </div>
          </div>
          <!-- donation card (if has data) -->
          <div v-if="donation && stats.donationCount > 0" class="scard link" @click="router.push('/donations')">
            <div class="sc-accent" style="background:#059669"></div>
            <div class="sc-icon" style="color:#059669;background:#ECFDF5">
              <n-icon size="18"><CashOutline /></n-icon>
            </div>
            <div class="sc-body">
              <div class="sc-num">{{ donation.currency === 'CNY' ? '¥' : '$' }}{{ donation.amount }}</div>
              <div class="sc-lbl">捐赠 · {{ stats.donationCount }}笔</div>
            </div>
          </div>
          <div v-else class="scard" style="visibility:hidden"></div>
        </div>

        <!-- stat cards row 3: 3 cards -->
        <div class="stat-row">
          <div v-for="s in statDefs.slice(7,10)" :key="s.key"
            class="scard" :class="{ link: !!s.link }"
            @click="s.link && router.push(s.link)"
          >
            <div class="sc-accent" :style="{ background: s.accent }"></div>
            <div class="sc-icon" :style="{ color: s.accent, background: s.bg }">
              <n-icon size="18"><component :is="s.icon" /></n-icon>
            </div>
            <div class="sc-body">
              <div class="sc-num">{{ fmt((stats as any)[s.key]) }}</div>
              <div class="sc-lbl">{{ s.label }}</div>
            </div>
          </div>
        </div>

        <!-- charts -->
        <div class="chart-row">
          <div class="ccard">
            <div class="cchd"><span>7天互动趋势</span></div>
            <div ref="trendEl" class="cbody"></div>
          </div>
          <div class="ccard">
            <div class="cchd"><span>文章状态分布</span><span class="cctag">共{{ stats.postCount }}篇</span></div>
            <div ref="pieEl" class="cbody"></div>
          </div>
          <div class="ccard">
            <div class="cchd"><span>捐赠趋势</span></div>
            <div ref="donEl" class="cbody"></div>
          </div>
        </div>

        <!-- bottom lists -->
        <div class="list-row">
          <div class="lcard">
            <div class="lhd"><span>热门文章</span><span class="lmore" @click="router.push('/posts')">全部</span></div>
            <div v-if="!stats.topPosts.length" class="lempty">暂无数据</div>
            <div v-for="(p,i) in stats.topPosts.slice(0,5)" :key="p.id" class="litem" @click="router.push(`/posts/${p.id}/edit`)">
              <span class="lrank" :class="'lr'+(i+1)">{{ i+1 }}</span>
              <span class="ltitle">{{ p.title }}</span>
              <span class="lstat">{{ fmt(p.viewCount) }}阅读 · {{ fmt(p.likeCount) }}赞</span>
            </div>
          </div>
          <div class="lcard">
            <div class="lhd"><span>最近注册</span></div>
            <div v-if="!stats.recentUsers.length" class="lempty">暂无数据</div>
            <div v-for="u in stats.recentUsers.slice(0,5)" :key="u.id" class="litem">
              <div class="luava">{{ (u.nickname||u.username).charAt(0).toUpperCase() }}</div>
              <span class="luname">{{ u.nickname||u.username }}</span>
              <span class="lutime">{{ ago(u.createdAt) }}</span>
            </div>
          </div>
        </div>

      </div>
    </n-spin>
  </div>
</template>

<style scoped>
/* === base === */
.dash { min-height: 100%; background: linear-gradient(180deg, #F1F5F9 0%, #F8FAFC 100%); }
.dash.is-dark { background: var(--n-body-color); }
.body { display: flex; flex-direction: column; gap: 16px; padding: 16px 12px 32px; }

/* light/dark card shadow tokens */
:root {
  --ds-card-shadow: 0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04);
  --ds-card-shadow-hover: 0 4px 16px rgba(15,23,42,0.1), 0 0 0 1px rgba(37,99,235,0.15);
  --ds-card-bg: #FFFFFF;
}
.is-dark {
  --ds-card-shadow: 0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2);
  --ds-card-shadow-hover: 0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(59,130,246,0.3);
  --ds-card-bg: var(--n-card-color);
}

/* === top bar === */
.topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
.tb-l { display: flex; align-items: center; }
.tb-title { font-size: 18px; font-weight: 700; color: var(--n-text-color); letter-spacing: -.02em; }

/* === greeting === */
.greet { padding: 2px 0 2px 0; }
.greet-hi { font-size: 15px; font-weight: 600; color: var(--n-text-color); }
.greet-sub { font-size: 12px; color: var(--n-text-color-3); margin-top: 2px; }

/* === stat card === */
.stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.scard {
  position: relative; overflow: hidden;
  background: var(--ds-card-bg);
  border-radius: 14px;
  padding: 18px 18px 18px 22px;
  display: flex; gap: 14px; align-items: center;
  box-shadow: var(--ds-card-shadow);
  transition: box-shadow .25s, transform .25s;
}
.scard.link { cursor: pointer; }
.scard.link:hover { box-shadow: var(--ds-card-shadow-hover); transform: translateY(-2px); }
/* left accent bar */
.sc-accent {
  position: absolute; left: 0; top: 0; bottom: 0;
  width: 3px; border-radius: 0;
}
.sc-icon {
  width: 42px; height: 42px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.sc-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.sc-num { font-size: 24px; font-weight: 700; color: var(--n-text-color); line-height: 1; letter-spacing: -.02em; }
.sc-lbl { font-size: 12px; color: var(--n-text-color-3); font-weight: 500; }

/* === chart card === */
.chart-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.ccard {
  background: var(--ds-card-bg);
  border-radius: 14px; padding: 18px;
  box-shadow: var(--ds-card-shadow);
}
.cchd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 13px; font-weight: 600; color: var(--n-text-color); }
.cctag { font-size: 10px; color: var(--n-text-color-3); }
.cbody { width: 100%; height: 220px; }

/* === list card === */
.list-row { display: grid; grid-template-columns: 1.4fr 1fr; gap: 14px; }
.lcard {
  background: var(--ds-card-bg);
  border-radius: 14px; overflow: hidden;
  box-shadow: var(--ds-card-shadow);
}
.lhd { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px 10px; font-size: 13px; font-weight: 600; color: var(--n-text-color); }
.lmore { font-size: 11px; font-weight: 400; color: #3B82F6; cursor: pointer; }
.lmore:hover { text-decoration: underline; }
.lempty { padding: 28px; text-align: center; font-size: 12px; color: var(--n-text-color-3); }

.litem {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 20px; cursor: pointer;
  transition: background .15s;
}
.litem:hover { background: var(--n-color-hover); }
.lrank {
  width: 20px; height: 20px; border-radius: 5px;
  background: var(--n-fill-color);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600; color: #6B7280;
  flex-shrink: 0;
}
.lrank.lr1 { background: #FEF3C7; color: #B45309; }
.lrank.lr2 { background: #E5E7EB; color: #374151; }
.lrank.lr3 { background: #FEE2E2; color: #991B1B; }
.ltitle { flex: 1; min-width: 0; font-size: 12.5px; color: var(--n-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lstat { font-size: 10.5px; color: var(--n-text-color-3); flex-shrink: 0; }

.luava {
  width: 26px; height: 26px; border-radius: 8px;
  background: var(--n-fill-color);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 600; color: var(--n-text-color-2);
  flex-shrink: 0;
}
.luname { flex: 1; min-width: 0; font-size: 12.5px; color: var(--n-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lutime { font-size: 10.5px; color: var(--n-text-color-3); flex-shrink: 0; }

/* === responsive === */
@media (max-width: 1400px) { .stat-row { grid-template-columns: repeat(4, 1fr); } .chart-row { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 1100px) { .stat-row { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 900px) { .stat-row { grid-template-columns: repeat(2, 1fr); } .chart-row { grid-template-columns: 1fr; } .list-row { grid-template-columns: 1fr; } }
</style>
