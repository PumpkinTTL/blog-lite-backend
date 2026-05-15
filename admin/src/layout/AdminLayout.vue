<script setup lang="ts">
import { h, ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NLayout, NLayoutSider, NLayoutHeader, NLayoutContent, NMenu, NAvatar, NDropdown, NIcon, NBreadcrumb, NBreadcrumbItem } from 'naive-ui'
import type { MenuOption } from 'naive-ui'
import {
  HomeOutline,
  DocumentTextOutline,
  FolderOutline,
  PricetagsOutline,
  ImagesOutline,
  PeopleOutline,
  ShieldOutline,
  LogOutOutline,
  PersonOutline,
  MoonOutline,
  SunnyOutline,
} from '@vicons/ionicons5'
import { useAuth } from '../stores/auth'
import { isDark } from '../theme'

const router = useRouter()
const route = useRoute()
const { logout } = useAuth()

const collapsed = ref(false)

function renderIcon(icon: Component) {
  return () => h(NIcon, null, { default: () => h(icon) })
}

const menuOptions: MenuOption[] = [
  { label: '数据概览', key: '/dashboard', icon: renderIcon(HomeOutline) },
  { label: '文章管理', key: '/posts', icon: renderIcon(DocumentTextOutline) },
  { label: '分类管理', key: '/categories', icon: renderIcon(FolderOutline) },
  { label: '标签管理', key: '/tags', icon: renderIcon(PricetagsOutline) },
  { label: '素材管理', key: '/media', icon: renderIcon(ImagesOutline) },
  { type: 'divider', key: 'd1' },
  { label: '用户管理', key: '/users', icon: renderIcon(PeopleOutline) },
  { label: '角色管理', key: '/roles', icon: renderIcon(ShieldOutline) },
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

const userDropdownOptions = [
  { label: '个人信息', key: 'profile', icon: renderIcon(PersonOutline) },
  { type: 'divider', key: 'd1' },
  { label: '退出登录', key: 'logout', icon: renderIcon(LogOutOutline) },
]

function handleUserAction(key: string) {
  if (key === 'logout') {
    logout()
  }
}

const breadcrumbItems = computed(() => {
  const map: Record<string, string> = {
    '/dashboard': '数据概览',
    '/posts': '文章管理',
    '/categories': '分类管理',
    '/tags': '标签管理',
    '/media': '素材管理',
    '/users': '用户管理',
    '/roles': '角色管理',
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

    <n-layout>
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
            <div class="user-block">
              <n-avatar :size="30" round class="user-avatar">
                <n-icon size="16"><PersonOutline /></n-icon>
              </n-avatar>
              <span class="user-name">Admin</span>
            </div>
          </n-dropdown>
        </div>
      </n-layout-header>

      <!-- 内容区 -->
      <n-layout-content content-style="padding: 24px;" class="admin-content">
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

.admin-content {
  background: var(--n-body-color);
}
</style>
