<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMessage, type FormInst, type FormRules } from 'naive-ui'
import { useRouter } from 'vue-router'
import { isDark } from '../theme'
import { loginApi } from '../api/user'
import FpJS from '@fingerprintjs/fingerprintjs'

const message = useMessage()
const router = useRouter()
const formRef = ref<FormInst | null>(null)
const loading = ref(false)
const visitorId = ref('')
const formValue = ref({
  username: '',
  password: '',
  remember: true,
})

onMounted(async () => {
  try {
    const fp = await FpJS.load()
    const result = await fp.get()
    visitorId.value = result.visitorId
  } catch {
    visitorId.value = ''
  }
})

const rules: FormRules = {
  username: [
    { required: true, message: '请输入管理员账号', trigger: ['input', 'blur'] },
  ],
  password: [
    { required: true, message: '请输入登录密码', trigger: ['input', 'blur'] },
  ],
}

async function handleLogin() {
  try {
    await formRef.value?.validate()
    loading.value = true

    const res = await loginApi({
      username: formValue.value.username,
      password: formValue.value.password,
      fingerprint: visitorId.value,
    })

    if (res.success && res.data) {
      const { accessToken, refreshToken, deviceId } = res.data
      localStorage.setItem('accessToken', accessToken)
      localStorage.setItem('refreshToken', refreshToken)
      localStorage.setItem('deviceId', deviceId)
      message.success('登录成功')
      router.push('/')
    } else {
      message.error(res.message || '登录失败')
    }
  } catch (error) {
    message.error((error as Error).message || '登录失败')
  } finally {
    loading.value = false
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !loading.value) {
    handleLogin()
  }
}
</script>

<template>
  <main class="login-page" :class="{ 'is-dark': isDark }">
    <!-- 左侧品牌区 -->
    <aside class="login-aside">
      <div class="aside-inner">
        <!-- 顶部 Logo + 名称 -->
        <div class="brand-head">
          <div class="brand-logo" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <rect x="2" y="2" width="28" height="28" rx="8" fill="currentColor" opacity="0.15" />
              <path d="M10 22V10l6 4.5L22 10v12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </div>
          <span class="brand-name">Blog Lite</span>
        </div>

        <!-- 主标语 -->
        <h1 class="brand-title">
          管理你的<br />
          <span class="title-accent">内容世界</span>
        </h1>
        <p class="brand-desc">
          轻量博客管理后台，提供文章发布、分类管理、素材上传与数据概览等核心能力，让创作回归本质。
        </p>

        <!-- 功能卡片网格 -->
        <div class="feature-grid">
          <div class="feature-card">
            <div class="feature-icon">
              <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><path fill-rule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5zm2.25 8A.75.75 0 017.5 9.25h5a.75.75 0 010 1.5h-5A.75.75 0 016.75 10zm0 3.5a.75.75 0 01.75-.75h3a.75.75 0 010 1.5h-3a.75.75 0 01-.75-.75z" clip-rule="evenodd" /></svg>
            </div>
            <div class="feature-text">
              <strong>文章管理</strong>
              <span>Markdown 编辑，草稿与发布</span>
            </div>
          </div>

          <div class="feature-card">
            <div class="feature-icon">
              <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><path d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 10.5a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5a.75.75 0 01-.75-.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10z" /></svg>
            </div>
            <div class="feature-text">
              <strong>分类标签</strong>
              <span>灵活归类，高效检索</span>
            </div>
          </div>

          <div class="feature-card">
            <div class="feature-icon">
              <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><path fill-rule="evenodd" d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.69l-2.22-2.219a.75.75 0 00-1.06 0l-1.91 1.909-4.97-4.969a.75.75 0 00-1.06 0L2.5 11.06zm10-3.56a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z" clip-rule="evenodd" /></svg>
            </div>
            <div class="feature-text">
              <strong>素材上传</strong>
              <span>图片与文件统一管理</span>
            </div>
          </div>

          <div class="feature-card">
            <div class="feature-icon">
              <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><path d="M15.5 2A1.5 1.5 0 0014 3.5v13a1.5 1.5 0 001.5 1.5h1a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0016.5 2h-1zM9.5 6A1.5 1.5 0 008 7.5v9A1.5 1.5 0 009.5 18h1a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0010.5 6h-1zM3.5 10A1.5 1.5 0 002 11.5v5A1.5 1.5 0 003.5 18h1A1.5 1.5 0 006 16.5v-5A1.5 1.5 0 004.5 10h-1z" /></svg>
            </div>
            <div class="feature-text">
              <strong>数据概览</strong>
              <span>访问量与运营数据看板</span>
            </div>
          </div>
        </div>

        <!-- 底部技术栈标签 -->
        <div class="tech-tags">
          <span class="tech-tag">NestJS</span>
          <span class="tech-tag">Vue 3</span>
          <span class="tech-tag">Naive UI</span>
          <span class="tech-tag">TypeORM</span>
        </div>
      </div>
    </aside>

    <!-- 右侧表单区 -->
    <section class="login-main">
      <div class="login-card">
        <div class="card-header">
          <div>
            <p class="card-eyebrow">Welcome back</p>
            <h2 class="card-title">登录管理后台</h2>
          </div>
          <n-switch v-model:value="isDark" size="small" aria-label="切换深色模式">
            <template #checked>
              <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M7.455 2.004a.75.75 0 01.26.77 7 7 0 009.958 7.967.75.75 0 011.067.853A8.5 8.5 0 116.647 1.921a.75.75 0 01.808.083z" clip-rule="evenodd" /></svg>
            </template>
            <template #unchecked>
              <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zM10 7a3 3 0 100 6 3 3 0 000-6zM15.657 5.404a.75.75 0 10-1.06-1.06l-1.061 1.06a.75.75 0 001.06 1.06l1.06-1.06zM6.464 14.596a.75.75 0 10-1.06-1.06l-1.06 1.06a.75.75 0 001.06 1.06l1.06-1.06zM18 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 0118 10zM5 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 015 10zM14.596 15.657a.75.75 0 001.06-1.06l-1.06-1.061a.75.75 0 10-1.06 1.06l1.06 1.06zM5.404 6.464a.75.75 0 001.06-1.06l-1.06-1.06a.75.75 0 10-1.061 1.06l1.06 1.06z" /></svg>
            </template>
          </n-switch>
        </div>

        <n-form
          ref="formRef"
          :model="formValue"
          :rules="rules"
          size="large"
          label-placement="top"
          class="login-form"
          @keydown="handleKeydown"
        >
          <n-form-item label="管理员账号" path="username">
            <n-input
              v-model:value="formValue.username"
              placeholder="请输入账号"
              autocomplete="username"
              clearable
            />
          </n-form-item>

          <n-form-item label="登录密码" path="password">
            <n-input
              v-model:value="formValue.password"
              type="password"
              placeholder="请输入密码"
              autocomplete="current-password"
              show-password-on="click"
            />
          </n-form-item>

          <div class="form-actions">
            <n-checkbox v-model:checked="formValue.remember">记住登录状态</n-checkbox>
            <n-button text type="primary" class="forgot-btn">忘记密码？</n-button>
          </div>

          <n-button
            block
            type="primary"
            size="large"
            :loading="loading"
            class="submit-btn"
            @click="handleLogin"
          >
            登录
          </n-button>
        </n-form>

      </div>
    </section>
  </main>
</template>
