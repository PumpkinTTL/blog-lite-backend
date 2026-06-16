<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NCard, NForm, NFormItem, NInput, NButton, NSelect, NSpace, NIcon, NUpload, NTag, NCheckbox, NCheckboxGroup, useMessage } from 'naive-ui'
import type { FormInst, FormRules, UploadFileInfo } from 'naive-ui'
import type { ExposeParam, UploadImgCallBack } from 'md-editor-v3'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { ArrowBackOutline, SaveOutline, CloudUploadOutline, TrashOutline, SparklesOutline } from '@vicons/ionicons5'
import { getPost, createPost, updatePost } from '../../api/post'
import { generateByAi } from '../../api/ai'
import type { AiGenerateField } from '../../api/ai'
import { getCategories } from '../../api/category'
import { getTags } from '../../api/tag'
import { getUsers } from '../../api/user'
import { getRoles } from '../../api/role'
import { uploadMedia } from '../../api/media'
import { uploadToR2 } from '../../api/r2-storage'
import { isDark } from '../../theme'

const route = useRoute()
const router = useRouter()
const message = useMessage()

const formRef = ref<FormInst | null>(null)
const editorRef = ref<ExposeParam | null>(null)
const saving = ref(false)
const loading = ref(false)
const coverUploadFileList = ref<UploadFileInfo[]>([])
const coverDragOver = ref(false)
const isEdit = computed(() => !!route.params.id)

const formValue = ref({
  title: '',
  subtitle: '',
  slug: '',
  content: '',
  summary: '',
  coverImage: '',
  status: 'draft' as string,
  categoryId: null as number | null,
  tagIds: [] as number[],
  allowedUserIds: [] as number[],
  allowedRoleIds: [] as number[],
})

const rules: FormRules = {
  title: [{ required: true, message: '请输入文章标题', trigger: ['input', 'blur'] }],
  slug: [{ required: true, message: '请输入 Slug', trigger: ['input', 'blur'] }],
}

const categoryOptions = ref<{ label: string; value: number }[]>([])
const tagOptions = ref<{ label: string; value: number }[]>([])
const userOptions = ref<{ label: string; value: number }[]>([])
const roleOptions = ref<{ label: string; value: number }[]>([])

const statusOptions = [
  { label: '草稿', value: 'draft' },
  { label: '已发布', value: 'published' },
  { label: '登录可见', value: 'login' },
  { label: '指定用户', value: 'private' },
]

/** 图片存储方式（封面+正文共用） */
const storageChannel = ref<'local' | 'oss' | 'r2'>('r2')
const ossPlatform = ref<'aliyun' | 'tencent' | 'backblaze'>('aliyun')

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

/** AI 助手：复选框选中要生成哪些字段 */
const aiFields = ref<AiGenerateField[]>(['summary'])
const aiLoading = ref(false)

/** 调用后端 AI 模块，根据标题+正文生成勾选的内容（副标题/摘要/slug） */
async function handleAiGenerate() {
  if (!formValue.value.title && !formValue.value.content) {
    message.warning('请先填写标题或正文')
    return
  }
  if (aiFields.value.length === 0) {
    message.warning('请至少选择一项要生成的内容')
    return
  }
  aiLoading.value = true
  try {
    // 响应拦截器已解包为 { success, data, message }，data 即生成结果
    const res = await generateByAi({
      title: formValue.value.title,
      content: formValue.value.content,
      fields: aiFields.value,
    })
    const r = res.data
    if (r.subtitle) formValue.value.subtitle = r.subtitle
    if (r.summary) formValue.value.summary = r.summary
    if (r.slug) formValue.value.slug = r.slug
    message.success('AI 生成完成')
  } catch (e: any) {
    message.error(e?.message || 'AI 生成失败')
  } finally {
    aiLoading.value = false
  }
}

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
    const [catRes, tagRes, userRes, roleRes] = await Promise.all([
      getCategories(), getTags(), getUsers({ pageSize: 1000 }), getRoles({ pageSize: 1000 }),
    ])
    const catPayload = catRes.data
    const cats = Array.isArray(catPayload) ? catPayload : (catPayload?.list || [])
    categoryOptions.value = cats.map((c: any) => ({ label: c.name, value: c.id }))

    const tagPayload = tagRes.data
    const tags = Array.isArray(tagPayload) ? tagPayload : (tagPayload?.list || [])
    tagOptions.value = tags.map((t: any) => ({ label: t.name, value: t.id }))

    const userPayload = userRes.data
    const users = Array.isArray(userPayload) ? userPayload : (userPayload?.list || [])
    userOptions.value = users.map((u: any) => ({ label: `${u.nickname} (${u.username})`, value: u.id }))

    const rolePayload = roleRes.data
    const roles = Array.isArray(rolePayload) ? rolePayload : (rolePayload?.list || [])
    roleOptions.value = roles.map((r: any) => ({ label: `${r.displayName} (${r.name})`, value: r.id }))
  } catch (e: any) {
    message.error(e?.message || '加载选项失败')
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
        subtitle: post.subtitle || '',
        slug: post.slug || '',
        content: post.content || '',
        summary: post.summary || '',
        coverImage: post.coverImage || '',
        status: post.status ?? 'draft',
        categoryId: post.categoryId,
        tagIds: (post.tags || []).map((t: any) => t.id),
          allowedUserIds: post.allowedUserIds || [],
          allowedRoleIds: post.allowedRoleIds || [],
      }
    }
  } catch (e: any) {
    message.error(e?.message || '加载文章失败')
  } finally {
    loading.value = false
  }
}

