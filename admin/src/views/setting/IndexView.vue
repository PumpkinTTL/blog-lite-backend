<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { NCard, NForm, NFormItem, NInput, NButton, NSpace, NSpin, useMessage } from 'naive-ui'
import { getSettings, batchUpdateSettings } from '../../api/setting'
import type { SettingItem } from '../../api/setting'

const message = useMessage()
const loading = ref(false)
const saving = ref(false)
const groups = ref<Record<string, SettingItem[]>>({})

async function loadSettings() {
  loading.value = true
  try {
    const res = await getSettings()
    groups.value = res.data || {}
  } catch {
    message.error('加载设置失败')
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  saving.value = true
  try {
    const items: Record<string, string> = {}
    for (const list of Object.values(groups.value)) {
      for (const item of list) {
        items[item.key] = item.value
      }
    }
    await batchUpdateSettings(items)
    message.success('保存成功')
  } catch (e: any) {
    message.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const groupLabels: Record<string, string> = {
  general: '基本设置',
  seo: 'SEO 设置',
  custom: '自定义',
}

onMounted(loadSettings)
</script>

<template>
  <div class="page-wrapper">
    <div class="page-header">
      <h2 class="page-title">系统设置</h2>
      <n-button type="primary" :loading="saving" @click="handleSave">保存设置</n-button>
    </div>

    <n-spin :show="loading">
      <NSpace vertical :size="16">
        <n-card v-for="(items, groupKey) in groups" :key="groupKey" :title="groupLabels[groupKey] || groupKey" :bordered="false" class="setting-card">
          <n-form label-placement="left" label-width="140">
            <n-form-item v-for="item in items" :key="item.id" :label="item.description || item.key">
              <n-input v-model:value="item.value" :placeholder="item.key" />
            </n-form-item>
          </n-form>
        </n-card>
      </NSpace>

      <n-empty v-if="!loading && Object.keys(groups).length === 0" description="暂无配置项，请先在数据库或种子脚本中添加" style="margin-top: 40px" />
    </n-spin>
  </div>
</template>

<style scoped>
.page-wrapper { display: flex; flex-direction: column; gap: 16px; }
.page-header { display: flex; align-items: center; justify-content: space-between; }
.page-title { font-size: 20px; font-weight: 700; margin: 0; }
.setting-card { border-radius: 12px; }
</style>
