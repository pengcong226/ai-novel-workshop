import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTokenUsageStore } from './tokenUsage'

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}))

vi.mock('@/utils/generateId', () => ({
  generateId: vi.fn(() => `gen-id-${++mockIdCounter}`),
}))

let mockIdCounter = 0

function createLocalStorageStub(): Storage {
  const store = new Map<string, string>()
  return {
    get length() { return store.size },
    clear: () => store.clear(),
    getItem: (k: string) => store.get(k) ?? null,
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => store.delete(k),
    setItem: (k: string, v: string) => store.set(k, v),
  }
}

function makeRecordInput(overrides: Record<string, unknown> = {}) {
  return {
    projectId: 'proj-1',
    source: 'chat' as const,
    taskType: 'chapter' as const,
    model: 'gpt-4o',
    inputTokens: 100,
    outputTokens: 200,
    totalTokens: 300,
    inputCostUSD: 0.003,
    outputCostUSD: 0.006,
    totalUSD: 0.009,
    totalCNY: 0.065,
    latency: 1200,
    status: 'success' as const,
    ...overrides,
  }
}

const makeRecordUsage = makeRecordInput

function makeChatResponse(overrides: Record<string, unknown> = {}) {
  return {
    content: 'generated text',
    model: 'gpt-4o',
    usage: {
      inputTokens: 500,
      outputTokens: 300,
      totalTokens: 800,
    },
    cost: {
      inputCostUSD: 0.005,
      outputCostUSD: 0.006,
      totalUSD: 0.011,
      totalCNY: 0.08,
      model: 'gpt-4o',
      inputTokens: 500,
      outputTokens: 300,
      totalTokens: 800,
    },
    latency: 900,
    finishReason: 'stop' as const,
    ...overrides,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('tokenUsage store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('localStorage', createLocalStorageStub())
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-30T12:00:00.000Z'))
    mockIdCounter = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initial state', () => {
    it('starts with empty records and summary', () => {
      const store = useTokenUsageStore()

      expect(store.records).toEqual([])
      expect(store.summary).toEqual([])
    })
  })

  describe('recordUsage', () => {
    it('creates a record with auto-generated id and timestamp', () => {
      const store = useTokenUsageStore()

      const result = store.recordUsage(makeRecordInput())

      expect(result).not.toBeNull()
      expect(result!.id).toBeTruthy()
      expect(result!.timestamp).toBe('2026-05-30T12:00:00.000Z')
      expect(result!.projectId).toBe('proj-1')
    })

    it('returns null when projectId is empty string', () => {
      const store = useTokenUsageStore()

      const result = store.recordUsage(makeRecordUsage({ projectId: '' }))

      expect(result).toBeNull()
      expect(store.records).toHaveLength(0)
    })

    it('returns null when projectId is falsy', () => {
      const store = useTokenUsageStore()

      const result = store.recordUsage(makeRecordUsage({ projectId: undefined as any }))

      expect(result).toBeNull()
    })

    it('appends the record to the records array', () => {
      const store = useTokenUsageStore()

      store.recordUsage(makeRecordInput())
      store.recordUsage(makeRecordInput({ model: 'claude-3-opus' }))

      expect(store.records).toHaveLength(2)
    })

    it('sorts records by timestamp', () => {
      const store = useTokenUsageStore()

      store.recordUsage(makeRecordInput({ timestamp: '2026-05-30T13:00:00.000Z' }))
      store.recordUsage(makeRecordInput({ timestamp: '2026-05-30T11:00:00.000Z' }))

      expect(store.records[0].timestamp).toBe('2026-05-30T11:00:00.000Z')
      expect(store.records[1].timestamp).toBe('2026-05-30T13:00:00.000Z')
    })

    it('persists to localStorage after recording', () => {
      const store = useTokenUsageStore()

      store.recordUsage(makeRecordInput())

      const stored = localStorage.getItem('token_usage:proj-1')
      expect(stored).toBeTruthy()
      const parsed = JSON.parse(stored!)
      expect(parsed).toHaveLength(1)
    })

    it('normalizes taskType to unknown for invalid values', () => {
      const store = useTokenUsageStore()

      const result = store.recordUsage(makeRecordInput({ taskType: 'invalid' as any }))

      expect(result!.taskType).toBe('unknown')
    })
  })

  describe('recordFromChatResponse', () => {
    it('creates a record from a ChatResponse with usage and cost', () => {
      const store = useTokenUsageStore()

      const result = store.recordFromChatResponse({
        projectId: 'proj-2',
        source: 'chatStream',
        response: makeChatResponse(),
      })

      expect(result).not.toBeNull()
      expect(result!.inputTokens).toBe(500)
      expect(result!.outputTokens).toBe(300)
      expect(result!.totalUSD).toBe(0.011)
      expect(result!.model).toBe('gpt-4o')
      expect(result!.status).toBe('success')
    })

    it('returns null when response.usage is missing', () => {
      const store = useTokenUsageStore()

      const result = store.recordFromChatResponse({
        projectId: 'proj-2',
        source: 'chat',
        response: makeChatResponse({ usage: undefined }),
      })

      expect(result).toBeNull()
    })

    it('returns null when response.cost is missing', () => {
      const store = useTokenUsageStore()

      const result = store.recordFromChatResponse({
        projectId: 'proj-2',
        source: 'chat',
        response: makeChatResponse({ cost: undefined }),
      })

      expect(result).toBeNull()
    })

    it('extracts requestedBy from context metadata', () => {
      const store = useTokenUsageStore()

      const result = store.recordFromChatResponse({
        projectId: 'proj-2',
        source: 'chat',
        context: {
          type: 'chapter',
          complexity: 'medium',
          priority: 'balanced',
          metadata: { requestedBy: 'auto-gen' },
        } as any,
        response: makeChatResponse(),
      })

      expect(result!.requestedBy).toBe('auto-gen')
    })

    it('falls back to response.model when cost.model is empty', () => {
      const store = useTokenUsageStore()

      const result = store.recordFromChatResponse({
        projectId: 'proj-2',
        source: 'chat',
        response: makeChatResponse({
          cost: {
            ...makeChatResponse().cost,
            model: '',
          },
        }),
      })

      expect(result!.model).toBe('gpt-4o')
    })
  })

  describe('getProjectRecords', () => {
    it('returns only records matching the given projectId', () => {
      const store = useTokenUsageStore()
      store.recordUsage(makeRecordInput({ projectId: 'proj-a' }))
      store.recordUsage(makeRecordInput({ projectId: 'proj-b' }))
      store.recordUsage(makeRecordInput({ projectId: 'proj-a' }))

      const result = store.getProjectRecords('proj-a')

      expect(result).toHaveLength(2)
      expect(result.every(r => r.projectId === 'proj-a')).toBe(true)
    })

    it('returns empty array when no records match', () => {
      const store = useTokenUsageStore()
      store.recordUsage(makeRecordInput({ projectId: 'proj-a' }))

      expect(store.getProjectRecords('proj-z')).toEqual([])
    })
  })

  describe('loadProjectUsage', () => {
    it('loads records from localStorage into memory', () => {
      const store = useTokenUsageStore()
      const records = [
        { id: 'r1', projectId: 'proj-x', timestamp: '2026-05-30T10:00:00.000Z', source: 'chat', model: 'gpt-4o', status: 'success', taskType: 'chapter', inputTokens: 10, outputTokens: 20, totalTokens: 30, inputCostUSD: 0, outputCostUSD: 0, totalUSD: 0, totalCNY: 0, latency: 100 },
      ]
      localStorage.setItem('token_usage:proj-x', JSON.stringify(records))

      store.loadProjectUsage('proj-x')

      expect(store.getProjectRecords('proj-x')).toHaveLength(1)
      expect(store.getProjectRecords('proj-x')[0].id).toBe('r1')
    })

    it('removes in-memory records for the project when localStorage has no data', () => {
      const store = useTokenUsageStore()
      store.recordUsage(makeRecordInput({ projectId: 'proj-empty' }))
      expect(store.getProjectRecords('proj-empty')).toHaveLength(1)

      store.loadProjectUsage('proj-empty')

      expect(store.getProjectRecords('proj-empty')).toHaveLength(0)
    })

    it('handles malformed JSON gracefully', () => {
      const store = useTokenUsageStore()
      localStorage.setItem('token_usage:proj-bad', 'not-valid-json{')

      store.loadProjectUsage('proj-bad')

      expect(store.getProjectRecords('proj-bad')).toHaveLength(0)
    })

    it('handles non-array localStorage values gracefully', () => {
      const store = useTokenUsageStore()
      localStorage.setItem('token_usage:proj-obj', JSON.stringify({ not: 'array' }))

      store.loadProjectUsage('proj-obj')

      expect(store.getProjectRecords('proj-obj')).toHaveLength(0)
    })
  })

  describe('clearProjectUsage', () => {
    it('removes records from memory and localStorage', () => {
      const store = useTokenUsageStore()
      store.recordUsage(makeRecordInput({ projectId: 'proj-del' }))
      store.recordUsage(makeRecordInput({ projectId: 'proj-keep' }))

      store.clearProjectUsage('proj-del')

      expect(store.getProjectRecords('proj-del')).toHaveLength(0)
      expect(store.getProjectRecords('proj-keep')).toHaveLength(1)
      expect(localStorage.getItem('token_usage:proj-del')).toBeNull()
    })
  })

  describe('exportProjectUsage', () => {
    it('returns a JSON string of project records', () => {
      const store = useTokenUsageStore()
      store.recordUsage(makeRecordInput({ projectId: 'proj-exp' }))

      const json = store.exportProjectUsage('proj-exp')
      const parsed = JSON.parse(json)

      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed).toHaveLength(1)
      expect(parsed[0].projectId).toBe('proj-exp')
    })

    it('returns an empty array JSON for unknown project', () => {
      const store = useTokenUsageStore()

      const json = store.exportProjectUsage('no-such-project')

      expect(JSON.parse(json)).toEqual([])
    })
  })

  describe('summary', () => {
    it('mirrors all records regardless of projectId', () => {
      const store = useTokenUsageStore()
      store.recordUsage(makeRecordInput({ projectId: 'a' }))
      store.recordUsage(makeRecordInput({ projectId: 'b' }))

      expect(store.summary).toHaveLength(2)
    })
  })

  describe('$reset', () => {
    it('clears all records', () => {
      const store = useTokenUsageStore()
      store.recordUsage(makeRecordInput())
      store.recordUsage(makeRecordInput({ projectId: 'other' }))
      expect(store.records).toHaveLength(2)

      store.$reset()

      expect(store.records).toEqual([])
      expect(store.summary).toEqual([])
    })
  })
})
