<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import {
  NCard, NInput, NInputNumber, NSwitch,
  NButton, NSpace, NSpin, NTabs, NTabPane, NTag, NSelect, useMessage,
} from 'naive-ui'
import { getSiteSettings, saveSiteSettings, testR2Connection, getEffectiveConfig, testSmtp } from '../../api/site-setting'
import type { EffectiveConfig } from '../../api/site-setting'
/**
 * 站点设置（group='site'）结构化管理页。
 * 与通用 KV 编辑页（views/setting/IndexView.vue）不同：这里把常用 key 固化成
 * 强类型表单字段，admin 无需记 key 名，开关/数字/文本/JSON 各用对应控件。
 *
 * 数据流：getSiteSettings() 返回 SettingItem[] → 展平到 reactive form →
 * 保存时重新打包成 Record<key,string> → saveSiteSettings()。
 * JSON 字段（钱包地址、社交链接）在表单内用 textarea 编辑，保存前 stringify、
 * 加载时 parse；parse 失败保留原字符串让用户修正（不丢数据）。
 *
 * 布局：双栏栅格（n-grid）紧凑排列，文本类字段两列并排，JSON 大字段占整行。
 */

const message = useMessage()
const loading = ref(false)
const saving = ref(false)
/** 当前生效配置概要（面板/env 兜底，密钥脱敏），保存后刷新 */
const eff = ref<EffectiveConfig | null>(null)

const sourceLabel: Record<string, string> = {
  panel: '面板配置',
  env: '.env 兜底',
  none: '未配置',
}

const form = reactive({
  // 站点信息
  siteName: '',
  siteTitle: '',
  siteSubtitle: '',
  siteDescription: '',
  logoUrl: '',
  faviconUrl: '',
  // 联系方式
  contactEmail: '',
  shopUrl: '',
  socialLinksText: '', // JSON 文本
  // 捐赠
  donationEnabled: true,
  donationUsdtRate: 7,
  walletEntries: [] as WalletEntryForm[],
  // 注册
  registrationEnabled: true,
  registrationRequireInvitation: true,
  registrationEmailWhitelist: '',
  // 维护模式
  maintenanceEnabled: false,
  // 模块开关
  commentsEnabled: true,
  announcementsEnabled: true,
  adsEnabled: true,
  // Turnstile
  turnstileEnabled: false,
  turnstileSiteKey: '',
  turnstileSecretKey: '',
  // R2 存储多账号（storage.r2.accounts）
  r2Accounts: [] as R2AccountForm[],
  r2ActiveId: '',
  // SMTP 邮件（smtp.*）—— smtpPort 用 string：n-input 的 value 只收 string，
  // 保存时 String() 归一（294 行），赋值处 get() 也是 string
  smtpHost: '',
  smtpPort: '',
  smtpUser: '',
  smtpPass: '',
  smtpFrom: '',
  // Tavily 联网搜索（ai.tavily_*）
  tavilyKey: '',
  tavilyUrl: '',
})

interface R2AccountForm {
  id: string
  name: string
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  publicDomain: string
  prefix: string
  enabled: boolean
}

/** 新建空白 R2 账号（id 用随机串，保存后即为账号唯一标识） */
function newR2Account(): R2AccountForm {
  return {
    id: 'r2-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
    name: '',
    accountId: '',
    accessKeyId: '',
    secretAccessKey: '',
    bucket: '',
    publicDomain: '',
    prefix: '',
    enabled: true,
  }
}

/** 钱包地址条目：选链 + 填地址（保存时序列化为 donation.wallet_addresses JSON 对象） */
interface WalletEntryForm {
  chain: string
  address: string
}

/** 常用链预设（下拉快捷项；支持输入自定义链名） */
const WALLET_CHAIN_PRESETS = ['TRC20', 'BSC', 'POL', 'ERC20', 'SOL', 'TRX']

const chainOptions = computed(() =>
  WALLET_CHAIN_PRESETS.filter((c) => !form.walletEntries.some((e) => e.chain === c))
    .map((c) => ({ label: c, value: c })),
)

function addWalletEntry() {
  form.walletEntries.push({ chain: '', address: '' })
}

function removeWalletEntry(i: number) {
  form.walletEntries.splice(i, 1)
}

function addR2Account() {
  form.r2Accounts.push(newR2Account())
}

function removeR2Account(i: number) {
  const removed = form.r2Accounts[i]
  form.r2Accounts.splice(i, 1)
  if (form.r2ActiveId === removed.id) form.r2ActiveId = ''
}

/** 归一化 key 前缀：去首尾斜杠 */
function normalizePrefix(p: string): string {
  return p.trim().replace(/^\/+|\/+$/g, '')
}

