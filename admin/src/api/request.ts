import axios from 'axios'
// 关键：续期/登出兜底时通过 tokenState 同步 store ref，
// 否则 refresh 轮换 refreshToken 后 store 里仍是旧值，登出会吊销失败。
import { persistTokens, clearTokens } from '../stores/tokenState'
import { genRequestId, extractRequestId } from '../utils/req-id'

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

// === Token 读取：localStorage 优先，sessionStorage 兜底 ===
// 与 tokenState 的读取策略保持一致
function getToken(key: string): string | null {
  return localStorage.getItem(key) || sessionStorage.getItem(key)
}

// 请求拦截器 - 自动带 token + X-Request-Id（请求追溯）
request.interceptors.request.use((config) => {
  const token = getToken('accessToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  // 每个请求生成唯一追溯 ID，后端日志/错误响应都带它，方便排障
  config.headers['X-Request-Id'] = genRequestId()
  return config
})

// 防止多次弹提示跳转
let isRedirecting = false

// 刷新 Token 相关
let isRefreshing = false
let refreshSubscribers: { onToken: (token: string) => void; reject: (e: unknown) => void }[] = []

/** 会话过期错误：401 且续签失败时 reject，让调用方 catch/finally 能执行，避免 loading 卡死 */
class SessionExpiredError extends Error {
  constructor(msg = '登录已过期，请重新登录') {
    super(msg)
    this.name = 'SessionExpiredError'
  }
}

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb.onToken(token))
  refreshSubscribers = []
}

/** 续签失败时 reject 掉所有排队请求，避免它们永久挂起导致 loading 卡死 */
function rejectQueued() {
  const err = new SessionExpiredError()
  refreshSubscribers.forEach((cb) => cb.reject(err))
  refreshSubscribers = []
}

function addRefreshSubscriber(
  onToken: (token: string) => void,
  reject: (e: unknown) => void,
) {
  refreshSubscribers.push({ onToken, reject })
}

function redirectToLogin() {
  if (isRedirecting) return
  isRedirecting = true
  // 超时强跳兜底：若 naive-ui 动态加载失败，onAfterLeave 不触发，
  // isRedirecting 会永久锁死后续 401 全静默。2.5s 后强制跳转并解锁。
  const forceTimer = setTimeout(() => {
    isRedirecting = false
    window.location.href = '/login'
  }, 2500)
  import('naive-ui').then(({ createDiscreteApi }) => {
    clearTimeout(forceTimer)
    const { message } = createDiscreteApi(['message'])
    message.warning('登录已过期，请重新登录', {
      duration: 2000,
      onAfterLeave: () => {
        isRedirecting = false
        window.location.href = '/login'
      },
    })
  }).catch(() => {
    // naive-ui 加载失败，forceTimer 会兜底跳转，这里不额外处理
  })
}

// 响应拦截器
request.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const status = error.response?.status
    const serverMsg = error.response?.data?.message || ''
    const config = error.config
    // 请求追溯 ID（错误时带上，方便用户上报排障）
    const reqId = extractRequestId(error)

    // 非 401 → 正常错误处理
    if (status !== 401) {
      const baseMsg = serverMsg || error.message || '请求失败'
      // 403/500 等错误附上 requestId，用户截图上报时后端能定位日志
      const fullMsg = reqId ? `${baseMsg}（追踪号：${reqId}）` : baseMsg
      if (status === 403) {
        return Promise.reject(new Error(serverMsg || '无权访问'))
      }
      return Promise.reject(new Error(fullMsg))
    }

    // === 以下全是 401 处理 ===

    // 登录请求 401 → 不做重定向，让 handleLogin 的 catch 显示真实错误
    if (config?.url?.includes('/user/login')) {
      return Promise.reject(new Error(serverMsg || '密码错误'))
    }

    // 刷新请求本身 401 → refreshToken 也过期了，直接跳登录
    if (config?.url?.includes('/user/refresh')) {
      clearTokens()
      rejectQueued()
      redirectToLogin()
      // 用 reject 代替 new Promise(()=>{})，避免调用方永久挂起导致 loading 卡死
      return Promise.reject(new SessionExpiredError())
    }

    // 其他 401：尝试用 refreshToken 刷新
    const refreshToken = getToken('refreshToken')
    const deviceId = getToken('deviceId')
    if (!refreshToken || !deviceId) {
      clearTokens()
      rejectQueued()
      redirectToLogin()
      return Promise.reject(new SessionExpiredError())
    }

    // 同一时间只发起一次刷新，其他请求排队
    if (!isRefreshing) {
      isRefreshing = true
      try {
        const res = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/user/refresh`, {
          refreshToken,
          deviceId,
        })
        const data = res.data?.data
        if (data?.accessToken) {
          // 续期成功：通过 tokenState 同步刷新 store ref + storage
          // （refresh 会轮换 refreshToken，必须同步，否则登出吊销的是旧 token）
          persistTokens(data.accessToken, data.refreshToken, data.deviceId || deviceId)
          isRefreshing = false
          onRefreshed(data.accessToken)
          // 重试原始请求
          config.headers.Authorization = `Bearer ${data.accessToken}`
          return request(config)
        }
      } catch {
        // refresh 失败
      }
      isRefreshing = false
      clearTokens()
      rejectQueued()
      redirectToLogin()
      return Promise.reject(new SessionExpiredError())
    }

    // 正在刷新中 → 排队等待（带 reject，续签失败时能释放，不卡死）
    return new Promise((resolve, reject) => {
      addRefreshSubscriber(
        (token) => {
          config.headers.Authorization = `Bearer ${token}`
          resolve(request(config))
        },
        reject,
      )
    })
  },
)

// ═══ 文件下载（需要 Authorization 的 GET 导出接口）═══
// window.open 无法携带 Authorization header（备份下载曾因此永远 401），
// 统一走 fetch→blob→a[download]。检查 res.ok，避免把 JSON 错误体存成文件。
export async function authedDownload(url: string, filename: string): Promise<void> {
  const token = getToken('accessToken')
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    let msg = `下载失败（HTTP ${res.status}）`
    try {
      const j = await res.json()
      if (j?.message) msg = j.message
    } catch { /* 非 JSON 错误体 */ }
    throw new Error(msg)
  }
  const blob = await res.blob()
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

export default request
