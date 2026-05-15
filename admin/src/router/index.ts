import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import AdminLayout from '../layout/AdminLayout.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { title: '登录后台', requiresAuth: false },
    },
    {
      path: '/',
      component: AdminLayout,
      redirect: '/dashboard',
      meta: { requiresAuth: true },
      children: [
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('../views/dashboard/IndexView.vue'),
          meta: { title: '数据概览' },
        },
        {
          path: 'posts',
          name: 'posts',
          component: () => import('../views/post/IndexView.vue'),
          meta: { title: '文章管理' },
        },
        {
          path: 'categories',
          name: 'categories',
          component: () => import('../views/category/IndexView.vue'),
          meta: { title: '分类管理' },
        },
        {
          path: 'tags',
          name: 'tags',
          component: () => import('../views/tag/IndexView.vue'),
          meta: { title: '标签管理' },
        },
        {
          path: 'media',
          name: 'media',
          component: () => import('../views/media/IndexView.vue'),
          meta: { title: '素材管理' },
        },
      ],
    },
  ],
})

// 鉴权守卫
router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('accessToken')
  if (to.meta.requiresAuth !== false && !token) {
    next('/login')
  } else if (to.path === '/login' && token) {
    next('/dashboard')
  } else {
    next()
  }
})

export default router
