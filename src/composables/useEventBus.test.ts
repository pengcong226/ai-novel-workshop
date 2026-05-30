import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useEventBus } from './useEventBus'
import type { UseEventBusReturn } from './useEventBus'

// Use the real eventBus singleton (tested separately) but clear it each run.
import { eventBus } from '@/utils/eventBus'

function mountEventBus(): UseEventBusReturn {
  let result!: UseEventBusReturn

  mount(
    defineComponent({
      setup() {
        result = useEventBus()
        return result
      },
      render: () => h('div'),
    }),
  )

  return result
}

describe('useEventBus', () => {
  beforeEach(() => {
    eventBus.clear()
  })

  it('returns the bus singleton', () => {
    const { bus } = mountEventBus()
    expect(bus).toBe(eventBus)
  })

  it('on registers a listener that receives emitted events', () => {
    const { on, emit } = mountEventBus()
    const handler = vi.fn()

    on('chapter:saved', handler)
    emit('chapter:saved', { chapter: { id: '1' } as any })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({ chapter: { id: '1' } })
  })

  it('once only fires the listener once', () => {
    const { once, emit } = mountEventBus()
    const handler = vi.fn()

    once('ai:completed', handler)

    emit('ai:completed', { taskType: 'gen', durationMs: 100 } as any)
    emit('ai:completed', { taskType: 'gen', durationMs: 200 } as any)

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('off manually removes a listener before unmount', () => {
    const { on, off, emit } = mountEventBus()
    const handler = vi.fn()

    on('project:saved', handler)
    off('project:saved', handler)
    emit('project:saved', { projectId: '1', updatedAt: new Date() })

    expect(handler).not.toHaveBeenCalled()
  })

  it('multiple listeners for the same event all fire', () => {
    const { on, emit } = mountEventBus()
    const handler1 = vi.fn()
    const handler2 = vi.fn()

    on('entity:created', handler1)
    on('entity:created', handler2)
    emit('entity:created', { entity: { id: 'e1' } } as any)

    expect(handler1).toHaveBeenCalledTimes(1)
    expect(handler2).toHaveBeenCalledTimes(1)
  })

  it('unsub returned by on removes the listener', () => {
    const { on: _on, emit, bus } = mountEventBus()
    const handler = vi.fn()

    // Use the unsub function returned by the bus (not the composable on wrapper)
    const unsub = bus.on('chapter:deleted', handler)
    unsub()

    emit('chapter:deleted', { chapterId: 'c1', chapterNumber: 1 })
    expect(handler).not.toHaveBeenCalled()
  })

  it('on with once option fires only once', () => {
    const { on, emit } = mountEventBus()
    const handler = vi.fn()

    on('outline:changed', handler, { once: true })
    emit('outline:changed', { projectId: 'p1', outline: {} })
    emit('outline:changed', { projectId: 'p1', outline: {} })

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('listeners on different events are independent', () => {
    const { on, emit } = mountEventBus()
    const savedHandler = vi.fn()
    const deletedHandler = vi.fn()

    on('chapter:saved', savedHandler)
    on('chapter:deleted', deletedHandler)

    emit('chapter:saved', { chapter: { id: '1' } } as any)

    expect(savedHandler).toHaveBeenCalledTimes(1)
    expect(deletedHandler).not.toHaveBeenCalled()
  })
})
