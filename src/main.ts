import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { storeLoggingMiddleware, storeDevtoolsPlugin } from './stores/middleware'
import 'element-plus/theme-chalk/dark/css-vars.css'
import '@/assets/styles/design-system.css'
import '@/styles/utilities.scss'
import '@/styles/animations.scss'
import VueKonva from 'vue-konva'

// ECharts 配置
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, PieChart, LineChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
} from 'echarts/components'

// 注册 ECharts 组件
use([
  CanvasRenderer,
  BarChart,
  PieChart,
  LineChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
])

import App from './App.vue'
import router from './router'
import { initializePluginSystem } from './plugins/setup'
import { getLogger, initLogger } from './utils/logger'
import i18n from './i18n'
import { errorHandler, ErrorSeverity, ErrorCategory } from './utils/errorHandler'
import { initAnalytics } from './utils/analytics'

// 屏蔽浏览器偶发的 ResizeObserver 无害错误（常见于复杂表格/图表布局）
const RESIZE_OBSERVER_BENIGN_ERROR = 'ResizeObserver loop completed with undelivered notifications.'

window.addEventListener('error', (event) => {
  if (event.message === RESIZE_OBSERVER_BENIGN_ERROR) {
    event.stopImmediatePropagation()
    event.preventDefault()
  }
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  const message =
    typeof reason === 'string'
      ? reason
      : reason && typeof reason === 'object' && 'message' in reason
        ? String((reason as { message?: any }).message ?? '')
        : ''

  if (message.includes(RESIZE_OBSERVER_BENIGN_ERROR)) {
    event.preventDefault()
  }
})

const loggerManager = initLogger({
  enabled: true,
  level: import.meta.env.DEV ? 'debug' : 'warn',
  namespaces: import.meta.env.DEV ? ['*'] : ['app:*', 'project:*', 'ai:*'],
  maxBuffer: 2000,
  persist: true
})

const appLogger = getLogger('app:bootstrap')
appLogger.info('日志系统初始化完成', loggerManager.getConfig())

// 初始化隐私优先的本地分析
initAnalytics()

const app = createApp(App)

// Vue 全局错误处理器：捕获未被 onErrorCaptured 处理的组件渲染/观察者错误
app.config.errorHandler = (err, instance, info) => {
  const componentName = instance?.$options?.name || instance?.$?.type?.name || '未知组件'
  appLogger.error(`[Vue 全局错误] 组件: ${componentName}, info: ${info}`, err)

  // 将错误转发到统一错误处理器
  errorHandler.handleError(err instanceof Error ? err : new Error(String(err)), {
    severity: ErrorSeverity.HIGH,
    category: ErrorCategory.RUNTIME,
    context: { componentName, info },
    userAction: `Vue 渲染 (${componentName})`,
  })
}

const pinia = createPinia()
pinia.use(storeLoggingMiddleware)
pinia.use(storeDevtoolsPlugin)
app.use(pinia)
app.use(router)
app.use(i18n)
app.use(VueKonva)

// 挂载应用
app.mount('#app')

// 初始化插件系统
initializePluginSystem()
  .then(() => {
    appLogger.info('应用启动完成')

    // V5: Theme loading race condition fix
    // Wait until all plugins are initialized before applying the theme
    // This avoids FOUC and race conditions.
    import('./stores/theme').then(module => {
      const themeStore = module.useThemeStore()
      themeStore.applyTheme()
    })
  })
  .catch(error => {
    appLogger.error('插件系统初始化失败', error)
  })

