import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTokenUsageStore } from '@/stores/tokenUsage'

const storage = new Map<string, string>()

vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { storage.set(key, value) }),
  removeItem: vi.fn((key: string) => { storage.delete(key) }),
})

describe('token usage store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    storage.clear()
    vi.clearAllMocks()
  })

  it('records chat responses without storing prompt content', () => {
    const store = useTokenUsageStore()

    store.recordFromChatResponse({
      projectId: 'project-1',
      source: 'chat',
      context: { type: 'chapter', complexity: 'medium', priority: 'balanced', metadata: { requestedBy: 'scheduler' } },
      response: {
        content: '正文',
        model: 'claude-sonnet-4-6',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        cost: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          inputCostUSD: 0.001,
          outputCostUSD: 0.002,
          totalUSD: 0.003,
          totalCNY: 0.0216,
          model: 'claude-sonnet-4-6',
        },
        latency: 900,
        finishReason: 'stop',
      },
    })

    expect(store.records).toHaveLength(1)
    expect(store.records[0]).toMatchObject({
      projectId: 'project-1',
      source: 'chat',
      taskType: 'chapter',
      requestedBy: 'scheduler',
      totalTokens: 150,
      totalUSD: 0.003,
    })
    expect(JSON.stringify(store.records[0])).not.toContain('正文')
  })

  it('loads and filters project-scoped persisted usage', () => {
    storage.set('token_usage:project-1', JSON.stringify([
      { id: '1', projectId: 'project-1', timestamp: '2026-04-25T00:00:00.000Z', source: 'chat', taskType: 'chapter', model: 'm1', inputTokens: 1, outputTokens: 2, totalTokens: 3, inputCostUSD: 0, outputCostUSD: 0, totalUSD: 0, totalCNY: 0, latency: 1, status: 'success' },
    ]))

    const store = useTokenUsageStore()
    store.loadProjectUsage('project-1')

    expect(store.records).toHaveLength(1)
    expect(store.getProjectRecords('project-1')).toHaveLength(1)
    expect(store.getProjectRecords('project-2')).toHaveLength(0)
  })

  it('falls back safely when persisted usage is corrupt', () => {
    storage.set('token_usage:project-1', '{bad json')
    const store = useTokenUsageStore()

    store.loadProjectUsage('project-1')

    expect(store.records).toEqual([])
  })

  it('caps persisted history to the newest 1000 records', () => {
    const store = useTokenUsageStore()

    for (let index = 0; index < 1005; index++) {
      store.recordUsage({
        projectId: 'project-1',
        source: 'mockChat',
        taskType: 'assistant',
        model: 'mock',
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
        inputCostUSD: 0,
        outputCostUSD: 0,
        totalUSD: 0,
        totalCNY: 0,
        latency: 1,
        status: 'success',
      })
    }

    expect(store.records).toHaveLength(1000)
    expect(store.records[0].id).not.toBe(store.records[999].id)
  })
})
