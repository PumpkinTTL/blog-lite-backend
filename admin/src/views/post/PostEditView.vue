<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NCard, NForm, NFormItem, NInput, NButton, NSelect, NSpace, NIcon, NUpload, NTag, useMessage } from 'naive-ui'
import type { FormInst, FormRules, UploadFileInfo } from 'naive-ui'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { ArrowBackOutline, SaveOutline, CloudUploadOutline, TrashOutline } from '@vicons/ionicons5'
import { getPost, createPost, updatePost } from '../../api/post'
import { getCategories } from '../../api/category'
import { getTags } from '../../api/tag'
import { getUsers } from '../../api/user'
import { uploadMedia } from '../../api/media'
import { uploadToR2 } from '../../api/r2-storage'
import { isDark } from '../../theme'

const route = useRoute()
const router = useRouter()
const message = useMessage()

const formRef = ref<FormInst | null>(null)
const saving = ref(false)
const loading = ref(false)
const coverUploadFileList = ref<UploadFileInfo[]>([])
const isEdit = computed(() => !!route.params.id)

const formValue = ref({
  title: '',
  slug: '',
  content: '',
  summary: '',
  coverImage: '',
  status: 'draft' as string,
  categoryId: null as number | null,
  tagIds: [] as number[],
  allowedUserIds: [] as number[],
})

const rules: FormRules = {
  title: [{ required: true, message: '请输入文章标题', trigger: ['input', 'blur'] }],
  slug: [{ required: true, message: '请输入 Slug', trigger: ['input', 'blur'] }],
}

const categoryOptions = ref<{ label: string; value: number }[]>([])
const tagOptions = ref<{ label: string; value: number }[]>([])
const userOptions = ref<{ label: string; value: number }[]>([])

const statusOptions = [
  { label: '草稿', value: 'draft' },
  { label: '已发布', value: 'published' },
  { label: '登录可见', value: 'login' },
  { label: '指定用户', value: 'private' },
]

/** 封面存储方式 */
const coverStorageChannel = ref<'local' | 'oss' | 'r2'>('local')
const coverOssPlatform = ref<'aliyun' | 'tencent' | 'backblaze'>('aliyun')

const coverStorageOptions = [
  { label: '本地', value: 'local' },
  { label: 'OSS', value: 'oss' },
  { label: 'R2', value: 'r2' },
]
const ossPlatformOptions = [
  { label: '阿里云', value: 'aliyun' },
  { label: '腾讯云', value: 'tencent' },
  { label: 'Backblaze', value: 'backblaze' },
]

const isPrivate = computed(() => formValue.value.status === 'private')
/** 封面是否为待上传的 base64（未实际上传） */
const isCoverPending = computed(() => formValue.value.coverImage.startsWith('data:'))

