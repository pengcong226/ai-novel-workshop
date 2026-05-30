<template>
  <Teleport to="body">
    <div v-if="isOpen" class="app-tour-overlay" @click.self="handleOverlayClick">
      <!-- 高亮区域 -->
      <div
        v-if="targetRect"
        class="app-tour-highlight"
        :style="highlightStyle"
      />
      <!-- 步骤卡片 -->
      <div
        v-if="targetRect && currentStep"
        class="app-tour-card"
        :style="cardStyle"
      >
        <div class="app-tour-card-header">
          <div class="app-tour-card-title">
            <component v-if="currentStep.icon" :is="currentStep.icon" />
            <span>{{ currentStep.title }}</span>
          </div>
          <button class="app-tour-close" @click="handleClose" aria-label="关闭引导">
            <el-icon><Close /></el-icon>
          </button>
        </div>
        <div class="app-tour-card-body">
          {{ currentStep.description }}
        </div>
        <div class="app-tour-card-footer">
          <span class="app-tour-progress">{{ currentIndex + 1 }} / {{ steps.length }}</span>
          <div class="app-tour-actions">
            <el-button v-if="currentIndex > 0" size="small" @click="prevStep">上一步</el-button>
            <el-button v-if="currentIndex < steps.length - 1" size="small" @click="handleSkip">跳过</el-button>
            <el-button
              v-if="currentIndex < steps.length - 1"
              type="primary"
              size="small"
              @click="nextStep"
            >
              下一步
            </el-button>
            <el-button
              v-else
              type="primary"
              size="small"
              @click="handleFinish"
            >
              完成
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Close } from '@element-plus/icons-vue'
import { getLogger } from '@/utils/logger'

const logger = getLogger('AppTour')

export interface TourStep {
  target: string | Ref<HTMLElement | undefined>
  title: string
  description: string
  icon?: any // VNode or component
}

type Ref<T> = { value: T }

const props = defineProps<{
  modelValue: boolean
  steps: TourStep[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'finish'): void
  (e: 'close'): void
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const currentIndex = ref(0)
const targetRect = ref<DOMRect | null>(null)

const currentStep = computed(() => props.steps[currentIndex.value] || null)

// 解析 target 为 DOM 元素
function resolveTarget(step: TourStep): HTMLElement | null {
  if (!step) return null
  const t = step.target
  if (typeof t === 'string') {
    return document.querySelector(t)
  }
  if (t && typeof t === 'object' && 'value' in t) {
    return (t as { value: HTMLElement | undefined }).value || null
  }
  return null
}

// 更新目标元素位置
function updateTargetRect() {
  const step = currentStep.value
  if (!step) {
    targetRect.value = null
    return
  }
  const el = resolveTarget(step)
  if (el) {
    targetRect.value = el.getBoundingClientRect()
    // 滚动目标元素到可视区域
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
  } else {
    targetRect.value = null
    logger.warn('[AppTour] 目标元素未找到:', typeof step.target === 'string' ? step.target : '[ref]')
  }
}

// 高亮区域样式
const highlightStyle = computed(() => {
  if (!targetRect.value) return {}
  const r = targetRect.value
  const pad = 6
  return {
    top: `${r.top - pad}px`,
    left: `${r.left - pad}px`,
    width: `${r.width + pad * 2}px`,
    height: `${r.height + pad * 2}px`,
  }
})

// 卡片位置：默认显示在目标下方，空间不足则显示在上方
const cardStyle = computed(() => {
  if (!targetRect.value) return {}
  const r = targetRect.value
  const gap = 12
  const cardWidth = 340
  const viewportH = window.innerHeight

  // 优先下方
  let top = r.bottom + gap
  if (top + 200 > viewportH) {
    // 空间不足，放上方
    top = Math.max(gap, r.top - gap - 160)
  }

  // 水平居中，但不超出视口
  let left = r.left + r.width / 2 - cardWidth / 2
  left = Math.max(gap, Math.min(left, window.innerWidth - cardWidth - gap))

  return {
    top: `${top}px`,
    left: `${left}px`,
    width: `${cardWidth}px`,
  }
})

// 步骤切换
function nextStep() {
  if (currentIndex.value < props.steps.length - 1) {
    currentIndex.value++
    nextTick(updateTargetRect)
  }
}

function prevStep() {
  if (currentIndex.value > 0) {
    currentIndex.value--
    nextTick(updateTargetRect)
  }
}

function handleFinish() {
  isOpen.value = false
  emit('finish')
}

function handleClose() {
  isOpen.value = false
  emit('close')
}

function handleSkip() {
  isOpen.value = false
  emit('close')
}

function handleOverlayClick() {
  // 点击遮罩层关闭
  handleClose()
}

// 键盘事件
function handleKeydown(e: KeyboardEvent) {
  if (!isOpen.value) return
  if (e.key === 'Escape') handleClose()
  if (e.key === 'ArrowRight' || e.key === 'Enter') nextStep()
  if (e.key === 'ArrowLeft') prevStep()
}

// 监听打开/关闭
watch(() => props.modelValue, (val) => {
  if (val) {
    currentIndex.value = 0
    nextTick(updateTargetRect)
  }
})

// 监听步骤变化更新位置
watch(currentIndex, () => {
  nextTick(updateTargetRect)
})

// 窗口 resize 时更新位置
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', updateTargetRect)
  window.addEventListener('scroll', updateTargetRect, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', updateTargetRect)
  window.removeEventListener('scroll', updateTargetRect, true)
  ;(resizeObserver as ResizeObserver | null)?.disconnect()
})
</script>

<style scoped>
.app-tour-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 9999;
  pointer-events: auto;
  background: rgba(0, 0, 0, 0.45);
}

.app-tour-highlight {
  position: fixed;
  border-radius: 6px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
  z-index: 10000;
  pointer-events: none;
  transition: all 0.3s ease;
}

.app-tour-card {
  position: fixed;
  z-index: 10001;
  background: var(--el-bg-color, #ffffff);
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  overflow: hidden;
  animation: tour-card-in 0.25s ease-out;
}

@keyframes tour-card-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.app-tour-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px 8px;
}

.app-tour-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 15px;
  color: var(--el-text-color-primary);
}

.app-tour-icon {
  display: inline-flex;
  align-items: center;
}

.app-tour-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--el-text-color-secondary);
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
}

.app-tour-close:hover {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
}

.app-tour-card-body {
  padding: 0 16px 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}

.app-tour-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-blank);
}

.app-tour-progress {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.app-tour-actions {
  display: flex;
  gap: 6px;
}
</style>