/** 正在测试连通性的账号 id */
const testingId = ref('')
/** 每个账号的测试结果：id → { ok, text } */
const testResults = reactive<Record<string, { ok: boolean; text: string }>>({})

/** 测试单个账号连通性（用表单当前值，无需先保存） */
async function handleTestR2(acc: R2AccountForm) {
  const missing: string[] = []
  if (!acc.accountId.trim()) missing.push('Endpoint/账户ID')
  if (!acc.accessKeyId.trim()) missing.push('Access Key')
  if (!acc.secretAccessKey.trim()) missing.push('Secret Key')
  if (!acc.bucket.trim()) missing.push('存储桶')
  if (missing.length > 0) {
    testResults[acc.id] = { ok: false, text: `请先填写：${missing.join('、')}` }
    return
  }
  testingId.value = acc.id
  delete testResults[acc.id]
  try {
    const res = await testR2Connection({
      accountId: acc.accountId.trim(),
      accessKeyId: acc.accessKeyId.trim(),
      secretAccessKey: acc.secretAccessKey,
      bucket: acc.bucket.trim(),
    })
    const d = res.data
    testResults[acc.id] = {
      ok: d.ok,
      text: d.ok ? `${d.message}（${d.latencyMs}ms）` : d.message,
    }
  } catch (e: any) {
    testResults[acc.id] = { ok: false, text: e?.message || '测试请求失败' }
  } finally {
    testingId.value = ''
  }
}

/** SMTP 测试发送 */
const smtpTestTo = ref('')
const smtpTesting = ref(false)
const smtpTestResult = ref<{ ok: boolean; text: string } | null>(null)

/** 加载时已存在于 DB 的 R2 账号 id（这些账号的 secret 后端存原值，编辑可留空） */
let loadedAccountIds = new Set<string>()

async function handleTestSmtp() {
  // 收件人留空时后端自动兜底（SMTP 用户名 → 站点联系邮箱），默认发给自己
  smtpTesting.value = true
  smtpTestResult.value = null
  try {
    const res = await testSmtp({
      to: smtpTestTo.value.trim(),
      host: form.smtpHost.trim(),
      port: form.smtpPort,
      user: form.smtpUser.trim(),
      pass: form.smtpPass,
      from: form.smtpFrom.trim(),
    })
    smtpTestResult.value = { ok: !!res.data?.ok, text: res.data?.message || '未知结果' }
  } catch (e: any) {
    smtpTestResult.value = { ok: false, text: e?.message || '测试请求失败' }
  } finally {
    smtpTesting.value = false
  }
}

/** 安全 JSON parse：失败返回 null（不抛错） */
function safeParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

