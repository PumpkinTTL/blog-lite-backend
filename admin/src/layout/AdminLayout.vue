<script setup lang="ts">
import { h, ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NLayout, NLayoutSider, NLayoutHeader, NLayoutContent, NMenu, NAvatar, NDropdown, NIcon, NBreadcrumb, NBreadcrumbItem, NSpin, useMessage } from 'naive-ui'
import type { MenuOption } from 'naive-ui'
import {
  HomeOutline,
  DocumentTextOutline,
  FolderOutline,
  PricetagsOutline,
  ImagesOutline,
  PeopleOutline,
  ShieldOutline,
  KeyOutline,
  MegaphoneOutline,
  LinkOutline,
  HeartOutline,
  SettingsOutline,
  LogOutOutline,
  PersonOutline,
  MoonOutline,
  SunnyOutline,
  RibbonOutline,
  ChatbubblesOutline,
  StarOutline,
  ClipboardOutline,
  GiftOutline,
  BanOutline,
  SpeedometerOutline,
  CubeOutline,
  ChatbubbleEllipsesOutline,
} from '@vicons/ionicons5'
import { useAuth } from '../stores/auth'
import { isDark } from '../theme'

const router = useRouter()
const route = useRoute()
const message = useMessage()
const { logout, displayName, displayAvatar } = useAuth()

const collapsed = ref(false)
const logoutLoading = ref(false)

function renderIcon(icon: Component) {
  return () => h(NIcon, null, { default: () => h(icon) })
}

const menuOptions: MenuOption[] = [
  { label: '数据概览', key: '/dashboard', icon: renderIcon(HomeOutline) },
  { type: 'divider', key: 'd0' },
  { label: '文章管理', key: '/posts', icon: renderIcon(DocumentTextOutline) },
  { label: '分类管理', key: '/categories', icon: renderIcon(FolderOutline) },
  { label: '标签管理', key: '/tags', icon: renderIcon(PricetagsOutline) },
  { label: '文件管理', key: '/media', icon: renderIcon(ImagesOutline) },
  { type: 'divider', key: 'd1' },
  { label: '用户管理', key: '/users', icon: renderIcon(PeopleOutline) },
  { label: '角色管理', key: '/roles', icon: renderIcon(ShieldOutline) },
  { label: '会员管理', key: '/membership', icon: renderIcon(RibbonOutline) },
  { label: '激活码管理', key: '/codes', icon: renderIcon(KeyOutline) },
  { type: 'divider', key: 'd2' },
  { label: '评论管理', key: '/comments', icon: renderIcon(ChatbubblesOutline) },
  { label: '互动管理', key: '/interactions', icon: renderIcon(StarOutline) },
  { label: '公告管理', key: '/announcements', icon: renderIcon(MegaphoneOutline) },
  { label: '友情链接', key: '/friend-links', icon: renderIcon(LinkOutline) },
  { label: '资源管理', key: '/resources', icon: renderIcon(GiftOutline) },
  { label: '捐赠管理', key: '/donations', icon: renderIcon(HeartOutline) },
  { type: 'divider', key: 'd3' },
  { label: 'AI 提供商', key: '/ai-providers', icon: renderIcon(CubeOutline) },
  { label: 'AI 对话历史', key: '/ai-conversations', icon: renderIcon(ChatbubbleEllipsesOutline) },
  { type: 'divider', key: 'd3b' },
  { label: '黑名单', key: '/blacklist', icon: renderIcon(BanOutline) },
  { label: '限流配置', key: '/rate-limit', icon: renderIcon(SpeedometerOutline) },
  { type: 'divider', key: 'd4' },
  { label: '系统设置', key: '/settings', icon: renderIcon(SettingsOutline) },
  { label: '审计日志', key: '/audit-logs', icon: renderIcon(ClipboardOutline) },
]

const activeMenu = computed(() => {
  const path = route.path
  if (path === '/dashboard' || path === '/') return '/dashboard'
  // /posts/123 -> /posts
  const base = '/' + path.split('/')[1]
  return base
})

