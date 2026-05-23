import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', component: () => import('../views/Home.vue') },
  { path: '/login', component: () => import('../views/Login.vue') },
  { path: '/register', component: () => import('../views/Register.vue') },
  { path: '/works', component: () => import('../views/Works.vue'), meta: { auth: true } },
  { path: '/works/:id', component: () => import('../views/WorkDetail.vue'), meta: { auth: true } },
  { path: '/works/:id/read/:chapter', component: () => import('../views/Reader.vue'), meta: { auth: true } },
  { path: '/branches/:id', component: () => import('../views/BranchRead.vue'), meta: { auth: true } },
  { path: '/create/:workId', component: () => import('../views/CreateBranch.vue'), meta: { auth: true } },
  { path: '/settings', component: () => import('../views/Settings.vue'), meta: { auth: true } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const token = localStorage.getItem('token')
  if (to.meta.auth && !token) {
    return '/login'
  }
})

export default router
