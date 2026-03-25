import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/projects'
    },
    {
      path: '/projects',
      name: 'ProjectList',
      component: () => import('@/views/ProjectList.vue'),
      meta: { title: '我的作品' }
    },
    {
      path: '/project/:id',
      name: 'ProjectEditor',
      component: () => import('@/views/ProjectEditor.vue'),
      meta: { title: '编辑作品' }
    }
  ]
})

export default router
