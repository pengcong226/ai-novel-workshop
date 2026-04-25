<template>
  <div class="app-container">
    <div v-if="onlineStatus.isOffline.value" class="offline-banner" role="status">
      当前处于离线状态，AI 生成与同步功能可能不可用。
    </div>

    <!-- 全局错误提示 -->
    <el-config-provider :locale="zhCn">
      <router-view />
      <OnboardingDialog />
    </el-config-provider>

    <!-- 全局任务观察器 -->
    <GlobalTaskObserver />

    <!-- 核弹级全局替换器 -->
    <GlobalMutator ref="globalMutatorRef" />

    <!-- 全局错误通知 -->
    <el-notification
      v-if="currentError"
      :title="errorTitle"
      :message="errorMessage"
      :type="errorType"
      :duration="errorDuration"
      @close="clearError"
    />

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElConfigProvider, ElNotification } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { setupGlobalErrorHandler, errorHandler, ErrorSeverity, type AppError } from '@/utils/errorHandler'
import GlobalTaskObserver from '@/components/GlobalTaskObserver.vue'
import GlobalMutator from '@/components/GlobalMutator.vue'
import OnboardingDialog from '@/components/OnboardingDialog.vue'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useOnboarding } from '@/composables/useOnboarding'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { getLogger } from '@/utils/logger'
const logger = getLogger('src:App')

const currentError = ref<AppError | null>(null)
const globalMutatorRef = ref<InstanceType<typeof GlobalMutator> | null>(null)
const { registerShortcuts } = useKeyboardShortcuts()
const onboarding = useOnboarding()
const onlineStatus = useOnlineStatus()

registerShortcuts([
  {
    id: 'global.open-mutator',
    label: '打开全局替换器',
    keys: ['ctrl', 'shift', 'h'],
    scope: 'global',
    handler: () => globalMutatorRef.value?.open(),
  },
])

const errorTitle = computed(() => {
  if (!currentError.value) return ''

  const severityTitles = {
    [ErrorSeverity.LOW]: '提示',
    [ErrorSeverity.MEDIUM]: '错误',
    [ErrorSeverity.HIGH]: '严重错误',
    [ErrorSeverity.CRITICAL]: '致命错误'
  }

  return severityTitles[currentError.value.severity]
})

const errorMessage = computed(() => {
  if (!currentError.value) return ''

  const error = currentError.value
  let message = error.message

  if (error.userAction) {
    message = `[${error.userAction}] ${message}`
  }

  return message
})

const errorType = computed(() => {
  if (!currentError.value) return 'info'

  const severityTypes = {
    [ErrorSeverity.LOW]: 'info',
    [ErrorSeverity.MEDIUM]: 'warning',
    [ErrorSeverity.HIGH]: 'error',
    [ErrorSeverity.CRITICAL]: 'error'
  }

  return severityTypes[currentError.value.severity]
})

const errorDuration = computed(() => {
  if (!currentError.value) return 3000

  const severityDurations = {
    [ErrorSeverity.LOW]: 3000,
    [ErrorSeverity.MEDIUM]: 5000,
    [ErrorSeverity.HIGH]: 8000,
    [ErrorSeverity.CRITICAL]: 0 // 不自动关闭
  }

  return severityDurations[currentError.value.severity]
})

function clearError() {
  currentError.value = null
}

function handleError(error: AppError) {
  currentError.value = error

  // 严重错误显示更详细的信息
  if (error.severity === ErrorSeverity.HIGH || error.severity === ErrorSeverity.CRITICAL) {
    console.group('🔴 应用错误详情')
    logger.error('错误ID:', error.id)
    logger.error('错误类别:', error.category)
    logger.error('错误消息:', error.message)
    if (error.context) {
      logger.error('错误上下文:', error.context)
    }
    if (error.stack) {
      logger.error('错误堆栈:', error.stack)
    }
    console.groupEnd()
  }
}


let unsubscribeErrorHandler: (() => void) | undefined

onMounted(async () => {
  // 设置全局错误处理器
  setupGlobalErrorHandler()
  onboarding.initialize()

  // 注册错误监听器
  unsubscribeErrorHandler = errorHandler.onError(handleError)
})

onUnmounted(() => {
  unsubscribeErrorHandler?.()
})
</script>

<style>
html, body, #app, .app-container {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.offline-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10000;
  padding: var(--ds-space-2) var(--ds-space-4);
  background: color-mix(in srgb, var(--ds-warning) 14%, var(--ds-bg-elevated));
  color: var(--ds-warning);
  border-bottom: 1px solid color-mix(in srgb, var(--ds-warning) 24%, transparent);
  text-align: center;
  font-size: var(--ds-text-base);
}

.error-boundary {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  padding: var(--ds-space-10);
  text-align: center;
  background: var(--ds-bg-primary);
  color: var(--ds-text-primary);
}

.error-icon {
  font-size: 64px;
  margin-bottom: var(--ds-space-6);
}

.error-title {
  font-size: var(--ds-text-xl);
  font-weight: 600;
  margin-bottom: var(--ds-space-4);
  color: var(--ds-text-primary);
}

.error-message {
  font-size: var(--ds-text-base);
  color: var(--ds-text-secondary);
  margin-bottom: var(--ds-space-6);
  max-width: 600px;
}

.error-actions {
  display: flex;
  gap: var(--ds-space-3);
}
</style>
