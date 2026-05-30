import { describe, it, expect, vi } from 'vitest'
import {
  QualityChecker,
  createQualityChecker,
  analyzeQualityTrend,
  DEFAULT_QUALITY_CHECK_CONFIG,
  type QualityReport,
  type QualityDimension,
  type LLMJudgeRequest,
  type LLMJudgeResult,
} from './qualityChecker'
import type { Chapter } from '@/types'
import type { ResolvedEntity } from '@/stores/sandbox'

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function makeChapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: 'ch-1',
    number: 1,
    title: '第一章',
    content: '这是一个很长的测试章节内容。'.repeat(50),
    wordCount: 5000,
    outline: {
      chapterId: 'ch-1',
      title: '第一章',
      scenes: [],
      characters: [],
      location: '',
      goals: [],
      conflicts: [],
      resolutions: [],
      foreshadowingToPlant: [],
      foreshadowingToResolve: [],
      status: 'completed',
    },
    status: 'final',
    generatedBy: 'ai',
    generationTime: new Date(),
    checkpoints: [],
    ...overrides,
  }
}

function makeResolvedEntity(overrides: Partial<ResolvedEntity> = {}): ResolvedEntity {
  return {
    id: 'entity-1',
    projectId: 'project-1',
    type: 'CHARACTER',
    name: '林照',
    aliases: ['小林'],
    importance: 'major',
    category: '',
    systemPrompt: '',
    isArchived: false,
    createdAt: 1,
    properties: {},
    relations: [],
    location: null,
    vitalStatus: 'alive',
    abilities: [],
    ...overrides,
  }
}

function makeReport(overrides: Partial<QualityReport> = {}): QualityReport {
  return {
    chapterId: 'ch-1',
    chapterNumber: 1,
    timestamp: new Date(),
    overallScore: 7.5,
    dimensions: [
      { name: '情节质量', score: 8, maxScore: 10, issues: [], suggestions: [] },
      { name: '人物塑造', score: 7, maxScore: 10, issues: [], suggestions: [] },
    ],
    summary: '质量良好',
    improvements: [],
    details: '',
    ...overrides,
  }
}

// ────────────────────────────────────────────────────────────
// DEFAULT_QUALITY_CHECK_CONFIG
// ────────────────────────────────────────────────────────────

describe('DEFAULT_QUALITY_CHECK_CONFIG', () => {
  it('enables all five dimension checks by default', () => {
    expect(DEFAULT_QUALITY_CHECK_CONFIG.enablePlotCheck).toBe(true)
    expect(DEFAULT_QUALITY_CHECK_CONFIG.enableCharacterCheck).toBe(true)
    expect(DEFAULT_QUALITY_CHECK_CONFIG.enableWritingCheck).toBe(true)
    expect(DEFAULT_QUALITY_CHECK_CONFIG.enableLogicCheck).toBe(true)
    expect(DEFAULT_QUALITY_CHECK_CONFIG.enableInnovationCheck).toBe(true)
  })

  it('sets qualityThreshold to 7', () => {
    expect(DEFAULT_QUALITY_CHECK_CONFIG.qualityThreshold).toBe(7)
  })

  it('disables LLM judge by default', () => {
    expect(DEFAULT_QUALITY_CHECK_CONFIG.enableLLMJudge).toBe(false)
  })

  it('has empty customRules array', () => {
    expect(DEFAULT_QUALITY_CHECK_CONFIG.customRules).toEqual([])
  })
})

// ────────────────────────────────────────────────────────────
// createQualityChecker
// ────────────────────────────────────────────────────────────

describe('createQualityChecker', () => {
  it('creates a QualityChecker instance', () => {
    const checker = createQualityChecker()
    expect(checker).toBeInstanceOf(QualityChecker)
  })

  it('merges partial config with defaults', () => {
    const checker = createQualityChecker(undefined, undefined, undefined, {
      enablePlotCheck: false,
      qualityThreshold: 5,
    })
    // We verify indirectly by checking it doesn't throw
    expect(checker).toBeInstanceOf(QualityChecker)
  })

  it('accepts optional LLM judge callback', () => {
    const judge = vi.fn(async () => null)
    const checker = createQualityChecker(undefined, undefined, undefined, {}, judge)
    expect(checker).toBeInstanceOf(QualityChecker)
  })
})

// ────────────────────────────────────────────────────────────
// QualityChecker.checkChapter
// ────────────────────────────────────────────────────────────