/** 把后端 SettingItem[] 灌进表单（含类型转换 + JSON 文本化） */
function applyItems(items: { key: string; value: string }[]) {
  const map = new Map(items.map((i) => [i.key, i.value]))
  const get = (k: string, def = '') => map.get(k) ?? def
  const toBool = (v: string) => v === 'true' || v === '1'

  form.siteName = get('site.name', '慢成长')
  form.siteTitle = get('site.title', '慢成长')
  form.siteSubtitle = get('site.subtitle', 'Slow Growth')
  form.siteDescription = get('site.description')
  form.logoUrl = get('site.logo_url')
  form.faviconUrl = get('site.favicon_url')
  form.contactEmail = get('site.contact_email')
  form.shopUrl = get('site.shop_url')

  // JSON 字段：美化输出方便编辑，parse 失败则原样展示
  const social = get('site.social_links')
  form.socialLinksText = social ? JSON.stringify(safeParse(social, {}), null, 2) : ''
  const wallets = get('donation.wallet_addresses')
  // JSON 对象 {TRC20:'addr',...} → 结构化条目（选链+地址），后台即可视化编辑
  const walletsParsed = safeParse<Record<string, string>>(wallets || '', {})
  form.walletEntries = Object.entries(walletsParsed).map(([chain, address]) => ({
    chain,
    address: String(address ?? ''),
  }))

  form.donationEnabled = toBool(get('donation.enabled', 'true'))
  form.donationUsdtRate = Number(get('donation.usdt_rate', '7')) || 7
  form.registrationEnabled = toBool(get('registration.enabled', 'true'))
  form.registrationRequireInvitation = toBool(get('registration.require_invitation', 'true'))
  form.registrationEmailWhitelist = get('registration.email_whitelist')
  form.maintenanceEnabled = toBool(get('maintenance.enabled', 'false'))
  form.commentsEnabled = toBool(get('comments.enabled', 'true'))
  form.announcementsEnabled = toBool(get('announcements.enabled', 'true'))
  form.adsEnabled = toBool(get('ads.enabled', 'true'))
  form.turnstileEnabled = toBool(get('turnstile.enabled', 'false'))
  form.turnstileSiteKey = get('turnstile.site_key')
  form.turnstileSecretKey = get('turnstile.secret_key')

  // R2 多账号：JSON 数组 → 表单数组（缺字段补默认值）
  const accountsRaw = get('storage.r2.accounts', '[]')
  const accountsParsed = safeParse<unknown[]>(accountsRaw, [])
  form.r2Accounts = Array.isArray(accountsParsed)
    ? accountsParsed
        .filter((a) => a && typeof a === 'object')
        .map((a) => {
          const src = a as Partial<R2AccountForm>
          return {
            ...newR2Account(),
            ...src,
            prefix: normalizePrefix(src.prefix || ''),
            enabled: src.enabled !== false,
          }
        })
    : []
  // 记录"已存在于 DB"的账号 id：后端对敏感值只回显空串（secretAccessKey），
  // 保存时空 secret 按 id 回填原值，因此已有账号编辑时 secret 可留空；
  // 只有新建账号才强制填写 secret。
  loadedAccountIds = new Set(form.r2Accounts.map((a) => a.id))
  form.r2ActiveId = get('storage.r2.active_id')

  // SMTP（空 = 用 .env）
  form.smtpHost = get('smtp.host')
  form.smtpPort = get('smtp.port')
  form.smtpUser = get('smtp.user')
  form.smtpPass = get('smtp.pass')
  form.smtpFrom = get('smtp.from')

  // Tavily（空 = 用 .env）
  form.tavilyKey = get('ai.tavily_key')
  form.tavilyUrl = get('ai.tavily_url')

  // SMTP 测试收件人预填：默认发给自己（SMTP 用户名），其次站点联系邮箱
  const emailLike = /^\S+@\S+\.\S+$/
  const smtpUserLike = form.smtpUser.trim()
  if (emailLike.test(smtpUserLike)) smtpTestTo.value = smtpUserLike
  else if (emailLike.test(form.contactEmail.trim())) smtpTestTo.value = form.contactEmail.trim()
}

/** 把表单打包成后端期望的 Record<key, string>（含 JSON 校验） */
function buildItems(): Record<string, string> | null {
  const out: Record<string, string> = {
    'site.name': form.siteName,
    'site.title': form.siteTitle,
    'site.subtitle': form.siteSubtitle,
    'site.description': form.siteDescription,
    'site.logo_url': form.logoUrl,
    'site.favicon_url': form.faviconUrl,
    'site.contact_email': form.contactEmail,
    'site.shop_url': form.shopUrl,
    'donation.enabled': String(form.donationEnabled),
    'donation.usdt_rate': String(form.donationUsdtRate),
    'registration.enabled': String(form.registrationEnabled),
    'registration.require_invitation': String(form.registrationRequireInvitation),
    'registration.email_whitelist': form.registrationEmailWhitelist,
    'maintenance.enabled': String(form.maintenanceEnabled),
    'comments.enabled': String(form.commentsEnabled),
    'announcements.enabled': String(form.announcementsEnabled),
    'ads.enabled': String(form.adsEnabled),
    'turnstile.enabled': String(form.turnstileEnabled),
    'turnstile.site_key': form.turnstileSiteKey,
    'turnstile.secret_key': form.turnstileSecretKey,
    'storage.r2.active_id': form.r2ActiveId,
    'smtp.host': form.smtpHost.trim(),
    'smtp.port': String(form.smtpPort ?? '').trim(),
    'smtp.user': form.smtpUser.trim(),
    'smtp.pass': form.smtpPass,
    'smtp.from': form.smtpFrom.trim(),
    'ai.tavily_key': form.tavilyKey.trim(),
    'ai.tavily_url': form.tavilyUrl.trim(),
  }

  // R2 账号：启用状态的账号必填字段校验（禁用账号原样保存不校验）。
  // secretAccessKey 例外：已有账号（loadedAccountIds）后端回填原值，可留空；
  // 新建账号必须填写。
  for (const acc of form.r2Accounts) {
    if (!acc.enabled) continue
    const label = acc.name || acc.id
    const missing: string[] = []
    if (!acc.accountId.trim()) missing.push('Endpoint/账户ID')
    if (!acc.accessKeyId.trim()) missing.push('Access Key ID')
    if (!acc.secretAccessKey.trim() && !loadedAccountIds.has(acc.id))
      missing.push('Secret Access Key')
    if (!acc.bucket.trim()) missing.push('存储桶')
    if (missing.length > 0) {
      message.error(`R2 账号「${label}」缺少：${missing.join('、')}`)
      return null
    }
  }
  out['storage.r2.accounts'] = JSON.stringify(
    form.r2Accounts.map((a) => ({
      id: a.id,
      name: a.name.trim(),
      accountId: a.accountId.trim(),
      accessKeyId: a.accessKeyId.trim(),
      secretAccessKey: a.secretAccessKey,
      bucket: a.bucket.trim(),
      publicDomain: a.publicDomain.trim(),
      prefix: normalizePrefix(a.prefix),
      enabled: a.enabled,
    })),
  )
  // 当前账号指向校验：必须存在且启用
  if (form.r2ActiveId && !form.r2Accounts.some((a) => a.id === form.r2ActiveId && a.enabled)) {
    form.r2ActiveId = ''
    out['storage.r2.active_id'] = ''
  }

  // JSON 字段：校验合法性，非法则提示并中止保存
  for (const [field, key] of [
    ['socialLinksText', 'site.social_links'],
  ] as const) {
    const raw = (form as any)[field] as string
    const trimmed = raw.trim()
    if (!trimmed) {
      out[key] = '{}'
      continue
    }
    try {
      out[key] = JSON.stringify(JSON.parse(trimmed))
    } catch {
      message.error(`${key} 的 JSON 格式有误，请检查（逗号、引号、括号是否匹配）`)
      return null
    }
  }

  // 钱包条目 → donation.wallet_addresses JSON：过滤空链名行，查重链名
  const wallets: Record<string, string> = {}
  for (const e of form.walletEntries) {
    const chain = e.chain.trim()
    if (!chain) continue
    if (chain in wallets) {
      message.error(`链「${chain}」重复，请合并后再保存`)
      return null
    }
    wallets[chain] = e.address.trim()
  }
  out['donation.wallet_addresses'] = JSON.stringify(wallets)
  return out
}

