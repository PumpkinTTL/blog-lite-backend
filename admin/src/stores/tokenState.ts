import { ref } from 'vue'

/**
 * Token 状态的单一数据源（Single Source of Truth）。
 *
 * 为什么独立成模块、且不依赖任何业务模块：
 * - auth.ts（logout 需要 refreshToken）和 request.ts（refresh 续期需要回写）
 *   都要读写 token。若状态放在 auth.ts，request.ts 导入它会形成循环依赖：
 *     auth.ts → api/user → request → auth.ts
 * - 抽到这里后，tokenState 无任何 import，被两端共同依赖，无环。
 * - 同时消除 auth.ts / request.ts 里各自维护的 localStorage 读写重复代码。
 *
 * 存储策略与 LoginView 的「记住登录」一致：
 *   remember=true  → localStorage（跨浏览器重启持久化）
 *   remember=false → sessionStorage（关浏览器即失效）
 * 读取时 localStorage 优先、sessionStorage 兜底，刷新页面后无论哪种策略都能恢复。
 */

function readToken(key: string): string {
  return localStorage.getItem(key) || sessionStorage.getItem(key) || ''
}

export const accessToken = ref(readToken('accessToken'))
export const refreshToken = ref(readToken('refreshToken'))
export const deviceId = ref(readToken('deviceId'))

export interface UserInfo {
  id: number
  username: string
  nickname: string | null
  avatar: string | null
  email: string | null
  roles: string[]
}

function readUserInfo(): UserInfo | null {
  const raw = localStorage.getItem('userInfo') || sessionStorage.getItem('userInfo')
  if (!raw) return null
  try {
    return JSON.parse(raw) as UserInfo
  } catch {
    return null
  }
}

export const userInfo = ref<UserInfo | null>(readUserInfo())

const TOKEN_KEYS = ['accessToken', 'refreshToken', 'deviceId'] as const
const USER_INFO_KEY = 'userInfo'

/**
 * 写入 token：同步更新 ref + 按策略写入目标 storage。
 * 登录、refresh 续期都走这里，保证 ref 与 storage 永不脱节。
 */
export function persistTokens(access: string, refresh: string, device: string, remember = true) {
  accessToken.value = access
  refreshToken.value = refresh
  deviceId.value = device
  // 先清两个 storage 的旧值，再按策略写入目标，避免残留串味（如 remember 切换时）
  TOKEN_KEYS.forEach((key) => {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  })
  const storage = remember ? localStorage : sessionStorage
  storage.setItem('accessToken', access)
  storage.setItem('refreshToken', refresh)
  storage.setItem('deviceId', device)
}

/**
 * 写入当前登录用户信息（登录后调 /user/profile 拉取后调用）。
 * remember 策略与 token 保持一致。
 */
export function persistUserInfo(info: UserInfo, remember = true) {
  userInfo.value = info
  localStorage.removeItem(USER_INFO_KEY)
  sessionStorage.removeItem(USER_INFO_KEY)
  const storage = remember ? localStorage : sessionStorage
  storage.setItem(USER_INFO_KEY, JSON.stringify(info))
}

/**
 * 清空 token：ref 归零 + 两个 storage 全清。
 * 登出、refresh 失败、401 兜底跳登录都走这里。
 */
export function clearTokens() {
  accessToken.value = ''
  refreshToken.value = ''
  deviceId.value = ''
  userInfo.value = null
  TOKEN_KEYS.forEach((key) => {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  })
  localStorage.removeItem(USER_INFO_KEY)
  sessionStorage.removeItem(USER_INFO_KEY)
}
