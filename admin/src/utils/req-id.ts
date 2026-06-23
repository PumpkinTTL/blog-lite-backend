/**
 * 请求追溯 ID 工具（admin 端）。
 * 与 v2 客户端 src/utils/req-id.ts 保持一致逻辑。
 *
 * 业界标准 X-Request-Id 方案：前端每个请求生成唯一 ID 发给后端，
 * 后端日志/错误响应都带它，用户上报错误时后端能精确定位行为链。
 */

/** fallback：老浏览器无 crypto.randomUUID */
function generateFallbackId(): string {
  return (
    'r-' +
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 10)
  )
}

/** 生成一个新的请求 ID */
export function genRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return generateFallbackId()
}

/**
 * 从 axios 错误响应里提取 requestId（优先响应体，其次响应头）。
 */
export function extractRequestId(err: any): string | undefined {
  const fromBody = err?.response?.data?.requestId
  if (fromBody && typeof fromBody === 'string') return fromBody
  const fromHeader = err?.response?.headers?.['x-request-id']
  if (fromHeader && typeof fromHeader === 'string') return fromHeader
  return undefined
}
