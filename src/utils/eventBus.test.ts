import { describe, expect, it, vi, beforeEach } from 'vitest'
import { EventBus } from '@/utils/eventBus'

describe('EventBus', () => {
  let bus: InstanceType<typeof EventBus>

  beforeEach(() => {
    bus = new EventBus()
  })

  it('calls a registered listener when the event is emitted', () => {
    const handler = vi.fn()
    bus.on('chapter:saved', handler)

    bus.emit('chapter:saved', { chapter: { id: '1', number: 1 } } as any)

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith({ chapter: { id: '1', number: 1 } })
  })

  it('supports multiple listeners on the same event', () => {
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    bus.on('chapter:saved', handler1)
    bus.on('chapter:saved', handler2)

    bus.emit('chapter:saved', { chapter: {} } as any)

    expect(handler1).toHaveBeenCalledOnce()
    expect(handler2).toHaveBeenCalledOnce()
  })

  it('off removes a specific listener', () => {
    const handler = vi.fn()
    bus.on('chapter:saved', handler)
    bus.off('chapter:saved', handler)

    bus.emit('chapter:saved', { chapter: {} } as any)

    expect(handler).not.toHaveBeenCalled()
  })

  it('off without a function removes all listeners for the event', () => {
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    bus.on('chapter:saved', handler1)
    bus.on('chapter:saved', handler2)
    bus.off('chapter:saved')

    expect(bus.listenerCount('chapter:saved')).toBe(0)
  })

  it('once listener fires only once then is automatically removed', () => {
    const handler = vi.fn()
    bus.once('chapter:saved', handler)

    bus.emit('chapter:saved', { chapter: {} } as any)
    bus.emit('chapter:saved', { chapter: {} } as any)

    expect(handler).toHaveBeenCalledOnce()
    expect(bus.listenerCount('chapter:saved')).toBe(0)
  })

  it('on returns an unsubscribe function', () => {
    const handler = vi.fn()
    const unsub = bus.on('chapter:saved', handler)

    unsub()
    bus.emit('chapter:saved', { chapter: {} } as any)

    expect(handler).not.toHaveBeenCalled()
  })

  it('wildcard listener matches events with * pattern', () => {
    const handler = vi.fn()
    bus.on('chapter:*' as any, handler)

    bus.emit('chapter:saved', { chapter: {} } as any)
    bus.emit('chapter:deleted', { chapterId: '1', chapterNumber: 1 } as any)

    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('global wildcard * matches every event', () => {
    const handler = vi.fn()
    bus.on('*' as any, handler)

    bus.emit('chapter:saved', { chapter: {} } as any)
    bus.emit('project:opened', { projectId: '1', title: 't' } as any)

    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('listenerCount returns the correct count', () => {
    expect(bus.listenerCount('chapter:saved')).toBe(0)

    bus.on('chapter:saved', vi.fn())
    bus.on('chapter:saved', vi.fn())

    expect(bus.listenerCount('chapter:saved')).toBe(2)
  })

  it('clear removes all listeners across every event', () => {
    bus.on('chapter:saved', vi.fn())
    bus.on('project:opened', vi.fn())
    bus.on('chapter:*' as any, vi.fn())

    bus.clear()

    expect(bus.listenerCount('chapter:saved')).toBe(0)
    expect(bus.listenerCount('project:opened')).toBe(0)
  })

  it('does not throw when a listener errors; other listeners still fire', () => {
    const badHandler = vi.fn(() => {
      throw new Error('boom')
    })
    const goodHandler = vi.fn()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    bus.on('chapter:saved', badHandler)
    bus.on('chapter:saved', goodHandler)

    bus.emit('chapter:saved', { chapter: {} } as any)

    expect(badHandler).toHaveBeenCalledOnce()
    expect(goodHandler).toHaveBeenCalledOnce()
    expect(consoleSpy).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('emitting an event with no listeners does not throw', () => {
    expect(() => {
      bus.emit('chapter:saved', { chapter: {} } as any)
    }).not.toThrow()
  })
})
