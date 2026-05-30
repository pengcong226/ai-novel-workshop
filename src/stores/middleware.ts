/**
 * Pinia Store Logging/Debugging Middleware
 *
 * Provides cross-cutting observability for all Pinia stores:
 * - Logs every action invocation with timing
 * - Detects and warns about slow actions (>500ms)
 * - Captures and re-throws action errors with store context
 * - Tracks action call counts for debugging
 *
 * Usage:
 *   import { storeLoggingMiddleware } from '@/stores/middleware'
 *   const pinia = createPinia()
 *   pinia.use(storeLoggingMiddleware)
 *
 * Toggle via:
 *   window.__STORE_MIDDLEWARE_DEBUG__ = true   (enable verbose logging)
 *   window.__STORE_MIDDLEWARE_DEBUG__ = false  (disable, errors still logged)
 *
 * Access metrics at runtime:
 *   window.__STORE_ACTION_METRICS__  // Record<string, { count, totalTime, errors }>
 *
 * @module stores/middleware
 */

import type { PiniaPluginContext } from 'pinia'
import { getLogger } from '@/utils/logger'

const logger = getLogger('store:middleware')

/** Duration threshold (ms) after which an action is logged as slow */
const SLOW_ACTION_THRESHOLD_MS = 500

/** Global toggle for verbose action logging */
declare global {
  interface Window {
    __STORE_MIDDLEWARE_DEBUG__?: boolean
    __STORE_ACTION_METRICS__?: ActionMetrics
  }
}

interface ActionMetric {
  /** Total number of calls */
  count: number
  /** Accumulated wall-clock time in ms */
  totalTime: number
  /** Number of failed calls */
  errors: number
  /** Maximum single-call time in ms */
  maxTime: number
}

type ActionMetrics = Record<string, ActionMetric>

/** Runtime metrics accumulator - accessible via window.__STORE_ACTION_METRICS__ */
const actionMetrics: ActionMetrics = {}

if (typeof window !== 'undefined') {
  window.__STORE_ACTION_METRICS__ = actionMetrics
}

/**
 * Check if verbose store logging is enabled.
 * Defaults to true in development, false in production.
 */
function isVerboseLoggingEnabled(): boolean {
  if (typeof window !== 'undefined' && window.__STORE_MIDDLEWARE_DEBUG__ !== undefined) {
    return window.__STORE_MIDDLEWARE_DEBUG__
  }
  return import.meta.env.DEV
}

/**
 * Format an elapsed time for log output.
 */
