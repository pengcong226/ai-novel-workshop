import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick, defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useDebounce } from './useDebounce'

/**
 * Helper: mount a component that calls useDebounce and returns
 * the composable result for assertions.
 */
function mountWithDebounce<T>(initialValue: T, delayMs?: number) {
  const source = ref(initialValue) as ReturnType<typeof ref<T>>
  let result!: ReturnType<typeof import('./useDebounce').useDebounce<T>>

  const wrapper = mount(
    defineComponent({
      setup() {
        result = useDebounce(source, delayMs) as any
        return { ...result, source }
      },
      render: () => h('div'),
    }),
  )

  return { wrapper, source, ...result }
}

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('initializes debounced with the source value', () => {
    const { debounced } = mountWithDebounce('hello')
    expect(debounced.value).toBe('hello')
  })

  it('does not update debounced immediately when source changes', async () => {
    const { source, debounced } = mountWithDebounce('initial', 300)

    source.value = 'changed'
    await nextTick()

    expect(debounced.value).toBe('initial')
  })

  it('updates debounced after the delay elapses', async () => {
    const { source, debounced } = mountWithDebounce('initial', 300)

    source.value = 'changed'
    await nextTick()
    vi.advanceTimersByTime(300)

    expect(debounced.value).toBe('changed')
  })

  it('uses default 300ms delay when none specified', async () => {
    const { source, debounced } = mountWithDebounce('default')

    source.value = 'after-default'
    await nextTick()

    vi.advanceTimersByTime(299)
    expect(debounced.value).toBe('default')

    vi.advanceTimersByTime(1)
    expect(debounced.value).toBe('after-default')
  })

  it('resets the timer when source changes again before delay elapses', async () => {
    const { source, debounced } = mountWithDebounce('a', 200)

    source.value = 'b'
    await nextTick()
    vi.advanceTimersByTime(100)

    source.value = 'c'
    await nextTick()
    vi.advanceTimersByTime(100)

    // Only 100ms since last change, should still be 'a'
    expect(debounced.value).toBe('a')

    vi.advanceTimersByTime(100)
    expect(debounced.value).toBe('c')
  })

  it('sets isPending to true when source changes', async () => {
    const { source, isPending } = mountWithDebounce('idle', 300)

    expect(isPending.value).toBe(false)

    source.value = 'typing'
    await nextTick()

    expect(isPending.value).toBe(true)
  })

  it('sets isPending to false after flush', async () => {
    const { source, isPending, debounced } = mountWithDebounce('idle', 300)

    source.value = 'typing'
    await nextTick()
    expect(isPending.value).toBe(true)

    vi.advanceTimersByTime(300)
    expect(isPending.value).toBe(false)
    expect(debounced.value).toBe('typing')
  })

  it('flush() immediately applies the latest value', async () => {
    const { source, debounced, flush, isPending } = mountWithDebounce('start', 500)

    source.value = 'flushed'
    await nextTick()

    flush()

    expect(debounced.value).toBe('flushed')
    expect(isPending.value).toBe(false)
  })

  it('cancel() prevents the debounced update from firing', async () => {
    const { source, debounced, cancel, isPending } = mountWithDebounce('keep', 300)

    source.value = 'discard'
    await nextTick()
    cancel()

    vi.advanceTimersByTime(500)

    expect(debounced.value).toBe('keep')
    expect(isPending.value).toBe(false)
  })

  it('works with complex objects', async () => {
    const initial = { name: 'Alice', age: 30 }
    const { source, debounced } = mountWithDebounce(initial, 100)

    const updated = { name: 'Bob', age: 25 }
    source.value = updated
    await nextTick()
    vi.advanceTimersByTime(100)

    expect(debounced.value).toEqual(updated)
  })

  it('debounces numeric values', async () => {
    const { source, debounced } = mountWithDebounce(0, 150)

    source.value = 42
    await nextTick()
    vi.advanceTimersByTime(150)

    expect(debounced.value).toBe(42)
  })
})
