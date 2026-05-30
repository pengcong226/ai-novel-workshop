import { describe, expect, it, vi } from 'vitest'
import type { Chapter, Outline } from '@/types'
import type { ResolvedEntity } from '@/stores/sandbox'

// Mock uuid so ids are deterministic in snapshots
vi.mock('uuid', () => ({ v4: () => 'mock-uuid' }))

// Mock logger to silence output
vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

import {
  ConflictDetector,
  detectConflicts,
  exportConflictsAsJSON,
  exportConflictsAsMarkdown,
  DEFAULT_CONFIG,
} from '@/utils/conflictDetector'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntity(overrides: Partial<ResolvedEntity> = {}): ResolvedEntity {
  return {
    id: 'entity-1',
    projectId: 'proj-1',
    type: 'CHARACTER',
    name: '张三',
    aliases: [],
    importance: 'major',
    category: '',
    systemPrompt: '',
    isArchived: false,
    createdAt: Date.now(),
    properties: {},
    relations: [],
    location: null,
    vitalStatus: 'alive',
    abilities: [],
    ...overrides,
  }
}

function makeChapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: `ch-${overrides.number ?? 1}`,
    number: overrides.number ?? 1,
    title: `Chapter ${overrides.number ?? 1}`,
    content: '',
    wordCount: 0,
    outline: { title: '', summary: '', scenes: [] },
    status: 'draft',
    generatedBy: 'manual',
    generationTime: new Date(),
    checkpoints: [],
    ...overrides,
  }
}

