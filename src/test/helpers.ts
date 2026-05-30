/**
 * Test helpers for Vitest + Vue 3 + Pinia tests.
 *
 * Usage:
 *   import { createTestPinia, waitForNextTick, flushPromises } from '@/test/helpers'
 */

import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import type { Pinia } from 'pinia'
import { afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Pinia
// ---------------------------------------------------------------------------

/**
 * Create a fresh Pinia instance, activate it, and return it.
 *
 * Call this in `beforeEach` (or inside individual tests) to get an isolated
 * store state for every test case.
 *
 * @example
 *   beforeEach(() => {
 *     createTestPinia()
 *   })
 */
export function createTestPinia(): Pinia {
  const pinia = createPinia()
  setActivePinia(pinia)
  return pinia
}

// ---------------------------------------------------------------------------
// Timing helpers
// ---------------------------------------------------------------------------

/**
 * Flush all pending micro-tasks (Promise callbacks, Vue reactivity queue).
 *
 * Useful when the code under test uses `Promise.resolve()` chains or
 * `queueMicrotask` and you need them resolved before asserting.
 */
export async function flushPromises(): Promise<void> {
  await new Promise<void>((resolve) => {
    // A single setTimeout(fn, 0) flushes the micro-task queue in most cases.
    // Using nested setTimeout ensures chained promises also settle.
    setTimeout(resolve, 0)
  })
}

/**
 * Wait for Vue's next DOM update tick.
 *
 * Shorthand for `await nextTick()` with a name that reads naturally in tests.
 */
export async function waitForNextTick(): Promise<void> {
  await nextTick()
}

/**
 * Wait for a specific condition to become true, polling at `interval` ms.
 *
 * Throws if the condition is not met within `timeout` ms.
 *
 * @example
 *   await waitFor(() => store.items.length > 0)
 */
export async function waitFor(
  predicate: () => boolean,
  { timeout = 2000, interval = 10 } = {},
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (predicate()) return
    await new Promise((r) => setTimeout(r, interval))
  }
  throw new Error(`waitFor: condition not met within ${timeout}ms`)
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

/**
 * Create a detached DOM element and attach it to `document.body`.
 *
 * Returns the element for mounting Vue components into.
 * Automatically cleaned up when `cleanup` is called (or via afterEach).
 */
export function createRootElement(tag = 'div'): HTMLElement {
  const el = document.createElement(tag)
  document.body.appendChild(el)
  return el
}

/**
 * Remove all children added to `document.body` during a test.
 *
 * Call this in `afterEach` or rely on auto-cleanup below.
 */
export function cleanupRootElements(): void {
  document.body.innerHTML = ''
}

// Auto-cleanup after each test when this module is imported.
if (typeof afterEach !== 'undefined') {
  afterEach(() => {
    cleanupRootElements()
  })
}
