<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  NCard, NForm, NFormItem, NInput, NButton, NSpace, NSpin,
  NModal, NSelect, NPopconfirm, NIcon, useMessage,
} from 'naive-ui'
import { TrashOutline } from '@vicons/ionicons5'
import {
  getSettings, createSetting, deleteSetting, updateSetting,
} from '../../api/setting'
import type { SettingItem } from '../../api/setting'

const message = useMessage()
const loading = ref(false)
const saving = ref(false)
const groups = ref<Record<string, SettingItem[]>>({})

const showModal = ref(false)
const newForm = ref({ key: '', value: '', description: '', group: 'custom' })
const creating = ref(false)

const groupOptions = [
  { label: '基本设置', value: 'general' },
  { label: 'SEO 设置', value: 'seo' },
  { label: '外观设置', value: 'appearance' },
  { label: '自定义', value: 'custom' },
]

const groupLabels: Record<string, string> = {
  general: '基本设置',
  seo: 'SEO 设置',
  appearance: '外观设置',
  custom: '自定义',
}

const groupOrder = ['general', 'seo', 'appearance', 'custom']
const sortedGroups = computed(() => {
  const keys = Object.keys(groups.value).sort(
    (a, b) => groupOrder.indexOf(a) - groupOrder.indexOf(b),
  )
  return keys.map(k => [k, groups.value[k]] as const)
})

function pairItems(items: SettingItem[]): [SettingItem, SettingItem | null][] {
  const pairs: [SettingItem, SettingItem | null][] = []
  for (let i = 0; i < items.length; i += 2) {
    pairs.push([items[i], items[i + 1] || null])
  }
  return pairs
}

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
    const promises: Promise<any>[] = []
    for (const list of Object.values(groups.value)) {
      for (const item of list) {
        promises.push(updateSetting(item.id, {
          key: item.key,
          value: item.value,
          description: item.description,
        }))
      }
    }
    await Promise.all(promises)
    message.success('保存成功')
    await loadSettings()
  } catch (e: any) {
    message.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

function openCreate() {
  newForm.value = { key: '', value: '', description: '', group: 'custom' }
  showModal.value = true
}

async function handleCreate() {
  if (!newForm.value.key.trim()) {
    message.warning('请填写配置键名')
    return
  }
  creating.value = true
  try {
    await createSetting(newForm.value)
    message.success('新增成功')
    showModal.value = false
    await loadSettings()
  } catch (e: any) {
    message.error(e.message || '新增失败')
  } finally {
    creating.value = false
  }
}

async function handleDelete(item: SettingItem) {
  try {
    await deleteSetting(item.id)
    message.success('删除成功')
    await loadSettings()
  } catch (e: any) {
    message.error(e.message || '删除失败')
  }
}

onMounted(loadSettings)
</script>

<template>
  <div class="page-wrapper">
    <div class="page-header">
      <h2 class="page-title">系统设置</h2>
      <n-space>
        <n-button @click="openCreate">新增配置</n-button>
        <n-button type="primary" :loading="saving" @click="handleSave">保存设置</n-button>
      </n-space>
    </div>

    <n-spin :show="loading">
      <NSpace vertical :size="16">
        <n-card
          v-for="[groupKey, items] in sortedGroups"
          :key="groupKey"
          :title="groupLabels[groupKey] || groupKey"
          :bordered="false"
          class="setting-card"
        >
          <table class="setting-table">
            <thead>
              <tr>
                <th>键名</th>
                <th>描述</th>
                <th>值</th>
                <th style="width: 40px"></th>
                <th style="width: 32px"></th>
                <th>键名</th>
                <th>描述</th>
                <th>值</th>
                <th style="width: 40px"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="[a, b] in pairItems(items)" :key="a.id">
                <td><n-input v-model:value="a.key" size="small" /></td>
                <td><n-input v-model:value="a.description" size="small" /></td>
                <td><n-input v-model:value="a.value" size="small" /></td>
                <td>
                  <n-popconfirm @positive-click="handleDelete(a)">
                    <template #trigger><n-button type="error" size="tiny" quaternary><template #icon><n-icon><TrashOutline /></n-icon></template></n-button></template>
                    确定删除「{{ a.description || a.key }}」？
                  </n-popconfirm>
                </td>
                <td></td>
                <template v-if="b">
                  <td><n-input v-model:value="b.key" size="small" /></td>
                  <td><n-input v-model:value="b.description" size="small" /></td>
                  <td><n-input v-model:value="b.value" size="small" /></td>
                  <td>
                    <n-popconfirm @positive-click="handleDelete(b)">
                      <template #trigger><n-button type="error" size="tiny" quaternary><template #icon><n-icon><TrashOutline /></n-icon></template></n-button></template>
                      确定删除「{{ b.description || b.key }}」？
                    </n-popconfirm>
                  </td>
                </template>
                <template v-else>
                  <td></td><td></td><td></td><td></td>
                </template>
              </tr>
            </tbody>
          </table>
        </n-card>
      </NSpace>

      <n-empty
        v-if="!loading && Object.keys(groups).length === 0"
        description="暂无配置项，点击「新增配置」添加"
        style="margin-top: 40px"
      />
    </n-spin>

    <n-modal
      v-model:show="showModal"
      preset="dialog"
      title="新增配置项"
      positive-text="确认"
      negative-text="取消"
      :loading="creating"
      @positive-click="handleCreate"
    >
      <n-form label-placement="left" label-width="80" style="margin-top: 16px">
        <n-form-item label="分组">
          <n-select v-model:value="newForm.group" :options="groupOptions" />
        </n-form-item>
        <n-form-item label="键名">
          <n-input v-model:value="newForm.key" placeholder="如 site_title" />
        </n-form-item>
        <n-form-item label="值">
          <n-input v-model:value="newForm.value" placeholder="配置值" />
        </n-form-item>
        <n-form-item label="描述">
          <n-input v-model:value="newForm.description" placeholder="显示名称（可选）" />
        </n-form-item>
      </n-form>
    </n-modal>
  </div>
</template>

<style scoped>
.page-wrapper { display: flex; flex-direction: column; gap: 16px; }
.page-header { display: flex; align-items: center; justify-content: space-between; }
.page-title { font-size: 20px; font-weight: 700; margin: 0; }
.setting-card { border-radius: 12px; }
.setting-table { width: 100%; border-collapse: collapse; table-layout: auto; }
.setting-table th,
.setting-table td { padding: 6px 8px; vertical-align: middle; text-align: left; font-weight: normal; border: none; }
.setting-table thead th { color: #999; font-size: 12px; }
</style>
