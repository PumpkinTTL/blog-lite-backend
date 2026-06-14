import axios from 'axios'

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

// === Token 存储抽象：localStorage 优先，sessionStorage 兜底 ===
// 这样登录时的 remember 复选框只需决定写入哪个 storage，
// 读取/清理逻辑无需关心具体来源
function getToken(key: string): string | null {
  return localStorage.getItem(key) || sessionStorage.getItem(key)
}

function clearTokens() {
  ;[localStorage, sessionStorage].forEach((s) => {
    s.removeItem('accessToken')
    s.removeItem('refreshToken')
    s.removeItem('deviceId')
  })
}

// 续期成功后，写入与原 token 相同的 storage（保持会话策略一致）
function saveTokens(access: string, refresh: string, device: string) {
  // 判断当前 token 来自哪个 storage
  const inLocal = !!localStorage.getItem('accessToken')
  const target = inLocal ? localStorage : sessionStorage
  target.setItem('accessToken', access)
  target.setItem('refreshToken', refresh)
  target.setItem('deviceId', device)
}

// 请求拦截器 - 自动带 token
request.interceptors.request.use((config) => {
  const token = getToken('accessToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 防止多次弹提示跳转
let isRedirecting = false

// 刷新 Token 相关
let isRefreshing = false
let refreshSubscribers: ((token: string) => void)[] = []

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token))
  refreshSubscribers = []
}

function addRefreshSubscriber(cb: (token: string) => void) {
  refreshSubscribers.push(cb)
}

function redirectToLogin() {
  if (isRedirecting) return
  isRedirecting = true
  import('naive-ui').then(({ createDiscreteApi }) => {
    const { message } = createDiscreteApi(['message'])
    message.warning('登录已过期，请重新登录', {
      duration: 2000,
      onAfterLeave: () => {
        window.location.href = '/login'
      },
    })
  })
}

// 响应拦截器
request.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const status = error.response?.status
    const serverMsg = error.response?.data?.message || ''
    const config = error.config

    // 非 401 → 正常错误处理
    if (status !== 401) {
      if (status === 403) {
        return Promise.reject(new Error(serverMsg || '无权访问'))
      }
      return Promise.reject(new Error(serverMsg || error.message || '请求失败'))
    }

    // === 以下全是 401 处理 ===

    // 登录请求 401 → 不做重定向，让 handleLogin 的 catch 显示真实错误
    if (config?.url?.includes('/user/login')) {
      return Promise.reject(new Error(serverMsg || '密码错误'))
    }

    // 刷新请求本身 401 → refreshToken 也过期了，直接跳登录
    if (config?.url?.includes('/user/refresh')) {
      clearTokens()
      redirectToLogin()
      return new Promise(() => {})
    }

    // 其他 401：尝试用 refreshToken 刷新
    const refreshToken = getToken('refreshToken')
    const deviceId = getToken('deviceId')
    if (!refreshToken || !deviceId) {
      clearTokens()
      redirectToLogin()
      return new Promise(() => {})
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
          saveTokens(data.accessToken, data.refreshToken, data.deviceId || deviceId)
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
      refreshSubscribers = []
      clearTokens()
      redirectToLogin()
      return new Promise(() => {})
    }

    // 正在刷新中 → 排队等待
    return new Promise((resolve) => {
      addRefreshSubscriber((token) => {
        config.headers.Authorization = `Bearer ${token}`
        resolve(request(config))
      })
    })
  },
)

export default request
