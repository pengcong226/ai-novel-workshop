<template>
  <div v-if="hasError" class="error-boundary-fallback" role="alert" aria-live="assertive">
    <div class="error-boundary-icon" aria-hidden="true">!</div>
    <div class="error-boundary-title">{{ title || '组件渲染出错' }}</div>
    <div class="error-boundary-message">{{ errorMessage }}</div>
    <el-button v-if="showRetry" size="small" type="primary" @click="handleRetry">
      重试
    </el-button>
    <el-button v-if="showDetail" size="small" text @click="showDetailExpanded = !showDetailExpanded">
      {{ showDetailExpanded ? '收起详情' : '查看详情' }}
    </el-button>
    <pre v-if="showDetail && showDetailExpanded" class="error-boundary-detail">{{ errorDetail }}</pre>
  </div>
  <slot v-else />
</template>

<script setup lang="ts">
import { ref, onErrorCaptured, provide } from 'vue'
import { getLogger } from '@/utils/logger'

const props = defineProps<{
  /** 组件名称（用于日志） */
  name?: string
  /** 自定义标题 */
  title?: string
  /** 是否显示重试按钮 */
  showRetry?: boolean
  /** 是否显示详情展开按钮 */
  showDetail?: boolean
}>()

const logger = getLogger(`ErrorBoundary:${props.name || 'unknown'}`)

const hasError = ref(false)
const errorMessage = ref('')
const errorDetail = ref('')
const showDetailExpanded = ref(false)

onErrorCaptured((err: Error, instance, info: string) => {
  hasError.value = true
  errorMessage.value = err.message || '未知错误'
  errorDetail.value = `${err.stack || err.message}\n\nComponent: ${info}`
  showDetailExpanded.value = false

  logger.error(`[ErrorBoundary] ${props.name || '组件'} 捕获错误:`, {
    message: err.message,
    info,
    stack: err.stack,
  })

  // 阻止错误继续向上传播
  return false
})

function handleRetry() {
  hasError.value = false
  errorMessage.value = ''
  errorDetail.value = ''
  showDetailExpanded.value = false
  logger.info(`[ErrorBoundary] ${props.name || '组件'} 用户触发重试`)
}

// 向子组件提供错误报告能力
provide('errorBoundary', {
  reportError: (err: Error) => {
    hasError.value = true
    errorMessage.value = err.message || '未知错误'
    errorDetail.value = err.stack || err.message
  },
})
</script>

<style scoped>
.error-boundary-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  min-height: 120px;
  background: var(--el-fill-color-lighter, #fafafa);
  border: 1px dashed var(--el-border-color, #dcdfe6);
  border-radius: 8px;
  text-align: center;
  gap: 8px;
}

.error-boundary-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--el-color-danger-light-9, #fef0f0);
  color: var(--el-color-danger, #f56c6c);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
}

.error-boundary-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary, #303133);
}

.error-boundary-message {
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
  max-width: 400px;
  word-break: break-word;
}

.error-boundary-detail {
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--el-fill-color-dark, #e6e8eb);
  border-radius: 4px;
  font-size: 11px;
  color: var(--el-text-color-regular, #606266);
  text-align: left;
  max-height: 200px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  max-width: 500px;
}
</style>
