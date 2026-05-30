import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick, defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useLocalStorage } from './useLocalStorage'

/**
 * Helper: wrap a useLocalStorage call inside a Vue component so
 * lifecycle hooks (watch, onUnmounted) fire correctly.
 */
function mountWithLocalStorage<T>(
  key: string,
  defaultValue: T,
  options?: Parameters<typeof useLocalStorage<T>>[2],
) {
  let refResult!: ReturnType<typeof useLocalStorage<T>>
  const wrapper = mount(
    defineComponent({
      setup() {
        refResult = useLocalStorage(key, defaultValue, options)
        return { refResult }
      },
      render: () => h('div'),
    }),
  )
  return { wrapper, data: refResult }
}

describe('useLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns defaultValue when localStorage is empty', () => {
    const { data } = mountWithLocalStorage('test-key', 'hello')
    expect(data.value).toBe('hello')
  })

  it('reads existing value from localStorage on init', () => {
    localStorage.setItem('existing-key', JSON.stringify({ name: 'saved' }))
    const { data } = mountWithLocalStorage('existing-key', { name: 'default' })
    expect(data.value).toEqual({ name: 'saved' })
  })

  it('writes to localStorage when the ref changes', async () => {
    const { data, wrapper } = mountWithLocalStorage('write-key', 'initial')
    data.value = 'updated'
    await nextTick()
    expect(localStorage.setItem).toHaveBeenCalledWith('write-key', '"updated"')
    wrapper.unmount()
  })

  it('removes the localStorage key when value is set to null', async () => {
    localStorage.setItem('nullable-key', '"exists"')
    const { data, wrapper } = mountWithLocalStorage<string | null>('nullable-key', 'default')
    data.value = null
    await nextTick()
    expect(localStorage.removeItem).toHaveBeenCalledWith('nullable-key')
    wrapper.unmount()
  })

  it('uses custom serializer and deserializer when provided', () => {
    const serializer = vi.fn((v: number) => `custom-${v}`)
    const deserializer = vi.fn((raw: string) => parseInt(raw.replace('custom-', ''), 10))
    localStorage.setItem('custom-ser', 'custom-42')

    const { data } = mountWithLocalStorage('custom-ser', 0, { serializer, deserializer })
    expect(deserializer).toHaveBeenCalledWith('custom-42')
    expect(data.value).toBe(42)
  })

  it('handles cross-tab storage events and updates the ref', async () => {
    const { data, wrapper } = mountWithLocalStorage('cross-tab-key', 'original')

    const event = new StorageEvent('storage', {
      key: 'cross-tab-key',
      newValue: JSON.stringify('from-other-tab'),
    })
    window.dispatchEvent(event)

    expect(data.value).toBe('from-other-tab')
    wrapper.unmount()
  })

  it('resets to defaultValue when storage event has null newValue (key removed)', async () => {
    const { data, wrapper } = mountWithLocalStorage('removed-key', 'default-val')

    const event = new StorageEvent('storage', {
      key: 'removed-key',
      newValue: null,
    })
    window.dispatchEvent(event)

    expect(data.value).toBe('default-val')
    wrapper.unmount()
  })

  it('ignores storage events for different keys', async () => {
    const { data, wrapper } = mountWithLocalStorage('my-key', 'keep-me')

    const event = new StorageEvent('storage', {
      key: 'other-key',
      newValue: JSON.stringify('should-not-change'),
    })
    window.dispatchEvent(event)

    expect(data.value).toBe('keep-me')
    wrapper.unmount()
  })

  it('calls onReadError when deserialization fails on init', () => {
    localStorage.setItem('bad-json', '{invalid json')
    const onReadError = vi.fn()
    const { data } = mountWithLocalStorage('bad-json', 'fallback', { onReadError })

    expect(onReadError).toHaveBeenCalled()
    expect(data.value).toBe('fallback')
  })

  it('calls onWriteError when serializer throws', async () => {
    const onWriteError = vi.fn()
    const serializer = vi.fn(() => { throw new Error('Serialization failed') })

    const { data, wrapper } = mountWithLocalStorage('fail-ser', 'val', { onWriteError, serializer })

    data.value = 'new-val'
    await nextTick()

    expect(onWriteError).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not listen to storage events when listenToStorageChanges is false', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const { wrapper } = mountWithLocalStorage('no-listen', 'val', {
      listenToStorageChanges: false,
    })

    expect(addSpy).not.toHaveBeenCalledWith('storage', expect.any(Function))
    wrapper.unmount()
  })
})
