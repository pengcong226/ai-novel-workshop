import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { defineStore, createPinia, setActivePinia } from 'pinia'
import {
  storeLoggingMiddleware,
  getActionMetrics,
  resetActionMetrics,
  storeDevtoolsPlugin,
} from './middleware'

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}))

/**
 * Helper: create a Pinia instance with the given plugins pushed directly
 * to `_p` (Pinia's plugin array). In Pinia 2.x, `pinia.use()` defers
 * registration until `install(app)` which never runs in tests.
 */
function createTestPiniaWithPlugins(...plugins: any[]) {
  const pinia = createPinia()
  for (const plugin of plugins) {
    (pinia as any)._p.push(plugin)
  }
  setActivePinia(pinia)
  return pinia
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('storeLoggingMiddleware', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetActionMetrics()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function createStoreWithMiddleware() {
    createTestPiniaWithPlugins(storeLoggingMiddleware)

    const useStore = defineStore('test', {
      state: () => ({ count: 0 }),
      actions: {
        increment() {
          this.count++
        },
        async incrementAsync() {
          await Promise.resolve()
          this.count++
          return this.count
        },
        failSync() {
          throw new Error('sync boom')
        },
        async failAsync() {
          await Promise.resolve()
          throw new Error('async boom')
        },
      },
    })

    return useStore()
  }

  it('tracks call count for a synchronous action', () => {
    const store = createStoreWithMiddleware()

    store.increment()
    store.increment()

    const metrics = getActionMetrics()
    expect(metrics['test/increment'].count).toBe(2)
  })

  it('tracks call count for an async action', async () => {
    const store = createStoreWithMiddleware()

    await store.incrementAsync()

    const metrics = getActionMetrics()
    expect(metrics['test/incrementAsync'].count).toBe(1)
  })

  it('preserves the return value of synchronous actions', () => {
    createTestPiniaWithPlugins(storeLoggingMiddleware)

    const useExtraStore = defineStore('extra', {
      state: () => ({ value: 0 }),
      actions: {
        compute() {
          this.value = 42
          return this.value
        },
      },
    })

    const store = useExtraStore()
    const result = store.compute()

    expect(result).toBe(42)
  })

  it('preserves the return value of async actions', async () => {
    const store = createStoreWithMiddleware()

    const result = await store.incrementAsync()

    expect(result).toBe(1)
  })

  it('records error count for sync action failures', () => {
    const store = createStoreWithMiddleware()

    expect(() => store.failSync()).toThrow('sync boom')

    const metrics = getActionMetrics()
    expect(metrics['test/failSync'].errors).toBe(1)
  })

  it('records error count for async action failures', async () => {
    const store = createStoreWithMiddleware()

    await expect(store.failAsync()).rejects.toThrow('async boom')

    const metrics = getActionMetrics()
    expect(metrics['test/failAsync'].errors).toBe(1)
  })

  it('re-throws async errors to the caller', async () => {
    const store = createStoreWithMiddleware()

    await expect(store.failAsync()).rejects.toThrow('async boom')
  })

  it('accumulates totalTime across multiple calls', () => {
    const store = createStoreWithMiddleware()

    store.increment()
    store.increment()
    store.increment()

    const metrics = getActionMetrics()
    expect(metrics['test/increment'].totalTime).toBeGreaterThanOrEqual(0)
    expect(metrics['test/increment'].count).toBe(3)
  })

  it('initialises metric entry for every action on the store', () => {
    createStoreWithMiddleware()

    const metrics = getActionMetrics()
    expect(metrics).toHaveProperty('test/increment')
    expect(metrics).toHaveProperty('test/incrementAsync')
    expect(metrics).toHaveProperty('test/failSync')
    expect(metrics).toHaveProperty('test/failAsync')
  })

  it('does not fail when store has no actions', () => {
    createTestPiniaWithPlugins(storeLoggingMiddleware)

    const useNoActionsStore = defineStore('noActions', {
      state: () => ({ x: 1 }),
    })

    // Should not throw
    useNoActionsStore()

    const metrics = getActionMetrics()
    expect(Object.keys(metrics)).toHaveLength(0)
  })

  it('maxTime is tracked after calls', () => {
    const store = createStoreWithMiddleware()

    store.increment()

    const metrics = getActionMetrics()
    expect(metrics['test/increment'].maxTime).toBeGreaterThanOrEqual(0)
  })

  it('metrics accumulate across multiple calls to the same action', () => {
    const store = createStoreWithMiddleware()

    store.increment()
    store.increment()

    const metrics = getActionMetrics()
    expect(metrics['test/increment'].count).toBe(2)
    expect(metrics['test/increment'].totalTime).toBeGreaterThanOrEqual(0)
  })
})

describe('resetActionMetrics', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetActionMetrics()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('clears all accumulated metrics', () => {
    createTestPiniaWithPlugins(storeLoggingMiddleware)

    const useStore = defineStore('resetTest', {
      state: () => ({ x: 0 }),
      actions: {
        doWork() { this.x++ },
      },
    })
    const store = useStore()
    store.doWork()

    expect(Object.keys(getActionMetrics()).length).toBeGreaterThan(0)

    resetActionMetrics()

    expect(Object.keys(getActionMetrics())).toHaveLength(0)
  })
})

describe('storeDevtoolsPlugin', () => {
  it('attaches __devtoolsMeta to the store', () => {
    createTestPiniaWithPlugins(storeDevtoolsPlugin)

    const useStore = defineStore('testDev', {
      state: () => ({ x: 0 }),
    })
    const store = useStore()

    const meta = (store as any).__devtoolsMeta
    expect(meta).toBeDefined()
    expect(meta.label).toContain('testDev')
    expect(meta.storeId).toBe('testDev')
    expect(typeof meta.registeredAt).toBe('number')
  })

  it('uses known label for recognized store IDs', () => {
    createTestPiniaWithPlugins(storeDevtoolsPlugin)

    const useSandboxStore = defineStore('sandbox', {
      state: () => ({}),
    })
    const store = useSandboxStore()

    const meta = (store as any).__devtoolsMeta
    expect(meta).toBeDefined()
    expect(meta.label).toBe('V5 Entity + StateEvent backbone')
  })

  it('uses default label format for unknown store IDs', () => {
    createTestPiniaWithPlugins(storeDevtoolsPlugin)

    const useCustomStore = defineStore('myCustomStore', {
      state: () => ({}),
    })
    const store = useCustomStore()

    const meta = (store as any).__devtoolsMeta
    expect(meta).toBeDefined()
    expect(meta.label).toBe('Store: myCustomStore')
  })
})
