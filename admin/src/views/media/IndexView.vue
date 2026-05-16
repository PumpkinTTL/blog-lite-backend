<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { NCard, NButton, NGrid, NGi, NIcon, NUpload, NEmpty, NSpin, NSpace, NInput, NPagination, useMessage, useDialog } from 'naive-ui'
import type { UploadFileInfo } from 'naive-ui'
import { CloudUploadOutline, TrashOutline, ImageOutline, SearchOutline, RefreshOutline } from '@vicons/ionicons5'
import { getMediaList, uploadMedia, deleteMedia } from '../../api/media'
import type { Media } from '../../api/media'

const message = useMessage()
const dialog = useDialog()
const loading = ref(false)
const mediaList = ref<Media[]>([])
const searchId = ref('')
const searchKeyword = ref('')
const total = ref(0)
const page = ref(1)
const pageSize = ref(5)

async function loadMedia() {
  loading.value = true
  try {
    const params: any = {}
    if (searchId.value) params.id = searchId.value
    if (searchKeyword.value) params.keyword = searchKeyword.value
    params.page = page.value
    params.pageSize = pageSize.value
    const res = await getMediaList(params)
    const payload = res.data
    if (payload?.list) {
      total.value = payload.total
      mediaList.value = payload.list
    } else {
      mediaList.value = Array.isArray(payload) ? payload : []
    }
  } catch {
    message.error('加载素材失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  page.value = 1
  loadMedia()
}

function handleReset() {
  searchId.value = ''
  searchKeyword.value = ''
  page.value = 1
  loadMedia()
}

function handlePageChange(p: number) {
  page.value = p
  loadMedia()
}

function handlePageSizeChange(s: number) {
  pageSize.value = s
  page.value = 1
  loadMedia()
}

async function handleUpload({ file }: { file: UploadFileInfo }) {
  if (!file.file) return
  try {
    await uploadMedia(file.file)
    message.success('上传成功')
    loadMedia()
  } catch (e: any) {
    message.error(e.message || '上传失败')
  }
}

function handleDelete(item: Media) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除素材�?{item.name}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteMedia(item.id)
        message.success('删除成功')
        loadMedia()
      } catch (e: any) {
        message.error(e.message || '删除失败')
      }
    },
  })
}

onMounted(loadMedia)
</script>

<template>
  <div class="page-wrapper">
    <div class="page-header">
      <h2 class="page-title">素材管理</h2>
      <n-upload :show-file-list="false" :custom-request="({ file }) => handleUpload({ file })" accept="image/*">
        <n-button type="primary">
          <template #icon><n-icon><CloudUploadOutline /></n-icon></template>
          上传素材
        </n-button>
      </n-upload>
    </div>
    <n-space class="search-bar" :size="12" align="center">
      <n-input v-model:value="searchId" placeholder="ID" clearable style="width: 100px" @keyup.enter="handleSearch" />
      <n-input v-model:value="searchKeyword" placeholder="搜索..." clearable @keyup.enter="handleSearch" />
      <n-button type="primary" @click="handleSearch">
        <template #icon><n-icon><SearchOutline /></n-icon></template>
        搜索
      </n-button>
      <n-button @click="handleReset">
        <template #icon><n-icon><RefreshOutline /></n-icon></template>
        重置
      </n-button>
    </n-space>

    <n-card :bordered="false" class="media-card">
      <n-spin :show="loading">
        <n-empty v-if="mediaList.length === 0 && !loading" description="暂无素材">
          <template #icon>
            <n-icon :size="48" :depth="3"><ImageOutline /></n-icon>
          </template>
        </n-empty>

        <n-grid :x-gap="12" :y-gap="12" :cols="6" responsive="screen" item-responsive v-else>
          <n-gi v-for="item in mediaList" :key="item.id" span="6 m:3 l:2 s:1">
            <div class="media-item">
              <div class="media-thumb">
                <img :src="item.url" :alt="item.name" />
              </div>
              <div class="media-footer">
                <span class="media-name">{{ item.name }}</span>
                <n-button quaternary circle size="tiny" type="error" @click="handleDelete(item)">
                  <template #icon><n-icon size="14"><TrashOutline /></n-icon></template>
                </n-button>
              </div>
            </div>
          </n-gi>
        </n-grid>
      </n-spin>
      <div class="pagination-wrap" v-if="total > 0">
        <n-pagination :page="page" :page-size="pageSize" :page-sizes="[5, 10, 20]" :item-count="total" show-size-picker @update:page="handlePageChange" @update:page-size="handlePageSizeChange" />
      </div>
    </n-card>
  </div>
</template>

<style scoped>
.media-card {
  border-radius: 12px;
}

.media-item {
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.12);
  transition: box-shadow 0.2s;
}

.media-item:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.media-thumb {
  aspect-ratio: 1;
  background: rgba(148, 163, 184, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.media-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.media-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
}

.media-name {
  font-size: 12px;
  color: #94A3B8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 120px;
}

.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }

.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
