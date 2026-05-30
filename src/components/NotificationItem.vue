<template>
  <div
    :class="['notification-item', `notification-item--${notification.type}`]"
    role="alert"
    :aria-live="notification.type === 'error' ? 'assertive' : 'polite'"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- Icon -->
    <div class="notification-item__icon">
      <span v-if="notification.type === 'success'" class="icon-wrapper icon-success">&#10003;</span>
      <span v-else-if="notification.type === 'error'" class="icon-wrapper icon-error">&#10007;</span>
      <span v-else-if="notification.type === 'warning'" class="icon-wrapper icon-warning">&#9888;</span>
      <span v-else class="icon-wrapper icon-info">&#8505;</span>
    </div>

    <!-- Content -->
    <div class="notification-item__content">
      <div v-if="notification.title" class="notification-item__title">
        {{ notification.title }}
      </div>
      <div class="notification-item__message">
        {{ notification.message }}
      </div>

      <!-- Actions -->
      <div v-if="notification.actions.length > 0" class="notification-item__actions">
        <button
          v-for="(action, index) in notification.actions"
          :key="index"
          class="notification-item__action-btn"
          @click.stop="action.handler"
        >
          {{ action.label }}
        </button>
      </div>
    </div>

    <!-- Close button -->
    <button
      v-if="notification.closable"
      class="notification-item__close"
      aria-label="关闭通知"
      @click.stop="$emit('dismiss', notification.id)"
    >
      &#10005;
    </button>

    <!-- Progress bar (auto-dismiss) -->
    <div
      v-if="notification.duration > 0"
      class="notification-item__progress"
    >
      <div
        class="notification-item__progress-bar"
        :class="{ 'notification-item__progress-bar--paused': notification.paused }"
        :style="progressStyle"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useNotificationsStore } from '@/stores/notifications'
import type { NotificationItem as NotificationItemType } from '@/stores/notifications'

const props = defineProps<{
  notification: NotificationItemType
}>()

const emit = defineEmits<{
  dismiss: [id: string]
}>()

const notifStore = useNotificationsStore()

// ── Auto-dismiss timer ─────────────────────────────────────────────────

const elapsed = ref(0)
let intervalId: ReturnType<typeof setInterval> | null = null
let startTime = 0

function startTimer() {
  if (props.notification.duration <= 0) return
  startTime = Date.now() - elapsed.value
  intervalId = setInterval(() => {
    elapsed.value = Date.now() - startTime
    if (elapsed.value >= props.notification.duration) {
      emit('dismiss', props.notification.id)
    }
  }, 50)
}

function stopTimer() {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
}

onMounted(() => {
  startTimer()
})

onUnmounted(() => {
  stopTimer()
})

// React to paused state changes
watch(() => props.notification.paused, (paused) => {
  if (paused) {
    stopTimer()
  } else {
    startTimer()
  }
})

// ── Progress bar ───────────────────────────────────────────────────────

const progressStyle = computed(() => {
  if (props.notification.duration <= 0) return { width: '0%' }
  const pct = Math.min(100, (elapsed.value / props.notification.duration) * 100)
  return { width: `${pct}%` }
})

// ── Hover handlers ─────────────────────────────────────────────────────

function handleMouseEnter() {
  notifStore.pause(props.notification.id)
}

function handleMouseLeave() {
  notifStore.resume(props.notification.id)
}
</script>

<script lang="ts">
export default {
  name: 'NotificationItem',
}
</script>

<style scoped>
.notification-item {
  display: flex;
  align-items: flex-start;
  gap: var(--ds-space-3);
  padding: var(--ds-space-3) var(--ds-space-4);
  border-radius: 8px;
  background: var(--ds-bg-elevated);
  border: 1px solid var(--ds-surface-border);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  width: 360px;
  max-width: calc(100vw - 32px);
  position: relative;
  overflow: hidden;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.notification-item:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
}

/* Type-specific left border */
.notification-item--success {
  border-left: 3px solid var(--ds-success);
}

.notification-item--error {
  border-left: 3px solid var(--ds-danger);
}

.notification-item--warning {
  border-left: 3px solid var(--ds-warning);
}

.notification-item--info {
  border-left: 3px solid var(--ds-info);
}

/* Icon */
.notification-item__icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 13px;
  font-weight: 600;
}

.icon-success {
  background: color-mix(in srgb, var(--ds-success) 18%, transparent);
  color: var(--ds-success);
}

.icon-error {
  background: color-mix(in srgb, var(--ds-danger) 18%, transparent);
  color: var(--ds-danger);
}

.icon-warning {
  background: color-mix(in srgb, var(--ds-warning) 18%, transparent);
  color: var(--ds-warning);
}

.icon-info {
  background: color-mix(in srgb, var(--ds-info) 18%, transparent);
  color: var(--ds-info);
}

/* Content */
.notification-item__content {
  flex: 1;
  min-width: 0;
}

.notification-item__title {
  font-size: var(--ds-text-sm);
  font-weight: 600;
  color: var(--ds-text-primary);
  margin-bottom: 2px;
  line-height: 1.4;
}

.notification-item__message {
  font-size: var(--ds-text-sm);
  color: var(--ds-text-secondary);
  line-height: 1.5;
  word-break: break-word;
}

/* Actions */
.notification-item__actions {
  display: flex;
  gap: var(--ds-space-2);
  margin-top: var(--ds-space-2);
}

.notification-item__action-btn {
  padding: 2px 10px;
  border: 1px solid var(--ds-surface-border);
  border-radius: 4px;
  background: var(--ds-bg-hover);
  color: var(--ds-text-primary);
  font-size: var(--ds-text-xs);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.notification-item__action-btn:hover {
  background: var(--ds-bg-active);
  border-color: var(--ds-accent);
}

/* Close button */
.notification-item__close {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--ds-text-tertiary);
  font-size: 11px;
  cursor: pointer;
  border-radius: 3px;
  transition: color 0.15s ease, background 0.15s ease;
  margin-top: 2px;
}

.notification-item__close:hover {
  color: var(--ds-text-primary);
  background: var(--ds-bg-hover);
}

/* Progress bar */
.notification-item__progress {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: rgba(255, 255, 255, 0.04);
}

.notification-item__progress-bar {
  height: 100%;
  transition: width 0.05s linear;
  border-radius: 0 2px 2px 0;
}

.notification-item--success .notification-item__progress-bar {
  background: var(--ds-success);
}

.notification-item--error .notification-item__progress-bar {
  background: var(--ds-danger);
}

.notification-item--warning .notification-item__progress-bar {
  background: var(--ds-warning);
}

.notification-item--info .notification-item__progress-bar {
  background: var(--ds-info);
}

.notification-item__progress-bar--paused {
  animation: progress-pulse 1.5s ease-in-out infinite;
}

@keyframes progress-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
</style>
