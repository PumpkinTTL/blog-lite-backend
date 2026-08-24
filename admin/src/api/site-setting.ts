import request from './request'

/** settings 表记录（后端 SettingEntity） */
export interface SettingItem {
  id: number
  key: string
  value: string
  description: string | null
  group: string
}

/**
 * 站点设置（group='site'）专用 API。
 * 复用后端通用 setting 接口的 group 维度读写，无需后端新增端点。
 * - GET  /setting/group/site  → SettingItem[]
 * - PUT  /setting/group/site  → items: Record<key, value>
 *
 * 注意：value 在 DB 里统一是字符串。JSON 类字段（钱包地址、社交链接）
 * 存的是 JSON 字符串，前端需自行 parse/stringify。
 */

/** 获取站点设置组（group='site'）的全部项 */
export function getSiteSettings() {
  return request.get<unknown, { success: boolean; data: SettingItem[]; message: string }>(
    '/setting/group/site',
  )
}

/**
 * 批量保存站点设置。
 * @param items key→value 映射（value 必须是字符串，JSON 字段需先 stringify）
 */
export function saveSiteSettings(items: Record<string, string>) {
  return request.put<unknown, { success: boolean; data: SettingItem[]; message: string }>(
    '/setting/group/site',
    { items },
  )
}

/** R2 连通性测试入参（表单当前值，无需先保存） */
export interface TestR2Payload {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}

/** 测试 R2 账号连通性：真实 HeadBucket，验证 endpoint/凭证/桶三者 */
export function testR2Connection(data: TestR2Payload) {
  return request.post<
    unknown,
    { success: boolean; data: { ok: boolean; message: string; latencyMs: number }; message: string }
  >('/media/test-r2', data)
}

/** 当前生效配置概要（面板优先 / .env 兜底，密钥已脱敏） */
export interface EffectiveConfig {
  smtp: { source: 'panel' | 'env' | 'none'; host: string; port: number; user: string; from: string; hasPass: boolean }
  r2: { source: 'panel' | 'env' | 'none'; accountName?: string; endpoint?: string; bucket?: string; prefix?: string; keyMasked?: string }
  tavily: { source: 'panel' | 'env' | 'none'; keyMasked: string; baseUrl: string }
}

/** 获取当前生效的 SMTP / R2 配置概要（设置面板展示"当前生效"提示用） */
export function getEffectiveConfig() {
  return request.get<unknown, { success: boolean; data: EffectiveConfig; message: string }>(
    '/setting/effective-config',
  )
}

/** SMTP 测试发送入参（表单当前值，空字段后端回落已保存/.env 配置） */
export function testSmtp(data: {
  to: string
  host?: string
  port?: number | string
  user?: string
  pass?: string
  from?: string
}) {
  return request.post<
    unknown,
    { success: boolean; data: { ok: boolean; message: string }; message: string }
  >('/setting/test-smtp', data)
}
