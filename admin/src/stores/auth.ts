import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

const AUTH_CENTER_URL = 'https://auth.bitle.cc.cd'

const accessToken = ref(localStorage.getItem('accessToken') || '')
const refreshToken = ref(localStorage.getItem('refreshToken') || '')
const deviceId = ref(localStorage.getItem('deviceId') || '')

export function useAuth() {
  const router = useRouter()
  const isLoggedIn = computed(() => !!accessToken.value)

  function setTokens(access: string, refresh: string, device: string) {
    accessToken.value = access
    refreshToken.value = refresh
    deviceId.value = device
    localStorage.setItem('accessToken', access)
    localStorage.setItem('refreshToken', refresh)
    localStorage.setItem('deviceId', device)
  }

  function clearTokens() {
    accessToken.value = ''
    refreshToken.value = ''
    deviceId.value = ''
    // LoginView 根据是否「记住登录」将 token 写入 localStorage 或 sessionStorage，
    // 登出时必须同时清两种 storage，否则未勾选记住的用户 token 仍残留。
    ;['accessToken', 'refreshToken', 'deviceId'].forEach((key) => {
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
    })
  }

  async function logout() {
    try {
      if (refreshToken.value && deviceId.value) {
        await axios.post(`${AUTH_CENTER_URL}/auth/revoke`, {
          refreshToken: refreshToken.value,
          deviceId: deviceId.value,
        })
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
    isLoggedIn,
    setTokens,
    clearTokens,
    logout,
  }
}