function makeOutline(overrides: Partial<Outline> = {}): Outline {
  return {
    id: 'outline-1',
    synopsis: '',
    theme: '',
    mainPlot: { id: 'p1', title: '', description: '', scenes: [] },
    subPlots: [],
    volumes: [],
    chapters: [],
    foreshadowings: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConflictDetector', () => {
  describe('constructor and default config', () => {
    it('applies DEFAULT_CONFIG when no config is provided', async () => {
      const detector = new ConflictDetector({ entities: [], chapters: [] })
      const result = await detector.detect()
      expect(result.config).toEqual(DEFAULT_CONFIG)
    })

    it('merges partial config overrides with defaults', async () => {
      const detector = new ConflictDetector(
        { entities: [], chapters: [] },
        { personalityChangeThreshold: 0.3, ageErrorTolerance: 5 },
      )
      const result = await detector.detect()
      expect(result.config.personalityChangeThreshold).toBe(0.3)
      expect(result.config.ageErrorTolerance).toBe(5)
      // Un-overridden values stay at default
      expect(result.config.enableCharacterConflicts).toBe(true)
    })
  })

  describe('empty inputs', () => {
    it('returns zero conflicts for empty entities and chapters', async () => {
      const result = await detectConflicts({ entities: [], chapters: [] })
      expect(result.conflicts).toHaveLength(0)
      expect(result.statistics.total).toBe(0)
      expect(result.warnings).toEqual([])
    })

    it('returns zero conflicts when all detection flags are disabled', async () => {
      const entity = makeEntity()
      const chapter = makeChapter({ number: 1, content: `${entity.name}很勇敢` })
      const result = await detectConflicts(
        { entities: [entity], chapters: [chapter] },
        {
          enableCharacterConflicts: false,
          enableTimelineConflicts: false,
          enableWorldConflicts: false,
          enablePlotLogicConflicts: false,
          enableForeshadowingConflicts: false,
        },
      )
      expect(result.conflicts).toHaveLength(0)
    })
  })

  describe('character personality conflicts', () => {
    it('detects contradictory personality traits across chapters', async () => {
      const entity = makeEntity({ id: 'hero', name: '李明', aliases: [] })
      const chapters = [
        makeChapter({ number: 1, content: '李明非常勇敢，无所畏惧地冲上前线。' }),
        makeChapter({ number: 5, content: '李明变得胆小，怯懦地躲在角落里。' }),
      ]

      const result = await detectConflicts({ entities: [entity], chapters })
      const personalityConflicts = result.conflicts.filter(
        (c) => c.type === 'character_personality',
      )
      expect(personalityConflicts.length).toBeGreaterThanOrEqual(1)
      expect(personalityConflicts[0].title).toContain('李明')
      expect(personalityConflicts[0].title).toContain('矛盾')
      expect(personalityConflicts[0].severity).toBe('warning')
      expect(personalityConflicts[0].relatedCharacterIds).toContain('hero')
    })

    it('does not flag consistent personality traits', async () => {
      const entity = makeEntity({ name: '王五', aliases: [] })
      const chapters = [
        makeChapter({ number: 1, content: '王五非常勇敢，无畏地面对危险。' }),
        makeChapter({ number: 3, content: '王五再次英勇地站了出来。' }),
      ]

      const result = await detectConflicts({ entities: [entity], chapters })
      const personalityConflicts = result.conflicts.filter(
        (c) => c.type === 'character_personality',
      )
      expect(personalityConflicts).toHaveLength(0)
    })

    it('matches character by alias', async () => {
      const entity = makeEntity({ name: '赵云', aliases: ['子龙'] })
      const chapters = [
        makeChapter({ number: 1, content: '赵云非常勇敢，无畏地冲锋。' }),
        makeChapter({ number: 4, content: '子龙此时却胆小地退缩了。' }),
      ]

      const result = await detectConflicts({ entities: [entity], chapters })
      const personalityConflicts = result.conflicts.filter(
        (c) => c.type === 'character_personality',
      )
      expect(personalityConflicts.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('character ability gap conflicts', () => {
    it('detects ability gap when gap exceeds 10 chapters', async () => {
      const entity = makeEntity({
        id: 'mage',
        name: '法师',
        abilities: [{ name: '火球术', status: 'active', acquiredChapter: 1 }],
      })
      const chapters = [
        makeChapter({ number: 1, content: '法师使用了火球术攻击敌人。' }),
        makeChapter({ number: 15, content: '法师再次施展火球术。' }),
      ]

      const result = await detectConflicts({ entities: [entity], chapters })
      const abilityConflicts = result.conflicts.filter(
        (c) => c.type === 'character_ability',
      )
      expect(abilityConflicts.length).toBeGreaterThanOrEqual(1)
      expect(abilityConflicts[0].title).toContain('火球术')
      expect(abilityConflicts[0].severity).toBe('info')
    })

    it('does not flag ability gap when gap is within 10 chapters', async () => {
      const entity = makeEntity({
        id: 'mage',
        name: '法师',
        abilities: [{ name: '火球术', status: 'active', acquiredChapter: 1 }],
      })
      const chapters = [
        makeChapter({ number: 1, content: '法师使用了火球术。' }),
        makeChapter({ number: 5, content: '法师再次施展火球术。' }),
      ]

      const result = await detectConflicts({ entities: [entity], chapters })
      const abilityConflicts = result.conflicts.filter(
        (c) => c.type === 'character_ability',
      )
      expect(abilityConflicts).toHaveLength(0)
    })
  })

  describe('character appearance repetition', () => {
    it('detects repeated appearance descriptions across >3 chapters', async () => {
      const entity = makeEntity({
        name: '美少女',
        aliases: [],
        properties: { appearance: '金色长发碧绿眼睛' },
      })
      const chapters = Array.from({ length: 5 }, (_, i) =>
        makeChapter({
          number: i + 1,
          content: `美少女的金色长发在风中飘扬。`,
        }),
      )

      const result = await detectConflicts({ entities: [entity], chapters })
      const appearanceConflicts = result.conflicts.filter(
        (c) => c.type === 'character_appearance',
      )
      expect(appearanceConflicts.length).toBeGreaterThanOrEqual(1)
      expect(appearanceConflicts[0].severity).toBe('info')
    })

    it('does not flag appearance with <=3 chapter mentions', async () => {
      const entity = makeEntity({
        name: '配角',
        aliases: [],
        properties: { appearance: '黑色短发' },
      })
      const chapters = Array.from({ length: 3 }, (_, i) =>
        makeChapter({
          number: i + 1,
          content: `配角的黑色短发十分精神。`,
        }),
      )

      const result = await detectConflicts({ entities: [entity], chapters })
      const appearanceConflicts = result.conflicts.filter(
        (c) => c.type === 'character_appearance',
      )
      expect(appearanceConflicts).toHaveLength(0)
    })
  })

  describe('age conflict detection', () => {
    it('detects inconsistent age descriptions across chapters', async () => {
      const entity = makeEntity({
        id: 'kid',
        name: '小明',
        aliases: [],
        properties: { age: '10' },
      })
      const chapters = [
        makeChapter({ number: 1, content: '小明今年8岁，正在上学。' }),
        makeChapter({ number: 3, content: '小明已经15岁了，长高了不少。' }),
      ]

      const result = await detectConflicts({ entities: [entity], chapters })
      const ageConflicts = result.conflicts.filter((c) => c.type === 'timeline_age')
      expect(ageConflicts.length).toBeGreaterThanOrEqual(1)
      expect(ageConflicts[0].description).toContain('不一致')
    })

    it('does not flag age within tolerance range', async () => {
      const entity = makeEntity({
        id: 'adult',
        name: '老王',
        aliases: [],
        properties: { age: '40' },
      })
      const chapters = [
        makeChapter({ number: 1, content: '老王今年40岁，经验丰富。' }),
        makeChapter({ number: 2, content: '老王41岁了，又长了一岁。' }),
      ]

      const result = await detectConflicts({ entities: [entity], chapters }, { ageErrorTolerance: 2 })
      const ageConflicts = result.conflicts.filter((c) => c.type === 'timeline_age')
      expect(ageConflicts).toHaveLength(0)
    })
  })

  describe('foreshadowing detection', () => {
    it('detects foreshadowing planted >20 chapters ago without resolution', async () => {
      const outline = makeOutline({
        foreshadowings: [
          {
            id: 'fs-1',
            description: '神秘的预言',
            plantChapter: 1,
            status: 'planted',
          },
        ],
      })
      const chapters = Array.from({ length: 25 }, (_, i) =>
        makeChapter({ number: i + 1, content: `第${i + 1}章内容` }),
      )

      const result = await detectConflicts({
        entities: [],
        chapters,
        outline,
      })
      const fsConflicts = result.conflicts.filter((c) => c.type === 'foreshadowing')
      expect(fsConflicts.length).toBeGreaterThanOrEqual(1)
      expect(fsConflicts[0].title).toContain('伏笔')
      expect(fsConflicts[0].title).toContain('未揭示')
    })

    it('does not flag foreshadowing planted within 20 chapters', async () => {
      const outline = makeOutline({
        foreshadowings: [
          {
            id: 'fs-2',
            description: '近期伏笔',
            plantChapter: 10,
            status: 'planted',
          },
        ],
      })
      const chapters = Array.from({ length: 25 }, (_, i) =>
        makeChapter({ number: i + 1, content: `内容${i + 1}` }),
      )

      const result = await detectConflicts({ entities: [], chapters, outline })
      const fsConflicts = result.conflicts.filter((c) => c.type === 'foreshadowing')
      expect(fsConflicts).toHaveLength(0)
    })

    it('does not flag resolved foreshadowing', async () => {
      const outline = makeOutline({
        foreshadowings: [
          {
            id: 'fs-3',
            description: '已解决伏笔',
            plantChapter: 1,
            resolveChapter: 5,
            status: 'resolved',
          },
        ],
      })
      const chapters = Array.from({ length: 25 }, (_, i) =>
        makeChapter({ number: i + 1, content: `内容${i + 1}` }),
      )

      const result = await detectConflicts({ entities: [], chapters, outline })
      const fsConflicts = result.conflicts.filter((c) => c.type === 'foreshadowing')
      expect(fsConflicts).toHaveLength(0)
    })
  })

  describe('plot logic: character never appeared', () => {
    it('detects character that never appears in any chapter', async () => {
      const entity = makeEntity({ id: 'ghost', name: '幽灵', aliases: [] })
      const chapters = [
        makeChapter({ number: 1, content: '今天天气不错。' }),
      ]
      // outline is required for detectPlotLogicConflicts to run
      const outline = makeOutline()

      const result = await detectConflicts({ entities: [entity], chapters, outline })
      const plotConflicts = result.conflicts.filter((c) => c.type === 'plot_logic')
      const neverAppeared = plotConflicts.find((c) => c.title.includes('从未出场'))
      expect(neverAppeared).toBeDefined()
      expect(neverAppeared!.description).toContain('幽灵')
    })

    it('does not flag character that appears in at least one chapter', async () => {
      const entity = makeEntity({ id: 'present', name: '出场者', aliases: [] })
      const chapters = [
        makeChapter({ number: 1, content: '出场者走进了房间。' }),
      ]
      const outline = makeOutline()

      const result = await detectConflicts({ entities: [entity], chapters, outline })
      const neverAppeared = result.conflicts.find((c) => c.title.includes('从未出场'))
      expect(neverAppeared).toBeUndefined()
    })
  })

  describe('plot logic: important character long absence', () => {
    it('detects critical character disappearing for >10 chapters', async () => {
      const entity = makeEntity({
        id: 'vip',
        name: '重要人物',
        importance: 'critical',
        aliases: [],
      })
      const chapters = [
        makeChapter({ number: 1, content: '重要人物登场了。' }),
        makeChapter({ number: 2, content: '重要人物在战斗中。' }),
        makeChapter({ number: 3, content: '重要人物胜利了。' }),
        // Chapters 4-15: no mention of the character (avoid name in content)
        ...Array.from({ length: 12 }, (_, i) =>
          makeChapter({ number: i + 4, content: '其他人继续冒险的剧情。' }),
        ),
      ]
      const outline = makeOutline()

      const result = await detectConflicts({ entities: [entity], chapters, outline })
      const longAbsence = result.conflicts.find((c) => c.title.includes('长期未出场'))
      expect(longAbsence).toBeDefined()
      expect(longAbsence!.relatedCharacterIds).toContain('vip')
    })

    it('does not flag minor character for long absence', async () => {
      const entity = makeEntity({
        id: 'minor',
        name: '路人',
        importance: 'minor',
        aliases: [],
      })
      const chapters = [
        makeChapter({ number: 1, content: '路人出现了。' }),
        makeChapter({ number: 2, content: '路人也在。' }),
        makeChapter({ number: 3, content: '路人还在。' }),
        ...Array.from({ length: 12 }, (_, i) =>
          makeChapter({ number: i + 4, content: '无关剧情。' }),
        ),
      ]
      const outline = makeOutline()

      const result = await detectConflicts({ entities: [entity], chapters, outline })
      const longAbsence = result.conflicts.find(
        (c) => c.type === 'plot_logic' && c.title.includes('长期未出场'),
      )
      expect(longAbsence).toBeUndefined()
    })
  })

  describe('statistics', () => {
    it('counts conflicts by severity and type correctly', async () => {
      const entity = makeEntity({
        id: 'hero',
        name: '勇者',
        importance: 'critical',
        aliases: [],
        properties: { age: '10' },
        abilities: [{ name: '剑术', status: 'active', acquiredChapter: 1 }],
      })
      const chapters = [
        makeChapter({ number: 1, content: '勇者非常勇敢，今年8岁，使出剑术。' }),
        makeChapter({ number: 5, content: '勇者变得胆小，今年15岁。' }),
      ]

      const result = await detectConflicts({ entities: [entity], chapters })
      expect(result.statistics.total).toBe(result.conflicts.length)
      expect(result.statistics.critical + result.statistics.warning + result.statistics.info).toBe(
        result.conflicts.length,
      )
      // byType keys should match actual conflict types
      for (const conflict of result.conflicts) {
        expect(result.statistics.byType[conflict.type]).toBeGreaterThanOrEqual(1)
      }
    })

    it('counts by chapter correctly', async () => {
      const entity = makeEntity({
        id: 'hero',
        name: '勇者',
        aliases: [],
        properties: { age: '10' },
      })
      const chapters = [
        makeChapter({ number: 1, content: '勇者今年8岁。' }),
        makeChapter({ number: 3, content: '勇者今年15岁了。' }),
      ]

      const result = await detectConflicts({ entities: [entity], chapters })
      // Age conflict references chapters 1 and 3
      expect(result.statistics.byChapter[1]).toBeGreaterThanOrEqual(1)
      expect(result.statistics.byChapter[3]).toBeGreaterThanOrEqual(1)
    })
  })

  describe('result metadata', () => {
    it('includes detectedAt timestamp and non-negative duration', async () => {
      const before = Date.now()
      const result = await detectConflicts({ entities: [], chapters: [] })
      const after = Date.now()

      expect(result.detectedAt.getTime()).toBeGreaterThanOrEqual(before)
      expect(result.detectedAt.getTime()).toBeLessThanOrEqual(after)
      expect(result.duration).toBeGreaterThanOrEqual(0)
    })
  })
})

describe('exportConflictsAsJSON', () => {
  it('returns valid JSON string', async () => {
    const result = await detectConflicts({ entities: [], chapters: [] })
    const json = exportConflictsAsJSON(result)
    const parsed = JSON.parse(json)
    expect(parsed.statistics.total).toBe(0)
    expect(Array.isArray(parsed.conflicts)).toBe(true)
  })
})

describe('exportConflictsAsMarkdown', () => {
  it('produces markdown with project name and statistics', async () => {
    const result = await detectConflicts({ entities: [], chapters: [] })
    const md = exportConflictsAsMarkdown(result, '测试项目')
    expect(md).toContain('# 冲突检测报告')
    expect(md).toContain('测试项目')
    expect(md).toContain('总计：0')
  })

  it('includes conflict details when conflicts exist', async () => {
    const entity = makeEntity({ id: 'h', name: '英雄', aliases: [] })
    const chapters = [
      makeChapter({ number: 1, content: '英雄非常勇敢。' }),
      makeChapter({ number: 5, content: '英雄变得胆小了。' }),
    ]
    const result = await detectConflicts({ entities: [entity], chapters })
    const md = exportConflictsAsMarkdown(result, '小说')
    expect(md).toContain('## 冲突详情')
    expect(md).toContain('英雄')
    expect(md).toContain('修复建议')
  })
})

describe('DEFAULT_CONFIG', () => {
  it('has all detection flags enabled by default', () => {
    expect(DEFAULT_CONFIG.enableCharacterConflicts).toBe(true)
    expect(DEFAULT_CONFIG.enableTimelineConflicts).toBe(true)
    expect(DEFAULT_CONFIG.enableWorldConflicts).toBe(true)
    expect(DEFAULT_CONFIG.enablePlotLogicConflicts).toBe(true)
    expect(DEFAULT_CONFIG.enableForeshadowingConflicts).toBe(true)
  })

  it('has reasonable threshold values', () => {
    expect(DEFAULT_CONFIG.personalityChangeThreshold).toBeGreaterThan(0)
    expect(DEFAULT_CONFIG.personalityChangeThreshold).toBeLessThanOrEqual(1)
    expect(DEFAULT_CONFIG.minConfidenceThreshold).toBeGreaterThan(0)
    expect(DEFAULT_CONFIG.ageErrorTolerance).toBeGreaterThanOrEqual(0)
    expect(DEFAULT_CONFIG.timeDurationTolerance).toBeGreaterThan(0)
  })
})