/** 从原生 File 加载封面（转 base64 预览） */
function loadCoverFromFile(raw: File) {
  if (!raw.type.startsWith('image/')) {
    message.error('请选择图片文件')
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    formValue.value.coverImage = reader.result as string
  }
  reader.onerror = () => message.error('读取文件失败')
  reader.readAsDataURL(raw)
}

/** 选择图片：只转 base64 预览，不实际上传 */
function handleCoverSelect({ file }: { file: UploadFileInfo }) {
  const raw = file.file
  if (!raw) return
  loadCoverFromFile(raw)
  coverUploadFileList.value = []
}

/** 拖拽图片到封面区 */
function handleCoverDrop(event: DragEvent) {
  coverDragOver.value = false
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return
  loadCoverFromFile(files[0])
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

/** File 转 base64 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** 按当前存储方式上传单个文件，返回 URL */
async function uploadOne(file: File, note: string, app?: string, folder?: string): Promise<string> {
  if (storageChannel.value === 'r2') {
    const r = await uploadToR2(file, { note, app, folder })
    return r.data.url
  }
  const r = await uploadMedia(file, {
    storageType: storageChannel.value === 'oss' ? 'oss' : 'local',
    ossPlatform: storageChannel.value === 'oss' ? ossPlatform.value : null,
    note, app, folder,
  })
  return r.data.url
}

/** 按当前选择的存储方式上传封面，返回 URL；若已是 URL 直接返回 */
async function uploadCoverIfNeeded(): Promise<string> {
  const url = formValue.value.coverImage
  if (!url || !url.startsWith('data:')) return url
  const file = base64ToFile(url, `cover-${Date.now()}`)
  const note = formValue.value.title
    ? `文章「${formValue.value.title}」封面`
    : '文章封面'
  return uploadOne(file, note, 'vibehub', 'cover')
}

/**
 * 扫描正文中的 base64 图片，逐个上传后替换为真实 URL
 * 匹配 markdown 图片语法 ![](data:image/...;base64,...)
 */
const DATA_IMG_RE = /!\[([^\]]*)\]\(data:image\/[^)]+\)/g

