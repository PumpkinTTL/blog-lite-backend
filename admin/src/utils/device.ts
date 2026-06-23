import FingerprintJS from '@fingerprintjs/fingerprintjs'

/**
 * 设备标识（deviceId）+ 浏览器指纹（fingerprint）工具（admin 端）。
 * 与 v2 客户端 src/utils/device.ts 保持一致逻辑。
 *
 * 职责分离（重要）：
 * - deviceId：续签凭证，必须【绝对稳定】。前端 crypto.randomUUID 生成，存 localStorage，
 *   登录时传给后端，鉴权中心绑定它。续签时原样回传，不一致就被拒。
 *   → 绝不能用 fingerprint 当 deviceId（fingerprint 会变，会导致续签失败踢登录）。
 *
 * - fingerprint：风控指纹，用于安全/审计/单设备识别。允许偶尔变化，不影响登录。
 *   → 用 FingerprintJS visitorId。
 *
 * 存储一致性：deviceId 存 localStorage 的 'deviceId' key，
 *   与 tokenState.ts / request.ts 读的 key 一致，保证续签能读到。
 */

const DEVICE_ID_STORAGE_KEY = 'deviceId'
const FINGERPRINT_STORAGE_KEY = 'fp'

/** fallback：老浏览器无 crypto.randomUUID */
function generateFallbackId(): string {
  return (
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  )
}

/**
 * 获取稳定的设备 ID（续签凭证）。
 * - 首次调用：生成并存 localStorage，后续永远返回同一个值。
 * - deviceId 不与登录态绑定，登出后仍保留（同设备再次登录还是同一个）。
 */
export function getDeviceId(): string {
  const existing =
    localStorage.getItem(DEVICE_ID_STORAGE_KEY) ||
    sessionStorage.getItem(DEVICE_ID_STORAGE_KEY)
  if (existing) return existing

  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : generateFallbackId()

  localStorage.setItem(DEVICE_ID_STORAGE_KEY, id)
  return id
}

let fpAgentPromise: ReturnType<typeof FingerprintJS.load> | null = null

/**
 * 获取浏览器指纹（FingerprintJS visitorId）。
 * 首次调用异步加载库并计算，结果缓存到 localStorage，后续直接读缓存。
 * 失败返回空串（不阻塞登录）。
 */
export async function getFingerprint(): Promise<string> {
  const cached = localStorage.getItem(FINGERPRINT_STORAGE_KEY)
  if (cached) return cached

  try {
    if (!fpAgentPromise) {
      fpAgentPromise = FingerprintJS.load()
    }
    const agent = await fpAgentPromise
    const result = await agent.get()
    const visitorId = result.visitorId
    localStorage.setItem(FINGERPRINT_STORAGE_KEY, visitorId)
    return visitorId
  } catch {
    return ''
  }
}

/**
 * 登录/注册前一次性拿到 deviceId + fingerprint。
 * deviceId 同步返回（必有值），fingerprint 异步获取（可能为空串）。
 */
export async function getDeviceIdentity(): Promise<{
  deviceId: string
  fingerprint: string
}> {
  const deviceId = getDeviceId()
  const fingerprint = await getFingerprint()
  return { deviceId, fingerprint }
}
