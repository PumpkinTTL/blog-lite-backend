<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NCard, NForm, NFormItem, NInput, NButton, NSelect, NSpace, NIcon, useMessage } from 'naive-ui'
import type { FormInst, FormRules } from 'naive-ui'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { ArrowBackOutline, SaveOutline, CloudUploadOutline } from '@vicons/ionicons5'
import { getPost, createPost, updatePost } from '../../api/post'
import { getCategories } from '../../api/category'
import { getTags } from '../../api/tag'
import { isDark } from '../../theme'

const route = useRoute()
const router = useRouter()
const message = useMessage()

const formRef = ref<FormInst | null>(null)
const saving = ref(false)
const loading = ref(false)
const isEdit = computed(() => !!route.params.id)

const formValue = ref({
  title: '',
  slug: '',
  content: '',
  summary: '',
  coverImage: '',
  status: 0,
  categoryId: null as number | null,
  tagIds: [] as number[],
})

const rules: FormRules = {
  title: [{ required: true, message: '请输入文章标题', trigger: ['input', 'blur'] }],
  slug: [{ required: true, message: '请输入 Slug', trigger: ['input', 'blur'] }],
}

const categoryOptions = ref<{ label: string; value: number }[]>([])
const tagOptions = ref<{ label: string; value: number }[]>([])

async function loadOptions() {
  try {
    const [catRes, tagRes] = await Promise.all([getCategories(), getTags()])
    const catPayload = catRes.data
    const cats = Array.isArray(catPayload) ? catPayload : (catPayload?.list || [])
    categoryOptions.value = cats.map((c: any) => ({ label: c.name, value: c.id }))

    const tagPayload = tagRes.data
    const tags = Array.isArray(tagPayload) ? tagPayload : (tagPayload?.list || [])
    tagOptions.value = tags.map((t: any) => ({ label: t.name, value: t.id }))
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
        status: post.status ?? 0,
        categoryId: post.categoryId,
        tagIds: (post.tags || []).map((t: any) => t.id),
      }
    }
  } catch {
    message.error('加载文章失败')
  } finally {
    loading.value = false
  }
}

async function handleSave(status: number) {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    const data = { ...formValue.value, status }
    if (isEdit.value) {
      await updatePost(Number(route.params.id), data)
      message.success('更新成功')
    } else {
      await createPost(data)
      message.success('创建成功')
      router.push('/posts')
      return
    }
    if (status === 1) {
      message.success('文章已发布')
    }
  } catch (e: any) {
    message.error(e.message || '保存失败')
  } finally {
    saving.value = false
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
        <n-button :loading="saving" @click="handleSave(0)">
          <template #icon><n-icon><SaveOutline /></n-icon></template>
          存为草稿
        </n-button>
        <n-button type="primary" :loading="saving" @click="handleSave(1)">
          <template #icon><n-icon><CloudUploadOutline /></n-icon></template>
          发布
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

            <n-form-item label="内容" path="content">
              <MdEditor
                v-model="formValue.content"
                :theme="isDark ? 'dark' : 'light'"
                :style="{ height: '520px' }"
                placeholder="开始编写 Markdown 内容..."
              />
            </n-form-item>
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
              <n-input v-model:value="formValue.coverImage" placeholder="封面图 URL（可选）" />
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
.editor-layout {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 16px;
  align-items: start;
}

.editor-card {
  border-radius: 12px;
}

.side-card {
  border-radius: 12px;
  position: sticky;
  top: 80px;
}

.field-label {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
  color: #64748B;
}

@media (max-width: 1024px) {
  .editor-layout {
    grid-template-columns: 1fr;
  }
}
</style>
