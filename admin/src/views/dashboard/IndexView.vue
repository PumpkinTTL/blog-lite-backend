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

echarts.use([LineChart, PieChart, BarChart, GridComponent, TooltipComponent, LegendComponent, GraphicComponent, CanvasRenderer])

const router = useRouter()
const message = useMessage()
const loading = ref(true)
const stats = ref<DashboardStats>({
  postCount: 0, publishedCount: 0, draftCount: 0, categoryCount: 0, tagCount: 0, mediaCount: 0,
  userCount: 0, pendingCommentCount: 0, likeCount: 0, favoriteCount: 0, totalViews: 0,
  donationCount: 0, donationTotalAmount: [], donationStatusDist: [], donationPayMethodDist: [],
  donationTrend: [], topPosts: [], recentUsers: [], postStatusDist: [], interactionTrend: [],
})

const donation = computed(() => {
  const list = stats.value.donationTotalAmount || []
  return list.find((d: any) => d.currency === 'CNY') || list[0] || null
})
const username = computed(() => {
  const raw = localStorage.getItem('userInfo') || sessionStorage.getItem('userInfo')
  if (!raw) return 'Admin'
  try { const u = JSON.parse(raw); return u.username || u.name || u.nickname || 'Admin' } catch { return 'Admin' }
})

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
    <!-- Header -->
    <div class="hdr">
      <div>
        <h1 class="hdrt">{{ greet }}，{{ username }}</h1>
        <p class="hdrs">{{ today }}</p>
      </div>
      <div class="hdrb">
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

    <n-spin :show="loading">
      <div class="body">

        <!-- Stats -->
        <div class="kpi">
          <div class="kc clk" @click="router.push('/posts')">
            <span class="kl">文章</span>
            <span class="kv">{{ fmt(stats.postCount) }}</span>
          </div>
          <div class="kc">
            <span class="kl">已发布</span>
            <span class="kv">{{ fmt(stats.publishedCount) }}</span>
          </div>
          <div class="kc">
            <span class="kl">阅读</span>
            <span class="kv">{{ fmt(stats.totalViews) }}</span>
          </div>
          <div class="kc">
            <span class="kl">用户</span>
            <span class="kv">{{ fmt(stats.userCount) }}</span>
          </div>
          <div class="kc">
            <span class="kl">点赞</span>
            <span class="kv">{{ fmt(stats.likeCount) }}</span>
          </div>
          <div class="kc">
            <span class="kl">收藏</span>
            <span class="kv">{{ fmt(stats.favoriteCount) }}</span>
          </div>
          <div class="kc clk" @click="router.push('/comments')">
            <span class="kl">待审评论</span>
            <span class="kv" :class="{ muted: !stats.pendingCommentCount }">{{ fmt(stats.pendingCommentCount) }}</span>
          </div>
          <div v-if="donation && stats.donationCount > 0" class="kc clk" @click="router.push('/donations')">
            <span class="kl">捐赠</span>
            <span class="kv accent">{{ donation.currency === 'CNY' ? '¥' : '$' }}{{ donation.amount }}</span>
          </div>
          <div v-else class="kc">
            <span class="kl">捐赠</span>
            <span class="kv muted">-</span>
          </div>
        </div>

        <!-- Section divider -->
        <div class="sec">
          <span>数据趋势</span>
          <div class="sec-line"></div>
        </div>

        <!-- Charts -->
        <div class="charts">
          <n-card size="small" :bordered="false">
            <template #header>7天互动趋势</template>
            <div ref="tcEl" class="echart"></div>
          </n-card>
          <n-card size="small" :bordered="false">
            <template #header>文章状态分布</template>
            <template #header-extra><span style="font-size:11px;color:var(--n-text-color-3)">共{{ stats.postCount }}篇</span></template>
            <div ref="pcEl" class="echart"></div>
          </n-card>
          <n-card size="small" :bordered="false">
            <template #header>捐赠趋势</template>
            <div ref="dcEl" class="echart"></div>
          </n-card>
        </div>

        <!-- Bottom -->
        <div class="lists">
          <n-card size="small" :bordered="false">
            <template #header>热门文章</template>
            <template #header-extra><span class="lmore" @click="router.push('/posts')">全部</span></template>
            <div v-if="!stats.topPosts.length" class="lempty">暂无数据</div>
            <div v-for="(p,i) in stats.topPosts.slice(0,5)" :key="p.id" class="li" @click="router.push(`/posts/${p.id}/edit`)">
              <span class="lr" :class="'r'+(i+1)">{{ i+1 }}</span>
              <span class="lt">{{ p.title }}</span>
              <span class="ls">{{ fmt(p.viewCount) }}阅读 · {{ fmt(p.likeCount) }}赞</span>
            </div>
          </n-card>
          <n-card size="small" :bordered="false">
            <template #header>最近注册</template>
            <div v-if="!stats.recentUsers.length" class="lempty">暂无数据</div>
            <div v-for="u in stats.recentUsers.slice(0,5)" :key="u.id" class="li">
              <n-avatar :size="24" round class="uav">{{ (u.nickname||u.username).charAt(0).toUpperCase() }}</n-avatar>
              <span class="lt">{{ u.nickname||u.username }}</span>
              <span class="ls">{{ ago(u.createdAt) }}</span>
            </div>
          </n-card>
        </div>

      </div>
    </n-spin>
  </div>
