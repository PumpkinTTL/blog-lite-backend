import { describe, it, expect, vi, beforeEach } from 'vitest'

// 使用 vi.hoisted 创建可在 mock 工厂和测试体中共享的变量
const mockRouterPush = vi.hoisted(() => vi.fn())
const mockAxiosPost = vi.hoisted(() => vi.fn())

// jsdom 环境下 localStorage 在模块加载时不可用，手动 mock
vi.hoisted(() => {
  const store: Record<string, string> = {}
  globalThis.localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length },
  } as Storage
})

vi.mock('vue-router', () => ({
  useRouter: vi.fn(() => ({
    push: mockRouterPush,
  })),
}))

vi.mock('axios', () => ({
  default: {
    post: mockAxiosPost,
  },
}))

import { useAuth } from '../auth'

describe('useAuth', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    // 重置模块级 ref（由前一个测试残留）
    const auth = useAuth()
    auth.clearTokens()
  })

  it('setTokens 应该设置 token 和 deviceId 到 localStorage 和 ref', () => {
    const auth = useAuth()

    auth.setTokens('test-access-token', 'test-refresh-token', 'test-device-id')

    expect(localStorage.getItem('accessToken')).toBe('test-access-token')
    expect(localStorage.getItem('refreshToken')).toBe('test-refresh-token')
    expect(localStorage.getItem('deviceId')).toBe('test-device-id')
    expect(auth.accessToken.value).toBe('test-access-token')
    expect(auth.refreshToken.value).toBe('test-refresh-token')
    expect(auth.deviceId.value).toBe('test-device-id')
  })

  it('clearTokens 应该清除所有 token', () => {
    const auth = useAuth()
    auth.setTokens('token', 'refresh', 'device')

    auth.clearTokens()

    expect(auth.accessToken.value).toBe('')
    expect(auth.refreshToken.value).toBe('')
    expect(auth.deviceId.value).toBe('')
    expect(localStorage.getItem('accessToken')).toBeNull()
    expect(localStorage.getItem('refreshToken')).toBeNull()
    expect(localStorage.getItem('deviceId')).toBeNull()
  })

  it('isLoggedIn 在 token 存在时返回 true', () => {
    const auth = useAuth()

    expect(auth.isLoggedIn.value).toBe(false)

    auth.setTokens('some-token', '', '')
    expect(auth.isLoggedIn.value).toBe(true)

    auth.clearTokens()
    expect(auth.isLoggedIn.value).toBe(false)
  })

  it('logout 在有 token 时应调用吊销接口、清除 token 并跳转到 /login', async () => {
    const auth = useAuth()
    auth.setTokens('access', 'refresh-token', 'device-id')
    mockAxiosPost.mockResolvedValue({ data: {} })

    await auth.logout()

    expect(mockAxiosPost).toHaveBeenCalledWith(
      'https://auth.bitle.cc.cd/auth/revoke',
      { refreshToken: 'refresh-token', deviceId: 'device-id' },
    )
    expect(localStorage.getItem('accessToken')).toBeNull()
    expect(localStorage.getItem('refreshToken')).toBeNull()
    expect(localStorage.getItem('deviceId')).toBeNull()
    expect(auth.accessToken.value).toBe('')
    expect(mockRouterPush).toHaveBeenCalledWith('/login')
  })

  it('logout 在无 token 时应跳过吊销但仍清除并跳转', async () => {
    const auth = useAuth()
    // 确保 token 为空（beforeEach 已调用 clearTokens）

    await auth.logout()

    expect(mockAxiosPost).not.toHaveBeenCalled()
    expect(localStorage.getItem('accessToken')).toBeNull()
    expect(auth.accessToken.value).toBe('')
    expect(mockRouterPush).toHaveBeenCalledWith('/login')
  })

  it('logout 在吊销失败时仍应清除 token 并跳转', async () => {
    const auth = useAuth()
    auth.setTokens('access', 'refresh-token', 'device-id')
    mockAxiosPost.mockRejectedValue(new Error('Network Error'))

    await auth.logout()

    expect(mockAxiosPost).toHaveBeenCalled()
    expect(localStorage.getItem('accessToken')).toBeNull()
    expect(mockRouterPush).toHaveBeenCalledWith('/login')
  })
})
