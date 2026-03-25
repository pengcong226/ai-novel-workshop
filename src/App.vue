<template>
  <div class="app-container">
    <!-- 全局错误提示 -->
    <el-config-provider :locale="zhCn">
      <router-view />
    </el-config-provider>

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
const currentError = ref<AppError | null>(null)

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
    console.error('错误ID:', error.id)
    console.error('错误类别:', error.category)
    console.error('错误消息:', error.message)
    if (error.context) {
      console.error('错误上下文:', error.context)
    }
    if (error.stack) {
      console.error('错误堆栈:', error.stack)
    }
    console.groupEnd()
  }
}

onMounted(() => {
  // 设置全局错误处理器
  setupGlobalErrorHandler()

  // 注册错误监听器
  const unsubscribe = errorHandler.onError(handleError)

  onUnmounted(() => {
    unsubscribe()
  })
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app, .app-container {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial,
    'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol',
    'Noto Color Emoji';
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: #f5f7fa;
}

/* 全局错误样式 */
.error-boundary {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  padding: 40px;
  text-align: center;
}

.error-icon {
  font-size: 64px;
  margin-bottom: 24px;
}

.error-title {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 16px;
  color: #303133;
}

.error-message {
  font-size: 14px;
  color: #606266;
  margin-bottom: 24px;
  max-width: 600px;
}

.error-actions {
  display: flex;
  gap: 12px;
}
</style>