async function loadSettings() {
  loading.value = true
  try {
    const [res, effRes] = await Promise.all([getSiteSettings(), getEffectiveConfig().catch(() => null)])
    applyItems(res.data || [])
    if (effRes?.data) eff.value = effRes.data
  } catch (e: any) {
    message.error(e?.message || '加载系统设置失败')
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  if (saving.value) return
  const items = buildItems()
  if (!items) return
  saving.value = true
  try {
    await saveSiteSettings(items)
    message.success('系统设置已保存，前台将在缓存过期后（约 5 分钟）生效')
    await loadSettings()
  } catch (e: any) {
    message.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadSettings()
})
</script>

<template>
  <div class="page-wrapper">
    <div class="page-header">
      <h2 class="page-title">系统设置</h2>
      <n-space>
        <n-button :loading="loading || saving" @click="loadSettings">刷新</n-button>
        <n-button type="primary" :loading="saving" :disabled="loading" @click="handleSave">
          保存
        </n-button>
      </n-space>
    </div>

    <n-spin :show="loading">
            <n-tabs type="line" animated size="large">
        <n-tab-pane name="switch" tab="功能开关" display-directive="show">
          <div class="setting-cards">
  <!-- ═══ 功能开关（双列排布，注册策略合并于此）═══ -->
          <n-card title="功能开关" size="small" :bordered="false">
            <div class="switch-grid">
              <div class="switch-row">
                <div class="switch-label">
                  <span class="switch-title">开放捐赠</span>
                  <span class="switch-desc">关闭后前台捐赠页显示"暂未开放"，后端也拒绝提交</span>
                </div>
                <n-switch v-model:value="form.donationEnabled" />
              </div>
              <div class="switch-row">
                <div class="switch-label">
                  <span class="switch-title">开放注册</span>
                  <span class="switch-desc">关闭后登录弹窗隐藏注册入口，后端 register 也拒绝</span>
                </div>
                <n-switch v-model:value="form.registrationEnabled" />
              </div>
              <div class="switch-row">
                <div class="switch-label">
                  <span class="switch-title">注册需要邀请码</span>
                  <span class="switch-desc">关闭后开放自由注册（无需邀请码即可注册）</span>
                </div>
                <n-switch v-model:value="form.registrationRequireInvitation" />
              </div>
              <div class="switch-row">
                <div class="switch-label">
                  <span class="switch-title">维护模式</span>
                  <span class="switch-desc">开启后前台进入只读状态（管理员仍可操作）</span>
                </div>
                <n-switch v-model:value="form.maintenanceEnabled" />
              </div>
              <div class="switch-row">
                <div class="switch-label">
                  <span class="switch-title">开放评论</span>
                  <span class="switch-desc">关闭后文章详情隐藏评论区，历史评论仍可查看</span>
                </div>
                <n-switch v-model:value="form.commentsEnabled" />
              </div>
              <div class="switch-row">
                <div class="switch-label">
                  <span class="switch-title">开放公告</span>
                  <span class="switch-desc">关闭后首页/通知中心隐藏公告位，公开接口返回空列表</span>
                </div>
                <n-switch v-model:value="form.announcementsEnabled" />
              </div>
              <div class="switch-row">
                <div class="switch-label">
                  <span class="switch-title">开放广告</span>
                  <span class="switch-desc">关闭后所有广告位隐藏，公开接口返回空列表</span>
                </div>
                <n-switch v-model:value="form.adsEnabled" />
              </div>
              <div class="switch-row">
                <div class="switch-label">
                  <span class="switch-title">Turnstile 验证</span>
                  <span class="switch-desc">敏感操作接入人机验证（凭证在下方卡片配置）</span>
                </div>
                <n-switch v-model:value="form.turnstileEnabled" />
              </div>
            </div>
            <div class="whitelist-row">
              <span class="whitelist-label">注册邮箱白名单</span>
              <n-input
                v-model:value="form.registrationEmailWhitelist"
                size="small"
                placeholder="留空表示不限；多个用逗号分隔，如 qq.com,163.com"
              />
            </div>
          </n-card>

        
          </div>
        </n-tab-pane>
        <n-tab-pane name="basic" tab="基本设置" display-directive="show">
          <div class="setting-cards">
          <n-card title="站点信息" size="small" :bordered="false">
            <div class="vg">
              <div class="f"><span class="f-label">站点名称</span><n-input v-model:value="form.siteName" placeholder="慢成长" /></div>
              <div class="f"><span class="f-label">站点标题</span><n-input v-model:value="form.siteTitle" placeholder="浏览器标签后缀" /></div>
              <div class="f"><span class="f-label">站点副标题</span><n-input v-model:value="form.siteSubtitle" placeholder="Logo 下方显示，如 Slow Growth" /></div>
              <div class="f"><span class="f-label">Logo URL</span><n-input v-model:value="form.logoUrl" placeholder="留空用文字 Logo" /></div>
              <div class="f"><span class="f-label">Favicon</span><n-input v-model:value="form.faviconUrl" placeholder="留空用默认" /></div>
              <div class="f"><span class="f-label">站点描述</span><n-input v-model:value="form.siteDescription" placeholder="一句话介绍站点" /></div>
            </div>
          </n-card>

          <n-card title="联系与社交" size="small" :bordered="false">
            <div class="vg">
              <div class="f"><span class="f-label">联系邮箱</span><n-input v-model:value="form.contactEmail" placeholder="contact@example.com" /></div>
              <div class="f"><span class="f-label">商城链接</span><n-input v-model:value="form.shopUrl" placeholder="https://shop.example.com" /></div>
              <div class="f wide">
                <span class="f-label">社交链接（JSON：github / x / telegram / rss，留空则该图标不可点）</span>
                <n-input v-model:value="form.socialLinksText" type="textarea" :rows="4" placeholder='{"github":"","x":"","telegram":"","rss":""}' style="font-family: monospace; font-size: 12px" />
              </div>
            </div>
          </n-card>

          <n-card title="捐赠配置" size="small" :bordered="false">
            <template #header-extra>
              <n-button size="small" dashed type="primary" @click="addWalletEntry">+ 添加链</n-button>
            </template>
            <div class="vg">
              <div class="f"><span class="f-label">USDT 汇率</span><n-input-number v-model:value="form.donationUsdtRate" :min="0" :step="0.1" style="width: 100%" /></div>
              <!-- 钱包地址：选链 + 填地址，保存时序列化为 donation.wallet_addresses JSON -->
              <div class="f wide">
                <span class="f-label">加密货币收款地址（选择链后填地址；可输入自定义链名；空地址的链前台不显示）</span>
                <div v-if="form.walletEntries.length === 0" class="panel-tip">暂未配置收款地址，点击右上角「+ 添加链」开始。</div>
                <div v-for="(entry, i) in form.walletEntries" :key="i" style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">
                  <n-select
                    v-model:value="entry.chain"
                    :options="chainOptions"
                    filterable
                    tag
                    placeholder="选择或输入链名"
                    style="width: 180px"
                  />
                  <n-input v-model:value="entry.address" placeholder="收款钱包地址" style="flex:1" />
                  <n-button size="small" quaternary type="error" @click="removeWalletEntry(i)">删除</n-button>
                </div>
              </div>
            </div>
          </n-card>

          <n-card title="Turnstile 凭证" size="small" :bordered="false">
            <div class="vg">
              <div class="f"><span class="f-label">Site Key</span><n-input v-model:value="form.turnstileSiteKey" placeholder="公开凭证" /></div>
              <div class="f"><span class="f-label">Secret Key</span><n-input v-model:value="form.turnstileSecretKey" type="password" show-password-on="click" placeholder="私密凭证" /></div>
            </div>
            <div class="panel-tip" style="margin-bottom: 0">
              开发环境可用 Cloudflare 测试密钥：Site Key <code>1x00000000000000000000AA</code>、
              Secret Key <code>1x0000000000000000000000000000000AA</code>（始终通过）。生产环境请替换为真实密钥。
            </div>
          </n-card>
          </div>
        </n-tab-pane>
        <n-tab-pane name="storage" tab="存储（R2）" display-directive="show">
          <div class="setting-cards">
  <!-- ═══ 存储配置（Cloudflare R2 多账号）═══ -->
          <n-card title="存储配置（Cloudflare R2）" size="small" :bordered="false">
            <template #header-extra>
              <n-button size="small" dashed type="primary" @click="addR2Account">+ 添加账号</n-button>
            </template>
            <div class="panel-tip">
              上传使用标记为「当前」的账号；Endpoint 和 Account ID 二选一填写，
              Key 前缀用于多账号/多站点隔离（如 <code>blog/</code>，可留空）。
            </div>

            <!-- 当前生效配置（面板/env 兜底，密钥脱敏） -->
            <div v-if="eff?.r2 && eff.r2.source !== 'none'" class="eff-line">
              <span class="eff-badge" :class="eff.r2.source">当前生效：{{ sourceLabel[eff.r2.source] }}（面板填写后优先于 .env）</span>
              <span class="eff-text">
                {{ eff.r2.accountName }} · 桶 {{ eff.r2.bucket }}
                <template v-if="eff.r2.prefix"> · 前缀 {{ eff.r2.prefix }}/</template>
                <template v-if="eff.r2.keyMasked"> · Key {{ eff.r2.keyMasked }}</template>
              </span>
            </div>

            <div v-if="form.r2Accounts.length === 0" class="r2-empty">
              {{ eff?.r2 && eff.r2.source === 'env'
                ? '未添加面板账号，当前走 .env 配置（见上方生效信息）'
                : '暂无 R2 账号，点右上角「添加账号」开始配置' }}
            </div>

            <div v-for="(acc, i) in form.r2Accounts" :key="acc.id" class="r2-account" :class="{ 'r2-account-off': !acc.enabled }">
              <div class="r2-account-head">
                <div class="r2-account-title">
                  <span class="r2-index">#{{ i + 1 }}</span>
                  <n-input
                    v-model:value="acc.name"
                    size="small"
                    placeholder="账号备注名（如 主站图床）"
                    class="r2-name-input"
                  />
                  <n-tag v-if="form.r2ActiveId === acc.id" type="success" size="small" round>当前</n-tag>
                </div>
                <n-space size="small" align="center">
                  <n-switch v-model:value="acc.enabled" size="small">
                    <template #checked>启用</template>
                    <template #unchecked>停用</template>
                  </n-switch>
                  <n-button
                    size="small"
                    secondary
                    :loading="testingId === acc.id"
                    @click="handleTestR2(acc)"
                  >
                    测试连通性
                  </n-button>
                  <n-button
                    v-if="form.r2ActiveId !== acc.id"
                    size="small"
                    :disabled="!acc.enabled"
                    @click="form.r2ActiveId = acc.id"
                  >
                    设为当前
                  </n-button>
                  <n-button size="small" quaternary type="error" @click="removeR2Account(i)">
                    删除
                  </n-button>
                </n-space>
              </div>

              <div class="r2-fields">
                <div class="field">
                  <label>Endpoint</label>
                  <n-input v-model:value="acc.accountId" placeholder="https://xxx.r2.cloudflarestorage.com 或纯 Account ID" />
                </div>
                <div class="field">
                  <label>存储桶</label>
                  <n-input v-model:value="acc.bucket" placeholder="bucket 名称" />
                </div>
                <div class="field">
                  <label>Access Key</label>
                  <n-input v-model:value="acc.accessKeyId" placeholder="Access Key ID" />
                </div>
                <div class="field">
                  <label>Secret Key</label>
                  <n-input v-model:value="acc.secretAccessKey" type="password" show-password-on="click" placeholder="Secret Access Key" />
                </div>
                <div class="field">
                  <label>公开域名</label>
                  <n-input v-model:value="acc.publicDomain" placeholder="https://cdn.example.com（可空）" />
                </div>
                <div class="field">
                  <label>Key 前缀</label>
                  <n-input v-model:value="acc.prefix" placeholder="blog/（可空）" />
                </div>
              </div>

              <div v-if="testResults[acc.id]" class="r2-test-result" :class="testResults[acc.id].ok ? 'ok' : 'fail'">
                {{ testResults[acc.id].ok ? '✓ ' : '✕ ' }}{{ testResults[acc.id].text }}
              </div>
            </div>
          </n-card>

        
          </div>
        </n-tab-pane>
        <n-tab-pane name="mail" tab="邮件通知" display-directive="show">
          <div class="setting-cards">
  <!-- ═══ 邮件通知（SMTP）═══ -->
          <n-card title="邮件通知（SMTP）" size="small" :bordered="false">
            <div class="vg">
                <div class="f"><span class="f-label">服务器（留空用 .env 兜底）</span><n-input v-model:value="form.smtpHost" placeholder="smtp.163.com" /></div>
                <div class="f"><span class="f-label">端口（留空用 .env 兜底）</span><n-input v-model:value="form.smtpPort" placeholder="465 / 587" /></div>
                <div class="f"><span class="f-label">用户名（留空用 .env 兜底）</span><n-input v-model:value="form.smtpUser" placeholder="SMTP 用户名" /></div>
                <div class="f"><span class="f-label">密码（留空用 .env 兜底）</span><n-input v-model:value="form.smtpPass" type="password" show-password-on="click" placeholder="密码 / 授权码" /></div>
                <div class="f wide"><span class="f-label">发件人（留空用 .env 兜底）</span><n-input v-model:value="form.smtpFrom" placeholder='"站名" <noreply@example.com>' /></div>
              </div>
              <div class="panel-tip" style="margin-top: 12px">
                所有字段留空时使用 .env 兜底；面板填了就用面板的（优先）。修改保存后立即生效（无需重启）。
              </div>
              <div class="smtp-test-row">
                <span class="whitelist-label">测试发送</span>
                <n-input
                  v-model:value="smtpTestTo"
                  size="small"
                  placeholder="留空发给自己（SMTP 用户名）；也可填其他邮箱"
                  class="smtp-test-input"
                  @keyup.enter="handleTestSmtp"
                />
                <n-button size="small" secondary type="primary" :loading="smtpTesting" @click="handleTestSmtp">
                  发送测试邮件
                </n-button>
              </div>
              <div v-if="smtpTestResult" class="r2-test-result" :class="smtpTestResult.ok ? 'ok' : 'fail'">
                {{ smtpTestResult.ok ? '✓ ' : '✕ ' }}{{ smtpTestResult.text }}
              </div>
          </n-card>

        
          </div>
        </n-tab-pane>
        <n-tab-pane name="ai" tab="AI 服务" display-directive="show">
          <div class="setting-cards">
  <!-- ═══ AI 联网搜索（Tavily）═══ -->
          <n-card title="AI 联网搜索（Tavily）" size="small" :bordered="false">
            <div class="vg">
              <div class="f"><span class="f-label">API Key（留空用 .env 兜底）</span><n-input v-model:value="form.tavilyKey" type="password" show-password-on="click" placeholder="tvly-..." /></div>
              <div class="f"><span class="f-label">接口地址（默认，可空）</span><n-input v-model:value="form.tavilyUrl" placeholder="https://api.tavily.com" /></div>
            </div>
            <div class="eff-line" style="margin: 14px 0 0"e="margin-bottom: 0">
                <span v-if="eff?.tavily && eff.tavily.source !== 'none'" class="eff-badge" :class="eff.tavily.source">
                  当前生效：{{ sourceLabel[eff.tavily.source] }}（面板填写后优先于 .env）
                </span>
                <span v-else class="eff-badge none">当前生效：未配置</span>
                <span class="eff-text">
                  <template v-if="eff?.tavily && eff.tavily.source !== 'none'">
                    Key {{ eff.tavily.keyMasked }} · {{ eff.tavily.baseUrl }}（写作面板 AI 助手的联网搜索用，保存即生效）
                  </template>
                  <template v-else>写作面板 AI 联网搜索不可用，填 Key 或配置 .env</template>
                </span>
              </div>
          </n-card>
          </div>
        </n-tab-pane>
      </n-tabs>
    </n-spin>
  </div>
</template>

<style scoped>
.setting-cards {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
/* 开关列表：双列网格，每行标题+说明在左，开关在右 */
.switch-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 28px;
}
@media (max-width: 900px) {
  .switch-grid {
    grid-template-columns: 1fr;
  }
}
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 0;
  border-bottom: 1px solid rgba(128, 128, 128, 0.18);
}
.switch-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-right: 16px;
  min-width: 0;
}
.switch-title {
  font-size: 14px;
  font-weight: 500;
}
.switch-desc {
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}
/* 注册白名单行（功能开关卡底部） */
.whitelist-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 12px;
  margin-top: 2px;
}
.whitelist-label {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 500;
}
.whitelist-row .n-input {
  flex: 1;
}
/* "当前生效"配置提示行（R2/SMTP 卡片共用） */
.eff-line {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: 4px;
  background: rgba(24, 160, 88, 0.05);
  border: 1px dashed rgba(24, 160, 88, 0.35);
}
.eff-badge {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 10px;
}
.eff-badge.panel {
  color: #10803e;
  background: rgba(24, 160, 88, 0.12);
}
.eff-badge.env {
  color: #7a5a00;
  background: rgba(240, 160, 32, 0.14);
}
.eff-badge.none {
  color: #c02745;
  background: rgba(208, 48, 80, 0.1);
}
.eff-text {
  font-size: 12px;
  color: #5f6368;
  line-height: 1.6;
  word-break: break-all;
}
/* R2 账号块：每个账号一个带边框的区域 */
.r2-account {
  padding: 12px 14px;
  margin-bottom: 10px;
  border: 1px solid rgba(128, 128, 128, 0.35);
  border-radius: 6px;
  background: rgba(128, 128, 128, 0.04);
}
/* 停用账号整体降低视觉权重 */
.r2-account-off {
  opacity: 0.6;
}
.r2-account-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.r2-account-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.r2-index {
  font-size: 12px;
  color: #909399;
  font-weight: 600;
}
.r2-name-input {
  width: 220px;
}
/* 基本设置：标签在上的竖排字段（Stripe 风格，输入框全宽同起点） */
.vg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px 16px;
}
@media (max-width: 900px) {
  .vg {
    grid-template-columns: 1fr;
  }
}
.vg .f {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.vg .f-label {
  font-size: 12px;
  color: #555;
  line-height: 1.4;
}
.vg .f.wide {
  grid-column: 1 / -1;
}

/* 通用表单网格：全站设置页统一对齐规范 */
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 18px;
}
/* 单列变体：整行字段，杜绝半行空白 */
.form-grid.one-col {
  grid-template-columns: 1fr;
}
/* 单列里的短字段：限宽，避免输入框拉满整行 */
.form-grid.one-col .field.half {
  max-width: 380px;
}
@media (max-width: 900px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
.form-grid .field {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.form-grid .field label {
  flex: 0 0 88px;
  text-align: right;
  font-size: 13px;
  color: #333;
  white-space: nowrap;
}
.form-grid .field .n-input,
.form-grid .field .n-input-number {
  flex: 1;
  min-width: 0;
}
/* 跨全宽字段（textarea 等） */
.form-grid .field.wide {
  grid-column: 1 / -1;
  align-items: flex-start;
}
.form-grid .field.wide label {
  padding-top: 6px;
}
/* 字段下方提示（与输入框左对齐） */
.form-grid .field-hint {
  grid-column: 1 / -1;
  margin: -2px 0 0 98px;
  font-size: 12px;
  color: #909399;
}

/* R2 字段网格：所有行等高、label 定宽右对齐，严格对齐 */
.r2-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 18px;
  margin-top: 2px;
}
@media (max-width: 900px) {
  .r2-fields {
    grid-template-columns: 1fr;
  }
}
.r2-fields .field {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.r2-fields .field label {
  flex: 0 0 82px;
  text-align: right;
  font-size: 13px;
  color: #333;
  white-space: nowrap;
}
.r2-fields .field .n-input {
  flex: 1;
  min-width: 0;
}
/* SMTP 测试发送行 */
.smtp-test-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}
.smtp-test-input {
  flex: 1;
}
.r2-empty {
  padding: 24px 0;
  text-align: center;
  font-size: 13px;
  color: #909399;
}
/* 测试连通性结果条 */
.r2-test-result {
  margin-top: 8px;
  padding: 7px 12px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.5;
}
.r2-test-result.ok {
  color: #10803e;
  background: rgba(24, 160, 88, 0.1);
}
.r2-test-result.fail {
  color: #c02745;
  background: rgba(208, 48, 80, 0.08);
}
/* 面板顶部说明（R2/SMTP 卡片共用）：中性灰，杜绝蓝色调 */
.panel-tip {
  margin-bottom: 12px;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.7;
  color: #5f6368;
  background: rgba(128, 128, 128, 0.09);
  border-radius: 4px;
}
.panel-tip code {
  padding: 1px 5px;
  font-size: 11px;
  background: rgba(128, 128, 128, 0.18);
  border-radius: 3px;
}
</style>
