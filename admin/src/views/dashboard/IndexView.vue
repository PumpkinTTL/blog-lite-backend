<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { NSpin, NIcon, NButton, NCard, NAvatar, useMessage } from 'naive-ui'
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

interface Stat { label: string; key: string; icon: any; color: string; bg: string; link?: string }
const statsDef: Stat[] = [
  { label: '文章', key: 'postCount',         icon: DocumentTextOutline,  color: '#3B82F6', bg: '#EFF6FF', link: '/posts' },
  { label: '已发布',key: 'publishedCount',    icon: PaperPlaneOutline,    color: '#0891B2', bg: '#ECFEFF' },
  { label: '阅读',  key: 'totalViews',        icon: EyeOutline,           color: '#059669', bg: '#ECFDF5' },
  { label: '用户',  key: 'userCount',         icon: PeopleOutline,        color: '#DB2777', bg: '#FDF2F8' },
  { label: '点赞',  key: 'likeCount',         icon: HeartOutline,         color: '#E11D48', bg: '#FFF1F2' },
  { label: '收藏',  key: 'favoriteCount',     icon: StarOutline,          color: '#CA8A04', bg: '#FEFCE8' },
  { label: '评论',  key: 'pendingCommentCount',icon: ChatbubblesOutline,  color: '#DC2626', bg: '#FEF2F2', link: '/comments' },
]

const donation = computed(() => {
  const list = stats.value.donationTotalAmount || []
  return list.find((d: any) => d.currency === 'CNY') || list[0] || null
})

const username = computed(() => {
  const raw = localStorage.getItem('userInfo') || sessionStorage.getItem('userInfo')
  if (!raw) return 'Admin'
  try { const u = JSON.parse(raw); return u.username || u.name || u.nickname || 'Admin' } catch { return 'Admin' }
})

// === echarts ===
let tcInst: echarts.ECharts | null = null, pcInst: echarts.ECharts | null = null, dcInst: echarts.ECharts | null = null
const tcEl = ref<HTMLElement | null>(null)
const pcEl = ref<HTMLElement | null>(null)
const dcEl = ref<HTMLElement | null>(null)

async function load() { loading.value = true; try { const r = await getDashboardStats(); if (r.data) { stats.value = r.data; await nextTick(); draw() } } catch (e: any) { message.error(e?.message || '加载失败') } finally { loading.value = false } }

function aC() { return isDark.value ? '#334155' : '#E2E8F0' }
function tC() { return isDark.value ? '#94A3B8' : '#64748B' }
function tbB() { return isDark.value ? '#1E293B' : '#FFFFFF' }

