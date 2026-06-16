import request from './request'

/** AI 可生成的字段类型 */
export type AiGenerateField = 'subtitle' | 'summary' | 'slug'

/** 统一 AI 生成入参（对应后端 AiGenerateDto） */
export interface AiGeneratePayload {
  /** 文章标题（上下文，可空但至少传 title 或 content 之一） */
  title?: string
  /** 文章正文（上下文） */
  content?: string
  /** 本次要生成哪些内容（复选框语义） */
  fields: AiGenerateField[]
  /** 可选：覆盖默认模型 */
  model?: string
}

/** 统一 AI 生成返回：只有被请求的字段才会有值 */
export interface AiGenerateResult {
  subtitle?: string
  summary?: string
  slug?: string
}

/** 后端统一返回体（响应拦截器已解包 axios response.data） */
export interface AiApiResponse<T> {
  success: boolean
  data: T
  message: string
}

/**
 * 调用后端 /ai/generate 生成文章辅助内容。
 * 一次请求可同时生成副标题 / 摘要 / slug 中的多项。
 * 注意：request 拦截器返回的是后端 body（{success,data,message}），不是 axios response。
 */
export function generateByAi(data: AiGeneratePayload) {
  return request.post<AiApiResponse<AiGenerateResult>, AiApiResponse<AiGenerateResult>>(
    '/ai/generate',
    data,
  )
}