describe('QualityChecker.checkChapter', () => {
  it('returns a quality report with all enabled dimensions', async () => {
    const checker = createQualityChecker()
    const chapter = makeChapter()
    const report = await checker.checkChapter(chapter)

    expect(report.chapterId).toBe(chapter.id)
    expect(report.chapterNumber).toBe(chapter.number)
    expect(report.overallScore).toBeGreaterThanOrEqual(0)
    expect(report.overallScore).toBeLessThanOrEqual(10)
    expect(report.dimensions.length).toBe(5) // all 5 enabled
    expect(report.timestamp).toBeInstanceOf(Date)
    expect(typeof report.summary).toBe('string')
    expect(Array.isArray(report.improvements)).toBe(true)
    expect(typeof report.details).toBe('string')
  })

  it('respects disabled dimension config', async () => {
    const checker = createQualityChecker(undefined, undefined, undefined, {
      enablePlotCheck: false,
      enableCharacterCheck: false,
      enableWritingCheck: false,
      enableLogicCheck: false,
      enableInnovationCheck: false,
    })
    const report = await checker.checkChapter(makeChapter())
    expect(report.dimensions.length).toBe(0)
    expect(report.overallScore).toBe(0)
  })

  it('reports only enabled dimensions', async () => {
    const checker = createQualityChecker(undefined, undefined, undefined, {
      enablePlotCheck: true,
      enableCharacterCheck: false,
      enableWritingCheck: false,
      enableLogicCheck: false,
      enableInnovationCheck: false,
    })
    const report = await checker.checkChapter(makeChapter())
    expect(report.dimensions.length).toBe(1)
    expect(report.dimensions[0].name).toBe('情节质量')
  })

  it('calls onProgress callback during check', async () => {
    const checker = createQualityChecker()
    const progressValues: number[] = []
    await checker.checkChapter(makeChapter(), (progress) => {
      progressValues.push(progress)
    })

    expect(progressValues.length).toBeGreaterThan(0)
    // Each dimension adds 20 to progress
    expect(progressValues).toContain(20)
  })

  it('checks plot quality with conflict content', async () => {
    const contentWithConflict = '这是一个充满冲突和矛盾的故事。'.repeat(200)
    const chapter = makeChapter({ content: contentWithConflict })
    const checker = createQualityChecker(undefined, undefined, undefined, {
      enablePlotCheck: true,
      enableCharacterCheck: false,
      enableWritingCheck: false,
      enableLogicCheck: false,
      enableInnovationCheck: false,
    })

    const report = await checker.checkChapter(chapter)
    const plotDimension = report.dimensions.find(d => d.name === '情节质量')
    expect(plotDimension).toBeDefined()
    expect(plotDimension!.maxScore).toBe(10)
    // Content with conflict should score higher
    expect(plotDimension!.score).toBeGreaterThan(8)
  })

  it('deduplicates improvement suggestions', async () => {
    const checker = createQualityChecker()
    const chapter = makeChapter({
      content: '短。', // Very short content to trigger multiple issues
    })
    const report = await checker.checkChapter(chapter)
    const unique = [...new Set(report.improvements)]
    expect(report.improvements).toEqual(unique)
  })

  it('limits improvements to 5 items', async () => {
    const checker = createQualityChecker()
    const chapter = makeChapter({
      content: '极短的内容。', // Very short, triggers many issues
    })
    const report = await checker.checkChapter(chapter)
    expect(report.improvements.length).toBeLessThanOrEqual(5)
  })
})

// ────────────────────────────────────────────────────────────
// QualityChecker.checkChapters (batch)
// ────────────────────────────────────────────────────────────

