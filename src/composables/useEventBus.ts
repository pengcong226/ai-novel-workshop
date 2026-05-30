/**
 * Vue composable for the typed application event bus.
 *
 * Listeners registered through this composable are automatically removed
 * when the host component unmounts (`onUnmounted`).
 *
 * Usage:
 *   <script setup lang="ts">
 *   import { useEventBus } from '@/composables/useEventBus'
 *
 *   const { on, once, emit } = useEventBus()
 *
 *   on('chapter:saved', (payload) => {
 *     console.log('Chapter saved:', payload.chapter.title)
 *   })
 *
 *   // This listener is also cleaned up on unmount.
 *   once('ai:completed', (payload) => {
 *     console.log('AI finished in', payload.durationMs, 'ms')
 *   })
 *   </script>
 */
import { onUnmounted } from 'vue'
import { eventBus } from '@/utils/eventBus'
import type {
  AppEventName,
  AppEventPayload,
} from '@/types/events'
import type { EventListener } from '@/utils/eventBus'

export interface UseEventBusReturn {
  /**
   * Register a listener that is automatically removed on component unmount.
   */
  on<T extends AppEventName>(
    event: T,
    fn: EventListener<T>,
    options?: { once?: boolean }
  ): void

  /**
   * Register a one-shot listener (auto-removed on unmount and after first fire).
   */
  once<T extends AppEventName>(event: T, fn: EventListener<T>): void

  /**
   * Manually remove a listener before unmount.
   */
  off<T extends AppEventName>(event: T, fn: EventListener<T>): void

  /**
   * Emit a typed event.
   */
  emit<T extends AppEventName>(event: T, payload: AppEventPayload<T>): void

  /**
   * The underlying bus instance, for advanced use cases.
   */
  bus: typeof eventBus
}

export function useEventBus(): UseEventBusReturn {
  /** Tracks all unsubscribe functions so onUnmounted can clean them up. */
  const unsubs: Array<() => void> = []

  function on<T extends AppEventName>(
    event: T,
    fn: EventListener<T>,
    options?: { once?: boolean }
  ): void {
    const unsub = eventBus.on(event, fn, options)
    unsubs.push(unsub)
  }

  function once<T extends AppEventName>(event: T, fn: EventListener<T>): void {
    const unsub = eventBus.once(event, fn)
    unsubs.push(unsub)
  }

  function off<T extends AppEventName>(event: T, fn: EventListener<T>): void {
    eventBus.off(event, fn)
  }

  function emit<T extends AppEventName>(
    event: T,
    payload: AppEventPayload<T>
  ): void {
    eventBus.emit(event, payload)
  }

  onUnmounted(() => {
    for (const unsub of unsubs) {
      unsub()
    }
    unsubs.length = 0
  })

  return { on, once, off, emit, bus: eventBus }
}