function resolveCoverUrl(url: string): string {
  if (!url) return ''
  if (url.startsWith('data:')) return url
  if (/^https?:\/\//.test(url)) return url
  const base = import.meta.env.VITE_API_BASE_URL || window.location.origin
  return new URL(url, base).toString()
}

const coverUrl = computed(() => resolveCoverUrl(formValue.value.coverImage))

async function loadOptions() {
  try {
    const [catRes, tagRes, userRes] = await Promise.all([getCategories(), getTags(), getUsers({ pageSize: 1000 })])
    const catPayload = catRes.data
    const cats = Array.isArray(catPayload) ? catPayload : (catPayload?.list || [])
    categoryOptions.value = cats.map((c: any) => ({ label: c.name, value: c.id }))

    const tagPayload = tagRes.data
    const tags = Array.isArray(tagPayload) ? tagPayload : (tagPayload?.list || [])
    tagOptions.value = tags.map((t: any) => ({ label: t.name, value: t.id }))

    const userPayload = userRes.data
    const users = Array.isArray(userPayload) ? userPayload : (userPayload?.list || [])
    userOptions.value = users.map((u: any) => ({ label: `${u.nickname} (${u.username})`, value: u.id }))
  } catch (e) {
    console.error('加载选项失败:', e)
  }
}

async function loadPost(id: number) {
  loading.value = true
  try {
    const res = await getPost(id)
    const post = res.data
    if (post) {
      formValue.value = {
        title: post.title || '',
        slug: post.slug || '',
        content: post.content || '',
        summary: post.summary || '',
        coverImage: post.coverImage || '',
        status: post.status ?? 'draft',
        categoryId: post.categoryId,
        tagIds: (post.tags || []).map((t: any) => t.id),
        allowedUserIds: (post.allowedUsers || []).map((u: any) => u.id),
      }
    }
  } catch {
    message.error('加载文章失败')
  } finally {
    loading.value = false
  }
}

/** 选择图片：只转 base64 预览，不实际上传 */
function handleCoverSelect({ file }: { file: UploadFileInfo }) {
  const raw = file.file
  if (!raw) return
  if (!raw.type.startsWith('image/')) {
    message.error('请选择图片文件')
    coverUploadFileList.value = []
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    formValue.value.coverImage = reader.result as string
  }
  reader.onerror = () => message.error('读取文件失败')
  reader.readAsDataURL(raw)
  coverUploadFileList.value = []
}

function handleRemoveCover() {
  formValue.value.coverImage = ''
}

/** base64 转 File */
function base64ToFile(dataUrl: string, filename: string): File {
  const [meta, b64] = dataUrl.split(',')
  const mime = /:(.*?);/.exec(meta)?.[1] || 'image/png'
  const ext = mime.split('/')[1] || 'png'
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new File([arr], `${filename}.${ext}`, { type: mime })
}

/** 按当前选择的存储方式上传封面，返回 URL；若已是 URL 直接返回 */
async function uploadCoverIfNeeded(): Promise<string> {
  const url = formValue.value.coverImage
  if (!url || !url.startsWith('data:')) return url

  const file = base64ToFile(url, `cover-${Date.now()}`)
  if (coverStorageChannel.value === 'r2') {
    const r = await uploadToR2(file)
    return r.data.url
  }
  const r = await uploadMedia(file, {
    storageType: coverStorageChannel.value === 'oss' ? 'oss' : 'local',
    ossPlatform: coverStorageChannel.value === 'oss' ? coverOssPlatform.value : null,
  })
  return r.data.url
}

async function handleSave() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    const coverImageUrl = await uploadCoverIfNeeded()
    const payload = { ...formValue.value, coverImage: coverImageUrl }

    if (isEdit.value) {
      await updatePost(Number(route.params.id), payload)
      // 同步本地状态，避免重复上传
      formValue.value.coverImage = coverImageUrl
      message.success('保存成功')
    } else {
      await createPost(payload)
      message.success('创建成功')
      router.push('/posts')
      return
    }
  } catch (e: any) {
    message.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

function handleStatusChange(val: string) {
  formValue.value.status = val
  if (val !== 'private') {
    formValue.value.allowedUserIds = []
  }
}

onMounted(async () => {
  await loadOptions()
  if (isEdit.value) {
    loadPost(Number(route.params.id))
  }
})
</script>

<template>
  <div class="page-wrapper">
    <div class="page-header">
      <n-space align="center">
        <n-button quaternary @click="router.push('/posts')">
          <template #icon><n-icon><ArrowBackOutline /></n-icon></template>
        </n-button>
        <h2 class="page-title">{{ isEdit ? '编辑文章' : '新建文章' }}</h2>
      </n-space>
      <n-space>
        <n-button type="primary" :loading="saving" @click="handleSave">
          <template #icon><n-icon><SaveOutline /></n-icon></template>
          保存
        </n-button>
      </n-space>
    </div>

    <div class="editor-layout" v-if="!loading">
      <!-- 左侧编辑器 -->
      <div class="editor-main">
        <n-form ref="formRef" :model="formValue" :rules="rules">
          <n-card :bordered="false" class="editor-card">
            <n-form-item label="标题" path="title">
              <n-input v-model:value="formValue.title" placeholder="请输入文章标题" size="large" />
            </n-form-item>

            <div class="content-block">
              <div class="field-label">内容</div>
              <MdEditor
                v-model="formValue.content"
                :theme="isDark ? 'dark' : 'light'"
                style="height: 100%"
                placeholder="开始编写 Markdown 内容..."
              />
            </div>
          </n-card>
        </n-form>
      </div>

      <!-- 右侧设置面板 -->
      <div class="editor-sidebar">
        <n-card :bordered="false" class="side-card" title="文章设置">
          <n-space vertical :size="16">
            <div>
              <div class="field-label">Slug</div>
              <n-input v-model:value="formValue.slug" placeholder="url-friendly 标识" />
            </div>

            <div>
              <div class="field-label">摘要</div>
              <n-input v-model:value="formValue.summary" type="textarea" placeholder="文章摘要（可选）" :rows="3" />
            </div>

            <div>
              <div class="field-label">封面图</div>
              <!-- 存储方式 -->
              <div class="cover-storage-row" v-if="!coverUrl || isCoverPending">
                <n-select
                  v-model:value="coverStorageChannel"
                  :options="coverStorageOptions"
                  size="small"
                  class="cover-storage-select"
                />
                <n-select
                  v-if="coverStorageChannel === 'oss'"
                  v-model:value="coverOssPlatform"
                  :options="ossPlatformOptions"
                  size="small"
                  class="cover-storage-select"
                />
              </div>

              <!-- 封面预览：hover 显示删除按钮 -->
              <div v-if="coverUrl" class="cover-preview">
                <div class="cover-preview-frame">
                  <img :src="coverUrl" class="cover-img" :alt="formValue.title" />
                  <div class="cover-overlay">
                    <n-button
                      circle
                      size="small"
                      type="error"
                      :focusable="false"
                      @click.stop="handleRemoveCover"
                      title="移除封面"
                    >
                      <template #icon><n-icon><TrashOutline /></n-icon></template>
                    </n-button>
                  </div>
                </div>
                <div class="cover-meta">
                  <n-tag v-if="isCoverPending" size="tiny" type="warning" :bordered="false" round>保存时上传</n-tag>
                  <span v-else class="cover-url-text" :title="formValue.coverImage">已设置封面</span>
                </div>
              </div>

              <!-- 选择图片按钮 -->
              <n-upload
                v-else
                class="cover-upload"
                v-model:file-list="coverUploadFileList"
                :show-file-list="false"
                accept="image/*"
                :custom-request="handleCoverSelect"
              >
                <div class="cover-empty">
                  <n-icon size="32" color="#94A3B8"><CloudUploadOutline /></n-icon>
                  <span class="cover-empty-title">点击上传封面图</span>
                  <span class="cover-empty-hint">支持 JPG / PNG / WebP，可选中后预览</span>
                </div>
              </n-upload>
            </div>

            <div>
              <div class="field-label">分类</div>
              <n-select
                v-model:value="formValue.categoryId"
                :options="categoryOptions"
                placeholder="选择分类"
                clearable
              />
            </div>

            <div>
              <div class="field-label">标签</div>
              <n-select
                v-model:value="formValue.tagIds"
                :options="tagOptions"
                placeholder="选择标签"
                multiple
                clearable
              />
            </div>

            <div>
              <div class="field-label">状态</div>
              <n-select
                :value="formValue.status"
                :options="statusOptions"
                placeholder="选择状态"
                @update:value="handleStatusChange"
              />
            </div>

            <div v-if="isPrivate">
              <div class="field-label">指定可见用户</div>
              <n-select
                v-model:value="formValue.allowedUserIds"
                :options="userOptions"
                placeholder="选择可见的用户"
                multiple
                clearable
                filterable
              />
            </div>
          </n-space>
        </n-card>
      </div>
    </div>

    <!-- 加载中 -->
    <n-card :bordered="false" v-else>
      <n-spin :show="true" description="加载中..." />
    </n-card>
  </div>
</template>

<style scoped>
/* 整体不滚，左右各自滚 */
.page-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-header {
  flex-shrink: 0;
}

.editor-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 340px;
  grid-template-rows: minmax(0, 1fr); /* 关键：强制 row 撑满，不允许由内容决定 */
  gap: 16px;
}

