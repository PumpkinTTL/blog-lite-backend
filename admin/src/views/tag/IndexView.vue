<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import { NCard, NButton, NDataTable, NSpace, NInput, NIcon, NModal, NForm, NFormItem, useMessage, useDialog } from 'naive-ui'
import type { DataTableColumns, FormInst, FormRules } from 'naive-ui'
import { AddOutline, TrashOutline, CreateOutline, SearchOutline } from '@vicons/ionicons5'
import { getTags, createTag, updateTag, deleteTag } from '../../api/tag'
import type { Tag } from '../../api/tag'

const message = useMessage()
const dialog = useDialog()
const loading = ref(false)
const tags = ref<Tag[]>([])
const keyword = ref('')
const showModal = ref(false)
const editingId = ref<number | null>(null)
const formRef = ref<FormInst | null>(null)
const saving = ref(false)
const formValue = ref({ name: '', slug: '' })

const rules: FormRules = {
  name: [{ required: true, message: '请输入标签名称', trigger: ['input', 'blur'] }],
  slug: [{ required: true, message: '请输入 Slug', trigger: ['input', 'blur'] }],
}

const columns: DataTableColumns<Tag> = [
  { title: '名称', key: 'name', width: 200 },
  { title: 'Slug', key: 'slug', width: 200 },
  { title: '创建时间', key: 'createdAt', width: 180 },
  { title: '更新时间', key: 'updatedAt', width: 180 },
  {
    title: '操作',
    key: 'actions',
    width: 140,
    render: (row) =>
      h(NSpace, { size: 'small' }, {
        default: () => [
          h(NButton, { size: 'small', quaternary: true, type: 'primary', onClick: () => openEdit(row) }, {
            default: () => '编辑',
            icon: () => h(NIcon, null, { default: () => h(CreateOutline) }),
          }),
          h(NButton, { size: 'small', quaternary: true, type: 'error', onClick: () => handleDelete(row) }, {
            default: () => '删除',
            icon: () => h(NIcon, null, { default: () => h(TrashOutline) }),
          }),
        ],
      }),
  },
]

async function loadTags() {
  loading.value = true
  try {
    const res = await getTags()
    const payload = res.data
    tags.value = Array.isArray(payload) ? payload : (payload?.list || [])
  } catch {
    message.error('加载标签失败')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  formValue.value = { name: '', slug: '' }
  showModal.value = true
}

function openEdit(row: Tag) {
  editingId.value = row.id
  formValue.value = { name: row.name, slug: row.slug }
  showModal.value = true
}

async function handleSave() {
  try {
    await formRef.value?.validate()
  } catch {
    return false
  }
  saving.value = true
  try {
    if (editingId.value) {
      await updateTag(editingId.value, formValue.value)
      message.success('更新成功')
    } else {
      await createTag(formValue.value)
      message.success('创建成功')
    }
    showModal.value = false
    loadTags()
  } catch (e: any) {
    message.error(e.message || '操作失败')
    return false
  } finally {
    saving.value = false
  }
}

function handleDelete(row: Tag) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除标签「${row.name}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteTag(row.id)
        message.success('删除成功')
        loadTags()
      } catch (e: any) {
        message.error(e.message || '删除失败')
      }
    },
  })
}

onMounted(loadTags)
</script>

<template>
  <div class="page-wrapper">
    <div class="page-header">
      <h2 class="page-title">标签管理</h2>
      <n-space>
        <n-input v-model:value="keyword" placeholder="搜索标签..." clearable>
          <template #prefix>
            <n-icon><SearchOutline /></n-icon>
          </template>
        </n-input>
        <n-button type="primary" @click="openCreate">
          <template #icon><n-icon><AddOutline /></n-icon></template>
          新建标签
        </n-button>
      </n-space>
    </div>

    <n-card :bordered="false" class="table-card">
      <n-data-table
        :columns="columns"
        :data="keyword ? tags.filter(t => t.name.includes(keyword) || t.slug.includes(keyword)) : tags"
        :loading="loading"
        :bordered="false"
      />
    </n-card>

    <n-modal
      v-model:show="showModal"
      preset="dialog"
      :title="editingId ? '编辑标签' : '新建标签'"
      :positive-text="saving ? '提交中...' : '确认'"
      :negative-text="saving ? undefined : '取消'"
      :loading="saving"
      @positive-click="handleSave"
    >
      <n-form ref="formRef" :model="formValue" :rules="rules" label-placement="top">
        <n-form-item label="标签名称" path="name">
          <n-input v-model:value="formValue.name" placeholder="请输入标签名称" />
        </n-form-item>
        <n-form-item label="Slug" path="slug">
          <n-input v-model:value="formValue.slug" placeholder="url-friendly 标识，如 javascript" />
        </n-form-item>
      </n-form>
    </n-modal>
  </div>
</template>

<style scoped>
.page-wrapper {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
}

.table-card {
  border-radius: 12px;
}
</style>