function handleMenuSelect(key: string) {
  router.push(key)
}

const userDropdownOptions = computed<MenuOption[]>(() => [
  { label: '个人信息', key: 'profile', icon: renderIcon(PersonOutline) },
  { type: 'divider', key: 'd1' },
  {
    label: logoutLoading.value ? '退出中…' : '退出登录',
    key: 'logout',
    icon: renderIcon(LogOutOutline),
    disabled: logoutLoading.value,
  },
])

async function handleUserAction(key: string) {
  if (key === 'profile') {
    message.info('个人信息页开发中')
    return
  }
  if (key === 'logout') {
    // 已在登出中（async 未完成时 dropdown 可能被再次触发），直接忽略
    if (logoutLoading.value) return
    logoutLoading.value = true
    try {
      await logout()
      message.success('已退出登录')
    } catch {
      message.error('退出失败，请重试')
    } finally {
      logoutLoading.value = false
    }
  }
}

const breadcrumbItems = computed(() => {
  const map: Record<string, string> = {
    '/dashboard': '数据概览',
    '/posts': '文章管理',
    '/categories': '分类管理',
    '/tags': '标签管理',
    '/media': '文件管理',
    '/users': '用户管理',
    '/roles': '角色管理',
    '/codes': '激活码管理',
    '/membership': '会员管理',
    '/comments': '评论管理',
    '/interactions': '互动管理',
    '/announcements': '公告管理',
    '/friend-links': '友情链接',
    '/resources': '资源管理',
    '/blacklist': '黑名单管理',
    '/rate-limit': '限流配置',
    '/donations': '捐赠管理',
    '/ai-providers': 'AI 提供商',
    '/ai-conversations': 'AI 对话历史',
    '/settings': '系统设置',
  }
  const path = route.path === '/' ? '/dashboard' : route.path
  const base = '/' + path.split('/')[1]
  const items = [{ label: '首页', path: '/dashboard' }]
  if (base !== '/dashboard' && map[base]) {
    items.push({ label: map[base], path: base })
  }
  return items
})

function toggleDark() {
  isDark.value = !isDark.value
}
</script>

<template>
  <n-layout has-sider class="admin-layout">
    <!-- 登出全屏遮罩：dropdown 的 disabled 反馈太弱，用遮罩给出明确「正在登出」反馈 -->
    <teleport to="body">
      <transition name="fade">
        <div v-if="logoutLoading" class="logout-overlay">
          <n-spin size="large" />
          <span class="logout-overlay-text">正在退出登录…</span>
        </div>
      </transition>
    </teleport>

    <!-- 侧边栏 -->
    <n-layout-sider
      bordered
      collapse-mode="width"
      :collapsed-width="64"
      :width="220"
      :collapsed="collapsed"
      show-trigger
      @collapse="collapsed = true"
      @expand="collapsed = false"
      :native-scrollbar="false"
      class="admin-sider"
    >
      <!-- Logo -->
      <div class="sider-logo" :class="{ 'is-collapsed': collapsed }">
        <div class="logo-icon">
          <svg viewBox="0 0 32 32" fill="none">
            <rect x="2" y="2" width="28" height="28" rx="8" fill="currentColor" opacity="0.15" />
            <path d="M10 22V10l6 4.5L22 10v12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <span v-show="!collapsed" class="logo-text">Blog Lite</span>
      </div>

      <n-menu
        :options="menuOptions"
        :value="activeMenu"
        :collapsed="collapsed"
        :collapsed-width="64"
        :collapsed-icon-size="20"
        @update:value="handleMenuSelect"
      />
    </n-layout-sider>

    <n-layout class="admin-main">
      <!-- 顶栏 -->
      <n-layout-header bordered class="admin-header">
        <div class="header-left">
          <n-breadcrumb>
            <n-breadcrumb-item v-for="item in breadcrumbItems" :key="item.path">
              {{ item.label }}
            </n-breadcrumb-item>
          </n-breadcrumb>
        </div>

        <div class="header-right">
          <n-button quaternary circle size="small" @click="toggleDark" class="header-action">
            <template #icon>
              <n-icon><MoonOutline v-if="!isDark" /><SunnyOutline v-else /></n-icon>
            </template>
          </n-button>

          <n-dropdown :options="userDropdownOptions" @select="handleUserAction" placement="bottom-end">
            <div class="user-block" :class="{ 'is-loading': logoutLoading }">
              <n-avatar :size="30" round :src="displayAvatar || undefined" class="user-avatar">
                <n-icon v-if="!displayAvatar" size="16"><PersonOutline /></n-icon>
              </n-avatar>
              <span class="user-name">{{ displayName }}</span>
            </div>
          </n-dropdown>
        </div>
      </n-layout-header>

      <!-- 内容区 -->
      <!-- native-scrollbar 必须=true。
           NScrollbar (native-scrollbar=false) 用 transform 模拟滚动,
           而 transform 容器不是 CSS scroll container, 会让 DataTable
           fixed:right 列的 position: sticky 找不到正确滚动祖先,
           导致 fixed 列飘出可视区域。原生 overflow 才是合法 scroll container。 -->
      <n-layout-content
        content-style="padding: 24px; display: flex; flex-direction: column; height: 100%; box-sizing: border-box;"
        :native-scrollbar="true"
        class="admin-content"
      >
        <router-view />
      </n-layout-content>
    </n-layout>
  </n-layout>
