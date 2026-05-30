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

// ── Helper store used in tests ─────────────────────────────────────────

function defineTestStore() {
  return defineStore('test', {
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
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('storeLoggingMiddleware', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetActionMetrics()
    const pinia = createPinia()
    pinia.use(storeLoggingMiddleware)
    setActivePinia(pinia)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('tracks call count for a synchronous action', () => {
    const useStore = defineTestStore()
    const store = useStore()

    store.increment()
    store.increment()

    const metrics = getActionMetrics()
    expect(metrics['test/increment'].count).toBe(2)
  })

  it('tracks call count for an async action', async () => {
    const useStore = defineTestStore()
    const store = useStore()

    await store.incrementAsync()

    const metrics = getActionMetrics()
    expect(metrics['test/incrementAsync'].count).toBe(1)
  })

  it('preserves the return value of synchronous actions', () => {
    const useExtraStore = defineStore('extra', {
      state: () => ({ value: 0 }),
      actions: {
        compute() {
          this.value = 42
          return this.value
        },
      },
    })
    // Re-create pinia with middleware
    const pinia = createPinia()
    pinia.use(storeLoggingMiddleware)
    setActivePinia(pinia)

    const store = useExtraStore()
    const result = store.compute()

    expect(result).toBe(42)
  })

  it('preserves the return value of async actions', async () => {
    const useStore = defineTestStore()
    const store = useStore()

    const result = await store.incrementAsync()

    expect(result).toBe(1)
  })

  it('records error count for sync action failures', () => {
    const useStore = defineTestStore()
    const store = useStore()

    expect(() => store.failSync()).toThrow('sync boom')

    const metrics = getActionMetrics()
    expect(metrics['test/failSync'].errors).toBe(1)
  })

  it('records error count for async action failures', async () => {
    const useStore = defineTestStore()
    const store = useStore()

    await expect(store.failAsync()).rejects.toThrow('async boom')

    const metrics = getActionMetrics()
    expect(metrics['test/failAsync'].errors).toBe(1)
  })

  it('re-throws async errors to the caller', async () => {
    const useStore = defineTestStore()
    const store = useStore()

    await expect(store.failAsync()).rejects.toThrow('async boom')
  })

  it('accumulates totalTime across multiple calls', () => {
    const useStore = defineTestStore()
    const store = useStore()

    store.increment()
    store.increment()
    store.increment()

    const metrics = getActionMetrics()
    expect(metrics['test/increment'].totalTime).toBeGreaterThanOrEqual(0)
    expect(metrics['test/increment'].count).toBe(3)
  })

  it('initialises metric entry for every action on the store', () => {
    const useStore = defineTestStore()
    useStore() // trigger registration

    const metrics = getActionMetrics()
    expect(metrics).toHaveProperty('test/increment')
    expect(metrics).toHaveProperty('test/incrementAsync')
    expect(metrics).toHaveProperty('test/failSync')
    expect(metrics).toHaveProperty('test/failAsync')
  })

  it('does not fail when store has no actions', () => {
    const useNoActionsStore = defineStore('noActions', {
      state: () => ({ x: 1 }),
    })

    // Should not throw
    useNoActionsStore()

    const metrics = getActionMetrics()
    expect(Object.keys(metrics)).toHaveLength(0)
  })

  it('maxTime is tracked after calls', () => {
    const useStore = defineTestStore()
    const store = useStore()

    store.increment()

    const metrics = getActionMetrics()
    expect(metrics['test/increment'].maxTime).toBeGreaterThanOrEqual(0)
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
    const pinia = createPinia()
    pinia.use(storeLoggingMiddleware)
    setActivePinia(pinia)

    const useStore = defineTestStore()
    const store = useStore()
    store.increment()

    expect(Object.keys(getActionMetrics()).length).toBeGreaterThan(0)

    resetActionMetrics()

    expect(Object.keys(getActionMetrics())).toHaveLength(0)
  })
})

describe('storeDevtoolsPlugin', () => {
  beforeEach(() => {
    const pinia = createPinia()
    pinia.use(storeDevtoolsPlugin)
    setActivePinia(pinia)
  })

  it('attaches __devtoolsMeta to the store', () => {
    const useStore = defineTestStore()
    const store = useStore()

    const meta = (store as any).__devtoolsMeta
    expect(meta).toBeDefined()
    expect(meta.label).toContain('test')
    expect(meta.storeId).toBe('test')
    expect(typeof meta.registeredAt).toBe('number')
  })

  it('uses known label for recognized store IDs', () => {
    const useSandboxStore = defineStore('sandbox', {
      state: () => ({}),
    })
    const store = useSandboxStore()

    const meta = (store as any).__devtoolsMeta
    expect(meta.label).toBe('V5 Entity + StateEvent backbone')
  })
})
