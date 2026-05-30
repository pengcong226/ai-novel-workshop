/**
 * 世界书动态注入引擎测试
 */

import { describe, it, expect, vi } from 'vitest'
import {
  WorldbookInjector,
  createInjector,
  createWorldbookInjector,
  mergeWorldbooks,
  filterWorldbook,
  exportWorldbookToJson,
  importWorldbookFromJson,
} from '../worldbook-injector'
import type { Worldbook, WorldbookEntry, WorldbookGroup } from '@/types/worldbook'
import type { Entity } from '@/types/sandbox'
import type { InjectionContext, WorldbookCondition } from '../worldbook-injector'

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<WorldbookEntry> = {}): WorldbookEntry {
  const key = overrides.key ?? ['test']
  return {
    uid: 1,
    key,
    content: 'test content',
    enabled: true,
    ...overrides,
    keys: overrides.keys ?? key,
  }
}

function makeWorldbook(entries: WorldbookEntry[] = []): Worldbook {
  return {
    name: 'Test Worldbook',
    entries,
  }
}

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'char-1',
    projectId: 'proj-1',
    type: 'CHARACTER',
    name: 'Alice',
    aliases: [],
    importance: 'major',
    category: 'character',
    systemPrompt: 'A brave warrior',
    isArchived: false,
    createdAt: Date.now(),
    ...overrides,
  }
}

function makeContext(overrides: Partial<InjectionContext> = {}): InjectionContext {
  return {
    projectId: 'proj-1',
    currentChapter: 5,
    currentContent: '',
    characters: [],
    recentEvents: [],
    worldState: {},
    ...overrides,
  }
}

const tokenCounter = (text: string) => Math.ceil(text.length / 4)

// ===========================================================================
// WorldbookInjector
// ===========================================================================