async function uploadContentImages(content: string): Promise<string> {
  const matches = [...content.matchAll(DATA_IMG_RE)]
  if (matches.length === 0) return content

  const note = formValue.value.title
    ? `文章「${formValue.value.title}」正文图片`
    : '文章正文图片'

  let result = content
  for (const m of matches) {
    const full = m[0]
    const alt = m[1]
    const dataUrlMatch = full.match(/\(data:image\/[^)]+\)/)
    if (!dataUrlMatch) continue
    const dataUrl = dataUrlMatch[0].slice(1, -1) // 去掉首尾括号
    try {
      const file = base64ToFile(dataUrl, `content-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      const realUrl = await uploadOne(file, note, 'vibehub', 'article')
      result = result.replace(full, `![${alt}](${realUrl})`)
    } catch (e: any) {
      message.error(e?.message || '正文图片上传失败')
    }
  }
  return result
}

/**
 * MdEditor onUploadImg：粘贴图片 / 工具栏上传按钮
 * 转 base64 直接回调，编辑器自动插入 markdown 图片语法
 */
async function onEditorUploadImg(
  files: File[],
  callback: UploadImgCallBack,
) {
  const urls: string[] = []
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue
    try {
      urls.push(await fileToBase64(f))
    } catch {
      // 单张图片读取失败时跳过，不打断其他图片
    }
  }
  callback(urls)
}

/**
 * MdEditor onDrop：拖拽图片到编辑器
 * 阻止默认行为，转 base64 后在光标处插入
 */
async function onEditorDrop(event: DragEvent) {
  const items = event.dataTransfer?.files
  if (!items || items.length === 0) return
  event.preventDefault()
  for (const f of items) {
    if (!f.type.startsWith('image/')) continue
    try {
      const dataUrl = await fileToBase64(f)
      editorRef.value?.insert(() => ({
        targetValue: `\n![](${dataUrl})\n`,
        select: false,
      }))
    } catch {
      // 拖拽图片处理失败时静默不打断
    }
  }
}

async function handleSave() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    // 1. 上传封面
    const coverImageUrl = await uploadCoverIfNeeded()
    // 2. 扫描并上传正文 base64 图片
    const realContent = await uploadContentImages(formValue.value.content)

    const payload = { ...formValue.value, coverImage: coverImageUrl, content: realContent }

    if (isEdit.value) {
      await updatePost(Number(route.params.id), payload)
      // 同步本地状态，避免重复上传
      formValue.value.coverImage = coverImageUrl
      formValue.value.content = realContent
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
    formValue.value.allowedRoleIds = []
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

            <n-form-item label="副标题" path="subtitle">
              <n-input v-model:value="formValue.subtitle" placeholder="一句话副标题（可选）" />
            </n-form-item>

            <div class="content-block">
              <div class="field-label">内容</div>
              <MdEditor
                ref="editorRef"
                v-model="formValue.content"
                :theme="isDark ? 'dark' : 'light'"
                style="height: 100%"
                placeholder="开始编写 Markdown 内容...（支持拖拽 / 粘贴图片）"
                :on-upload-img="onEditorUploadImg"
                :on-drop="onEditorDrop"
              />
            </div>
          </n-card>
        </n-form>
      </div>

      <!-- 右侧设置面板 -->
      <div class="editor-sidebar">
        <n-card :bordered="false" class="side-card" title="文章设置">
          <n-space vertical :size="16">
            <!-- AI 助手：勾选要生成的内容，一次调用生成多项 -->
            <div class="ai-panel" :class="{ 'is-loading': aiLoading }">
              <div class="ai-panel-header">
                <div class="ai-panel-title">
                  <n-icon class="ai-spark-icon" :size="15"><SparklesOutline /></n-icon>
                  <span>AI 助手</span>
                </div>
                <span class="ai-panel-tag">DEEPSEEK</span>
              </div>
              <n-checkbox-group v-model:value="aiFields" class="ai-fields">
                <n-checkbox value="subtitle">副标题</n-checkbox>
                <n-checkbox value="summary">摘要</n-checkbox>
                <n-checkbox value="slug">Slug</n-checkbox>
              </n-checkbox-group>
              <n-button
                block
                size="small"
                type="primary"
                ghost
                :loading="aiLoading"
                :disabled="aiFields.length === 0"
                @click="handleAiGenerate"
              >
                {{ aiLoading ? '正在生成…' : '一键生成' }}
              </n-button>
            </div>

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
                  v-model:value="storageChannel"
                  :options="coverStorageOptions"
                  size="small"
                  class="cover-storage-select"
                />
                <n-select
                  v-if="storageChannel === 'oss'"
                  v-model:value="ossPlatform"
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
                <div
                  class="cover-empty"
                  :class="{ 'is-dragover': coverDragOver }"
                  @dragenter.prevent="coverDragOver = true"
                  @dragover.prevent="coverDragOver = true"
                  @dragleave.prevent="coverDragOver = false"
                  @drop.prevent="handleCoverDrop"
                >
                  <n-icon size="32" color="#94A3B8"><CloudUploadOutline /></n-icon>
                  <span class="cover-empty-title">点击或拖拽上传封面图</span>
                  <span class="cover-empty-hint">支持 JPG / PNG / WebP，选中后本地预览</span>
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
              <div class="field-label">指定可见角色（拥有这些角色的用户可见）</div>
              <n-select
                v-model:value="formValue.allowedRoleIds"
                :options="roleOptions"
                placeholder="选择可见的角色"
                multiple
                clearable
                filterable
              />
            </div>

            <div v-if="isPrivate">
              <div class="field-label">指定可见用户（直接授权单个用户）</div>
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

/* === AI 助手面板：扁平 + 科技感 === */
.ai-panel {
  position: relative;
  padding: 12px 12px 14px;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.045), rgba(56, 189, 248, 0.03));
  border: 1px dashed rgba(99, 102, 241, 0.3);
  transition: border-color 0.25s ease, background 0.25s ease, box-shadow 0.25s ease;
}

.ai-panel.is-loading {
  border-color: rgba(99, 102, 241, 0.55);
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.09), rgba(56, 189, 248, 0.06));
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
}

.ai-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.ai-panel-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.3px;
  color: #6366f1;
}

/* 火花图标：默认微亮，生成时脉冲闪烁 */
.ai-spark-icon {
  color: #818cf8;
  transition: color 0.25s ease;
}
.ai-panel.is-loading .ai-spark-icon {
  animation: ai-pulse 1.1s ease-in-out infinite;
}

/* 右上角科技感小标签 */
.ai-panel-tag {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.2px;
  padding: 2px 6px;
  border-radius: 4px;
  color: rgba(99, 102, 241, 0.75);
  background: rgba(99, 102, 241, 0.1);
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
}

.ai-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 11px;
}

@keyframes ai-pulse {
  0%, 100% { color: #818cf8; transform: scale(1); }
  50% { color: #38bdf8; transform: scale(1.18); }
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

.cover-empty:hover,
.cover-empty.is-dragover {
  border-color: #6366f1;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.08);
}

.cover-empty:hover :deep(svg),
.cover-empty.is-dragover :deep(svg) {
  color: #6366f1 !important;
}

.cover-empty:hover .cover-empty-hint,
.cover-empty.is-dragover .cover-empty-hint {
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
