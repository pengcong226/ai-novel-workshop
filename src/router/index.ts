import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
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
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

// 全局前置守卫：动态设置页面标题
router.beforeEach((to, _from, next) => {
  const title = to.meta.title as string | undefined
  document.title = title ? `${title} - AI小说工坊` : 'AI小说工坊'
  next()
})

export default router
