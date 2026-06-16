<script setup lang="ts">
import { ref, h, onMounted } from 'vue'
import { NButton, NDataTable, NSpace, NInput, NIcon, NModal, NForm, NFormItem, NPagination, NTag, NSelect, NSwitch, NInputNumber } from 'naive-ui'
import type { DataTableColumns, FormInst, FormRules, SelectOption } from 'naive-ui'
import { AddOutline, TrashOutline, CreateOutline, SearchOutline, RefreshOutline } from '@vicons/ionicons5'
import { getAiModels, createAiModel, updateAiModel, deleteAiModel, batchDeleteAiModels } from '../../api/ai-model'
import type { AiModel } from '../../api/ai-model'
import { getAiProviders } from '../../api/ai-provider'
import { useCrudList } from '../../composables/useCrudList'

const formRef = ref<FormInst | null>(null)
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)

// 提供商下拉选项
const providerOptions = ref<SelectOption[]>([])
const searchProviderId = ref<number | null>(null)

async function loadProviders() {
  const res = await getAiProviders({ pageSize: 200 })
  const list = res.data?.list ?? []
  providerOptions.value = list.map((p: any) => ({ label: p.name, value: p.id }))
}
onMounted(loadProviders)

const { loading, list, searchId, searchKeyword, showModal, editingId, saving, formValue,
  handleSearch: _handleSearch, handleReset: _handleReset, openCreate, openEdit, handleSave: _handleSave, handleDelete, handleBatchDelete, checkedRowKeys, selectionColumn } =
  useCrudList<AiModel>({
    loadApi: (params) => getAiModels({
      ...params,
      providerId: searchProviderId.value ?? undefined,
      page: page.value,
      pageSize: pageSize.value,
    }),
    createApi: createAiModel,
    updateApi: updateAiModel,
    deleteApi: deleteAiModel,
    batchDeleteApi: batchDeleteAiModels,
    deleteContent: (row) => `确定删除模型「${row.displayName}」？`,
    defaultForm: () => ({ providerId: null as number | null, modelId: '', displayName: '', maxContextTokens: 32000, maxOutputTokens: 4096, supportsTools: 1, supportsThinking: 0, status: 1 }),
    extractList: (res) => {
      const payload = res.data
      if (payload?.list) { total.value = payload.total; return payload.list }
      return Array.isArray(payload) ? payload : []
    },
  })

function handleSearch() { page.value = 1; _handleSearch() }
function handleReset() { searchId.value = ''; searchKeyword.value = ''; searchProviderId.value = null; page.value = 1; _handleReset() }
async function handleSave() { return _handleSave(() => formRef.value?.validate()) }
function handlePageChange(p: number) { page.value = p; _handleSearch() }
function handlePageSizeChange(s: number) { pageSize.value = s; page.value = 1; _handleSearch() }

const rules: FormRules = {
  providerId: [{ required: true, type: 'number', message: '请选择提供商', trigger: ['change', 'blur'] }],
  modelId: [{ required: true, message: '请输入模型标识', trigger: ['input', 'blur'] }],
  displayName: [{ required: true, message: '请输入展示名', trigger: ['input', 'blur'] }],
}

const columns: DataTableColumns<AiModel> = [
  selectionColumn,
  { title: 'ID', key: 'id', width: 70 },
  { title: '模型标识', key: 'modelId', width: 220, ellipsis: { tooltip: true } },
  { title: '展示名', key: 'displayName', width: 150 },
  { title: '所属提供商', key: 'provider', width: 120, render: (row) => row.provider?.name ?? '-' },
  { title: '上下文', key: 'maxContextTokens', width: 100 },
  { title: '输出上限', key: 'maxOutputTokens', width: 100 },
  {
    title: '能力', key: 'caps', width: 140,
    render: (row) => h(NSpace, { size: 4 }, {
      default: () => [
        row.supportsTools === 1 ? h(NTag, { size: 'small', type: 'info' }, { default: () => '工具' }) : null,
        row.supportsThinking === 1 ? h(NTag, { size: 'small', type: 'warning' }, { default: () => '思考' }) : null,
      ],
    }),
  },
  {
    title: '状态', key: 'status', width: 80,
    render: (row) => h(NTag, { type: row.status === 1 ? 'success' : 'default', size: 'small' }, { default: () => row.status === 1 ? '启用' : '禁用' }),
  },
  {
    title: '操作', key: 'actions', width: 140, fixed: 'right',
    render: (row) => h(NSpace, { size: 'small', wrap: false }, {
      default: () => [
        h(NButton, { size: 'small', quaternary: true, type: 'primary', onClick: () => openEdit(row, (r) => ({ providerId: r.providerId, modelId: r.modelId, displayName: r.displayName, maxContextTokens: r.maxContextTokens, maxOutputTokens: r.maxOutputTokens, supportsTools: r.supportsTools, supportsThinking: r.supportsThinking, status: r.status })) }, {
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
      <h2 class="page-title">AI 模型</h2>
      <n-button type="primary" @click="openCreate">
        <template #icon><n-icon><AddOutline /></n-icon></template>
        新建模型
      </n-button>
    </div>
    <n-space class="search-bar" :size="12" align="center">
      <n-input v-model:value="searchId" placeholder="ID" clearable style="width: 100px" @keyup.enter="handleSearch" />
      <n-input v-model:value="searchKeyword" placeholder="搜索模型标识/名..." clearable @keyup.enter="handleSearch" />
      <n-select v-model:value="searchProviderId" :options="providerOptions" placeholder="提供商" clearable style="width: 160px" />
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

    <n-modal v-model:show="showModal" preset="dialog" :title="editingId ? '编辑模型' : '新建模型'" :positive-text="saving ? '提交中...' : '确认'" :negative-text="saving ? undefined : '取消'" :loading="saving" @positive-click="handleSave" style="width: 520px">
      <n-form ref="formRef" :model="formValue" :rules="rules" label-placement="top">
        <n-form-item label="所属提供商" path="providerId">
          <n-select v-model:value="formValue.providerId" :options="providerOptions" placeholder="选择提供商" />
        </n-form-item>
        <n-form-item label="模型标识" path="modelId">
          <n-input v-model:value="formValue.modelId" placeholder="如 cmc/deepseek/deepseek-v4-flash" />
        </n-form-item>
        <n-form-item label="展示名" path="displayName">
          <n-input v-model:value="formValue.displayName" placeholder="如 DeepSeek V4 Flash" />
        </n-form-item>
        <n-space>
          <n-form-item label="最大上下文 Token" path="maxContextTokens">
            <n-input-number v-model:value="formValue.maxContextTokens" :min="1000" :step="1000" />
          </n-form-item>
          <n-form-item label="单次输出上限" path="maxOutputTokens">
            <n-input-number v-model:value="formValue.maxOutputTokens" :min="256" :step="256" />
          </n-form-item>
        </n-space>
        <n-space>
          <n-form-item label="支持工具调用" path="supportsTools">
            <n-switch v-model:value="formValue.supportsTools" :checked-value="1" :unchecked-value="0" />
          </n-form-item>
          <n-form-item label="支持思考过程" path="supportsThinking">
            <n-switch v-model:value="formValue.supportsThinking" :checked-value="1" :unchecked-value="0" />
          </n-form-item>
          <n-form-item label="状态" path="status">
            <n-switch v-model:value="formValue.status" :checked-value="1" :unchecked-value="0" />
          </n-form-item>
        </n-space>
      </n-form>
    </n-modal>
  </div>
</template>

<style scoped></style>
