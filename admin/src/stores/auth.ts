import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { logoutApi, getProfileApi } from '../api/user'
import {
  accessToken,
  refreshToken,
  deviceId,
  userInfo,
  persistTokens,
  persistUserInfo,
  clearTokens,
} from './tokenState'

export function useAuth() {
  const router = useRouter()
  const isLoggedIn = computed(() => !!accessToken.value)
  // 显示名优先昵称 → 用户名 → 兜底
  const displayName = computed(
    () => userInfo.value?.nickname || userInfo.value?.username || 'Admin',
  )
  const displayAvatar = computed(() => userInfo.value?.avatar || '')

  /**
   * 登录成功后调用：同步更新 store ref + 按策略写入 storage。
   * @param remember true=localStorage（持久化），false=sessionStorage（关浏览器即失效）
   */
  function setTokens(access: string, refresh: string, device: string, remember = true) {
    persistTokens(access, refresh, device, remember)
  }

  /**
   * 拉取当前登录用户信息并持久化。登录成功后调用一次。
   * 失败不阻断登录流程（token 已拿到，userInfo 可后续懒加载）。
   */
  async function fetchUserInfo(remember = true) {
    try {
      const res = await getProfileApi()
      if (res.success && res.data) {
        const u = res.data
        persistUserInfo(
          {
            id: u.id,
            username: u.username,
            nickname: u.nickname,
            avatar: u.avatar,
            email: u.email,
            roles: (u.roles || []).map((r: any) => r.name),
          },
          remember,
        )
      }
    } catch {
      // 拉取失败不阻断，UI 会兜底显示 'Admin'
    }
  }

  async function logout() {
    try {
      // 调后端登出，由后端调鉴权中心吊销 refreshToken（避免前端跨域直连鉴权中心）
      if (refreshToken.value) {
        await logoutApi(refreshToken.value)
      }
    } catch {
      // 即使吊销失败也要清本地
    } finally {
      clearTokens()
      router.push('/login')
    }
  }

  return {
    accessToken,
    refreshToken,
    deviceId,
    userInfo,
    isLoggedIn,
    displayName,
    displayAvatar,
    setTokens,
    fetchUserInfo,
    clearTokens,
    logout,
  }
}
