import { describe, it, expect, vi } from 'vitest'
import {
  WorldbookInjector,
  createInjector,
  createWorldbookInjector,
  mergeWorldbooks,
  filterWorldbook,
  exportWorldbookToJson,
  importWorldbookFromJson,
} from './worldbook-injector'
import type { Worldbook, WorldbookEntry, WorldbookGroup } from '@/types/worldbook'
import type { Entity } from '@/types/sandbox'
import type { InjectionContext, WorldbookCondition } from './worldbook-injector'

// ---- mock logger ----

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// ---- helpers ----

function makeEntry(overrides: Partial<WorldbookEntry> & { uid: number } = { uid: 1 }): WorldbookEntry {
  return {
    uid: overrides.uid,
    key: [],
    keys: [],
    content: '',
    enabled: true,
    ...overrides,
  } as WorldbookEntry
}

function makeWorldbook(entries: WorldbookEntry[], groups?: WorldbookGroup[]): Worldbook {
  return {
    name: 'Test Worldbook',
    entries,
    groups,
  }
}

function makeContext(overrides: Partial<InjectionContext> = {}): InjectionContext {
  return {
    projectId: 'proj-1',
    currentChapter: 1,
    currentContent: '',
    characters: [],
    recentEvents: [],
    worldState: {},
    ...overrides,
  }
}

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'char-1',
    projectId: 'proj-1',
    type: 'CHARACTER',
    name: '角色A',
    aliases: [],
    importance: 'major',
    category: 'protagonist',
    systemPrompt: '你是一个勇敢的冒险者',
    isArchived: false,
    createdAt: Date.now(),
    ...overrides,
  }
}

// ---- tests ----

