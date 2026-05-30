import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick, defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useAsyncState, type AsyncStatus } from './useAsyncState'

/**
 * Helper: mount a component that uses useAsyncState and exposes the result.
 */
function mountWithAsyncState<T, TArgs extends unknown[] = []>(
  asyncFn: (...args: TArgs) => Promise<T>,
  options?: Parameters<typeof useAsyncState<T, TArgs>>[1],
) {
  let result!: ReturnType<typeof useAsyncState<T, TArgs>>

  const wrapper = mount(
    defineComponent({
      setup() {
        result = useAsyncState(asyncFn, options)
        return {}
      },
      render: () => h('div'),
    }),
  )

  return { wrapper, ...result }
}

describe('useAsyncState', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('starts in idle state with null data', () => {
    const fn = vi.fn(async () => 'result')
    const { state, status, isLoading, isReady, error } = mountWithAsyncState(fn)

    expect(state.value).toBeNull()
    expect(status.value).toBe('idle')
    expect(isLoading.value).toBe(false)
    expect(isReady.value).toBe(false)
    expect(error.value).toBeNull()
  })

  it('transitions to loading then success on execute()', async () => {
    const fn = vi.fn(async () => 'data')
    const { execute, status, state, isLoading, isReady } = mountWithAsyncState(fn)

    const promise = execute()
    expect(status.value).toBe('loading')
    expect(isLoading.value).toBe(true)

    await promise

    expect(status.value).toBe('success')
    expect(state.value).toBe('data')
    expect(isReady.value).toBe(true)
    expect(isLoading.value).toBe(false)
  })

  it('transitions to error state when asyncFn rejects', async () => {
    const errorObj = new Error('boom')
    const fn = vi.fn(async () => { throw errorObj })
    const { execute, status, error, state } = mountWithAsyncState(fn)

    await execute()

    expect(status.value).toBe('error')
    expect(error.value).toBe(errorObj)
    expect(state.value).toBeNull()
  })

  it('normalizes non-Error throws into Error instances', async () => {
    const fn = vi.fn(async () => { throw 'string error' })
    const { execute, error } = mountWithAsyncState(fn)

    await execute()

    expect(error.value).toBeInstanceOf(Error)
    expect(error.value!.message).toBe('string error')
  })

  it('passes arguments to the async function', async () => {
    const fn = vi.fn(async (a: string, b: number) => `${a}-${b}`)
    const { execute, state } = mountWithAsyncState(fn)

    await execute('hello', 42)

    expect(fn).toHaveBeenCalledWith('hello', 42)
    expect(state.value).toBe('hello-42')
  })

  it('refresh() re-executes with the most recent arguments', async () => {
    const fn = vi.fn(async (x: number) => x * 2)
    const { execute, refresh, state } = mountWithAsyncState(fn)

    await execute(5)
    expect(state.value).toBe(10)

    await refresh()
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith(5)
    expect(state.value).toBe(10)
  })

  it('refresh() returns null if never executed', async () => {
    const fn = vi.fn(async () => 'never')
    const { refresh } = mountWithAsyncState(fn)

    const result = await refresh()
    expect(result).toBeNull()
    expect(fn).not.toHaveBeenCalled()
  })

  it('reset() returns all state to initial values', async () => {
    const fn = vi.fn(async () => 'done')
    const { execute, reset, state, status, error, executedAt } = mountWithAsyncState(fn)

    await execute()
    expect(state.value).toBe('done')
    expect(status.value).toBe('success')

    reset()

    expect(state.value).toBeNull()
    expect(status.value).toBe('idle')
    expect(error.value).toBeNull()
    expect(executedAt.value).toBeNull()
  })

  it('uses initialState option when provided', () => {
    const fn = vi.fn(async () => 'irrelevant')
    const { state } = mountWithAsyncState(fn, { initialState: 'preloaded' })

    expect(state.value).toBe('preloaded')
  })

  it('fires onSuccess callback on successful execution', async () => {
    const onSuccess = vi.fn()
    const fn = vi.fn(async () => 'success-data')
    const { execute } = mountWithAsyncState(fn, { onSuccess })

    await execute()

    expect(onSuccess).toHaveBeenCalledWith('success-data')
  })

  it('fires onError callback and clears error ref when callback returns true', async () => {
    const onError = vi.fn(() => true)
    const fn = vi.fn(async () => { throw new Error('handled') })
    const { execute, error } = mountWithAsyncState(fn, { onError })

    await execute()

    expect(onError).toHaveBeenCalled()
    expect(error.value).toBeNull()
  })

  it('records executedAt timestamp on success', async () => {
    const fn = vi.fn(async () => 'ts')
    const { execute, executedAt } = mountWithAsyncState(fn)

    const before = Date.now()
    await execute()

    expect(executedAt.value).not.toBeNull()
    expect(executedAt.value!).toBeGreaterThanOrEqual(before)
  })

  it('delays loading indicator when delay option is set', async () => {
    const fn = vi.fn(async () => 'delayed')
    const { execute, isLoading, status } = mountWithAsyncState(fn, { delay: 200 })

    const promise = execute()

    // Immediately after execute, status should not be 'loading' yet
    expect(isLoading.value).toBe(false)

    vi.advanceTimersByTime(200)
    expect(status.value).toBe('loading')

    await promise
    expect(status.value).toBe('success')
  })
})
