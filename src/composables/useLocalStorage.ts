/**
 * Generic reactive localStorage wrapper with type-safe read/write, defaults,
 * cross-tab sync via `storage` events, and proper cleanup.
 *
 * @template T - The type of the stored value
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useLocalStorage } from '@/composables/useLocalStorage'
 *
 * // Primitive with default
 * const theme = useLocalStorage('app-theme', 'dark')
 * theme.value = 'light' // writes to localStorage + updates ref
 *
 * // Complex type with serializer
 * interface Draft { title: string; body: string }
 * const draft = useLocalStorage<Draft>('draft', { title: '', body: '' })
 * ```
 */

import { ref, watch, onUnmounted, type Ref } from 'vue'

export interface UseLocalStorageOptions<T> {
  /** Custom serializer (default: JSON.stringify) */
  serializer?: (value: T) => string
  /** Custom deserializer (default: JSON.parse) */
  deserializer?: (raw: string) => T
  /** Listen for cross-tab `storage` events (default: true) */
  listenToStorageChanges?: boolean
  /** Custom write error handler (default: silent) */
  onWriteError?: (error: unknown) => void
  /** Custom read error handler (default: returns defaultValue) */
  onReadError?: (error: unknown) => void
}

function defaultSerializer<T>(value: T): string {
  return JSON.stringify(value)
}

function defaultDeserializer<T>(raw: string): T {
  return JSON.parse(raw) as T
}

/**
 * Reactive localStorage wrapper.
 *
 * Reads the initial value from `localStorage` (falling back to `defaultValue`),
 * writes on every change, and optionally listens for cross-tab `storage` events.
 *
 * @param key - localStorage key
 * @param defaultValue - fallback when the key is absent or unreadable
 * @param options - optional serializer, deserializer, and event listeners
 * @returns writable `Ref<T>` bound to `localStorage`
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
  options: UseLocalStorageOptions<T> = {}
): Ref<T> {
  const {
    serializer = defaultSerializer,
    deserializer = defaultDeserializer,
    listenToStorageChanges = true,
    onWriteError,
    onReadError,
  } = options

  // --- Read initial value ---------------------------------------------------

  function read(): T {
    try {
      if (typeof window === 'undefined') return defaultValue
      const raw = window.localStorage.getItem(key)
      return raw !== null ? deserializer(raw) : defaultValue
    } catch (error) {
      onReadError?.(error)
      return defaultValue
    }
  }

  const data = ref<T>(read()) as Ref<T>

  // --- Write on change ------------------------------------------------------

  watch(
    data,
    (newValue) => {
      try {
        if (typeof window === 'undefined') return
        if (newValue === null || newValue === undefined) {
          window.localStorage.removeItem(key)
        } else {
          window.localStorage.setItem(key, serializer(newValue))
        }
      } catch (error) {
        onWriteError?.(error)
      }
    },
    { deep: true }
  )

  // --- Cross-tab sync -------------------------------------------------------

  function handleStorageEvent(event: StorageEvent): void {
    if (event.key !== key) return

    // newValue is null when the key was removed
    if (event.newValue === null) {
      data.value = defaultValue
      return
    }

    try {
      data.value = deserializer(event.newValue)
    } catch (error) {
      onReadError?.(error)
    }
  }

  if (listenToStorageChanges && typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageEvent)

    onUnmounted(() => {
      window.removeEventListener('storage', handleStorageEvent)
    })
  }

  return data
}
