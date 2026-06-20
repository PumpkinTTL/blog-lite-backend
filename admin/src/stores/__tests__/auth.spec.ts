import { describe, it, expect, vi, beforeEach } from 'vitest'

// 使用 vi.hoisted 创建可在 mock 工厂和测试体中共享的变量
const mockRouterPush = vi.hoisted(() => vi.fn())
const mockLogoutApi = vi.hoisted(() => vi.fn())
const mockGetProfileApi = vi.hoisted(() => vi.fn())

// jsdom 环境下 localStorage/sessionStorage 在模块加载时可能不可用，手动 mock
vi.hoisted(() => {
  const makeStorage = () => {
    const store: Record<string, string> = {}
    return {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value },
      removeItem: (key: string) => { delete store[key] },
      clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
      key: (i: number) => Object.keys(store)[i] ?? null,
      get length() { return Object.keys(store).length },
    } as Storage
  }
  globalThis.localStorage = makeStorage()
  globalThis.sessionStorage = makeStorage()
})

vi.mock('vue-router', () => ({
  useRouter: vi.fn(() => ({
    push: mockRouterPush,
  })),
}))

// mock logoutApi + getProfileApi（不再直连鉴权中心，走后端 /user/*）
vi.mock('../../api/user', () => ({
  logoutApi: mockLogoutApi,
  getProfileApi: mockGetProfileApi,
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
    mockLogoutApi.mockResolvedValue({ data: {} })

    await auth.logout()

    // 调用后端 logoutApi（传 refreshToken），由后端负责吊销鉴权中心 token
    expect(mockLogoutApi).toHaveBeenCalledWith('refresh-token')
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

    expect(mockLogoutApi).not.toHaveBeenCalled()
    expect(localStorage.getItem('accessToken')).toBeNull()
    expect(auth.accessToken.value).toBe('')
    expect(mockRouterPush).toHaveBeenCalledWith('/login')
  })

  it('logout 在吊销失败时仍应清除 token 并跳转', async () => {
    const auth = useAuth()
    auth.setTokens('access', 'refresh-token', 'device-id')
    mockLogoutApi.mockRejectedValue(new Error('Network Error'))

    await auth.logout()

    expect(mockLogoutApi).toHaveBeenCalled()
    expect(localStorage.getItem('accessToken')).toBeNull()
    expect(mockRouterPush).toHaveBeenCalledWith('/login')
  })

  it('fetchUserInfo 拉取成功后应持久化用户信息', async () => {
    const auth = useAuth()
    mockGetProfileApi.mockResolvedValue({
      success: true,
      data: {
        id: 1,
        username: 'admin',
        nickname: '管理员',
        avatar: 'https://example.com/a.png',
        email: 'a@b.com',
        roles: [{ name: 'admin' }],
      },
      message: 'ok',
    })

    await auth.fetchUserInfo(true)

    expect(mockGetProfileApi).toHaveBeenCalled()
    expect(auth.userInfo.value).not.toBeNull()
    expect(auth.userInfo.value?.nickname).toBe('管理员')
    expect(auth.userInfo.value?.avatar).toBe('https://example.com/a.png')
    expect(auth.userInfo.value?.roles).toEqual(['admin'])
    // 持久化到 localStorage（remember=true）
    expect(localStorage.getItem('userInfo')).toContain('管理员')
  })

  it('fetchUserInfo 拉取失败时不抛错，userInfo 仍为 null', async () => {
    const auth = useAuth()
    mockGetProfileApi.mockRejectedValue(new Error('Network Error'))

    await expect(auth.fetchUserInfo(true)).resolves.toBeUndefined()
    expect(auth.userInfo.value).toBeNull()
  })

  it('displayName 优先昵称，无昵称兜底用户名，再兜底 Admin', async () => {
    const auth = useAuth()

    // 无 userInfo → Admin
    expect(auth.displayName.value).toBe('Admin')

    // 有昵称 → 昵称
    auth.setTokens('a', 'b', 'c')
    // 直接通过 tokenState 写入 userInfo
    const { persistUserInfo } = await import('../tokenState')
    persistUserInfo(
      { id: 1, username: 'admin', nickname: '管理员', avatar: null, email: null, roles: [] },
      true,
    )
    expect(auth.displayName.value).toBe('管理员')
  })
})
