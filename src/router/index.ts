import { createRouter, createWebHashHistory } from 'vue-router'
import { projectExistsGuard, resolvePageTitle } from './guards'
import { trackPageView } from '@/utils/analytics'

const router = createRouter({
  history: createWebHashHistory(),
  scrollBehavior(to, _from, savedPosition) {
    // Restore scroll position on back/forward navigation
    if (savedPosition) {
      return savedPosition
    }
    // Scroll to top on new navigations (unless hash is present)
    if (to.hash) {
      return { el: to.hash, behavior: 'smooth' }
    }
    return { top: 0, behavior: 'smooth' }
  },
  routes: [
    {
      path: '/',
      redirect: '/projects',
    },
    {
      path: '/projects',
      name: 'ProjectList',
      component: () => import(/* webpackChunkName: "projects" */ '@/views/ProjectList.vue'),
      meta: {
        title: '我的作品',
        breadcrumb: '我的作品',
        transition: 'fade-slide',
      },
    },
    {
      path: '/project/:id',
      name: 'ProjectEditor',
      component: () => import(/* webpackChunkName: "editor" */ '@/views/ProjectEditor.vue'),
      meta: {
        title: '编辑作品',
        breadcrumb: '编辑作品',
        transition: 'fade-slide',
        requiresProject: true,
      },
    },
    {
      path: '/not-found',
      name: 'NotFound',
      component: () => import(/* webpackChunkName: "not-found" */ '@/views/NotFound.vue'),
      meta: {
        title: '页面未找到',
        breadcrumb: '404',
        transition: 'fade',
      },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/not-found',
    },
  ],
})

// Guard: project existence validation
router.beforeEach(projectExistsGuard)

// Guard: dynamic page title
router.beforeEach((to) => {
  document.title = resolvePageTitle(to)
})

// Analytics: track page views
router.afterEach((to) => {
  trackPageView(to.name?.toString() || to.path)
})

// Preload likely next routes on idle
if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
  window.requestIdleCallback(() => {
    // After initial page is loaded, preload the editor chunk
    // since users typically navigate ProjectList -> ProjectEditor
    import(/* webpackPrefetch: true */ '@/views/ProjectEditor.vue')
  })
}

export default router