describe('QualityChecker.checkChapters', () => {
  it('returns a report for each chapter', async () => {
    const checker = createQualityChecker(undefined, undefined, undefined, {
      enablePlotCheck: true,
      enableCharacterCheck: false,
      enableWritingCheck: false,
      enableLogicCheck: false,
      enableInnovationCheck: false,
    })
    const chapters = [
      makeChapter({ id: 'ch-1', number: 1 }),
      makeChapter({ id: 'ch-2', number: 2 }),
      makeChapter({ id: 'ch-3', number: 3 }),
    ]

    const reports = await checker.checkChapters(chapters)
    expect(reports).toHaveLength(3)
    expect(reports[0].chapterId).toBe('ch-1')
    expect(reports[1].chapterId).toBe('ch-2')
    expect(reports[2].chapterId).toBe('ch-3')
  })

  it('calls batch progress callback', async () => {
    const checker = createQualityChecker(undefined, undefined, undefined, {
      enablePlotCheck: true,
      enableCharacterCheck: false,
      enableWritingCheck: false,
      enableLogicCheck: false,
      enableInnovationCheck: false,
    })
    const chapters = [makeChapter({ id: 'ch-1', number: 1 }), makeChapter({ id: 'ch-2', number: 2 })]

    const progressCalls: Array<{ current: number; total: number; chapterNumber: number }> = []
    await checker.checkChapters(chapters, (current, total, chapterNumber) => {
      progressCalls.push({ current, total, chapterNumber })
    })

    expect(progressCalls.length).toBeGreaterThan(0)
    expect(progressCalls.some(p => p.total === 2)).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────
// QualityChecker with characters
// ────────────────────────────────────────────────────────────

describe('QualityChecker character detection', () => {
  it('detects characters by name in content', async () => {
    const character = makeResolvedEntity({ name: '林照', aliases: [] })
    const content = '林照走进了大厅。"你好"林照说道。林照看着窗外。这是一个很长的段落。'.repeat(50)
    const chapter = makeChapter({ content })

    const checker = createQualityChecker(undefined, [character], undefined, {
      enablePlotCheck: false,
      enableCharacterCheck: true,
      enableWritingCheck: false,
      enableLogicCheck: false,
      enableInnovationCheck: false,
    })

    const report = await checker.checkChapter(chapter)
    const charDimension = report.dimensions.find(d => d.name === '人物塑造')
    expect(charDimension).toBeDefined()
    // Should not complain about missing characters
    const missingCharIssues = charDimension!.issues.filter(i => i.message.includes('未检测到人物'))
    expect(missingCharIssues).toHaveLength(0)
  })

  it('detects characters by alias in content', async () => {
    const character = makeResolvedEntity({ name: '林照', aliases: ['小林'] })
    const content = '小林走进了大厅。"你好"小林说道。小林看着窗外。这是一个很长的段落。'.repeat(50)
    const chapter = makeChapter({ content })

    const checker = createQualityChecker(undefined, [character], undefined, {
      enablePlotCheck: false,
      enableCharacterCheck: true,
      enableWritingCheck: false,
      enableLogicCheck: false,
      enableInnovationCheck: false,
    })

    const report = await checker.checkChapter(chapter)
    const charDimension = report.dimensions.find(d => d.name === '人物塑造')
    expect(charDimension).toBeDefined()
    const missingCharIssues = charDimension!.issues.filter(i => i.message.includes('未检测到人物'))
    expect(missingCharIssues).toHaveLength(0)
  })
})

// ────────────────────────────────────────────────────────────
// QualityChecker with LLM judge
// ────────────────────────────────────────────────────────────

describe('QualityChecker LLM judge integration', () => {
  it('merges LLM judge scores with weighted average', async () => {
    const llmJudge = vi.fn(async (_req: LLMJudgeRequest): Promise<LLMJudgeResult> => ({
      score: 9,
      issues: ['LLM发现的问题'],
      suggestions: ['LLM建议'],
    }))

    const checker = createQualityChecker(undefined, undefined, undefined, {
      enablePlotCheck: true,
      enableCharacterCheck: false,
      enableWritingCheck: false,
      enableLogicCheck: false,
      enableInnovationCheck: false,
      enableLLMJudge: true,
      llmJudgeWeight: 0.4,
    }, llmJudge)

    const report = await checker.checkChapter(makeChapter())
    expect(llmJudge).toHaveBeenCalled()
    // The plot dimension should include LLM issues
    const plotDimension = report.dimensions.find(d => d.name === '情节质量')
    expect(plotDimension).toBeDefined()
    const llmIssues = plotDimension!.issues.filter(i => i.message.includes('[LLM评估]'))
    expect(llmIssues.length).toBeGreaterThan(0)
  })

  it('falls back to rule-based scoring when LLM judge returns null', async () => {
    const llmJudge = vi.fn(async () => null)

    const checker = createQualityChecker(undefined, undefined, undefined, {
      enablePlotCheck: true,
      enableCharacterCheck: false,
      enableWritingCheck: false,
      enableLogicCheck: false,
      enableInnovationCheck: false,
      enableLLMJudge: true,
    }, llmJudge)

    const report = await checker.checkChapter(makeChapter())
    const plotDimension = report.dimensions.find(d => d.name === '情节质量')
    expect(plotDimension).toBeDefined()
    // No LLM issues should appear
    const llmIssues = plotDimension!.issues.filter(i => i.message.includes('[LLM评估]'))
    expect(llmIssues).toHaveLength(0)
  })

  it('falls back to rule-based scoring when LLM judge throws', async () => {
    const llmJudge = vi.fn(async () => { throw new Error('LLM failed') })

    const checker = createQualityChecker(undefined, undefined, undefined, {
      enablePlotCheck: true,
      enableCharacterCheck: false,
      enableWritingCheck: false,
      enableLogicCheck: false,
      enableInnovationCheck: false,
      enableLLMJudge: true,
    }, llmJudge)

    // Should not throw
    const report = await checker.checkChapter(makeChapter())
    expect(report).toBeDefined()
  })

  it('does not call LLM judge when enableLLMJudge is false', async () => {
    const llmJudge = vi.fn(async () => ({ score: 5 }))

    const checker = createQualityChecker(undefined, undefined, undefined, {
      enablePlotCheck: true,
      enableCharacterCheck: false,
      enableWritingCheck: false,
      enableLogicCheck: false,
      enableInnovationCheck: false,
      enableLLMJudge: false,
    }, llmJudge)

    await checker.checkChapter(makeChapter())
    expect(llmJudge).not.toHaveBeenCalled()
  })
})

// ────────────────────────────────────────────────────────────
// analyzeQualityTrend
// ────────────────────────────────────────────────────────────

describe('analyzeQualityTrend', () => {
  it('returns stable trend for empty reports', () => {
    const result = analyzeQualityTrend([])
    expect(result.averageScore).toBe(0)
    expect(result.scoreTrend).toBe('stable')
    expect(result.dimensionTrends).toEqual({})
    expect(result.recommendations).toEqual([])
  })

  it('calculates average score correctly', () => {
    const reports = [
      makeReport({ overallScore: 6 }),
      makeReport({ overallScore: 8 }),
      makeReport({ overallScore: 7 }),
    ]
    const result = analyzeQualityTrend(reports)
    expect(result.averageScore).toBe(7)
  })

  it('detects improving trend', () => {
    const reports = [
      makeReport({ overallScore: 5 }),
      makeReport({ overallScore: 6 }),
      makeReport({ overallScore: 8 }),
    ]
    const result = analyzeQualityTrend(reports)
    expect(result.scoreTrend).toBe('improving')
    expect(result.recommendations).toEqual(
      expect.arrayContaining([expect.stringContaining('上升趋势')])
    )
  })

  it('detects declining trend', () => {
    const reports = [
      makeReport({ overallScore: 8 }),
      makeReport({ overallScore: 6 }),
      makeReport({ overallScore: 5 }),
    ]
    const result = analyzeQualityTrend(reports)
    expect(result.scoreTrend).toBe('declining')
    expect(result.recommendations).toEqual(
      expect.arrayContaining([expect.stringContaining('下降趋势')])
    )
  })

  it('detects stable trend when scores do not change significantly', () => {
    const reports = [
      makeReport({ overallScore: 7.0 }),
      makeReport({ overallScore: 7.1 }),
      makeReport({ overallScore: 7.2 }),
    ]
    const result = analyzeQualityTrend(reports)
    expect(result.scoreTrend).toBe('stable')
  })

  it('reports stable trend for fewer than 3 reports', () => {
    const reports = [makeReport({ overallScore: 5 }), makeReport({ overallScore: 9 })]
    const result = analyzeQualityTrend(reports)
    expect(result.scoreTrend).toBe('stable')
  })

  it('analyzes dimension trends', () => {
    const dimensions1: QualityDimension[] = [
      { name: '情节质量', score: 6, maxScore: 10, issues: [], suggestions: [] },
      { name: '人物塑造', score: 8, maxScore: 10, issues: [], suggestions: [] },
    ]
    const dimensions3: QualityDimension[] = [
      { name: '情节质量', score: 9, maxScore: 10, issues: [], suggestions: [] },
      { name: '人物塑造', score: 5, maxScore: 10, issues: [], suggestions: [] },
    ]

    // Make all 3 reports use the same dimension structure so trends are consistent
    const reports = [
      makeReport({ dimensions: dimensions1 }),
      makeReport({ overallScore: 7, dimensions: dimensions1 }),
      makeReport({ dimensions: dimensions3 }),
    ]

    const result = analyzeQualityTrend(reports)
    expect(result.dimensionTrends['情节质量']).toBeDefined()
    // Scores extracted from reports: [6, 6, 9]
    expect(result.dimensionTrends['情节质量'].scores).toEqual([6, 6, 9])
    // Score went from 6 to 9, that's a jump > 0.5 -> '上升'
    expect(result.dimensionTrends['情节质量'].trend).toBe('上升')

    expect(result.dimensionTrends['人物塑造']).toBeDefined()
    // Scores extracted from reports: [8, 8, 5]
    expect(result.dimensionTrends['人物塑造'].scores).toEqual([8, 8, 5])
    // Score went from 8 to 5, that's a drop < -0.5 -> '下降'
    expect(result.dimensionTrends['人物塑造'].trend).toBe('下降')

    // Should include declining dimension recommendation
    expect(result.recommendations).toEqual(
      expect.arrayContaining([expect.stringContaining('人物塑造')])
    )
  })

  it('rounds average score to one decimal', () => {
    const reports = [
      makeReport({ overallScore: 7.33 }),
      makeReport({ overallScore: 7.66 }),
    ]
    const result = analyzeQualityTrend(reports)
    // (7.33 + 7.66) / 2 = 7.495 → 7.5
    expect(result.averageScore).toBe(7.5)
  })
})
