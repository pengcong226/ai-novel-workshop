import { computed, ref } from 'vue'

const isOnline = ref(readInitialOnlineState())
const lastChangedAt = ref<Date | null>(null)
let listenersAttached = false

function readInitialOnlineState(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') return true
  return navigator.onLine
}

function updateOnlineState(nextValue: boolean): void {
  if (isOnline.value === nextValue) return
  isOnline.value = nextValue
  lastChangedAt.value = new Date()
}

function handleOnline(): void {
  updateOnlineState(true)
}

function handleOffline(): void {
  updateOnlineState(false)
}

function attachListeners(): void {
  if (listenersAttached || typeof window === 'undefined') return
  listenersAttached = true
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  updateOnlineState(readInitialOnlineState())
}

export function isBrowserOnline(): boolean {
  return readInitialOnlineState()
}

export function useOnlineStatus() {
  attachListeners()

  return {
    isOnline: computed(() => isOnline.value),
    isOffline: computed(() => !isOnline.value),
    lastChangedAt: computed(() => lastChangedAt.value),
  }
}

export function resetOnlineStatusForTest(): void {
  if (typeof window !== 'undefined' && listenersAttached) {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
  listenersAttached = false
  isOnline.value = readInitialOnlineState()
  lastChangedAt.value = null
}
