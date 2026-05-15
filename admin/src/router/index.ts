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
          path: 'posts/create',
          name: 'post-create',
          component: () => import('../views/post/PostEditView.vue'),
          meta: { title: '新建文章' },
        },
        {
          path: 'posts/:id/edit',
          name: 'post-edit',
          component: () => import('../views/post/PostEditView.vue'),
          meta: { title: '编辑文章' },
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
        {
          path: 'users',
          name: 'users',
          component: () => import('../views/user/IndexView.vue'),
          meta: { title: '用户管理' },
        },
        {
          path: 'roles',
          name: 'roles',
          component: () => import('../views/role/IndexView.vue'),
          meta: { title: '角色管理' },
        },
      ],
    },
  ],
})

// 鉴权守卫
router.beforeEach((to) => {
  const token = localStorage.getItem('accessToken')
  if (to.meta.requiresAuth !== false && !token) {
    return '/login'
  }
  if (to.path === '/login' && token) {
    return '/dashboard'
  }
})

export default router
