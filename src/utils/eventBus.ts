/**
 * Type-safe event emitter with wildcard support, once-listeners, and
 * optional debug logging in development mode.
 *
 * Usage:
 *   import { eventBus } from '@/utils/eventBus'
 *
 *   eventBus.on('chapter:saved', (payload) => { ... })
 *   eventBus.emit('chapter:saved', { chapter })
 *   eventBus.off('chapter:saved', handler)
 */
import type { AppEventName, AppEventPayload } from '@/types/events'

// ============================================================================
// Listener type helpers
// ============================================================================

/** A listener receives the typed payload for a specific event. */
export type EventListener<T extends AppEventName> = (payload: AppEventPayload<T>) => void

/** Internal wrapper that tracks per-listener options. */
interface ListenerEntry<T extends AppEventName = AppEventName> {
  fn: EventListener<T>
  once: boolean
}

// ============================================================================
// Wildcard helpers
// ============================================================================

/**
 * Returns true when `candidate` matches the `pattern`.
 *
 * Patterns:
 *   '*'              matches everything
 *   'chapter:*'      matches 'chapter:saved', 'chapter:deleted', etc.
 *   'chapter:saved'  matches only 'chapter:saved'
 */
function matchesWildcard(pattern: string, candidate: string): boolean {
  if (pattern === '*') return true
  if (!pattern.includes('*')) return pattern === candidate
  const regex = new RegExp('^' + pattern.replace(/\*/g, '[^:]*') + '$')
  return regex.test(candidate)
}

// ============================================================================
// EventBus class
// ============================================================================

export class EventBus {
  /** Map from event name to its set of listeners. */
  private listeners = new Map<string, ListenerEntry<any>[]>()
  /** Wildcard listeners keyed by the pattern they registered with. */
  private wildcardListeners = new Map<string, ListenerEntry<any>[]>()
  /** Whether debug logging is enabled. */
  private debugEnabled: boolean

  constructor(options?: { debug?: boolean }) {
    this.debugEnabled = options?.debug ?? false
  }

  // ---- Registration --------------------------------------------------------

  /**
   * Register a listener for `event`.
   * Returns an unsubscribe function for convenience.
   */
  on<T extends AppEventName>(
    event: T,
    fn: EventListener<T>,
    options?: { once?: boolean }
  ): () => void {
    const entry: ListenerEntry<T> = {
      fn,
      once: options?.once ?? false,
    }

    if (event.includes('*')) {
      const list = this.wildcardListeners.get(event) ?? []
      list.push(entry)
      this.wildcardListeners.set(event, list)
    } else {
      const list = this.listeners.get(event) ?? []
      list.push(entry)
      this.listeners.set(event, list)
    }

    this.debug('registered', event, { once: entry.once })

    // Return unsubscribe function
    return () => this.off(event, fn)
  }

  /**
   * Register a one-shot listener that auto-removes after the first emission.
   */
  once<T extends AppEventName>(event: T, fn: EventListener<T>): () => void {
    return this.on(event, fn, { once: true })
  }

  /**
   * Remove a previously registered listener.
   * If `fn` is omitted, all listeners for `event` are removed.
   */
  off<T extends AppEventName>(event: T, fn?: EventListener<T>): void {
    const isWildcard = event.includes('*')
    const map = isWildcard ? this.wildcardListeners : this.listeners

    if (!fn) {
      map.delete(event)
      this.debug('removed all', event)
      return
    }

    const list = map.get(event)
    if (!list) return

    const filtered = list.filter((entry) => entry.fn !== fn)
    if (filtered.length === 0) {
      map.delete(event)
    } else {
      map.set(event, filtered)
    }

    this.debug('removed one', event)
  }

  // ---- Emission ------------------------------------------------------------

  /**
   * Emit an event with its typed payload.
   *
   * 1. Fires exact-match listeners for `event`.
   * 2. Fires any wildcard listener whose pattern matches `event`.
   * 3. One-shot listeners are removed after firing.
   */
  emit<T extends AppEventName>(event: T, payload: AppEventPayload<T>): void {
    this.debug('emit', event, payload)

    // Exact listeners
    this.fireListeners(this.listeners.get(event), event, payload)

    // Wildcard listeners
    for (const [pattern, list] of this.wildcardListeners) {
      if (matchesWildcard(pattern, event)) {
        this.fireListeners(list, event, payload)
      }
    }
  }

  // ---- Introspection -------------------------------------------------------

  /** Return the number of listeners registered for `event` (exact match). */
  listenerCount(event: AppEventName): number {
    return this.listeners.get(event)?.length ?? 0
  }

  /** Remove all listeners across every event. */
  clear(): void {
    this.listeners.clear()
    this.wildcardListeners.clear()
    this.debug('clear', '*')
  }

  // ---- Internal helpers ----------------------------------------------------

  private fireListeners(
    list: ListenerEntry[] | undefined,
    event: string,
    payload: unknown
  ): void {
    if (!list || list.length === 0) return

    // Snapshot the list so removals during iteration are safe.
    const snapshot = [...list]

    for (const entry of snapshot) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        entry.fn(payload as any)
      } catch (err) {
        console.error(`[EventBus] Listener error for "${event}":`, err)
      }
    }

    // Remove once-listeners after all have fired.
    const remaining = list.filter((entry) => !entry.once)
    if (remaining.length === 0) {
      this.listeners.delete(event)
    } else if (list !== remaining) {
      // Only update if something was actually removed.
      // Find the correct map (exact vs wildcard).
      const inExact = this.listeners.get(event) === list
      if (inExact) {
        this.listeners.set(event, remaining)
      } else {
        // Must be a wildcard pattern key; find it.
        for (const [pat, wl] of this.wildcardListeners) {
          if (wl === list) {
            if (remaining.length === 0) {
              this.wildcardListeners.delete(pat)
            } else {
              this.wildcardListeners.set(pat, remaining)
            }
            break
          }
        }
      }
    }
  }

  private debug(action: string, event: string, detail?: unknown): void {
    if (!this.debugEnabled) return
    const label = `[EventBus] ${action} "${event}"`
    if (detail !== undefined) {
      console.debug(label, detail)
    } else {
      console.debug(label)
    }
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

/**
 * Application-wide event bus singleton.
 *
 * In development mode (`import.meta.env.DEV`) debug logging is enabled
 * automatically. Override with `eventBus.setDebug(true/false)`.
 */
function isDev(): boolean {
  try {
    return import.meta.env.DEV === true
  } catch {
    return false
  }
}

export const eventBus = new EventBus({ debug: isDev() })

/**
 * Allow runtime toggling of debug logging (e.g. from devtools).
 */
export function setEventBusDebug(enabled: boolean): void {
  // Intentional cast: we own the class and need to toggle private field.
  (eventBus as unknown as { debugEnabled: boolean }).debugEnabled = enabled
}
