/**
 * Async state composable with loading, error, and success lifecycle management.
 *
 * Wraps an async function in a reactive state machine that tracks pending
 * status, resolved data, error information, and provides `execute`, `refresh`,
 * and `reset` controls.
 *
 * @template T - The resolved data type
 * @template TArgs - Tuple type of the async function's parameters
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useAsyncState } from '@/composables/useAsyncState'
 *
 * interface User { id: string; name: string }
 *
 * async function fetchUser(id: string): Promise<User> {
 *   const res = await fetch(`/api/users/${id}`)
 *   if (!res.ok) throw new Error('Not found')
 *   return res.json()
 * }
 *
 * const { state, isLoading, error, execute, isReady } = useAsyncState(fetchUser)
 *
 * // Execute on mount or on demand
 * execute('user-123')
 * </script>
 *
 * <template>
 *   <div v-if="isLoading">Loading...</div>
 *   <div v-else-if="error">{{ error.message }}</div>
 *   <div v-else-if="isReady">{{ state.name }}</div>
 * </template>
 * ```
 */

import { ref, computed, onUnmounted, type Ref, type ComputedRef } from 'vue'

export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error'

export interface UseAsyncStateReturn<T, TArgs extends unknown[]> {
  /** Current resolved data (null until first success) */
  state: Ref<T | null>
  /** Current async status */
  status: Ref<AsyncStatus>
  /** Whether the async operation is in progress */
  isLoading: ComputedRef<boolean>
  /** Whether the async operation completed successfully at least once */
  isReady: ComputedRef<boolean>
  /** Current error (null when not in error state) */
  error: Ref<Error | null>
  /** Timestamp of the last successful resolution */
  executedAt: Ref<number | null>
  /** Execute the async function with the given arguments */
  execute: (...args: TArgs) => Promise<T | null>
  /** Re-execute with the most recent arguments */
  refresh: () => Promise<T | null>
  /** Reset all state to initial values */
  reset: () => void
}

export interface UseAsyncStateOptions<T> {
  /** Initial data value (default: null) */
  initialState?: T | null
  /** Delay in ms before setting isLoading to true (debounces fast calls) */
  delay?: number
  /** Whether to execute immediately with the provided args */
  immediate?: boolean
  /**
   * Callback fired on error. Return true to prevent the error from being
   * stored in the `error` ref (useful for global error handlers).
   */
  onError?: (error: Error) => boolean | void
  /**
   * Callback fired on success.
   */
  onSuccess?: (data: T) => void
  /**
   * Abort controller signal for cancelling in-flight requests.
   * The composable creates its own AbortController; pass your own
   * if you need external cancellation.
   */
  resetOnExecute?: boolean
}

/**
 * Manage async function state with loading, error, and success lifecycle.
 *
 * @param asyncFn - the async function to wrap
 * @param options - configuration options
 * @returns reactive state object with execute/refresh/reset controls
 */
export function useAsyncState<
  T,
  TArgs extends unknown[] = [],
>(
  asyncFn: (...args: TArgs) => Promise<T>,
  options: UseAsyncStateOptions<T> & { immediate?: false } = {}
): UseAsyncStateReturn<T, TArgs> {
  const {
    initialState = null,
    delay = 0,
    onError,
    onSuccess,
    resetOnExecute = true,
  } = options

  const state = ref<T | null>(initialState) as Ref<T | null>
  const status = ref<AsyncStatus>('idle') as Ref<AsyncStatus>
  const error = ref<Error | null>(null)
  const executedAt = ref<number | null>(null)

  const isLoading = computed(() => status.value === 'loading')
  const isReady = computed(() => status.value === 'success' && state.value !== null)

  // Track the latest call to discard stale results
  let callId = 0
  let delayTimer: ReturnType<typeof setTimeout> | null = null
  let lastArgs: TArgs | null = null

  onUnmounted(() => {
    if (delayTimer !== null) {
      clearTimeout(delayTimer)
      delayTimer = null
    }
  })

  /**
   * Execute the async function with the provided arguments.
   * Discards results from any in-flight call that started before this one.
   */
  async function execute(...args: TArgs): Promise<T | null> {
    const thisCallId = ++callId
    lastArgs = args

    if (resetOnExecute) {
      error.value = null
    }

    // Debounce the loading indicator to avoid flashing for fast calls
    if (delay > 0) {
      if (delayTimer !== null) clearTimeout(delayTimer)
      delayTimer = setTimeout(() => {
        if (thisCallId === callId) {
          status.value = 'loading'
        }
      }, delay)
    } else {
      status.value = 'loading'
    }

    try {
      const result = await asyncFn(...args)

      // Discard stale results
      if (thisCallId !== callId) return null

      state.value = result
      status.value = 'success'
      error.value = null
      executedAt.value = Date.now()
      onSuccess?.(result)
      return result
    } catch (err) {
      if (thisCallId !== callId) return null

      const normalizedError = err instanceof Error ? err : new Error(String(err))
      status.value = 'error'
      error.value = normalizedError

      const handled = onError?.(normalizedError)
      if (handled) {
        error.value = null
      }

      return null
    } finally {
      if (delayTimer !== null) {
        clearTimeout(delayTimer)
        delayTimer = null
      }
    }
  }

  /**
   * Re-execute with the most recent arguments.
   * No-op if the function was never executed.
   */
  async function refresh(): Promise<T | null> {
    if (!lastArgs) return null
    return execute(...lastArgs)
  }

  /**
   * Reset all state to initial values.
   */
  function reset(): void {
    callId++
    state.value = initialState
    status.value = 'idle'
    error.value = null
    executedAt.value = null
    lastArgs = null
  }

  return {
    state,
    status,
    isLoading,
    isReady,
    error,
    executedAt,
    execute,
    refresh,
    reset,
  }
}
