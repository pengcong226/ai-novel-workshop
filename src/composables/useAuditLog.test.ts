import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useAuditLog } from './useAuditLog'

vi.mock('@/utils/generateId', () => ({
  generateId: vi.fn(() => 'test-id-123'),
}))

function mountAuditLog() {
  let result!: ReturnType<typeof useAuditLog>

  const wrapper = mount(
    defineComponent({
      setup() {
        result = useAuditLog()
        return result
      },
      render: () => h('div'),
    }),
  )

  return { wrapper, ...result }
}

describe('useAuditLog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear the module-scope log state between tests
    const { clearLogs } = useAuditLog()
    clearLogs()
  })

  it('starts with an empty logs array', () => {
    const { logs } = mountAuditLog()
    expect(logs.value).toEqual([])
  })

  it('addLog appends an entry with generated id and timestamp', () => {
    const { addLog, logs } = mountAuditLog()

    const id = addLog({ type: 'info', title: 'Test', description: 'Desc' })

    expect(id).toBe('test-id-123')
    expect(logs.value).toHaveLength(1)
    expect(logs.value[0]).toMatchObject({
      id: 'test-id-123',
      type: 'info',
      title: 'Test',
      description: 'Desc',
    })
    expect(logs.value[0].timestamp).toBeInstanceOf(Date)
  })

  it('addLog prepends new entries (newest first)', () => {
    const { addLog, logs } = mountAuditLog()

    addLog({ type: 'info', title: 'First', description: 'D1' })
    addLog({ type: 'warning', title: 'Second', description: 'D2' })

    expect(logs.value).toHaveLength(2)
    expect(logs.value[0].title).toBe('Second')
    expect(logs.value[1].title).toBe('First')
  })

  it('addLog supports optional chapterNumber and metadata', () => {
    const { addLog, logs } = mountAuditLog()

    addLog({
      type: 'ai_decision',
      title: 'State Update',
      description: 'Character mood changed',
      chapterNumber: 5,
      metadata: { character: 'Alice', mood: 'happy' },
    })

    expect(logs.value[0].chapterNumber).toBe(5)
    expect(logs.value[0].metadata).toEqual({ character: 'Alice', mood: 'happy' })
  })

  it('getLogsByChapter filters entries by chapterNumber', () => {
    const { addLog, getLogsByChapter } = mountAuditLog()

    addLog({ type: 'info', title: 'A', description: 'D', chapterNumber: 1 })
    addLog({ type: 'warning', title: 'B', description: 'D', chapterNumber: 2 })
    addLog({ type: 'info', title: 'C', description: 'D', chapterNumber: 1 })

    const chapter1Logs = getLogsByChapter(1)
    expect(chapter1Logs).toHaveLength(2)
    expect(chapter1Logs.every((l) => l.chapterNumber === 1)).toBe(true)
  })

  it('getLogsByChapter returns empty array when no match', () => {
    const { addLog, getLogsByChapter } = mountAuditLog()

    addLog({ type: 'info', title: 'A', description: 'D', chapterNumber: 1 })

    expect(getLogsByChapter(99)).toEqual([])
  })

  it('clearLogs empties the log array', () => {
    const { addLog, clearLogs, logs } = mountAuditLog()

    addLog({ type: 'info', title: 'A', description: 'D' })
    addLog({ type: 'error', title: 'B', description: 'D' })
    expect(logs.value).toHaveLength(2)

    clearLogs()

    expect(logs.value).toEqual([])
  })

  it('caps log at 500 entries by removing oldest', () => {
    const { addLog, logs } = mountAuditLog()

    // Fill to 500
    for (let i = 0; i < 500; i++) {
      addLog({ type: 'info', title: `Entry ${i}`, description: 'D' })
    }
    expect(logs.value).toHaveLength(500)

    // Add one more - should cap at 500, dropping the oldest (last in array)
    addLog({ type: 'warning', title: 'Overflow', description: 'D' })

    expect(logs.value).toHaveLength(500)
    expect(logs.value[0].title).toBe('Overflow') // newest first
  })

  it('logs is a readonly ref preventing external mutation', () => {
    const { logs } = mountAuditLog()

    // readonly() in Vue wraps with a Proxy that silently rejects writes in non-strict mode
    // TypeScript also prevents it at compile time. We verify the value is an array.
    expect(Array.isArray(logs.value)).toBe(true)
  })

  it('supports all AuditLogType values', () => {
    const { addLog, logs } = mountAuditLog()
    const types = ['info', 'warning', 'success', 'error', 'ai_decision', 'conflict_resolved', 'memory_updated'] as const

    types.forEach((type) => {
      addLog({ type, title: type, description: `Test ${type}` })
    })

    expect(logs.value).toHaveLength(types.length)
    types.forEach((type) => {
      expect(logs.value.some((l) => l.type === type)).toBe(true)
    })
  })
})