describe('WorldbookInjector', () => {
  // ---- constructor / setWorldbook / getWorldbook --------------------------

  it('creates with no worldbook and returns null from getWorldbook', () => {
    const injector = new WorldbookInjector()
    expect(injector.getWorldbook()).toBeNull()
  })

  it('setWorldbook stores the worldbook', () => {
    const injector = new WorldbookInjector()
    const wb = makeWorldbook([makeEntry()])
    injector.setWorldbook(wb)
    expect(injector.getWorldbook()).toBe(wb)
  })

  it('constructor accepts worldbook directly', () => {
    const wb = makeWorldbook([makeEntry()])
    const injector = new WorldbookInjector(wb)
    expect(injector.getWorldbook()).toBe(wb)
  })

  // ---- inject: empty / no worldbook --------------------------------------

  it('inject returns empty result when no worldbook is set', () => {
    const injector = new WorldbookInjector()
    const result = injector.inject(makeContext())
    expect(result.entries).toEqual([])
    expect(result.injectedContent).toBe('')
    expect(result.totalTokens).toBe(0)
    expect(result.stats.totalEntries).toBe(0)
  })

  // ---- inject: keyword matching -------------------------------------------

  it('triggers entry when keyword appears in currentContent', () => {
    const wb = makeWorldbook([
      makeEntry({ uid: 1, key: ['dragon'], content: 'Dragons are ancient creatures.' }),
    ])
    const injector = new WorldbookInjector(wb, { tokenCounter })
    const result = injector.inject(makeContext({ currentContent: 'The dragon appeared.' }))

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].uid).toBe(1)
    expect(result.stats.keywordMatched).toBe(1)
  })

  it('does not trigger entry when keyword is absent', () => {
    const wb = makeWorldbook([
      makeEntry({ uid: 1, key: ['dragon'], content: 'Dragons are ancient creatures.' }),
    ])
    const injector = new WorldbookInjector(wb, { tokenCounter })
    const result = injector.inject(makeContext({ currentContent: 'A sunny day.' }))

    expect(result.entries).toHaveLength(0)
    expect(result.stats.keywordMatched).toBe(0)
  })

  it('matches keyword case-insensitively', () => {
    const wb = makeWorldbook([
      makeEntry({ uid: 1, key: ['Dragon'], content: 'info' }),
    ])
    const injector = new WorldbookInjector(wb, { tokenCounter })
    const result = injector.inject(makeContext({ currentContent: 'the DRAGON roared' }))

    expect(result.entries).toHaveLength(1)
  })

  it('matches keyword in userPrompt', () => {
    const wb = makeWorldbook([
      makeEntry({ uid: 1, key: ['magic'], content: 'Magic system info' }),
    ])
    const injector = new WorldbookInjector(wb, { tokenCounter })
    const result = injector.inject(makeContext({ userPrompt: 'Write about magic spells' }))

    expect(result.entries).toHaveLength(1)
  })

  it('matches keyword in recentEvents', () => {
    const wb = makeWorldbook([
      makeEntry({ uid: 1, key: ['betrayal'], content: 'The betrayal info' }),
    ])
    const injector = new WorldbookInjector(wb, { tokenCounter })
    const result = injector.inject(makeContext({ recentEvents: ['The great betrayal'] }))

    expect(result.entries).toHaveLength(1)
  })

  it('matches keyword in chapter context location', () => {
    const wb = makeWorldbook([
      makeEntry({ uid: 1, key: ['castle'], content: 'Castle description' }),
    ])
    const injector = new WorldbookInjector(wb, { tokenCounter })
    const result = injector.inject(
      makeContext({ chapterContext: { location: 'The old castle' } }),
    )

    expect(result.entries).toHaveLength(1)
  })

  // ---- inject: selective matching (primary + secondary keys) ---------------

  it('selective entry requires both primary and secondary keyword match', () => {
    const wb = makeWorldbook([
      makeEntry({
        uid: 1,
        key: ['alice'],
        secondary_keys: ['sword'],
        selective: true,
        content: 'Alice with sword',
      }),
    ])
    const injector = new WorldbookInjector(wb, { tokenCounter })

    // Only primary matches
    const r1 = injector.inject(makeContext({ currentContent: 'alice walked' }))
    expect(r1.entries).toHaveLength(0)

    // Both match
    const r2 = injector.inject(makeContext({ currentContent: 'alice drew her sword' }))
    expect(r2.entries).toHaveLength(1)
  })

  // ---- inject: chapter range ----------------------------------------------

  it('respects startChapter extension', () => {
    const wb = makeWorldbook([
      makeEntry({
        uid: 1,
        key: ['test'],
        content: 'content',
        extensions: { startChapter: 10 },
      }),
    ])
    const injector = new WorldbookInjector(wb, { tokenCounter })

    const r1 = injector.inject(makeContext({ currentChapter: 5, currentContent: 'test' }))
    expect(r1.entries).toHaveLength(0)

    const r2 = injector.inject(makeContext({ currentChapter: 10, currentContent: 'test' }))
    expect(r2.entries).toHaveLength(1)
  })

  it('respects endChapter extension', () => {
    const wb = makeWorldbook([
      makeEntry({
        uid: 1,
        key: ['test'],
        content: 'content',
        extensions: { endChapter: 3 },
      }),
    ])
    const injector = new WorldbookInjector(wb, { tokenCounter })

    const r1 = injector.inject(makeContext({ currentChapter: 5, currentContent: 'test' }))
    expect(r1.entries).toHaveLength(0)

    const r2 = injector.inject(makeContext({ currentChapter: 3, currentContent: 'test' }))
    expect(r2.entries).toHaveLength(1)
  })

  // ---- inject: disabled / already-injected entries -------------------------

  it('skips disabled entries', () => {
    const wb = makeWorldbook([
      makeEntry({ uid: 1, key: ['test'], content: 'a', enabled: false }),
      makeEntry({ uid: 2, key: ['test'], content: 'b', enabled: true }),
    ])
    const injector = new WorldbookInjector(wb, { tokenCounter })
    const result = injector.inject(makeContext({ currentContent: 'test' }))

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].uid).toBe(2)
  })

  it('skips already-injected entries via injectedEntries set', () => {
    const wb = makeWorldbook([
      makeEntry({ uid: 1, key: ['test'], content: 'a' }),
      makeEntry({ uid: 2, key: ['test'], content: 'b' }),
    ])
    const injector = new WorldbookInjector(wb, { tokenCounter })
    const result = injector.inject(
      makeContext({ currentContent: 'test', injectedEntries: new Set(['1']) }),
    )

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].uid).toBe(2)
  })

  // ---- inject: condition evaluation ---------------------------------------

  it('evaluates "and" condition', () => {
    const condition: WorldbookCondition = {
      type: 'and',
      conditions: [
        { type: 'exists', field: 'currentContent' },
        { type: 'comparison', field: 'currentChapter', operator: 'gt', value: 3 },
      ],
    }
    const wb = makeWorldbook([
      makeEntry({
        uid: 1,
        key: ['test'],
        content: 'c',
        extensions: { condition },
      }),
    ])
    const injector = new WorldbookInjector(wb, { tokenCounter })

    const r1 = injector.inject(makeContext({ currentContent: 'test', currentChapter: 2 }))
    expect(r1.entries).toHaveLength(0)

    const r2 = injector.inject(makeContext({ currentContent: 'test', currentChapter: 5 }))
    expect(r2.entries).toHaveLength(1)
  })

  it('evaluates "or" condition', () => {
    const condition: WorldbookCondition = {
      type: 'or',
      conditions: [
        { type: 'comparison', field: 'currentChapter', operator: 'eq', value: 999 },
        { type: 'exists', field: 'userPrompt' },
      ],
    }
    const wb = makeWorldbook([
      makeEntry({
        uid: 1,
        key: ['test'],
        content: 'c',
        extensions: { condition },
      }),
    ])
    const injector = new WorldbookInjector(wb, { tokenCounter })

    const r1 = injector.inject(makeContext({ currentContent: 'test' }))
    expect(r1.entries).toHaveLength(0)

    const r2 = injector.inject(makeContext({ currentContent: 'test', userPrompt: 'hello' }))
    expect(r2.entries).toHaveLength(1)
  })

  it('evaluates "not" condition', () => {
    const condition: WorldbookCondition = {
      type: 'not',
      conditions: [{ type: 'exists', field: 'userPrompt' }],
    }
    const wb = makeWorldbook([
      makeEntry({
        uid: 1,
        key: ['test'],
        content: 'c',
        extensions: { condition },
      }),
    ])
    const injector = new WorldbookInjector(wb, { tokenCounter })

    const r1 = injector.inject(makeContext({ currentContent: 'test', userPrompt: 'x' }))
    expect(r1.entries).toHaveLength(0)

    const r2 = injector.inject(makeContext({ currentContent: 'test' }))
    expect(r2.entries).toHaveLength(1)
  })

  it('evaluates "comparison" conditions (eq, ne, gte, lt, lte, contains)', () => {
    const wb = makeWorldbook([
      makeEntry({
        uid: 1,
        key: ['test'],
        content: 'c',
        extensions: { condition: { type: 'comparison', field: 'currentChapter', operator: 'gte', value: 5 } },
      }),
    ])
    const injector = new WorldbookInjector(wb, { tokenCounter })

    expect(injector.inject(makeContext({ currentContent: 'test', currentChapter: 4 })).entries).toHaveLength(0)
    expect(injector.inject(makeContext({ currentContent: 'test', currentChapter: 5 })).entries).toHaveLength(1)
  })

  it('evaluates "regex" condition safely (blocks ReDoS patterns)', () => {
    const wb = makeWorldbook([
      makeEntry({
        uid: 1,
        key: ['test'],
        content: 'c',
        extensions: {
          condition: {
            type: 'regex',
            field: 'currentContent',
            pattern: '\\d{3,}',  // safe pattern, sanitized to {3,10}
          },
        },
      }),
    ])
    const injector = new WorldbookInjector(wb, { tokenCounter })

    const r1 = injector.inject(makeContext({ currentContent: 'test abc' }))
    expect(r1.entries).toHaveLength(0)

    const r2 = injector.inject(makeContext({ currentContent: 'test 12345' }))
    expect(r2.entries).toHaveLength(1)
  })

  it('blocks dangerous nested quantifier regex (ReDoS protection)', () => {
    const wb = makeWorldbook([
      makeEntry({
        uid: 1,
        key: ['test'],
        content: 'c',
        extensions: {
          condition: {
            type: 'regex',
            field: 'currentContent',
            pattern: '(a+)+',
          },
        },
      }),
    ])
    const injector = new WorldbookInjector(wb, { tokenCounter })
    const result = injector.inject(makeContext({ currentContent: 'test' }))

    // Condition should evaluate to false because the unsafe regex is blocked
    expect(result.entries).toHaveLength(0)
  })

  it('evaluates "custom" condition via registered evaluator', () => {
    const wb = makeWorldbook([
      makeEntry({
        uid: 1,
        key: ['test'],
        content: 'c',
        extensions: {
          condition: { type: 'custom', customFunction: 'isNightTime' },
        },
      }),
    ])

    const evaluators = new Map<string, (cond: WorldbookCondition, ctx: InjectionContext) => boolean>()
    evaluators.set('isNightTime', (_cond, ctx) => (ctx.worldState as Record<string, unknown>).time === 'night')

    const injector = new WorldbookInjector(wb, { tokenCounter, customEvaluators: evaluators })

    const r1 = injector.inject(makeContext({ currentContent: 'test', worldState: { time: 'day' } }))
    expect(r1.entries).toHaveLength(0)

    const r2 = injector.inject(makeContext({ currentContent: 'test', worldState: { time: 'night' } }))
    expect(r2.entries).toHaveLength(1)
  })

  it('returns false for unknown custom evaluator', () => {
    const wb = makeWorldbook([
      makeEntry({
        uid: 1,
        key: ['test'],
        content: 'c',
        extensions: {
          condition: { type: 'custom', customFunction: 'nonexistent' },
        },
      }),
    ])
    const injector = new WorldbookInjector(wb, { tokenCounter })
    const result = injector.inject(makeContext({ currentContent: 'test' }))

    expect(result.entries).toHaveLength(0)
  })

  // ---- inject: sorting ----------------------------------------------------

  it('sorts entries by position then priority then insertion_order', () => {
    const wb = makeWorldbook([
      makeEntry({ uid: 1, key: ['test'], content: 'a', position: 'after_char', priority: 5, insertion_order: 200 }),
      makeEntry({ uid: 2, key: ['test'], content: 'b', position: 'before_char', priority: 5, insertion_order: 100 }),
      makeEntry({ uid: 3, key: ['test'], content: 'c', position: 'before_char', priority: 10, insertion_order: 200 }),
    ])
    const injector = new WorldbookInjector(wb, { tokenCounter })
    const result = injector.inject(makeContext({ currentContent: 'test' }))

    // before_char comes first; within that, higher priority first
    expect(result.entries[0].uid).toBe(3)
    expect(result.entries[1].uid).toBe(2)
    expect(result.entries[2].uid).toBe(1)
  })

  // ---- inject: token budget -----------------------------------------------

  it('skips entries that exceed the token budget', () => {
    const bigContent = 'x'.repeat(400) // tokenCounter -> 100 tokens
    const wb = makeWorldbook([
      makeEntry({ uid: 1, key: ['test'], content: bigContent, priority: 10, insertion_order: 1 }),
      makeEntry({ uid: 2, key: ['test'], content: bigContent, priority: 5, insertion_order: 2 }),
    ])
    const injector = new WorldbookInjector(wb, { tokenCounter })

    // budget=150 tokens, usedTokens=0 => only first entry fits
    const result = injector.inject(
      makeContext({ currentContent: 'test', tokenBudget: 150, usedTokens: 0 }),
    )

    expect(result.entries).toHaveLength(1)
    expect(result.stats.skippedDueToBudget).toBe(1)
  })

  it('accounts for already-used tokens in the budget', () => {
    const content = 'x'.repeat(200) // ~50 tokens
    const wb = makeWorldbook([
      makeEntry({ uid: 1, key: ['test'], content }),
    ])
    const injector = new WorldbookInjector(wb, { tokenCounter })

    const result = injector.inject(
      makeContext({ currentContent: 'test', tokenBudget: 100, usedTokens: 80 }),
    )

    // remaining budget = 20 tokens, entry = 50 tokens => skipped
    expect(result.entries).toHaveLength(0)
    expect(result.stats.skippedDueToBudget).toBe(1)
  })

  // ---- inject: injectedContent format -------------------------------------

  it('generates position-tagged content sections', () => {
    const wb = makeWorldbook([
      makeEntry({ uid: 1, key: ['test'], content: 'before content', position: 'before_char' }),
      makeEntry({ uid: 2, key: ['test'], content: 'after content', position: 'after_char' }),
    ])
    const injector = new WorldbookInjector(wb, { tokenCounter })
    const result = injector.inject(makeContext({ currentContent: 'test' }))

    expect(result.injectedContent).toContain('[before_char]')
    expect(result.injectedContent).toContain('before content')
    expect(result.injectedContent).toContain('[after_char]')
    expect(result.injectedContent).toContain('after content')
    expect(result.injectedContent).toContain('---')
  })

  // ---- inject: injection log ----------------------------------------------

  it('produces injection log with evaluation details', () => {
    const wb = makeWorldbook([
      makeEntry({ uid: 1, key: ['test'], content: 'hit' }),
      makeEntry({ uid: 2, key: ['nope'], content: 'miss' }),
    ])
    const injector = new WorldbookInjector(wb, { tokenCounter })
    const result = injector.inject(makeContext({ currentContent: 'test' }))

    expect(result.injectionLog).toHaveLength(2)
    const hitLog = result.injectionLog.find(l => l.entryId === '1')!
    expect(hitLog.evaluationResult.keywordMatched).toBe(true)
    expect(hitLog.injected).toBe(true)

    const missLog = result.injectionLog.find(l => l.entryId === '2')!
    expect(missLog.evaluationResult.keywordMatched).toBe(false)
    expect(missLog.injected).toBe(false)
  })

  // ---- character keyword matching -----------------------------------------

  it('matches keyword in character name when characterIds present', () => {
    const character = makeEntity({ id: 'c1', name: 'Gandalf' })
    const wb = makeWorldbook([
      makeEntry({ uid: 1, key: ['gandalf'], content: 'Gandalf info' }),
    ])
    const injector = new WorldbookInjector(wb, { tokenCounter })
    const result = injector.inject(
      makeContext({
        currentContent: '',
        characters: [character],
        chapterContext: { characterIds: ['c1'] },
      }),
    )

    expect(result.entries).toHaveLength(1)
  })

  // ---- getModel-level methods ---------------------------------------------

  describe('findEntry', () => {
    it('finds entry by uid', () => {
      const wb = makeWorldbook([makeEntry({ uid: 42 })])
      const injector = new WorldbookInjector(wb)
      expect(injector.findEntry('42')).toBeDefined()
      expect(injector.findEntry('99')).toBeUndefined()
    })
  })

  describe('findEntriesByKeyword', () => {
    it('returns entries matching keyword (case-insensitive by default)', () => {
      const wb = makeWorldbook([
        makeEntry({ uid: 1, keys: ['Sword'] }),
        makeEntry({ uid: 2, keys: ['Shield'] }),
      ])
      const injector = new WorldbookInjector(wb)
      const results = injector.findEntriesByKeyword('sword')
      expect(results).toHaveLength(1)
      expect(results[0].uid).toBe(1)
    })

    it('returns empty when no worldbook set', () => {
      const injector = new WorldbookInjector()
      expect(injector.findEntriesByKeyword('x')).toEqual([])
    })
  })

  describe('findEntriesByType', () => {
    it('filters by entry type', () => {
      const wb = makeWorldbook([
        makeEntry({ uid: 1, type: 'location' }),
        makeEntry({ uid: 2, type: 'character' }),
        makeEntry({ uid: 3, type: 'location' }),
      ])
      const injector = new WorldbookInjector(wb)
      expect(injector.findEntriesByType('location')).toHaveLength(2)
    })
  })

  describe('findEntriesByCategory', () => {
    it('filters by category', () => {
      const wb = makeWorldbook([
        makeEntry({ uid: 1, category: 'lore' }),
        makeEntry({ uid: 2, category: 'npc' }),
      ])
      const injector = new WorldbookInjector(wb)
      expect(injector.findEntriesByCategory('lore')).toHaveLength(1)
    })
  })

  describe('getStats', () => {
    it('returns correct statistics', () => {
      const wb = makeWorldbook([
        makeEntry({ uid: 1, type: 'character', category: 'main', enabled: true }),
        makeEntry({ uid: 2, type: 'character', category: 'main', enabled: true }),
        makeEntry({ uid: 3, type: 'location', enabled: false }),
      ])
      const injector = new WorldbookInjector(wb)
      const stats = injector.getStats()

      expect(stats.totalEntries).toBe(3)
      expect(stats.enabledEntries).toBe(2)
      expect(stats.byType['character']).toBe(2)
      expect(stats.byType['location']).toBe(1)
      expect(stats.byCategory['main']).toBe(2)
    })

    it('returns zeros when no worldbook', () => {
      const injector = new WorldbookInjector()
      const stats = injector.getStats()
      expect(stats.totalEntries).toBe(0)
      expect(stats.enabledEntries).toBe(0)
    })
  })

  // ---- group management ---------------------------------------------------

  describe('group management', () => {
    it('setGroup and removeGroup work correctly', () => {
      const injector = new WorldbookInjector()
      const group: WorldbookGroup = {
        id: 'g1',
        name: 'Main',
        order: 1,
        enabled: true,
        entries: [1, 2],
      }

      injector.setGroup(group)
      const wb = makeWorldbook([makeEntry({ uid: 1 })])
      injector.setWorldbook(wb)
      injector.inject(makeContext({ currentContent: 'test' }))

      expect(injector.removeGroup('g1')).toBe(true)
      expect(injector.removeGroup('g1')).toBe(false)
    })
  })

  // ---- registerConditionEvaluator ----------------------------------------

  it('registerConditionEvaluator registers a custom evaluator', () => {
    const wb = makeWorldbook([
      makeEntry({
        uid: 1,
        key: ['test'],
        content: 'c',
        extensions: { condition: { type: 'custom', customFunction: 'myCheck' } },
      }),
    ])
    const injector = new WorldbookInjector(wb, { tokenCounter })

    // Before registration - condition fails
    const r1 = injector.inject(makeContext({ currentContent: 'test' }))
    expect(r1.entries).toHaveLength(0)

    // Register evaluator that always returns true
    injector.registerConditionEvaluator('myCheck', () => true)
    const r2 = injector.inject(makeContext({ currentContent: 'test' }))
    expect(r2.entries).toHaveLength(1)
  })

  // ---- updateWorldbook ----------------------------------------------------

  it('updateWorldbook replaces the worldbook', () => {
    const injector = new WorldbookInjector(makeWorldbook([makeEntry({ uid: 1 })]))
    expect(injector.getWorldbook()!.entries).toHaveLength(1)

    const newWb = makeWorldbook([makeEntry({ uid: 10 }), makeEntry({ uid: 20 })])
    injector.updateWorldbook(newWb)
    expect(injector.getWorldbook()!.entries).toHaveLength(2)
  })
})

