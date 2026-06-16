import { ref, onMounted } from 'vue'
import { useMessage, useDialog } from 'naive-ui'

export interface UseCrudListOptions<T> {
  /** 加载列表的 API 函数 */
  loadApi: (params?: Record<string, any>) => Promise<any>
  /** 创建的 API 函数 */
  createApi: (data: any) => Promise<any>
  /** 更新的 API 函数 */
  updateApi: (id: number, data: any) => Promise<any>
  /** 删除的 API 函数 */
  deleteApi: (id: number) => Promise<any>
  /** 列表数据在响应中的路径，默认从 res.data 中提取 */
  extractList?: (res: any) => T[]
  /** 删除确认的内容文案 */
  deleteContent: (row: T) => string
  /** 新建成功的提示 */
  createSuccessMessage?: string
  /** 更新成功的提示 */
  updateSuccessMessage?: string
  /** 删除成功的提示 */
  deleteSuccessMessage?: string
  /** 加载失败的提示 */
  loadErrorMessage?: string
  /** 新建表单的初始值 */
  defaultForm: () => Record<string, any>
  /** 搜索字段名列表（用于 handleReset 清空） */
  searchFields?: string[]
  /** 批量删除 API（启用批量删除能力） */
  batchDeleteApi?: (ids: number[]) => Promise<any>
  /** 批量删除确认文案，默认「确定删除选中的 N 项?此操作不可恢复!」 */
  batchDeleteContent?: (count: number) => string
  /** 批量删除成功提示，默认「批量删除成功」 */
  batchDeleteSuccessMessage?: string
}

export function useCrudList<T extends { id: number }>(options: UseCrudListOptions<T>) {
  const message = useMessage()
  const dialog = useDialog()

  const loading = ref(false)
  const list = ref<T[]>([])
  const searchId = ref('')
  const searchKeyword = ref('')
  const showModal = ref(false)
  const editingId = ref<number | null>(null)
  const saving = ref(false)
  const formValue = ref(options.defaultForm())
  const checkedRowKeys = ref<number[]>([])

  /** 可直接用作 DataTableColumns 首项 */
  const selectionColumn = { type: 'selection' as const, width: 40 }

  async function loadList(extraParams?: Record<string, any>) {
    loading.value = true
    try {
      const params: Record<string, any> = { ...extraParams }
      if (searchId.value) params.id = searchId.value
      if (searchKeyword.value) params.keyword = searchKeyword.value
      const res = await options.loadApi(params)
      list.value = options.extractList
        ? options.extractList(res)
        : (() => {
            const payload = res.data
            return Array.isArray(payload) ? payload : (payload?.list || [])
          })()
    } catch (e: any) {
      message.error(e?.message || options.loadErrorMessage || '加载列表失败')
    } finally {
      loading.value = false
    }
    return list.value
  }

  function handleSearch() {
    return loadList()
  }

  function handleReset() {
    searchId.value = ''
    searchKeyword.value = ''
    return loadList()
  }

  function openCreate() {
    editingId.value = null
    formValue.value = options.defaultForm()
    showModal.value = true
  }

  function openEdit(row: T, formMapper?: (row: T) => Record<string, any>) {
    editingId.value = row.id
    formValue.value = formMapper ? formMapper(row) : { ...row } as any
    showModal.value = true
  }

  async function handleSave(validateFn?: () => Promise<unknown> | undefined) {
    // 防止双击重入，导致重复创建/更新
    if (saving.value) return false
    if (validateFn) {
      try {
        await validateFn()
      } catch {
        return false
      }
    }
    saving.value = true
    try {
      if (editingId.value) {
        await options.updateApi(editingId.value, formValue.value)
        message.success(options.updateSuccessMessage || '更新成功')
      } else {
        await options.createApi(formValue.value)
        message.success(options.createSuccessMessage || '创建成功')
      }
      showModal.value = false
      loadList()
    } catch (e: any) {
      message.error(e.message || '操作失败')
      return false
    } finally {
      saving.value = false
    }
  }

  function handleDelete(row: T) {
    dialog.warning({
      title: '确认删除',
      content: options.deleteContent(row),
      positiveText: '删除',
      negativeText: '取消',
      onPositiveClick: async () => {
        try {
          await options.deleteApi(row.id)
          message.success(options.deleteSuccessMessage || '删除成功')
          loadList()
        } catch (e: any) {
          message.error(e.message || '删除失败')
        }
      },
    })
  }

  async function handleBatchDelete() {
    if (!options.batchDeleteApi) return
    if (checkedRowKeys.value.length === 0) {
      message.warning('请先选择要删除的项')
      return
    }
    dialog.warning({
      title: '批量删除',
      content: (options.batchDeleteContent || ((n) => `确定删除选中的 ${n} 项?此操作不可恢复!`))(checkedRowKeys.value.length),
      positiveText: '删除',
      negativeText: '取消',
      onPositiveClick: async () => {
        try {
          await options.batchDeleteApi!(checkedRowKeys.value)
          message.success(options.batchDeleteSuccessMessage || '批量删除成功')
          checkedRowKeys.value = []
          loadList()
        } catch (e: any) {
          message.error(e?.message || '批量删除失败')
        }
      },
    })
  }

  onMounted(() => loadList())

  return {
    loading,
    list,
    searchId,
    searchKeyword,
    showModal,
    editingId,
    saving,
    formValue,
    checkedRowKeys,
    selectionColumn,
    loadList,
    handleSearch,
    handleReset,
    openCreate,
    openEdit,
    handleSave,
    handleDelete,
    handleBatchDelete,
    message,
    dialog,
  }
}