function gGr() { const h = new Date().getHours(); return h<12?'早上好':h<14?'中午好':h<18?'下午好':'晚上好' }
function gDt() { const d = new Date(); const w = ['日','一','二','三','四','五','六']; return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 星期${w[d.getDay()]}` }
function f(n: any): string { if (n == null || n === 0) return '0'; if (n>=1e4) return (n/1e4).toFixed(1)+'w'; if (n>=1e3) return (n/1e3).toFixed(1)+'k'; return String(n) }
function tA(s: string): string { const m = Math.floor((Date.now()-new Date(s).getTime())/6e4); if(m<1) return '刚刚'; if(m<60) return m+'分钟前'; const h=Math.floor(m/60); if(h<24) return h+'小时前'; return Math.floor(h/24)+'天前' }

function drawTrend() {
  if (!tcEl.value) return; if (!tcInst) tcInst = echarts.init(tcEl.value)
  const d = stats.value.interactionTrend, tc = tC()
  tcInst.setOption({
    animation: true, animationDuration: 600,
    tooltip: { trigger: 'axis', backgroundColor:tbB(), borderColor:'#E2E8F0', textStyle:{color:'#0F172A',fontSize:12}, extraCssText:'border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.08)' },
    legend: { data:['点赞','收藏'], top:0, right:0, itemGap:12, textStyle:{color:tc,fontSize:11}, icon:'roundRect', itemWidth:10, itemHeight:6 },
    grid: { left:38, right:12, top:34, bottom:22 },
    xAxis: { type:'category', data:d.map((t:any)=>t.date.slice(5)), axisLine:{show:false}, axisLabel:{color:tc,fontSize:10}, axisTick:{show:false} },
    yAxis: { type:'value', minInterval:1, axisLine:{show:false}, axisLabel:{color:tc,fontSize:10}, splitLine:{lineStyle:{color:aC(),type:'dashed'}} },
    series: [
      { name:'点赞', type:'line', smooth:true, symbol:'circle', symbolSize:3, data:d.map((t:any)=>t.likeCount), itemStyle:{color:'#F43F5E'}, lineStyle:{color:'#F43F5E',width:2}, areaStyle:{color:new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'rgba(244,63,94,0.08)'},{offset:1,color:'rgba(244,63,94,0)'}])} },
      { name:'收藏', type:'line', smooth:true, symbol:'circle', symbolSize:3, data:d.map((t:any)=>t.favoriteCount), itemStyle:{color:'#F59E0B'}, lineStyle:{color:'#F59E0B',width:2}, areaStyle:{color:new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'rgba(245,158,11,0.08)'},{offset:1,color:'rgba(245,158,11,0)'}])} },
    ],
  })
}
function drawPie() {
  if (!pcEl.value) return; if (!pcInst) pcInst = echarts.init(pcEl.value)
  const d = stats.value.postStatusDist, total = d.reduce((s:number,x:any)=>s+x.value,0), tc = tC()
  pcInst.setOption({
    animation: true, animationDuration: 600,
    tooltip: { trigger:'item', formatter:'{b}: {c}篇({d}%)', backgroundColor:tbB(), borderColor:'#E2E8F0', textStyle:{color:'#0F172A',fontSize:12}, extraCssText:'border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.08)' },
    legend: { bottom:2, textStyle:{color:tc,fontSize:10}, icon:'circle', itemWidth:6, itemHeight:6, itemGap:10 },
    color: ['#3B82F6','#94A3B8','#F59E0B','#8B5CF6','#10B981','#EF4444'],
    graphic: { type:'text', left:'center', top:'36%', style:{text:`共${total}篇`,textAlign:'center',fill:tc,fontSize:13,fontWeight:600} },
    series: [{ type:'pie', radius:['52%','76%'], center:['50%','44%'], itemStyle:{borderRadius:4,borderColor:tbB(),borderWidth:2}, label:{show:false}, emphasis:{scaleSize:6,label:{show:true,fontSize:12,fontWeight:'bold'}}, data:d }],
  })
}
function drawDon() {
  if (!dcEl.value) return; if (!dcInst) dcInst = echarts.init(dcEl.value)
  const d = stats.value.donationTrend, tc = tC()
  dcInst.setOption({
    animation: true, animationDuration: 600,
    tooltip: { trigger:'axis', backgroundColor:tbB(), borderColor:'#E2E8F0', textStyle:{color:'#0F172A',fontSize:12}, extraCssText:'border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.08)' },
    legend: { data:['金额','笔数'], top:0, right:0, itemGap:12, textStyle:{color:tc,fontSize:11}, icon:'roundRect', itemWidth:10, itemHeight:6 },
    grid: { left:40, right:44, top:34, bottom:22 },
    xAxis: { type:'category', data:d.map((t:any)=>t.date.slice(5)), axisLine:{show:false}, axisLabel:{color:tc,fontSize:10}, axisTick:{show:false} },
    yAxis: [
      { type:'value', axisLine:{show:false}, axisLabel:{color:tc,fontSize:10}, splitLine:{lineStyle:{color:aC(),type:'dashed'}} },
      { type:'value', axisLine:{show:false}, axisLabel:{color:tc,fontSize:10}, splitLine:{show:false} },
    ],
    series: [
      { name:'金额', type:'line', smooth:true, symbol:'circle', symbolSize:3, yAxisIndex:0, data:d.map((t:any)=>t.amount), itemStyle:{color:'#10B981'}, lineStyle:{color:'#10B981',width:2}, areaStyle:{color:new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'rgba(16,185,129,0.08)'},{offset:1,color:'rgba(16,185,129,0)'}])} },
      { name:'笔数', type:'bar', yAxisIndex:1, data:d.map((t:any)=>t.count), itemStyle:{color:new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'#F59E0B'},{offset:1,color:'#FDE68A'}]),borderRadius:[3,3,0,0]}, barWidth:12, barGap:'40%' },
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
    <!-- header -->
    <div class="dh">
      <div>
        <div class="dh-hi">{{ gGr() }}，{{ username }}</div>
        <div class="dh-sub">{{ gDt() }}</div>
      </div>
      <div class="dh-btns">
        <n-button size="small" type="primary" @click="router.push('/posts/create')"><template #icon><n-icon size="14"><CreateOutline /></n-icon></template>写文章</n-button>
        <n-button size="small" @click="router.push('/membership')" quaternary><template #icon><n-icon size="14"><GiftOutline /></n-icon></template>会员</n-button>
        <n-button size="small" :loading="loading" @click="load" quaternary><template #icon><n-icon size="14"><RefreshOutline /></n-icon></template></n-button>
      </div>
    </div>

    <n-spin :show="loading">
      <div class="db">

        <!-- stat cards -->
        <div class="sr">
          <div v-for="s in statsDef" :key="s.key"
            class="sc" :class="{ clickable: !!s.link }"
            @click="s.link && router.push(s.link)"
          >
            <div class="sic" :style="{ color: s.color, background: s.bg }">
              <n-icon size="18"><component :is="s.icon" /></n-icon>
            </div>
            <div class="sbd">
              <div class="sn">{{ f((stats as any)[s.key]) }}</div>
              <div class="sl">{{ s.label }}</div>
            </div>
          </div>
          <!-- donation -->
          <div v-if="donation && (stats.donationCount??0) > 0" class="sc clickable" @click="router.push('/donations')">
            <div class="sic" style="color:#059669;background:#ECFDF5"><n-icon size="18"><CashOutline /></n-icon></div>
            <div class="sbd">
              <div class="sn">{{ donation.currency === 'CNY' ? '¥' : '$' }}{{ donation.amount }}</div>
              <div class="sl">捐赠 · {{ stats.donationCount }}笔</div>
            </div>
          </div>
        </div>

        <!-- charts -->
        <div class="cr">
          <n-card size="small" :bordered="false">
            <template #header>7天互动趋势</template>
            <div ref="tcEl" style="width:100%;height:200px"></div>
          </n-card>
          <n-card size="small" :bordered="false">
            <template #header>文章状态分布</template>
            <template #header-extra><span style="font-size:11px;color:var(--n-text-color-3)">共{{ stats.postCount }}篇</span></template>
            <div ref="pcEl" style="width:100%;height:200px"></div>
          </n-card>
          <n-card size="small" :bordered="false">
            <template #header>捐赠趋势</template>
            <div ref="dcEl" style="width:100%;height:200px"></div>
          </n-card>
        </div>

        <!-- bottom lists -->
        <div class="br">
          <n-card size="small" :bordered="false">
            <template #header>热门文章</template>
            <template #header-extra><span class="lmore" @click="router.push('/posts')">全部</span></template>
            <div v-if="!stats.topPosts.length" class="lempty">暂无数据</div>
            <div v-for="(p,i) in stats.topPosts.slice(0,5)" :key="p.id" class="li" @click="router.push(`/posts/${p.id}/edit`)">
              <span class="lir" :class="'r'+(i+1)">{{ i+1 }}</span>
              <span class="lit">{{ p.title }}</span>
              <span class="lis">{{ f(p.viewCount) }}阅读 · {{ f(p.likeCount) }}赞</span>
            </div>
          </n-card>
          <n-card size="small" :bordered="false">
            <template #header>最近注册</template>
            <div v-if="!stats.recentUsers.length" class="lempty">暂无数据</div>
            <div v-for="u in stats.recentUsers.slice(0,5)" :key="u.id" class="li">
              <n-avatar :size="24" round :style="{background:'var(--n-fill-color)',fontSize:'11px'}">{{ (u.nickname||u.username).charAt(0).toUpperCase() }}</n-avatar>
              <span class="lit">{{ u.nickname||u.username }}</span>
              <span class="lis">{{ tA(u.createdAt) }}</span>
            </div>
          </n-card>
        </div>

      </div>
    </n-spin>
  </div>
</template>

<style scoped>
.dash { display: flex; flex-direction: column; gap: 16px; }
.db { display: flex; flex-direction: column; gap: 16px; }

/* header */
.dh { display: flex; align-items: center; justify-content: space-between; }
.dh-hi { font-size: 18px; font-weight: 700; color: var(--n-text-color); }
.dh-sub { font-size: 12px; color: var(--n-text-color-3); margin-top: 2px; }
.dh-btns { display: flex; gap: 6px; align-items: center; }

/* stat cards */
.sr { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.sc {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 12px;
  padding: 14px 16px;
  display: flex; gap: 12px; align-items: center;
  transition: border-color .2s, box-shadow .2s;
}
.sc.clickable { cursor: pointer; }
.sc.clickable:hover { border-color: var(--n-primary-color); box-shadow: 0 2px 12px rgba(37,99,235,.06); }
.sic {
  width: 40px; height: 40px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.sbd { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sn { font-size: 20px; font-weight: 700; color: var(--n-text-color); line-height: 1; }
.sl { font-size: 11px; color: var(--n-text-color-3); }

/* charts */
.cr { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }

/* bottom */
.br { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; }

/* lists */
.lmore { font-size: 11px; color: var(--n-primary-color); cursor: pointer; }
.lmore:hover { text-decoration: underline; }
.lempty { padding: 24px; text-align: center; font-size: 12px; color: var(--n-text-color-3); }
.li { display: flex; align-items: center; gap: 10px; padding: 8px 0; cursor: pointer; border-bottom: 1px solid var(--n-border-color); }
.li:last-child { border-bottom: none; padding-bottom: 0; }
.li:first-child { padding-top: 0; }
.lir {
  width: 20px; height: 20px; border-radius: 5px;
  background: var(--n-fill-color);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600; color: #6B7280; flex-shrink: 0;
}
.lir.r1 { background: #FEF3C7; color: #B45309; }
.lir.r2 { background: #E5E7EB; color: #374151; }
.lir.r3 { background: #FEE2E2; color: #991B1B; }
.lit { flex: 1; min-width: 0; font-size: 12.5px; color: var(--n-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lis { font-size: 10.5px; color: var(--n-text-color-3); flex-shrink: 0; }

@media (max-width: 1100px) { .sr { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 900px) { .sr { grid-template-columns: repeat(2, 1fr); } .cr { grid-template-columns: 1fr; } .br { grid-template-columns: 1fr; } }
</style>