// ===========================================================================
// Factory functions
// ===========================================================================

describe('createInjector / createWorldbookInjector', () => {
  it('createInjector returns a WorldbookInjector', () => {
    const injector = createInjector()
    expect(injector).toBeInstanceOf(WorldbookInjector)
  })

  it('createWorldbookInjector is an alias for createInjector', () => {
    expect(createWorldbookInjector).toBe(createInjector)
  })

  it('passes worldbook and options through', () => {
    const wb = makeWorldbook([makeEntry()])
    const injector = createInjector(wb, { tokenCounter })
    expect(injector.getWorldbook()).toBe(wb)
  })
})

// ===========================================================================
// mergeWorldbooks
// ===========================================================================

describe('mergeWorldbooks', () => {
  it('merges entries from multiple worldbooks', () => {
    const wb1 = makeWorldbook([makeEntry({ uid: 1, keys: ['a'] })])
    const wb2 = makeWorldbook([makeEntry({ uid: 2, keys: ['b'] })])
    const merged = mergeWorldbooks([wb1, wb2])

    expect(merged.entries).toHaveLength(2)
    expect(merged.name).toBe('Merged Worldbook')
  })

  it('deduplicates by uid when deduplicate is true', () => {
    const wb1 = makeWorldbook([
      makeEntry({ uid: 1, content: 'old', updated_at: 100 }),
    ])
    const wb2 = makeWorldbook([
      makeEntry({ uid: 1, content: 'new', updated_at: 200 }),
    ])
    const merged = mergeWorldbooks([wb1, wb2], { deduplicate: true })

    expect(merged.entries).toHaveLength(1)
    expect(merged.entries[0].content).toBe('new')
  })

  it('uses custom mergeFunction when provided', () => {
    const wb1 = makeWorldbook([makeEntry({ uid: 1, content: 'A' })])
    const wb2 = makeWorldbook([makeEntry({ uid: 1, content: 'B' })])
    const merged = mergeWorldbooks([wb1, wb2], {
      deduplicate: true,
      mergeFunction: (existing, incoming) => ({
        ...existing,
        content: `${existing.content}+${incoming.content}`,
      }),
    })

    expect(merged.entries[0].content).toBe('A+B')
  })

  it('updateTimestamps sets updated_at on all entries', () => {
    const wb = makeWorldbook([makeEntry({ uid: 1 })])
    const merged = mergeWorldbooks([wb], { updateTimestamps: true })

    expect(merged.entries[0].updated_at).toBeDefined()
  })
})

