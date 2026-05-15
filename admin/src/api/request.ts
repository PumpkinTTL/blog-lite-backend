import axios from 'axios'

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

// 请求拦截器 - 自动带 token
request.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 防止多次弹提示跳转
let isRedirecting = false

// 响应拦截器
request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status = error.response?.status
    if (status === 401) {
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('deviceId')
      if (!isRedirecting) {
        isRedirecting = true
        // 动态导入避免循环依赖，用 Naive UI 的 message 提示
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
      return new Promise(() => {}) // 挂起，不触发页面内的错误处理
    }
    const message = error.response?.data?.message || error.message || '请求失败'
    return Promise.reject(new Error(message))
  },
)

export default request
