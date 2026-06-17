<script setup lang="ts">
import { ref, h } from 'vue'
import { NButton, NDataTable, NSpace, NInput, NIcon, NModal, NForm, NFormItem, NPagination, NTag, NSelect, NSwitch, NInputNumber } from 'naive-ui'
import type { DataTableColumns, FormInst, FormRules, SelectOption } from 'naive-ui'
import { AddOutline, TrashOutline, CreateOutline, SearchOutline, RefreshOutline } from '@vicons/ionicons5'
import { getAiProviders, createAiProvider, updateAiProvider, deleteAiProvider, batchDeleteAiProviders } from '../../api/ai-provider'
import type { AiProvider, AiProviderModel } from '../../api/ai-provider'
import { useCrudList } from '../../composables/useCrudList'

const formRef = ref<FormInst | null>(null)
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)

const statusOptions: SelectOption[] = [
  { label: '全部', value: '' },
  { label: '启用', value: 1 },
  { label: '禁用', value: 0 },
]
const searchStatus = ref<number | ''>('')

const { loading, list, searchId, searchKeyword, showModal, editingId, saving, formValue,
  handleSearch: _handleSearch, handleReset: _handleReset, openCreate, openEdit, handleSave: _handleSave, handleDelete, handleBatchDelete, checkedRowKeys, selectionColumn } =
  useCrudList<AiProvider>({
    loadApi: (params) => getAiProviders({
      ...params,
      status: searchStatus.value === '' ? undefined : Number(searchStatus.value),
      page: page.value,
      pageSize: pageSize.value,
    }),
    createApi: createAiProvider,
    updateApi: updateAiProvider,
    deleteApi: deleteAiProvider,
    batchDeleteApi: batchDeleteAiProviders,
    deleteContent: (row) => `确定删除提供商「${row.name}」？`,
    defaultForm: () => ({ name: '', baseUrl: '', apiKey: '', protocol: 'openai', models: [], remark: '', status: 1 } as any),
    extractList: (res) => {
      const payload = res.data
      if (payload?.list) { total.value = payload.total; return payload.list }
      return Array.isArray(payload) ? payload : []
    },
  })

function handleSearch() { page.value = 1; _handleSearch() }
function handleReset() { searchId.value = ''; searchKeyword.value = ''; searchStatus.value = ''; page.value = 1; _handleReset() }
async function handleSave() { return _handleSave(() => formRef.value?.validate()) }
function handlePageChange(p: number) { page.value = p; _handleSearch() }
function handlePageSizeChange(s: number) { pageSize.value = s; page.value = 1; _handleSearch() }

const rules: FormRules = {
  name: [{ required: true, message: '请输入名称', trigger: ['input', 'blur'] }],
  baseUrl: [{ required: true, message: '请输入 Base URL', trigger: ['input', 'blur'] }],
  apiKey: [{ required: true, message: '请输入 API Key', trigger: ['input', 'blur'] }],
}

// === 模型列表编辑（嵌入） ===
function addModel() {
  const fv = formValue.value as any
  if (!Array.isArray(fv.models)) fv.models = []
  fv.models.push({ modelId: '', displayName: '', maxContextTokens: 32000, maxOutputTokens: 8192, supportsTools: true, supportsThinking: false } as AiProviderModel)
}
function removeModel(idx: number) {
  const fv = formValue.value as any
  if (Array.isArray(fv.models)) fv.models.splice(idx, 1)
}

const columns: DataTableColumns<AiProvider> = [
  selectionColumn,
  { title: 'ID', key: 'id', width: 60 },
  { title: '名称', key: 'name', width: 110 },
  { title: 'Base URL', key: 'baseUrl', width: 200, ellipsis: { tooltip: true } },
  {
    title: 'API Key', key: 'apiKey', width: 120, ellipsis: { tooltip: true },
    render: (row) => {
      const k = row.apiKey || ''
      return k.length > 12 ? k.slice(0, 8) + '••••' + k.slice(-4) : '••••'
    },
  },
  {
    title: '模型', key: 'models', width: 180, ellipsis: { tooltip: true },
    render: (row) => {
      const models = row.models
      if (!Array.isArray(models) || models.length === 0) return '—'
      return models.map((m: any) => m.displayName || m.modelId).join(', ')
    },
  },
  { title: '备注', key: 'remark', width: 120, ellipsis: { tooltip: true } },
  {
    title: '状态', key: 'status', width: 60,
    render: (row) => h(NTag, { type: row.status === 1 ? 'success' : 'default', size: 'small' }, { default: () => row.status === 1 ? '启用' : '禁用' }),
  },
  { title: '创建时间', key: 'createdAt', width: 160, render: (r) => new Date(r.createdAt).toLocaleDateString('zh-CN') },
  {
    title: '操作', key: 'actions', width: 100, fixed: 'right',
    render: (row) => h(NSpace, { size: 'small' }, {
      default: () => [
        h(NButton, { size: 'small', quaternary: true, type: 'primary', onClick: () => openEdit(row, (r) => ({ name: r.name, baseUrl: r.baseUrl, apiKey: r.apiKey, protocol: r.protocol, models: r.models ?? [], remark: r.remark ?? '', status: r.status } as any)) }, {
          default: () => '编辑', icon: () => h(NIcon, null, { default: () => h(CreateOutline) }),
        }),
        h(NButton, { size: 'small', quaternary: true, type: 'error', onClick: () => handleDelete(row) }, {
          default: () => '删除', icon: () => h(NIcon, null, { default: () => h(TrashOutline) }),
        }),
      ],
    }),
  },
]
</script>

