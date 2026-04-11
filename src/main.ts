import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
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

const app = createApp(App)

// 注册Element Plus图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(createPinia())
app.use(router)
app.use(ElementPlus)
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