</template>

<style scoped>
.dash { min-height: 100%; background: linear-gradient(160deg, #F8FAFC 0%, #F1F5F9 60%, #E8ECF1 100%); }
.dash.is-dark { background: var(--n-body-color); }
.body { display: flex; flex-direction: column; gap: 24px; }

/* header */
.hdr { display: flex; align-items: center; justify-content: space-between; }
.hdrt { margin: 0; font-size: 20px; font-weight: 700; color: var(--n-text-color); letter-spacing: -0.02em; }
.hdrs { margin: 3px 0 0; font-size: 13px; color: var(--n-text-color-3); }
.hdrb { display: flex; gap: 6px; align-items: center; }

/* KPI cards — label on top, coloured dot, shadow for depth */
.kpi { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.kc {
  position: relative;
  background: var(--n-card-color);
  border-radius: 10px;
  padding: 18px 18px 18px 18px;
  display: flex; flex-direction: column; gap: 6px;
  box-shadow: 0 1px 3px rgba(15,23,42,0.04), 0 1px 2px rgba(15,23,42,0.06);
  transition: box-shadow .25s, transform .25s;
}
.kc::before {
  content: ''; position: absolute; top: 14px; left: 18px;
  width: 8px; height: 8px; border-radius: 50%;
}
.kc:nth-child(1)::before { background: #3B82F6; }
.kc:nth-child(2)::before { background: #0891B2; }
.kc:nth-child(3)::before { background: #059669; }
.kc:nth-child(4)::before { background: #DB2777; }
.kc:nth-child(5)::before { background: #E11D48; }
.kc:nth-child(6)::before { background: #CA8A04; }
.kc:nth-child(7)::before { background: #DC2626; }
.kc:nth-child(8)::before { background: #059669; }
.kc.clk { cursor: pointer; }
.kc.clk:hover { box-shadow: 0 4px 16px rgba(15,23,42,0.08), 0 1px 3px rgba(15,23,42,0.04); transform: translateY(-1px); }
.kl { font-size: 12px; font-weight: 500; color: var(--n-text-color-3); padding-left: 16px; }
.kv { font-size: 28px; font-weight: 700; color: var(--n-text-color); line-height: 1; letter-spacing: -0.03em; }
.kv.muted { color: var(--n-text-color-3); }
.kv.accent { color: #059669; }

/* charts */
.sec { display: flex; align-items: center; gap: 16px; }
.sec span { font-size: 14px; font-weight: 600; color: var(--n-text-color); flex-shrink: 0; }
.sec-line { flex: 1; height: 1px; background: var(--n-border-color); }
.charts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.echart { width: 100%; height: 210px; }

/* bottom */
.lists { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; }

/* list items */
.lmore { font-size: 11px; color: var(--n-primary-color); cursor: pointer; }
.lmore:hover { text-decoration: underline; }
.lempty { padding: 24px; text-align: center; font-size: 12px; color: var(--n-text-color-3); }
.li { display: flex; align-items: center; gap: 10px; padding: 8px 0; cursor: pointer; border-bottom: 1px solid var(--n-border-color); }
.li:last-child { border-bottom: none; padding-bottom: 0; }
.li:first-child { padding-top: 0; }
.lr { width: 20px; height: 20px; border-radius: 4px; background: var(--n-fill-color); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; color: #6B7280; flex-shrink: 0; }
.lr.r1 { background: #FEF3C7; color: #B45309; }
.lr.r2 { background: #E5E7EB; color: #374151; }
.lr.r3 { background: #FEE2E2; color: #991B1B; }
.lt { flex: 1; min-width: 0; font-size: 12.5px; color: var(--n-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ls { font-size: 10.5px; color: var(--n-text-color-3); flex-shrink: 0; }
.uav { background: var(--n-fill-color) !important; }

@media (max-width: 1100px) { .kpi { grid-template-columns: repeat(3,1fr); } }
@media (max-width: 900px) { .kpi { grid-template-columns: repeat(2,1fr); } .charts { grid-template-columns: 1fr; } .lists { grid-template-columns: 1fr; } }
</style>
