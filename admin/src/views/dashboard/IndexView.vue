<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { NCard, NGrid, NGi, NStatistic, NSpin, NIcon } from 'naive-ui'
import {
  DocumentTextOutline,
  FolderOutline,
  PricetagsOutline,
  ImagesOutline,
} from '@vicons/ionicons5'
import { getDashboardStats } from '../../api/dashboard'
import type { DashboardStats } from '../../api/dashboard'

const loading = ref(true)
const stats = ref<DashboardStats>({
  postCount: 0,
  categoryCount: 0,
  tagCount: 0,
  mediaCount: 0,
})

const cards = [
  { label: '文章总数', key: 'postCount' as const, icon: DocumentTextOutline, color: '#2563EB' },
  { label: '分类数量', key: 'categoryCount' as const, icon: FolderOutline, color: '#8B5CF6' },
  { label: '标签数量', key: 'tagCount' as const, icon: PricetagsOutline, color: '#F59E0B' },
  { label: '素材数量', key: 'mediaCount' as const, icon: ImagesOutline, color: '#10B981' },
]

onMounted(async () => {
  try {
    const res = await getDashboardStats()
    if (res.data) {
      stats.value = res.data
    }
  } catch {
    // 骨架阶段，接口可能未就绪
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="dashboard-page">
    <h2 class="page-title">数据概览</h2>

    <n-spin :show="loading">
      <n-grid :x-gap="16" :y-gap="16" :cols="4" responsive="screen" item-responsive>
        <n-gi v-for="card in cards" :key="card.key" span="4 m:2 l:1">
          <n-card class="stat-card" :bordered="false">
            <div class="stat-inner">
              <div class="stat-icon" :style="{ background: card.color + '14', color: card.color }">
                <n-icon :size="24"><component :is="card.icon" /></n-icon>
              </div>
              <div class="stat-info">
                <span class="stat-label">{{ card.label }}</span>
                <nStatistic :value="stats[card.key]" class="stat-value" />
              </div>
            </div>
          </n-card>
        </n-gi>
      </n-grid>
    </n-spin>
  </div>
</template>

<style scoped>
.page-title {
  font-size: 20px;
  font-weight: 700;
  margin: 0 0 24px;
}

.stat-card {
  border-radius: 12px;
  transition: box-shadow 0.2s;
}

.stat-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}

.stat-inner {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 52px;
  height: 52px;
  min-width: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-label {
  font-size: 13px;
  color: #94A3B8;
  margin-bottom: 2px;
}
</style>