</template>

<style scoped>
.admin-layout {
  height: 100vh;
}

.admin-sider {
  display: flex;
  flex-direction: column;
}

.sider-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 20px 16px;
  border-bottom: 1px solid var(--n-border-color);
  overflow: hidden;
  transition: padding 0.3s ease;
}

.sider-logo.is-collapsed {
  justify-content: center;
  padding: 20px 0 16px;
}

.logo-icon {
  width: 34px;
  height: 34px;
  min-width: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: #2563EB;
  color: #fff;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
}

.logo-icon svg {
  width: 20px;
  height: 20px;
}

.logo-text {
  font-family: 'Poppins', sans-serif;
  font-size: 16px;
  font-weight: 700;
  white-space: nowrap;
  letter-spacing: -0.02em;
}

.admin-header {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
}

.header-left {
  display: flex;
  align-items: center;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-action {
  color: var(--n-text-color);
}

.user-block {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
  transition: background 0.2s;
}

.user-block:hover {
  background: rgba(37, 99, 235, 0.06);
}

.user-avatar {
  background: #2563EB;
  color: #fff;
}

.user-name {
  font-size: 13px;
  font-weight: 500;
}

/* 登出时头像区轻微置灰，配合全屏遮罩 */
.user-block.is-loading {
  pointer-events: none;
  opacity: 0.6;
}

.admin-content {
  background: var(--n-body-color);
  flex: 1;
  min-height: 0;
}

.admin-content :deep(.router-view) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 让 router-view 的直接子元素撑满 */
.admin-content > div {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 贯通高度链（修编辑器无限增高/工具栏滚走/同步滚动失联的根因）：
   naive-ui 的 .n-layout-scroll-container 默认 display:block（仅 has-sider 时才提升为 flex）。
   这会让内层 n-layout 的 scroll-container → header + 内容区 的高度分配失效，
   子页面的 .page-wrapper{flex:1} 拿不到确定高度，编辑器退化为内容驱动高度，
   外层整体滚动，富文本工具栏随之滚走、scrollAuto 同步滚动失联。
   把这个 scroll-container 提升为 flex column 后，header(56px) + .admin-content(flex:1)
   拿到确定视口高度，下游所有依赖 flex 撑满的页面（如文章编辑页）才能正常内部滚动。 */
.admin-main :deep(.n-layout-scroll-container) {
  display: flex;
  flex-direction: column;
}
</style>

<!-- 非 scoped：teleport 到 body 的全屏登出遮罩需要全局样式 -->
<style>
.logout-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(2px);
}

.logout-overlay-text {
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