/* === 左侧编辑器：grid item 自动撑满 row === */
.editor-main {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.editor-main :deep(.n-form) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.editor-main :deep(.n-card) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.editor-main :deep(.n-card-content) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.content-block {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-top: 16px;
}

.editor-card {
  border-radius: 12px;
}

/* === 右侧侧栏 === */
.editor-sidebar {
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.side-card {
  border-radius: 12px;
}

.editor-sidebar :deep(.n-space) {
  width: 100%;
}

.editor-sidebar :deep(.n-space-item) {
  width: 100%;
}

.field-label {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
  color: #64748B;
}

/* === 存储方式选择行 === */
.cover-storage-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  width: 100%;
}

.cover-storage-select {
  flex: 1;
  min-width: 0;
}

/* === 封面预览 === */
.cover-preview {
  width: 100%;
}

.cover-preview-frame {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(148, 163, 184, 0.08);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.cover-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
  pointer-events: none;
}

.cover-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 8px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.4) 0%, transparent 30%);
  opacity: 0;
  transition: opacity 0.18s ease;
}

.cover-preview-frame:hover .cover-overlay {
  opacity: 1;
}

.cover-meta {
  margin-top: 6px;
  font-size: 12px;
  color: #94A3B8;
}

.cover-url-text {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

/* === 上传组件撑满 === */
.cover-upload {
  width: 100%;
}

.cover-upload :deep(.n-upload) {
  width: 100%;
  display: block;
}

.cover-upload :deep(.n-upload-trigger) {
  width: 100%;
  display: block;
}

/* === 空状态 === */
.cover-empty {
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 16px;
  border: 1px dashed rgba(148, 163, 184, 0.4);
  border-radius: 8px;
  color: #94A3B8;
  cursor: pointer;
  transition: border-color 0.18s ease, color 0.18s ease, background 0.18s ease;
}

.cover-empty-title {
  font-size: 13px;
  font-weight: 500;
}

.cover-empty-hint {
  font-size: 11px;
  color: #B0B7C3;
}

.cover-empty:hover {
  border-color: #6366f1;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.04);
}

.cover-empty:hover :deep(svg) {
  color: #6366f1 !important;
}

.cover-empty:hover .cover-empty-hint {
  color: #818CF8;
}

@media (max-width: 1024px) {
  .page-wrapper {
    height: auto;
    overflow: visible;
  }
  .editor-layout {
    grid-template-columns: 1fr;
    grid-template-rows: none;
  }
  .editor-main,
  .editor-sidebar {
    overflow: visible;
  }
}
</style>