function formatElapsed(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}us`
  if (ms < 1000) return `${ms.toFixed(1)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

/**
 * Pinia plugin that wraps every store action with logging and timing.
 *
 * - Actions returning Promises get async-aware timing and error capture.
 * - Synchronous actions get synchronous timing and error capture.
 * - Metrics are accumulated in `actionMetrics` for runtime inspection.
 */
export function storeLoggingMiddleware({ store, options }: PiniaPluginContext): void {
  const storeId = store.$id
  const actions = options.actions
  if (!actions) return

  for (const actionName of Object.keys(actions)) {
    const originalFn = actions[actionName]
    if (typeof originalFn !== 'function') continue

    const metricKey = `${storeId}/${actionName}`

    // Initialize metric entry
    actionMetrics[metricKey] = actionMetrics[metricKey] ?? {
      count: 0,
      totalTime: 0,
      errors: 0,
      maxTime: 0,
    }

    // Replace the action with an instrumented wrapper
    store[actionName] = function (this: typeof store, ...args: unknown[]) {
      const metric = actionMetrics[metricKey]
      metric.count++

      const start = performance.now()
      const verbose = isVerboseLoggingEnabled()

      if (verbose) {
        logger.debug(`[${storeId}] ${actionName}() called`, {
          args: args.length > 0 ? args : undefined,
        })
      }

      try {
        const result = originalFn.apply(this, args)

        // Handle async actions
        if (result instanceof Promise) {
          return result
            .then((value: unknown) => {
              const elapsed = performance.now() - start
              metric.totalTime += elapsed
              if (elapsed > metric.maxTime) metric.maxTime = elapsed

              if (elapsed > SLOW_ACTION_THRESHOLD_MS) {
                logger.warn(
                  `[${storeId}] ${actionName}() slow: ${formatElapsed(elapsed)}`
                )
              } else if (verbose) {
                logger.debug(
                  `[${storeId}] ${actionName}() completed in ${formatElapsed(elapsed)}`
                )
              }

              return value
            })
            .catch((error: unknown) => {
              const elapsed = performance.now() - start
              metric.totalTime += elapsed
              metric.errors++
              if (elapsed > metric.maxTime) metric.maxTime = elapsed

              const message = error instanceof Error ? error.message : String(error)
              logger.error(
                `[${storeId}] ${actionName}() failed after ${formatElapsed(elapsed)}: ${message}`
              )

              throw error
            })
        }

        // Handle sync actions
        const elapsed = performance.now() - start
        metric.totalTime += elapsed
        if (elapsed > metric.maxTime) metric.maxTime = elapsed

        if (elapsed > SLOW_ACTION_THRESHOLD_MS) {
          logger.warn(
            `[${storeId}] ${actionName}() slow: ${formatElapsed(elapsed)}`
          )
        } else if (verbose) {
          logger.debug(
            `[${storeId}] ${actionName}() completed in ${formatElapsed(elapsed)}`
          )
        }

        return result
      } catch (error: unknown) {
        const elapsed = performance.now() - start
        metric.totalTime += elapsed
        metric.errors++
        if (elapsed > metric.maxTime) metric.maxTime = elapsed

        const message = error instanceof Error ? error.message : String(error)
        logger.error(
          `[${storeId}] ${actionName}() failed after ${formatElapsed(elapsed)}: ${message}`
        )

        throw error
      }
    } as typeof actions[typeof actionName]
  }
}

/**
 * Get a snapshot of the current action metrics.
 * Useful for debugging panels and diagnostics.
 */
export function getActionMetrics(): Readonly<ActionMetrics> {
  return { ...actionMetrics }
}

/**
 * Reset all accumulated metrics.
 */
export function resetActionMetrics(): void {
  for (const key of Object.keys(actionMetrics)) {
    delete actionMetrics[key]
  }
}

/**
 * Pinia devtools integration plugin.
 *
 * Adds store-level metadata annotations visible in Vue DevTools:
 * - `__storeMeta` object on each store with label, version, and store type hints
 * - Mutation tracking with `$subscribe` for debugging state changes
 *
 * Usage:
 *   pinia.use(storeDevtoolsPlugin)
 *
 * Toggle mutation logging via:
 *   window.__STORE_MUTATION_TRACE__ = true
 */
declare global {
  interface Window {
    __STORE_MUTATION_TRACE__?: boolean
  }
}

const DEVTOOLS_STORE_LABELS: Record<string, string> = {
  sandbox: 'V5 Entity + StateEvent backbone',
  project: 'Project aggregate & chapter lifecycle',
  ai: 'AI service, model routing & daemon',
  suggestions: 'AI review suggestions',
  vector: 'Vector retrieval/index',
  tokenUsage: 'Token cost tracking',
  theme: 'UI theme state',
}

export function storeDevtoolsPlugin({ store }: PiniaPluginContext): void {
  const label = DEVTOOLS_STORE_LABELS[store.$id] || `Store: ${store.$id}`

  // Attach metadata for Vue DevTools inspection
  // Pinia devtools reads this via store._customProperties
  // Pinia internals are not typed; cast through a narrow interface
  interface PiniaDevtoolsInternals {
    _customProperties?: Set<string>
    __devtoolsMeta?: Record<string, unknown>
  }
  const devtoolsStore = store as unknown as PiniaDevtoolsInternals
  const customProperties = devtoolsStore._customProperties
  if (customProperties instanceof Set) {
    customProperties.add('__devtoolsMeta')
  }

  // Provide a lightweight meta object for devtools
  devtoolsStore.__devtoolsMeta = {
    label,
    storeId: store.$id,
    registeredAt: Date.now(),
  }

  // Optional mutation tracing (off by default)
  if (import.meta.env.DEV) {
    store.$subscribe((_mutation, state) => {
      if (typeof window !== 'undefined' && window.__STORE_MUTATION_TRACE__) {
        const events = 'events' in _mutation ? _mutation.events : undefined
        const keys = Array.isArray(events) ? events.map((e: any) => e.key) : events ? [events.key] : undefined
        logger.debug(`[${store.$id}] mutation`, {
          type: _mutation.type,
          storeId: _mutation.storeId,
          keys,
          stateSize: Object.keys(state).length,
        })
      }
    }, { detached: true })
  }
}