// ===========================================================================
// filterWorldbook
// ===========================================================================

describe('filterWorldbook', () => {
  it('filters entries by predicate', () => {
    const wb = makeWorldbook([
      makeEntry({ uid: 1, category: 'a' }),
      makeEntry({ uid: 2, category: 'b' }),
      makeEntry({ uid: 3, category: 'a' }),
    ])
    const filtered = filterWorldbook(wb, e => e.category === 'a')

    expect(filtered.entries).toHaveLength(2)
    expect(filtered.name).toBe(wb.name)
  })
})

// ===========================================================================
// exportWorldbookToJson / importWorldbookFromJson
// ===========================================================================

describe('exportWorldbookToJson / importWorldbookFromJson', () => {
  it('round-trips a worldbook through JSON', () => {
    const wb = makeWorldbook([
      makeEntry({ uid: 1, keys: ['test'], content: 'hello' }),
    ])
    const json = exportWorldbookToJson(wb)
    const restored = importWorldbookFromJson(json)

    expect(restored.entries).toHaveLength(1)
    expect(restored.entries[0].content).toBe('hello')
  })

  it('exportWorldbookToJson produces compact JSON when pretty=false', () => {
    const wb = makeWorldbook([makeEntry()])
    const pretty = exportWorldbookToJson(wb, true)
    const compact = exportWorldbookToJson(wb, false)

    expect(compact.length).toBeLessThan(pretty.length)
    expect(compact).not.toContain('\n')
  })
})