describe('WorldbookInjector', () => {
  // =========================================================================
  // Construction & basic state
  // =========================================================================

  describe('constructor and basic state', () => {
    it('creates instance without worldbook', () => {
      const injector = new WorldbookInjector()
      expect(injector.getWorldbook()).toBeNull()
    })

    it('creates instance with worldbook', () => {
      const wb = makeWorldbook([])
      const injector = new WorldbookInjector(wb)
      expect(injector.getWorldbook()).toBe(wb)
    })

    it('setWorldbook updates the internal worldbook', () => {
      const injector = new WorldbookInjector()
      const wb = makeWorldbook([makeEntry({ uid: 10, keys: ['hello'] })])
      injector.setWorldbook(wb)
      expect(injector.getWorldbook()).toBe(wb)
      expect(injector.getWorldbook()!.entries).toHaveLength(1)
    })

    it('updateWorldbook replaces the internal worldbook', () => {
      const injector = new WorldbookInjector(makeWorldbook([]))
      const wb2 = makeWorldbook([makeEntry({ uid: 1 })])
      injector.updateWorldbook(wb2)
      expect(injector.getWorldbook()).toBe(wb2)
    })

    it('initializes groups from options', () => {
      const group: WorldbookGroup = {
        id: 'g1',
        name: 'Group 1',
        order: 0,
        entries: [1, 2],
      }
      const injector = new WorldbookInjector(undefined, { groups: [group] })
      // The group map is internal, but we can verify it works via setGroup/removeGroup
      // We remove an existing group to verify it was registered
      expect(injector.removeGroup('g1')).toBe(true)
      expect(injector.removeGroup('g1')).toBe(false)
    })
  })

  // =========================================================================
  // inject – no worldbook edge case
  // =========================================================================

  describe('inject with no worldbook', () => {
    it('returns empty result when worldbook is null', () => {
      const injector = new WorldbookInjector()
      const result = injector.inject(makeContext())
      expect(result.entries).toEqual([])
      expect(result.injectedContent).toBe('')
      expect(result.totalTokens).toBe(0)
      expect(result.stats.totalEntries).toBe(0)
      expect(result.injectionLog).toEqual([])
    })
  })

  // =========================================================================
  // Keyword matching
  // =========================================================================

  describe('keyword matching', () => {
    it('triggers entry when keyword matches current content', () => {
      const entry = makeEntry({
        uid: 1,
        keys: ['魔法'],
        content: '关于魔法的描述',
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      const result = injector.inject(
        makeContext({ currentContent: '主角开始施展魔法攻击怪物' })
      )

      expect(result.entries).toHaveLength(1)
      expect(result.entries[0].uid).toBe(1)
      expect(result.stats.keywordMatched).toBe(1)
    })

    it('does not trigger entry when keyword is absent', () => {
      const entry = makeEntry({
        uid: 1,
        keys: ['龙族'],
        content: '关于龙族的描述',
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      const result = injector.inject(
        makeContext({ currentContent: '主角走在森林里' })
      )

      expect(result.entries).toHaveLength(0)
      expect(result.stats.keywordMatched).toBe(0)
    })

    it('matches keyword in userPrompt', () => {
      const entry = makeEntry({
        uid: 1,
        keys: ['青云宗'],
        content: '关于青云宗的介绍',
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      const result = injector.inject(
        makeContext({ currentContent: '无匹配文本', userPrompt: '主角前往青云宗修炼' })
      )

      expect(result.entries).toHaveLength(1)
    })

    it('matches keyword in chapterContext location', () => {
      const entry = makeEntry({
        uid: 1,
        keys: ['魔法塔'],
        content: '魔法塔的描述',
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      const result = injector.inject(
        makeContext({
          currentContent: '',
          chapterContext: { location: '魔法塔顶层' },
        })
      )

      expect(result.entries).toHaveLength(1)
    })

    it('matches keyword case-insensitively', () => {
      const entry = makeEntry({
        uid: 1,
        keys: ['dragon'],
        content: 'Dragon lore',
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      const result = injector.inject(
        makeContext({ currentContent: 'The Dragon appeared.' })
      )

      expect(result.entries).toHaveLength(1)
    })

    it('matches keyword in recentEvents', () => {
      const entry = makeEntry({
        uid: 1,
        keys: ['暗影议会'],
        content: '暗影议会的阴谋',
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      const result = injector.inject(
        makeContext({
          currentContent: '',
          recentEvents: ['暗影议会召开了秘密会议'],
        })
      )

      expect(result.entries).toHaveLength(1)
    })

    it('matches keyword in character systemPrompt when characterIds present', () => {
      const entity = makeEntity({ id: 'c1', name: '林清雪', systemPrompt: '林清雪是一位冰系法师' })
      const entry = makeEntry({
        uid: 1,
        keys: ['冰系法师'],
        content: '冰系法师的设定',
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      const result = injector.inject(
        makeContext({
          currentContent: '',
          characters: [entity],
          chapterContext: { characterIds: ['c1'] },
        })
      )

      expect(result.entries).toHaveLength(1)
    })
  })

  // =========================================================================
  // Selective keyword matching
  // =========================================================================

  describe('selective keyword matching', () => {
    it('requires both primary and secondary keywords when selective is true', () => {
      const entry = makeEntry({
        uid: 1,
        keys: ['魔法'],
        secondary_keys: ['治疗'],
        selective: true,
        content: '治疗魔法的描述',
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      // Only primary matches -- selective requires both
      const r1 = injector.inject(
        makeContext({ currentContent: '主角使用了强大的魔法' })
      )
      expect(r1.entries).toHaveLength(0)

      // Both match
      const r2 = injector.inject(
        makeContext({ currentContent: '主角使用了治疗魔法' })
      )
      expect(r2.entries).toHaveLength(1)
    })

    it('selective with primary keyword but no secondary_keys still matches', () => {
      const entry = makeEntry({
        uid: 1,
        keys: ['魔法'],
        selective: true,
        secondary_keys: undefined,
        content: '描述',
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      const result = injector.inject(
        makeContext({ currentContent: '使用魔法' })
      )
      expect(result.entries).toHaveLength(1)
    })
  })

  // =========================================================================
  // Disabled & already-injected entries
  // =========================================================================

  describe('disabled and already-injected entries', () => {
    it('skips disabled entries', () => {
      const entry = makeEntry({
        uid: 1,
        keys: ['龙'],
        content: '龙的描述',
        enabled: false,
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      const result = injector.inject(
        makeContext({ currentContent: '龙出现了' })
      )

      expect(result.entries).toHaveLength(0)
    })

    it('skips already-injected entries via injectedEntries set', () => {
      const entry = makeEntry({
        uid: 1,
        keys: ['龙'],
        content: '龙的描述',
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      const result = injector.inject(
        makeContext({
          currentContent: '龙出现了',
          injectedEntries: new Set(['1']),
        })
      )

      expect(result.entries).toHaveLength(0)
    })
  })

  // =========================================================================
  // Chapter range
  // =========================================================================

  describe('chapter range', () => {
    it('triggers entry when currentChapter is within range', () => {
      const entry = makeEntry({
        uid: 1,
        keys: ['事件'],
        content: '重要事件',
        extensions: { startChapter: 3, endChapter: 7 },
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      const result = injector.inject(
        makeContext({ currentContent: '发生了事件', currentChapter: 5 })
      )

      expect(result.entries).toHaveLength(1)
      expect(result.stats.chapterInRange).toBe(1)
    })

    it('does not trigger when currentChapter is before start', () => {
      const entry = makeEntry({
        uid: 1,
        keys: ['事件'],
        content: '重要事件',
        extensions: { startChapter: 10 },
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      const result = injector.inject(
        makeContext({ currentContent: '发生了事件', currentChapter: 3 })
      )

      expect(result.entries).toHaveLength(0)
    })

    it('does not trigger when currentChapter is after end', () => {
      const entry = makeEntry({
        uid: 1,
        keys: ['事件'],
        content: '重要事件',
        extensions: { endChapter: 5 },
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      const result = injector.inject(
        makeContext({ currentContent: '发生了事件', currentChapter: 10 })
      )

      expect(result.entries).toHaveLength(0)
    })

    it('triggers when no chapter range is specified', () => {
      const entry = makeEntry({
        uid: 1,
        keys: ['事件'],
        content: '事件',
        extensions: {},
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      const result = injector.inject(
        makeContext({ currentContent: '事件发生', currentChapter: 999 })
      )

      expect(result.entries).toHaveLength(1)
    })
  })

  // =========================================================================
  // Condition evaluation
  // =========================================================================

  describe('condition evaluation', () => {
    it('passes when no condition is present', () => {
      const entry = makeEntry({
        uid: 1,
        keys: ['test'],
        content: 'c',
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      const result = injector.inject(makeContext({ currentContent: 'test' }))
      expect(result.entries).toHaveLength(1)
    })

    it('evaluates "and" condition', () => {
      const condition: WorldbookCondition = {
        type: 'and',
        conditions: [
          { type: 'comparison', field: 'currentChapter', operator: 'gte', value: 5 },
          { type: 'exists', field: 'userPrompt' },
        ],
      }
      const entry = makeEntry({
        uid: 1,
        keys: ['x'],
        content: 'c',
        extensions: { condition },
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      // Missing userPrompt -> fails and
      const r1 = injector.inject(
        makeContext({ currentContent: 'x', currentChapter: 10 })
      )
      expect(r1.entries).toHaveLength(0)

      // All conditions met
      const r2 = injector.inject(
        makeContext({
          currentContent: 'x',
          currentChapter: 10,
          userPrompt: 'hello',
        })
      )
      expect(r2.entries).toHaveLength(1)
    })

    it('evaluates "or" condition', () => {
      const condition: WorldbookCondition = {
        type: 'or',
        conditions: [
          { type: 'comparison', field: 'currentChapter', operator: 'eq', value: 100 },
          { type: 'exists', field: 'userPrompt' },
        ],
      }
      const entry = makeEntry({
        uid: 1,
        keys: ['x'],
        content: 'c',
        extensions: { condition },
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      const result = injector.inject(
        makeContext({ currentContent: 'x', currentChapter: 1, userPrompt: 'hi' })
      )
      expect(result.entries).toHaveLength(1)
    })

    it('evaluates "not" condition', () => {
      const condition: WorldbookCondition = {
        type: 'not',
        conditions: [{ type: 'exists', field: 'userPrompt' }],
      }
      const entry = makeEntry({
        uid: 1,
        keys: ['x'],
        content: 'c',
        extensions: { condition },
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      // No userPrompt -> not(exists) = true -> triggers
      const r1 = injector.inject(makeContext({ currentContent: 'x' }))
      expect(r1.entries).toHaveLength(1)

      // Has userPrompt -> not(exists) = false -> blocked
      const r2 = injector.inject(
        makeContext({ currentContent: 'x', userPrompt: 'hi' })
      )
      expect(r2.entries).toHaveLength(0)
    })

    it('evaluates comparison operators: eq, ne, gt, gte, lt, lte, contains', () => {
      const operators: Array<{
        op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains'
        value: unknown
        chapter: number
        expected: boolean
      }> = [
        { op: 'eq', value: 5, chapter: 5, expected: true },
        { op: 'eq', value: 5, chapter: 6, expected: false },
        { op: 'ne', value: 5, chapter: 6, expected: true },
        { op: 'gt', value: 5, chapter: 6, expected: true },
        { op: 'gte', value: 5, chapter: 5, expected: true },
        { op: 'lt', value: 5, chapter: 4, expected: true },
        { op: 'lte', value: 5, chapter: 5, expected: true },
        { op: 'contains', value: '魔', chapter: 0, expected: true }, // userPrompt contains 魔
      ]

      for (const { op, value, chapter, expected } of operators) {
        const condition: WorldbookCondition = {
          type: 'comparison',
          field: op === 'contains' ? 'userPrompt' : 'currentChapter',
          operator: op,
          value,
        }
        const entry = makeEntry({
          uid: 1,
          keys: ['x'],
          content: 'c',
          extensions: { condition },
        })
        const injector = new WorldbookInjector(makeWorldbook([entry]))

        const result = injector.inject(
          makeContext({
            currentContent: 'x',
            currentChapter: chapter,
            userPrompt: '使用魔法',
          })
        )
        expect(result.entries).toHaveLength(expected ? 1 : 0)
      }
    })

    it('evaluates "exists" condition for nested fields', () => {
      const condition: WorldbookCondition = {
        type: 'exists',
        field: 'chapterContext.title',
      }
      const entry = makeEntry({
        uid: 1,
        keys: ['x'],
        content: 'c',
        extensions: { condition },
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      const r1 = injector.inject(
        makeContext({ currentContent: 'x' })
      )
      expect(r1.entries).toHaveLength(0)

      const r2 = injector.inject(
        makeContext({
          currentContent: 'x',
          chapterContext: { title: '第一章' },
        })
      )
      expect(r2.entries).toHaveLength(1)
    })

    it('evaluates "regex" condition with safe pattern', () => {
      const condition: WorldbookCondition = {
        type: 'regex',
        field: 'currentContent',
        pattern: '第.{1,3}章',
      }
      const entry = makeEntry({
        uid: 1,
        keys: [],
        content: 'c',
        extensions: { condition },
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      const r1 = injector.inject(
        makeContext({ currentContent: '现在是第三章了', currentChapter: 1 })
      )
      // keywordMatched will be false since keys is empty, so entry won't trigger
      // regex conditions only pass when keyword also matches
      expect(r1.entries).toHaveLength(0)

      // Now put the keyword in content so keyword also matches
      const entry2 = makeEntry({
        uid: 2,
        keys: ['第三章'],
        content: 'c',
        extensions: { condition },
      })
      const injector2 = new WorldbookInjector(makeWorldbook([entry2]))

      const r2 = injector2.inject(
        makeContext({ currentContent: '现在是第三章了', currentChapter: 1 })
      )
      expect(r2.entries).toHaveLength(1)
    })

    it('blocks "regex" with dangerous ReDoS patterns', () => {
      const condition: WorldbookCondition = {
        type: 'regex',
        field: 'currentContent',
        pattern: '(a+)+b',
      }
      const entry = makeEntry({
        uid: 1,
        keys: ['x'],
        content: 'c',
        extensions: { condition },
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      const result = injector.inject(
        makeContext({ currentContent: 'x' })
      )
      // ReDoS pattern blocked -> regex evaluates to false -> entry not triggered
      expect(result.entries).toHaveLength(0)
    })

    it('evaluates "custom" condition via registered evaluator', () => {
      const entry = makeEntry({
        uid: 1,
        keys: ['x'],
        content: 'c',
        extensions: {
          condition: { type: 'custom', customFunction: 'alwaysTrue' } as WorldbookCondition,
        },
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))
      injector.registerConditionEvaluator('alwaysTrue', () => true)

      const result = injector.inject(makeContext({ currentContent: 'x' }))
      expect(result.entries).toHaveLength(1)
    })

    it('custom condition returns false when evaluator not found', () => {
      const entry = makeEntry({
        uid: 1,
        keys: ['x'],
        content: 'c',
        extensions: {
          condition: { type: 'custom', customFunction: 'nonexistent' } as WorldbookCondition,
        },
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      const result = injector.inject(makeContext({ currentContent: 'x' }))
      expect(result.entries).toHaveLength(0)
    })

    it('custom condition returns false when customFunction is missing', () => {
      const entry = makeEntry({
        uid: 1,
        keys: ['x'],
        content: 'c',
        extensions: {
          condition: { type: 'custom' } as WorldbookCondition,
        },
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      const result = injector.inject(makeContext({ currentContent: 'x' }))
      expect(result.entries).toHaveLength(0)
    })

    it('returns false for unknown condition type', () => {
      const entry = makeEntry({
        uid: 1,
        keys: ['x'],
        content: 'c',
        extensions: {
          condition: { type: 'bogus' } as unknown as WorldbookCondition,
        },
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      const result = injector.inject(makeContext({ currentContent: 'x' }))
      expect(result.entries).toHaveLength(0)
    })
  })

  // =========================================================================
  // Token budget
  // =========================================================================

  describe('token budget', () => {
    it('skips entries exceeding token budget', () => {
      // Token counter returns the length of content (each char = 1 token for simplicity)
      const tokenCounter = (text: string) => text.length

      const entry1 = makeEntry({
        uid: 1,
        keys: ['a'],
        content: 'x'.repeat(100),
      })
      const entry2 = makeEntry({
        uid: 2,
        keys: ['b'],
        content: 'x'.repeat(2000),
      })
      const injector = new WorldbookInjector(makeWorldbook([entry1, entry2]), {
        tokenCounter,
      })

      const result = injector.inject(
        makeContext({
          currentContent: 'a b',
          tokenBudget: 150,
          usedTokens: 0,
        })
      )

      // First entry fits (100), second does not (100+2000 > 150)
      expect(result.entries).toHaveLength(1)
      expect(result.entries[0].uid).toBe(1)
      expect(result.stats.skippedDueToBudget).toBe(1)
    })

    it('respects usedTokens to reduce remaining budget', () => {
      const tokenCounter = (text: string) => text.length

      const entry = makeEntry({
        uid: 1,
        keys: ['a'],
        content: 'x'.repeat(50),
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]), {
        tokenCounter,
      })

      const result = injector.inject(
        makeContext({
          currentContent: 'a',
          tokenBudget: 100,
          usedTokens: 80,
        })
      )

      // 50 tokens needed but only 20 remaining
      expect(result.entries).toHaveLength(0)
      expect(result.stats.skippedDueToBudget).toBe(1)
    })

    it('uses default budget of 2000 when not specified', () => {
      // Default token counter: Chinese chars ~0.6 each, English words ~1.3 each
      const entry = makeEntry({
        uid: 1,
        keys: ['test'],
        content: '这是测试内容',
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      const result = injector.inject(
        makeContext({ currentContent: 'test' })
      )

      // Well within default 2000 budget
      expect(result.entries).toHaveLength(1)
    })
  })

  // =========================================================================
  // Sorting / ordering
  // =========================================================================

  describe('entry sorting', () => {
    it('sorts by position weight first', () => {
      const entryAfter = makeEntry({
        uid: 1,
        keys: ['x'],
        content: 'after',
        position: 'after_char',
      })
      const entryBefore = makeEntry({
        uid: 2,
        keys: ['x'],
        content: 'before',
        position: 'before_char',
      })
      const injector = new WorldbookInjector(
        makeWorldbook([entryAfter, entryBefore])
      )

      const result = injector.inject(makeContext({ currentContent: 'x' }))

      expect(result.entries[0].uid).toBe(2) // before_char comes first
      expect(result.entries[1].uid).toBe(1)
    })

    it('sorts by priority descending when position is equal', () => {
      const low = makeEntry({
        uid: 1,
        keys: ['x'],
        content: 'low',
        priority: 5,
      })
      const high = makeEntry({
        uid: 2,
        keys: ['x'],
        content: 'high',
        priority: 20,
      })
      const injector = new WorldbookInjector(makeWorldbook([low, high]))

      const result = injector.inject(makeContext({ currentContent: 'x' }))

      expect(result.entries[0].uid).toBe(2) // higher priority first
      expect(result.entries[1].uid).toBe(1)
    })

    it('sorts by insertion_order ascending when priority is equal', () => {
      const later = makeEntry({
        uid: 1,
        keys: ['x'],
        content: 'later',
        insertion_order: 200,
      })
      const earlier = makeEntry({
        uid: 2,
        keys: ['x'],
        content: 'earlier',
        insertion_order: 10,
      })
      const injector = new WorldbookInjector(makeWorldbook([later, earlier]))

      const result = injector.inject(makeContext({ currentContent: 'x' }))

      expect(result.entries[0].uid).toBe(2) // lower order first
      expect(result.entries[1].uid).toBe(1)
    })
  })

  // =========================================================================
  // Injection result structure
  // =========================================================================

  describe('injection result', () => {
    it('groups content by position with separator', () => {
      const e1 = makeEntry({
        uid: 1,
        keys: ['x'],
        content: 'Content A',
        position: 'before_char',
      })
      const e2 = makeEntry({
        uid: 2,
        keys: ['x'],
        content: 'Content B',
        position: 'after_char',
      })
      const injector = new WorldbookInjector(makeWorldbook([e1, e2]))

      const result = injector.inject(makeContext({ currentContent: 'x' }))

      expect(result.injectedContent).toContain('[before_char]')
      expect(result.injectedContent).toContain('Content A')
      expect(result.injectedContent).toContain('[after_char]')
      expect(result.injectedContent).toContain('Content B')
      expect(result.injectedContent).toContain('---')
    })

    it('populates injection log for triggered entries', () => {
      const entry = makeEntry({
        uid: 1,
        keys: ['龙'],
        content: '龙的传说',
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      const result = injector.inject(makeContext({ currentContent: '龙出现了' }))

      expect(result.injectionLog).toHaveLength(1)
      const log = result.injectionLog[0]
      expect(log.entryId).toBe('1')
      expect(log.injected).toBe(true)
      expect(log.evaluationResult.keywordMatched).toBe(true)
      expect(log.evaluationResult.chapterInRange).toBe(true)
      expect(log.evaluationResult.conditionSatisfied).toBe(true)
    })

    it('reports correct stats', () => {
      const entries = [
        makeEntry({ uid: 1, keys: ['龙'], content: '龙的传说' }),
        makeEntry({ uid: 2, keys: ['精灵'], content: '精灵', enabled: false }),
        makeEntry({ uid: 3, keys: ['不存在的词'], content: '不会匹配' }),
        makeEntry({ uid: 4, keys: ['龙'], content: '另一条龙的条目' }),
      ]
      const injector = new WorldbookInjector(makeWorldbook(entries))

      const result = injector.inject(makeContext({ currentContent: '龙出现了' }))

      expect(result.stats.totalEntries).toBe(4)
      expect(result.stats.keywordMatched).toBe(2) // uid 1 and 4
      expect(result.stats.injected).toBe(2)
    })
  })

  // =========================================================================
  // Lookup methods (no injection needed)
  // =========================================================================

  describe('findEntry', () => {
    it('finds entry by string uid', () => {
      const wb = makeWorldbook([
        makeEntry({ uid: 42, keys: ['test'] }),
      ])
      const injector = new WorldbookInjector(wb)
      expect(injector.findEntry('42')).toBeDefined()
      expect(injector.findEntry('42')!.uid).toBe(42)
    })

    it('returns undefined for missing entry', () => {
      const injector = new WorldbookInjector(makeWorldbook([]))
      expect(injector.findEntry('999')).toBeUndefined()
    })

    it('returns undefined when no worldbook set', () => {
      const injector = new WorldbookInjector()
      expect(injector.findEntry('1')).toBeUndefined()
    })
  })

  describe('findEntriesByKeyword', () => {
    it('finds entries with matching key', () => {
      const wb = makeWorldbook([
        makeEntry({ uid: 1, keys: ['龙族', '巨龙'] }),
        makeEntry({ uid: 2, keys: ['精灵'] }),
      ])
      const injector = new WorldbookInjector(wb)

      const results = injector.findEntriesByKeyword('龙族')
      expect(results).toHaveLength(1)
      expect(results[0].uid).toBe(1)
    })

    it('matches case-insensitively by default', () => {
      const wb = makeWorldbook([
        makeEntry({ uid: 1, keys: ['Dragon'] }),
      ])
      const injector = new WorldbookInjector(wb)

      expect(injector.findEntriesByKeyword('dragon')).toHaveLength(1)
    })

    it('respects case_sensitive flag', () => {
      const wb = makeWorldbook([
        makeEntry({ uid: 1, keys: ['Dragon'], case_sensitive: true }),
      ])
      const injector = new WorldbookInjector(wb)

      expect(injector.findEntriesByKeyword('dragon')).toHaveLength(0)
      expect(injector.findEntriesByKeyword('Dragon')).toHaveLength(1)
    })

    it('returns empty when no worldbook', () => {
      const injector = new WorldbookInjector()
      expect(injector.findEntriesByKeyword('x')).toEqual([])
    })
  })

  describe('findEntriesByType', () => {
    it('finds entries matching a type', () => {
      const wb = makeWorldbook([
        makeEntry({ uid: 1, type: 'lore' as any }),
        makeEntry({ uid: 2, type: 'character' as any }),
      ])
      const injector = new WorldbookInjector(wb)

      expect(injector.findEntriesByType('lore' as any)).toHaveLength(1)
    })

    it('returns empty when no worldbook', () => {
      const injector = new WorldbookInjector()
      expect(injector.findEntriesByType('lore' as any)).toEqual([])
    })
  })

  describe('findEntriesByCategory', () => {
    it('finds entries matching category', () => {
      const wb = makeWorldbook([
        makeEntry({ uid: 1, category: 'geography' }),
        makeEntry({ uid: 2, category: 'history' }),
      ])
      const injector = new WorldbookInjector(wb)

      expect(injector.findEntriesByCategory('geography')).toHaveLength(1)
    })

    it('returns empty when no worldbook', () => {
      const injector = new WorldbookInjector()
      expect(injector.findEntriesByCategory('x')).toEqual([])
    })
  })

  // =========================================================================
  // getStats
  // =========================================================================

  describe('getStats', () => {
    it('returns zeroed stats when no worldbook', () => {
      const injector = new WorldbookInjector()
      const stats = injector.getStats()
      expect(stats.totalEntries).toBe(0)
      expect(stats.enabledEntries).toBe(0)
      expect(stats.groups).toBe(0)
      expect(stats.byType).toEqual({})
      expect(stats.byCategory).toEqual({})
    })

    it('counts entries, types, categories, and groups', () => {
      const wb = makeWorldbook(
        [
          makeEntry({ uid: 1, type: 'lore' as any, category: 'magic' }),
          makeEntry({ uid: 2, type: 'lore' as any, category: 'geography' }),
          makeEntry({ uid: 3, type: 'character' as any, enabled: false }),
        ],
        [{ id: 'g1', name: 'G1', order: 0, entries: [] }]
      )
      const injector = new WorldbookInjector(wb)

      const stats = injector.getStats()
      expect(stats.totalEntries).toBe(3)
      expect(stats.enabledEntries).toBe(2)
      expect(stats.groups).toBe(1)
      expect(stats.byType['lore']).toBe(2)
      expect(stats.byType['character']).toBe(1)
      expect(stats.byCategory['magic']).toBe(1)
      expect(stats.byCategory['geography']).toBe(1)
    })
  })

  // =========================================================================
  // Groups
  // =========================================================================

  describe('group management', () => {
    it('setGroup and removeGroup work correctly', () => {
      const injector = new WorldbookInjector()
      const group: WorldbookGroup = {
        id: 'g1',
        name: '测试组',
        order: 0,
        entries: [1],
      }

      injector.setGroup(group)
      // removeGroup returns true for existing group
      expect(injector.removeGroup('g1')).toBe(true)
      // returns false for already-removed group
      expect(injector.removeGroup('g1')).toBe(false)
    })
  })

  // =========================================================================
  // Default token counter
  // =========================================================================

  describe('default token counter', () => {
    it('estimates tokens for Chinese text', () => {
      const entry = makeEntry({
        uid: 1,
        keys: ['test'],
        content: '你好世界', // 4 Chinese chars -> 4 * 0.6 = 2.4 -> ceil = 3
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      const result = injector.inject(makeContext({ currentContent: 'test' }))

      // totalTokens should be > 0 for Chinese content
      expect(result.totalTokens).toBeGreaterThan(0)
    })

    it('returns 0 for empty content', () => {
      const entry = makeEntry({
        uid: 1,
        keys: ['test'],
        content: '',
      })
      const injector = new WorldbookInjector(makeWorldbook([entry]))

      const result = injector.inject(makeContext({ currentContent: 'test' }))

      expect(result.totalTokens).toBe(0)
    })
  })
})

// ============================================================================
// Factory functions
// ============================================================================

describe('factory functions', () => {
  it('createInjector returns a WorldbookInjector instance', () => {
    const injector = createInjector()
    expect(injector).toBeInstanceOf(WorldbookInjector)
  })

  it('createWorldbookInjector is an alias for createInjector', () => {
    expect(createWorldbookInjector).toBe(createInjector)
  })

  it('passes worldbook and options through', () => {
    const wb = makeWorldbook([makeEntry({ uid: 1 })])
    const customCounter = (text: string) => text.length
    const injector = createInjector(wb, { tokenCounter: customCounter })

    expect(injector.getWorldbook()).toBe(wb)
  })
})

// ============================================================================
// mergeWorldbooks
// ============================================================================

describe('mergeWorldbooks', () => {
  it('merges entries from multiple worldbooks', () => {
    const wb1 = makeWorldbook([makeEntry({ uid: 1, keys: ['a'], content: 'A' })])
    const wb2 = makeWorldbook([makeEntry({ uid: 2, keys: ['b'], content: 'B' })])

    const merged = mergeWorldbooks([wb1, wb2])

    expect(merged.entries).toHaveLength(2)
    expect(merged.name).toBe('Merged Worldbook')
  })

  it('deduplicates by uid when deduplicate is true', () => {
    const wb1 = makeWorldbook([
      makeEntry({ uid: 1, keys: ['a'], content: 'Old', updated_at: 100 }),
    ])
    const wb2 = makeWorldbook([
      makeEntry({ uid: 1, keys: ['a'], content: 'New', updated_at: 200 }),
    ])

    const merged = mergeWorldbooks([wb1, wb2], { deduplicate: true })

    expect(merged.entries).toHaveLength(1)
    expect(merged.entries[0].content).toBe('New') // newer entry wins
  })

  it('updates timestamps when updateTimestamps is true', () => {
    const wb = makeWorldbook([makeEntry({ uid: 1, keys: ['a'], content: 'X' })])
    const now = 999999
    vi.spyOn(Date, 'now').mockReturnValue(now)

    const merged = mergeWorldbooks([wb], { updateTimestamps: true })

    expect(merged.entries[0].updated_at).toBe(now)

    vi.restoreAllMocks()
  })

  it('uses custom merge function when provided', () => {
    const wb1 = makeWorldbook([
      makeEntry({ uid: 1, keys: ['a'], content: 'first' }),
    ])
    const wb2 = makeWorldbook([
      makeEntry({ uid: 1, keys: ['a'], content: 'second' }),
    ])

    const merged = mergeWorldbooks([wb1, wb2], {
      deduplicate: true,
      mergeFunction: (existing, incoming) => ({
        ...incoming,
        content: `${existing.content}+${incoming.content}`,
      }),
    })

    expect(merged.entries[0].content).toBe('first+second')
  })
})

// ============================================================================
// filterWorldbook
// ============================================================================

describe('filterWorldbook', () => {
  it('filters entries by predicate', () => {
    const wb = makeWorldbook([
      makeEntry({ uid: 1, keys: ['a'], enabled: true }),
      makeEntry({ uid: 2, keys: ['b'], enabled: false }),
      makeEntry({ uid: 3, keys: ['c'], enabled: true }),
    ])

    const filtered = filterWorldbook(wb, (e) => e.enabled !== false)

    expect(filtered.entries).toHaveLength(2)
    expect(filtered.entries.map((e) => e.uid)).toEqual([1, 3])
  })

  it('preserves other worldbook properties', () => {
    const wb = makeWorldbook([makeEntry({ uid: 1 })], [
      { id: 'g1', name: 'G', order: 0, entries: [] },
    ])
    wb.description = 'test'

    const filtered = filterWorldbook(wb, () => true)

    expect(filtered.description).toBe('test')
    expect(filtered.groups).toHaveLength(1)
  })
})

// ============================================================================
// exportWorldbookToJson / importWorldbookFromJson
// ============================================================================

describe('JSON export/import', () => {
  it('exports and imports worldbook round-trip', () => {
    const original = makeWorldbook([
      makeEntry({ uid: 1, keys: ['test'], content: 'Hello' }),
    ])

    const json = exportWorldbookToJson(original)
    const restored = importWorldbookFromJson(json)

    expect(restored.entries).toHaveLength(1)
    expect(restored.entries[0].content).toBe('Hello')
    expect(restored.name).toBe('Test Worldbook')
  })

  it('exportWorldbookToJson produces compact JSON when pretty is false', () => {
    const wb = makeWorldbook([makeEntry({ uid: 1 })])

    const pretty = exportWorldbookToJson(wb, true)
    const compact = exportWorldbookToJson(wb, false)

    expect(compact.length).toBeLessThan(pretty.length)
  })
})
