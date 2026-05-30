import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSuggestionsStore } from './suggestions'

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}))

let uuidCounter = 0

vi.mock('uuid', () => ({
  v4: vi.fn(() => `uuid-${++uuidCounter}`),
}))

// ---- helpers ----

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

const baseSuggestionParams = {
  type: 'improvement' as const,
  category: 'quality' as const,
  priority: 'medium' as const,
  title: '测试建议',
  message: '这是一条测试建议消息',
  location: {},
}

// ---- tests ----

describe('suggestions store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('localStorage', createLocalStorageStub())
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-30T12:00:00.000Z'))
    uuidCounter = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initial state', () => {
    it('starts with empty suggestions and default config', () => {
      const store = useSuggestionsStore()

      expect(store.suggestions).toEqual([])
      expect(store.queue).toEqual([])
      expect(store.unreadCount).toBe(0)
      expect(store.highPriorityCount).toBe(0)
      expect(store.config.maxLength).toBe(50)
      expect(store.config.similarityThreshold).toBe(0.8)
    })
  })

  describe('addSuggestion', () => {
    it('adds a new suggestion to the list', () => {
      const store = useSuggestionsStore()
      const result = store.addSuggestion(baseSuggestionParams)

      expect(result).not.toBeNull()
      expect(result!.title).toBe('测试建议')
      expect(result!.status).toBe('unread')
      expect(result!.pushed).toBe(false)
      expect(store.suggestions).toHaveLength(1)
      expect(store.unreadCount).toBe(1)
    })

    it('assigns an id and timestamps', () => {
      const store = useSuggestionsStore()
      const s = store.addSuggestion(baseSuggestionParams)!

      expect(s.id).toBe('uuid-1')
      expect(s.createdAt).toBeInstanceOf(Date)
      expect(s.updatedAt).toBeInstanceOf(Date)
      expect(s.expiresAt).toBeInstanceOf(Date)
    })

    it('adds to the queue after creation', () => {
      const store = useSuggestionsStore()
      store.addSuggestion(baseSuggestionParams)

      expect(store.queue).toHaveLength(1)
      expect(store.queue[0].id).toBe('uuid-1')
      expect(store.queue[0].pushCount).toBe(0)
    })

    it('respects maxLength by dropping oldest suggestions', () => {
      const store = useSuggestionsStore()
      store.updateConfig({ maxLength: 3 })

      for (let i = 0; i < 5; i++) {
        store.addSuggestion({
          ...baseSuggestionParams,
          title: `建议 ${i}`,
          message: `消息 ${i} unique-word-${i}`,
        })
      }

      expect(store.suggestions).toHaveLength(3)
    })

    it('deduplicates similar suggestions with the same location', () => {
      const store = useSuggestionsStore()
      const s1 = store.addSuggestion(baseSuggestionParams)
      const s2 = store.addSuggestion(baseSuggestionParams)

      // second call returns the existing similar suggestion
      expect(s2!.id).toBe(s1!.id)
      expect(store.suggestions).toHaveLength(1)
    })

    it('does not deduplicate suggestions in different scopes', () => {
      const store = useSuggestionsStore()
      const s1 = store.addSuggestion({
        ...baseSuggestionParams,
        location: { projectId: 'p1', chapter: 1 },
      })
      const s2 = store.addSuggestion({
        ...baseSuggestionParams,
        location: { projectId: 'p1', chapter: 2 },
      })

      expect(s2!.id).not.toBe(s1!.id)
      expect(store.suggestions).toHaveLength(2)
    })
  })

  describe('status management', () => {
    it('markAsRead changes status to read', () => {
      const store = useSuggestionsStore()
      const s = store.addSuggestion(baseSuggestionParams)!

      store.markAsRead(s.id)

      expect(store.suggestions[0].status).toBe('read')
      expect(store.unreadCount).toBe(0)
    })

    it('markAsAdopted changes status and removes from queue', () => {
      const store = useSuggestionsStore()
      const s = store.addSuggestion(baseSuggestionParams)!

      store.markAsAdopted(s.id)

      expect(store.suggestions[0].status).toBe('adopted')
      expect(store.queue).toHaveLength(0)
    })

    it('markAsIgnored changes status and removes from queue', () => {
      const store = useSuggestionsStore()
      const s = store.addSuggestion(baseSuggestionParams)!

      store.markAsIgnored(s.id)

      expect(store.suggestions[0].status).toBe('ignored')
      expect(store.queue).toHaveLength(0)
    })

    it('batchUpdateStatus updates multiple suggestions', () => {
      const store = useSuggestionsStore()
      store.updateConfig({ similarityThreshold: 0 })
      const s1 = store.addSuggestion({
        ...baseSuggestionParams,
        message: 'first unique suggestion',
      })!
      const s2 = store.addSuggestion({
        ...baseSuggestionParams,
        message: 'second unique suggestion',
      })!

      store.batchUpdateStatus([s1.id, s2.id], 'read')

      expect(store.suggestions.every((s) => s.status === 'read')).toBe(true)
    })

    it('updateStatus does nothing for unknown id', () => {
      const store = useSuggestionsStore()
      store.addSuggestion(baseSuggestionParams)

      store.updateStatus('nonexistent-id', 'read')

      expect(store.suggestions[0].status).toBe('unread')
    })
  })

  describe('deleteSuggestion', () => {
    it('removes the suggestion from both list and queue', () => {
      const store = useSuggestionsStore()
      const s = store.addSuggestion(baseSuggestionParams)!

      store.deleteSuggestion(s.id)

      expect(store.suggestions).toHaveLength(0)
      expect(store.queue).toHaveLength(0)
    })

    it('does nothing for unknown id', () => {
      const store = useSuggestionsStore()
      store.addSuggestion(baseSuggestionParams)

      store.deleteSuggestion('nonexistent')

      expect(store.suggestions).toHaveLength(1)
    })
  })

  describe('clearProcessed', () => {
    it('removes adopted and ignored suggestions, keeps unread and read', () => {
      const store = useSuggestionsStore()
      store.updateConfig({ similarityThreshold: 0 })

      const s1 = store.addSuggestion({
        ...baseSuggestionParams,
        message: 'msg-alpha-unique',
      })!
      const s2 = store.addSuggestion({
        ...baseSuggestionParams,
        message: 'msg-beta-unique',
      })!
      const s3 = store.addSuggestion({
        ...baseSuggestionParams,
        message: 'msg-gamma-unique',
      })!
      const s4 = store.addSuggestion({
        ...baseSuggestionParams,
        message: 'msg-delta-unique',
      })!

      store.markAsRead(s1.id)
      store.markAsAdopted(s2.id)
      store.markAsIgnored(s3.id)
      // s4 stays unread

      store.clearProcessed()

      expect(store.suggestions).toHaveLength(2)
      expect(store.suggestions.map((s) => s.id).sort()).toEqual([s1.id, s4.id].sort())
    })
  })

  describe('filterSuggestions', () => {
    function populateStore() {
      const store = useSuggestionsStore()
      store.updateConfig({ similarityThreshold: 0 })

      store.addSuggestion({
        type: 'improvement',
        category: 'quality',
        priority: 'high',
        title: '质量提升',
        message: 'quality improvement suggestion',
        location: { projectId: 'p1', chapter: 1 },
      })
      store.addSuggestion({
        type: 'issue',
        category: 'consistency',
        priority: 'low',
        title: '一致性问题',
        message: 'consistency issue found',
        location: { projectId: 'p1', chapter: 2 },
      })
      store.addSuggestion({
        type: 'question',
        category: 'reminder',
        priority: 'medium',
        title: '创作提醒',
        message: 'writing reminder',
        location: { projectId: 'p2' },
      })

      return store
    }

    it('filters by status', () => {
      const store = populateStore()
      store.markAsRead(store.suggestions[0].id)

      const unread = store.filterSuggestions({ status: 'unread' })
      const read = store.filterSuggestions({ status: 'read' })

      expect(unread).toHaveLength(2)
      expect(read).toHaveLength(1)
    })

    it('filters by type', () => {
      const store = populateStore()
      const issues = store.filterSuggestions({ type: 'issue' })

      expect(issues).toHaveLength(1)
      expect(issues[0].type).toBe('issue')
    })

    it('filters by category', () => {
      const store = populateStore()
      const quality = store.filterSuggestions({ category: 'quality' })

      expect(quality).toHaveLength(1)
    })

    it('filters by priority', () => {
      const store = populateStore()
      const high = store.filterSuggestions({ priority: 'high' })

      expect(high).toHaveLength(1)
      expect(high[0].priority).toBe('high')
    })

    it('filters by projectId', () => {
      const store = populateStore()
      const p1 = store.filterSuggestions({ projectId: 'p1' })

      expect(p1).toHaveLength(2)
    })

    it('filters by chapter number', () => {
      const store = populateStore()
      const ch1 = store.filterSuggestions({ chapter: 1 })

      expect(ch1).toHaveLength(1)
    })

    it('filters by keyword in title or message', () => {
      const store = populateStore()
      const result = store.filterSuggestions({ keyword: '质量' })

      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('质量提升')
    })

    it('supports array filters', () => {
      const store = populateStore()
      const result = store.filterSuggestions({
        type: ['improvement', 'issue'],
      })

      expect(result).toHaveLength(2)
    })
  })

  describe('getSuggestion', () => {
    it('returns a suggestion by id', () => {
      const store = useSuggestionsStore()
      const s = store.addSuggestion(baseSuggestionParams)!

      const found = store.getSuggestion(s.id)

      expect(found).toBeDefined()
      expect(found!.id).toBe(s.id)
    })

    it('returns undefined for unknown id', () => {
      const store = useSuggestionsStore()

      expect(store.getSuggestion('nope')).toBeUndefined()
    })
  })

  describe('getSuggestionsByChapter', () => {
    it('returns suggestions for a specific chapter number', () => {
      const store = useSuggestionsStore()
      store.updateConfig({ similarityThreshold: 0 })

      store.addSuggestion({
        ...baseSuggestionParams,
        message: 'chapter-1-a',
        location: { chapter: 1 },
      })
      store.addSuggestion({
        ...baseSuggestionParams,
        message: 'chapter-1-b',
        location: { chapter: 1 },
      })
      store.addSuggestion({
        ...baseSuggestionParams,
        message: 'chapter-2-a',
        location: { chapter: 2 },
      })

      expect(store.getSuggestionsByChapter(1)).toHaveLength(2)
      expect(store.getSuggestionsByChapter(2)).toHaveLength(1)
      expect(store.getSuggestionsByChapter(99)).toHaveLength(0)
    })
  })

  describe('getSuggestionsByCharacter', () => {
    it('returns suggestions for a character id', () => {
      const store = useSuggestionsStore()
      store.updateConfig({ similarityThreshold: 0 })

      store.addSuggestion({
        ...baseSuggestionParams,
        message: 'char-a-msg',
        location: { characterId: 'char1' },
      })
      store.addSuggestion({
        ...baseSuggestionParams,
        message: 'char-b-msg',
        location: { characterId: 'char2' },
      })

      expect(store.getSuggestionsByCharacter('char1')).toHaveLength(1)
      expect(store.getSuggestionsByCharacter('char2')).toHaveLength(1)
      expect(store.getSuggestionsByCharacter('charX')).toHaveLength(0)
    })
  })

  describe('statistics', () => {
    it('computes counts by status, type, category, priority', () => {
      const store = useSuggestionsStore()
      store.updateConfig({ similarityThreshold: 0 })

      store.addSuggestion({
        type: 'improvement',
        category: 'quality',
        priority: 'high',
        title: 'A',
        message: 'stat-msg-1',
        location: {},
      })
      store.addSuggestion({
        type: 'issue',
        category: 'consistency',
        priority: 'low',
        title: 'B',
        message: 'stat-msg-2',
        location: {},
      })

      const stats = store.statistics

      expect(stats.total).toBe(2)
      expect(stats.byStatus.unread).toBe(2)
      expect(stats.byType.improvement).toBe(1)
      expect(stats.byType.issue).toBe(1)
      expect(stats.byCategory.quality).toBe(1)
      expect(stats.byCategory.consistency).toBe(1)
      expect(stats.byPriority.high).toBe(1)
      expect(stats.byPriority.low).toBe(1)
    })

    it('computes adoption rate', () => {
      const store = useSuggestionsStore()
      store.updateConfig({ similarityThreshold: 0 })

      const s1 = store.addSuggestion({
        ...baseSuggestionParams,
        message: 'adopt-1',
      })!
      const s2 = store.addSuggestion({
        ...baseSuggestionParams,
        message: 'adopt-2',
      })!

      store.markAsAdopted(s1.id)
      store.markAsIgnored(s2.id)

      expect(store.statistics.adoptionRate).toBe(50)
    })

    it('adoptionTrend has 7 entries', () => {
      const store = useSuggestionsStore()
      expect(store.statistics.adoptionTrend).toHaveLength(7)
    })
  })

  describe('highPriorityCount', () => {
    it('counts only high-priority unread suggestions', () => {
      const store = useSuggestionsStore()
      store.updateConfig({ similarityThreshold: 0 })

      const s1 = store.addSuggestion({
        ...baseSuggestionParams,
        priority: 'high',
        message: 'hp-msg-1-unique',
      })!
      const s2 = store.addSuggestion({
        ...baseSuggestionParams,
        priority: 'high',
        message: 'hp-msg-2-unique',
      })!
      store.addSuggestion({
        ...baseSuggestionParams,
        priority: 'low',
        message: 'lp-msg-1-unique',
      })

      expect(store.suggestions).toHaveLength(3)
      expect(store.highPriorityCount).toBe(2)

      store.markAsRead(s1.id)

      expect(s1.status).toBe('read')
      expect(store.highPriorityCount).toBe(1)
    })
  })

  describe('markAsPushed', () => {
    it('marks suggestion as pushed and updates queue item', () => {
      const store = useSuggestionsStore()
      const s = store.addSuggestion({
        ...baseSuggestionParams,
        priority: 'high',
      })!

      store.markAsPushed(s.id)

      expect(store.suggestions[0].pushed).toBe(true)
      expect(store.queue[0].pushCount).toBe(1)
    })
  })

  describe('updateConfig', () => {
    it('merges partial config with existing config', () => {
      const store = useSuggestionsStore()
      const originalMaxLength = store.config.maxLength

      store.updateConfig({ maxLength: 10 })

      expect(store.config.maxLength).toBe(10)
      expect(store.config.similarityThreshold).toBe(0.8) // preserved
    })
  })

  describe('updateRule', () => {
    it('updates an existing rule by id', () => {
      const store = useSuggestionsStore()

      store.updateRule('idle_reminder', { enabled: false })

      const rule = store.rules.find((r) => r.id === 'idle_reminder')
      expect(rule!.enabled).toBe(false)
    })

    it('does nothing for unknown rule id', () => {
      const store = useSuggestionsStore()
      const originalRules = [...store.rules]

      store.updateRule('nonexistent', { enabled: false })

      expect(store.rules).toEqual(originalRules)
    })
  })

  describe('saveToStorage / loadFromStorage', () => {
    it('round-trips through localStorage', () => {
      const store = useSuggestionsStore()
      store.updateConfig({ similarityThreshold: 0 })
      store.addSuggestion({
        ...baseSuggestionParams,
        title: '持久化测试',
        message: 'persist-msg',
      })

      // flush synchronously
      store.flushSave()

      const raw = localStorage.getItem('ai-novel-suggestions')
      expect(raw).toBeTruthy()

      // Create a fresh store and load
      setActivePinia(createPinia())
      const store2 = useSuggestionsStore()
      store2.loadFromStorage()

      expect(store2.suggestions).toHaveLength(1)
      expect(store2.suggestions[0].title).toBe('持久化测试')
    })
  })
})
