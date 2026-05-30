<template>
  <Teleport to="body">
    <div
      :class="['notification-container', `notification-container--${position}`]"
      aria-label="通知区域"
      role="region"
    >
      <!-- Dismiss all button -->
      <Transition name="notif-fade">
        <button
          v-if="store.visibleNotifications.length > 1"
          class="notification-container__dismiss-all"
          @click="store.dismissAll()"
        >
          全部关闭
        </button>
      </Transition>

      <!-- Notification list with transition group -->
      <TransitionGroup
        :name="transitionName"
        tag="div"
        class="notification-container__list"
      >
        <NotificationItem
          v-for="item in store.visibleNotifications"
          :key="item.id"
          :notification="item"
          @dismiss="store.dismiss"
        />
      </TransitionGroup>

      <!-- Overflow indicator -->
      <Transition name="notif-fade">
        <div v-if="store.hasOverflow" class="notification-container__overflow">
          还有 {{ store.overflowCount }} 条通知
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useNotificationsStore } from '@/stores/notifications'
import NotificationItem from './NotificationItem.vue'

const store = useNotificationsStore()

const position = computed(() => store.position)

const transitionName = computed(() => {
  const pos = store.position
  if (pos.includes('left')) return 'notif-slide-left'
  if (pos.includes('right')) return 'notif-slide-right'
  return 'notif-slide-down'
})
</script>

<script lang="ts">
export default {
  name: 'NotificationContainer',
}
</script>

<style scoped>
.notification-container {
  position: fixed;
  z-index: var(--ds-z-modal, 2000);
  display: flex;
  flex-direction: column;
  pointer-events: none;
}

.notification-container > * {
  pointer-events: auto;
}

/* Position variants */
.notification-container--top-right {
  top: var(--ds-space-4);
  right: var(--ds-space-4);
  align-items: flex-end;
}

.notification-container--top-left {
  top: var(--ds-space-4);
  left: var(--ds-space-4);
  align-items: flex-start;
}

.notification-container--bottom-right {
  bottom: var(--ds-space-4);
  right: var(--ds-space-4);
  align-items: flex-end;
  flex-direction: column-reverse;
}

.notification-container--bottom-left {
  bottom: var(--ds-space-4);
  left: var(--ds-space-4);
  align-items: flex-start;
  flex-direction: column-reverse;
}

.notification-container--top-center {
  top: var(--ds-space-4);
  left: 50%;
  transform: translateX(-50%);
  align-items: center;
}

.notification-container__list {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-2);
}

.notification-container--bottom-right .notification-container__list,
.notification-container--bottom-left .notification-container__list {
  flex-direction: column-reverse;
}

.notification-container__dismiss-all {
  align-self: flex-end;
  padding: 4px 12px;
  margin-bottom: var(--ds-space-2);
  border: 1px solid var(--ds-surface-border);
  border-radius: 4px;
  background: var(--ds-bg-elevated);
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-xs);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.notification-container__dismiss-all:hover {
  background: var(--ds-bg-hover);
  color: var(--ds-text-primary);
}

.notification-container__overflow {
  padding: var(--ds-space-2) var(--ds-space-3);
  margin-top: var(--ds-space-1);
  font-size: var(--ds-text-xs);
  color: var(--ds-text-tertiary);
  text-align: center;
}

/* ── Transitions ────────────────────────────────────────────────────── */

/* Slide from right */
.notif-slide-right-enter-active,
.notif-slide-right-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.notif-slide-right-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.notif-slide-right-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

.notif-slide-right-move {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Slide from left */
.notif-slide-left-enter-active,
.notif-slide-left-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.notif-slide-left-enter-from {
  opacity: 0;
  transform: translateX(-100%);
}

.notif-slide-left-leave-to {
  opacity: 0;
  transform: translateX(-100%);
}

.notif-slide-left-move {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Slide down */
.notif-slide-down-enter-active,
.notif-slide-down-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.notif-slide-down-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}

.notif-slide-down-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

.notif-slide-down-move {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Generic fade */
.notif-fade-enter-active,
.notif-fade-leave-active {
  transition: opacity 0.2s ease;
}

.notif-fade-enter-from,
.notif-fade-leave-to {
  opacity: 0;
}
</style>
