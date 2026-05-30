/**
 * Debounce composable for Vue 3.
 *
 * Returns a read-only ref that updates to the latest value of the source ref
 * only after `delayMs` milliseconds of inactivity. Provides `cancel()` and
 * `flush()` to control pending updates.
 *
 * @template T - The type of the debounced value
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { ref, watch } from 'vue'
 * import { useDebounce } from '@/composables/useDebounce'
 *
 * const searchQuery = ref('')
 * const debouncedQuery = useDebounce(searchQuery, 300)
 *
 * // Only fires when the user pauses typing for 300ms
 * watch(debouncedQuery, (q) => {
 *   fetchResults(q)
 * })
 * </script>
 *
 * <template>
 *   <input v-model="searchQuery" />
 * </template>
 * ```
 */

import { ref, watch, onUnmounted, type Ref } from 'vue'

export interface UseDebounceReturn<T> {
  /** Debounced read-only ref */
  debounced: Ref<T>
  /** Cancel any pending debounced update */
  cancel: () => void
  /** Immediately flush the pending debounced value */
  flush: () => void
  /** Whether a debounced update is pending */
  isPending: Ref<boolean>
}

/**
 * Debounce a reactive value.
 *
 * @param source - the source ref to debounce
 * @param delayMs - debounce delay in milliseconds (default: 300)
 * @returns object with `debounced` ref, `cancel`, `flush`, and `isPending`
 */
export function useDebounce<T>(source: Ref<T>, delayMs = 300): UseDebounceReturn<T> {
  const debounced = ref<T>(source.value) as Ref<T>
  const isPending = ref(false)

  let timerId: ReturnType<typeof setTimeout> | null = null
  let latestValue: T = source.value

  function clearTimer(): void {
    if (timerId !== null) {
      clearTimeout(timerId)
      timerId = null
    }
  }

  function flush(): void {
    clearTimer()
    isPending.value = false
    debounced.value = latestValue
  }

  function cancel(): void {
    clearTimer()
    isPending.value = false
  }

  watch(source, (newValue) => {
    latestValue = newValue
    clearTimer()
    isPending.value = true

    timerId = setTimeout(() => {
      flush()
    }, delayMs)
  })

  onUnmounted(() => {
    clearTimer()
  })

  return {
    debounced: debounced as Ref<T>,
    cancel,
    flush,
    isPending,
  }
}