<template>
  <div class="page-wrapper">
    <div class="page-header">
      <h2 class="page-title">AI 提供商</h2>
      <n-button type="primary" @click="openCreate">
        <template #icon><n-icon><AddOutline /></n-icon></template>
        新建提供商
      </n-button>
    </div>
    <n-space class="search-bar" :size="12" align="center">
      <n-input v-model:value="searchId" placeholder="ID" clearable style="width: 100px" @keyup.enter="handleSearch" />
      <n-input v-model:value="searchKeyword" placeholder="搜索名称..." clearable @keyup.enter="handleSearch" />
      <n-select v-model:value="searchStatus" :options="statusOptions" style="width: 120px" />
      <n-button type="primary" @click="handleSearch">
        <template #icon><n-icon><SearchOutline /></n-icon></template>
        搜索
      </n-button>
      <n-button @click="handleReset">
        <template #icon><n-icon><RefreshOutline /></n-icon></template>
        重置
      </n-button>
      <n-button :disabled="checkedRowKeys.length === 0" type="error" @click="handleBatchDelete">
        <template #icon><n-icon><TrashOutline /></n-icon></template>
        批量删除
      </n-button>
    </n-space>

    <div class="table-section">
      <n-data-table :columns="columns" :data="list" :loading="loading" :bordered="false" :scroll-x="1200" :row-key="(row: any) => row.id" @update:checked-row-keys="(keys: any) => checkedRowKeys = keys" />
      <div class="pagination-wrap" v-if="total > 0">
        <n-pagination :page="page" :page-size="pageSize" :page-sizes="[10, 20, 50]" :item-count="total" show-size-picker @update:page="handlePageChange" @update:page-size="handlePageSizeChange" />
      </div>
    </div>

    <n-modal v-model:show="showModal" preset="dialog" :title="editingId ? '编辑提供商' : '新建提供商'" :positive-text="saving ? '提交中...' : '确认'" :negative-text="saving ? undefined : '取消'" :loading="saving" @positive-click="handleSave" style="width: 640px">
      <n-form ref="formRef" :model="formValue" :rules="rules" label-placement="top">
        <n-form-item label="名称" path="name">
          <n-input v-model:value="formValue.name" placeholder="如 9router" />
        </n-form-item>
        <n-form-item label="Base URL" path="baseUrl">
          <n-input v-model:value="formValue.baseUrl" placeholder="https://..." />
        </n-form-item>
        <n-form-item label="API Key" path="apiKey">
          <n-input v-model:value="formValue.apiKey" type="password" show-password-on="click" placeholder="sk-..." />
        </n-form-item>
        <n-form-item label="协议" path="protocol">
          <n-input v-model:value="formValue.protocol" placeholder="openai" />
        </n-form-item>

        <!-- 模型列表编辑 -->
        <n-form-item label="模型列表" path="models">
          <div class="models-editor">
            <div v-for="(m, idx) in (formValue.models || [])" :key="idx" class="model-row">
              <n-input v-model:value="m.modelId" placeholder="模型标识 modelId" style="width: 200px" />
              <n-input v-model:value="m.displayName" placeholder="展示名" style="width: 150px" />
              <n-input-number v-model:value="m.maxContextTokens" placeholder="上下文" :step="1000" size="small" style="width: 120px" />
              <div class="model-flags">
                <label class="flag"><n-switch v-model:value="m.supportsTools" size="small" />工具</label>
                <label class="flag"><n-switch v-model:value="m.supportsThinking" size="small" />思考</label>
              </div>
              <n-button size="small" quaternary type="error" @click="removeModel(idx)">
                <template #icon><n-icon><TrashOutline /></n-icon></template>
              </n-button>
            </div>
            <n-button size="small" dashed block @click="addModel">
              <template #icon><n-icon><AddOutline /></n-icon></template>
              添加模型
            </n-button>
          </div>
        </n-form-item>

        <n-form-item label="备注" path="remark">
          <n-input v-model:value="formValue.remark" type="textarea" placeholder="可选" :rows="2" />
        </n-form-item>
        <n-form-item label="状态" path="status">
          <n-select v-model:value="formValue.status" :options="[{ label: '启用', value: 1 }, { label: '禁用', value: 0 }]" />
        </n-form-item>
      </n-form>
    </n-modal>
  </div>
</template>

<style scoped>
.models-editor { width: 100%; display: flex; flex-direction: column; gap: 8px; }
.model-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px; border: 1px dashed #e7e5e4; border-radius: 8px; background: #fafaf9;
}
.model-flags { display: flex; gap: 10px; }
.flag { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: #78716c; }
</style>
