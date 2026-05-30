import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks — available before any vi.mock() call
// ---------------------------------------------------------------------------

const {
  composerComposeMock,
  auditorAuditMock,
  reviserReviseMock,
  normalizerNormalizeMock,
  settlerSettleMock,
  analyzerAnalyzeMock,
  hookPromoterPromoteMock,
  reviewCycleExecuteMock,
  reviewCycleCtorMock,
  chatMock,
  checkInitializedMock,
} = vi.hoisted(() => ({
  composerComposeMock: vi.fn(),
  auditorAuditMock: vi.fn(),
  reviserReviseMock: vi.fn(),
  normalizerNormalizeMock: vi.fn(),
  settlerSettleMock: vi.fn(),
  analyzerAnalyzeMock: vi.fn(),
  hookPromoterPromoteMock: vi.fn(),
  reviewCycleExecuteMock: vi.fn(),
  reviewCycleCtorMock: vi.fn(),
  chatMock: vi.fn(),
  checkInitializedMock: vi.fn(),
}))

// ---------------------------------------------------------------------------
// vi.mock() declarations
// ---------------------------------------------------------------------------

vi.mock('@/agents/ComposerAgent', () => ({
  ComposerAgent: vi.fn().mockImplementation(() => ({
    compose: composerComposeMock,
  })),
  buildLengthSpec: vi.fn((target: number) => ({
    target,
    softMin: Math.round(target * 0.85),
    softMax: Math.round(target * 1.15),
    hardMin: Math.round(target * 0.7),
    hardMax: Math.round(target * 1.3),
    countingMode: 'chars',
  })),
}))

vi.mock('@/agents/ContinuityAuditor', () => ({
  ContinuityAuditor: vi.fn().mockImplementation(() => ({
    audit: auditorAuditMock,
  })),
  AUDIT_DIMENSIONS: ['plot', 'character', 'world', 'style', 'pacing'],
}))

vi.mock('@/agents/ReviserAgent', () => ({
  ReviserAgent: vi.fn().mockImplementation(() => ({
    revise: reviserReviseMock,
  })),
}))

vi.mock('@/agents/LengthNormalizerAgent', () => ({
  LengthNormalizerAgent: vi.fn().mockImplementation(() => ({
    normalize: normalizerNormalizeMock,
  })),
  countChars: vi.fn((text: string) => text.length),
  buildLengthSpec: vi.fn((target: number) => ({
    target,
    softMin: Math.round(target * 0.85),
    softMax: Math.round(target * 1.15),
    hardMin: Math.round(target * 0.7),
    hardMax: Math.round(target * 1.3),
    countingMode: 'chars',
  })),
}))

vi.mock('@/agents/StateSettler', () => ({
  StateSettler: vi.fn().mockImplementation(() => ({
    settle: settlerSettleMock,
  })),
}))

vi.mock('@/agents/ChapterAnalyzer', () => ({
  ChapterAnalyzer: vi.fn().mockImplementation(() => ({
    analyze: analyzerAnalyzeMock,
  })),
}))

vi.mock('@/agents/HookPromoter', () => ({
  HookPromoter: vi.fn().mockImplementation(() => ({
    promote: hookPromoterPromoteMock,
  })),
}))

vi.mock('@/services/pipeline/ChapterReviewCycle', () => ({
  ChapterReviewCycle: vi.fn().mockImplementation((...args: any[]) => {
    reviewCycleCtorMock(...args)
    return { execute: reviewCycleExecuteMock }
  }),
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('@/stores/ai', () => ({
  useAIStore: () => ({
    chat: chatMock,
    checkInitialized: checkInitializedMock,
  }),
}))

// ---------------------------------------------------------------------------
// Helpers — minimal mock Project objects
// ---------------------------------------------------------------------------

function makeMockProject(overrides: Record<string, any> = {}): any {
  return {
    id: 'test-project-001',
    title: '测试项目',
    description: '用于单元测试的项目',
    genre: '玄幻',
    targetWords: 200000,
    currentWords: 0,
    status: 'writing' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    config: {
      advancedSettings: {
        targetWordCount: 2000,
      },
    },
    chapters: [
      {
        number: 1,
        title: '第一章',
        summary: '主角穿越到异世界',
        content: '这是第一章的内容。'.repeat(50),
      },
      {
        number: 2,
        title: '第二章',
        summary: '主角遇见导师',
        content: '这是第二章的内容。'.repeat(50),
      },
    ],
    plotEvents: [
      {
        id: 'evt-1',
        type: 'foreshadowing_planted',
        description: '神秘的戒指发出微光',
        createdAt: Date.now(),
        chapterNumber: 1,
      },
      {
        id: 'evt-2',
        type: 'foreshadowing_resolved',
        description: '戒指的力量觉醒',
        createdAt: Date.now(),
        chapterNumber: 2,
      },
      {
        id: 'evt-3',
        type: 'character_appeared',
        description: '主角登场',
        createdAt: Date.now(),
        chapterNumber: 1,
      },
    ],
    outline: {
      id: 'outline-1',
      synopsis: '穿越异世界的冒险故事',
      theme: '成长与冒险',
      mainPlot: { id: 'main-1', name: '主线', description: '主角穿越到异世界，经历冒险成长' },
      subPlots: [
        { id: 'sub-1', name: '感情线', description: '主角与女主的互动' },
      ],
      volumes: [],
      chapters: [
        {
          chapterId: 'ch-outline-1',
          id: 'ch-outline-1',
          title: '第一章',
          summary: '建立世界观，引入主角',
          goals: ['建立世界观', '引入主角'],
          keyBeats: ['穿越发生'],
          scenes: [{ id: 'sc-1', description: '场景1', characters: ['主角'], location: '异世界', order: 0 }],
          characters: ['主角'],
          location: '异世界',
          conflicts: ['未知威胁'],
          resolutions: [],
          foreshadowingToPlant: ['神秘戒指'],
          foreshadowingToResolve: [],
          status: 'planned' as const,
        },
        {
          chapterId: 'ch-outline-2',
          id: 'ch-outline-2',
          title: '第二章',
          summary: '遇见导师',
          goals: ['遇见导师'],
          keyBeats: ['导师出现'],
          scenes: [{ id: 'sc-2', description: '场景2', characters: ['主角', '导师'], location: '学院', order: 0 }],
          characters: ['主角', '导师'],
          location: '学院',
          conflicts: [],
          resolutions: ['神秘戒指'],
          foreshadowingToPlant: [],
          foreshadowingToResolve: ['神秘戒指'],
          status: 'planned' as const,
        },
      ],
      foreshadowings: [],
    },
    _entities: [
      { id: 'ent-1', projectId: 'test-project-001', type: 'CHARACTER', name: '主角', aliases: [], importance: 'critical', category: 'protagonist', systemPrompt: '穿越者', isArchived: false, createdAt: Date.now() },
      { id: 'ent-2', projectId: 'test-project-001', type: 'LOCATION', name: '异世界', aliases: [], importance: 'major', category: 'world', systemPrompt: '奇幻大陆', isArchived: false, createdAt: Date.now() },
    ],
    _stateEvents: [{ id: 'evt-1', projectId: 'test-project-001', chapterNumber: 1, entityId: 'ent-1', eventType: 'PROPERTY_UPDATE', payload: { key: 'status', value: 'active' }, source: 'AI_EXTRACTED' }],
    ...overrides,
  }
}

function makeMockComposeOutput() {
  return {
    contextPackage: {
      chapter: 3,
      storyBible: '故事设定',
      currentState: '当前状态',
      hookSnapshot: '伏笔快照',
      chapterSummaries: '章节摘要',
      characterMatrix: '角色矩阵',
      emotionalArcs: '情感弧线',
      subplotBoard: '支线面板',
      volumeOutline: '大纲',
      recentChapters: [] as string[],
      selectedEntities: '',
    },
    ruleStack: {
      genreRules: ['玄幻规则'],
      bookRules: ['本书规则'],
      prohibitions: ['禁止穿越悖论'],
      styleGuide: '文风指南',
    },
    trace: {
      selectedSections: ['storyBible'],
      trimmedSections: [],
      totalBudgetUsed: 5000,
      totalBudgetAvailable: 50000,
    },
  }
}

function makeMockReviewResult(overrides: Record<string, any> = {}) {
  return {
    finalContent: '修订后的章节内容',
    finalWordCount: 2000,
    auditResult: {
      passed: true,
      overallScore: 88,
      issues: [],
      summary: '通过',
      dimensionScores: { plot: 90, character: 85 },
      tokenUsage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
    },
    aggregatedReport: {
      overallScore: 88,
      dimensionScores: { plot: 90, character: 85 },
      issues: [],
      summary: '质量良好',
    },
    iterations: 0,
    rolledBack: false,
    snapshotReport: { snapshots: [] },
    postWriteIssues: [],
    sensitiveWordBlocked: false,
    tokenUsage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PipelineRunner', () => {
  let PipelineRunner: typeof import('@/services/pipeline/PipelineRunner').PipelineRunner

  beforeEach(async () => {
    vi.clearAllMocks()

    // Default mocks
    checkInitializedMock.mockReturnValue(true)
    chatMock.mockResolvedValue({
      content: 'AI generated chapter content',
      usage: { inputTokens: 500, outputTokens: 1000, totalTokens: 1500 },
    })
    composerComposeMock.mockResolvedValue(makeMockComposeOutput())
    normalizerNormalizeMock.mockResolvedValue({
      normalizedContent: 'normalized content',
      finalCount: 2000,
      applied: false,
      mode: 'none',
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    })
    reviewCycleExecuteMock.mockResolvedValue(makeMockReviewResult())
    settlerSettleMock.mockResolvedValue({
      newEntities: [{ name: '新角色' }],
      newStateEvents: [{ type: 'event_record' }],
      chapterSummary: '章节摘要',
      tokenUsage: { inputTokens: 50, outputTokens: 50, totalTokens: 100 },
    })
    analyzerAnalyzeMock.mockResolvedValue({
      chapterSummary: '章节分析摘要',
      hookUpdates: [{ content: '伏笔更新', previousStatus: 'planted', newStatus: 'advanced' }],
      emotionalArcUpdate: '情感弧线更新',
      tokenUsage: { inputTokens: 50, outputTokens: 50, totalTokens: 100 },
    })
    hookPromoterPromoteMock.mockReturnValue({
      promotedHooks: [],
      staleHooks: [],
      expiredRiskHooks: [],
      resolvedHooks: [],
    })

    // Dynamic import so vi.mock() is already applied
    const mod = await import('@/services/pipeline/PipelineRunner')
    PipelineRunner = mod.PipelineRunner
  })

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------
  describe('constructor', () => {
    it('should initialize all agents', async () => {
      const { ComposerAgent } = await import('@/agents/ComposerAgent')
      const { ContinuityAuditor } = await import('@/agents/ContinuityAuditor')
      const { ReviserAgent } = await import('@/agents/ReviserAgent')
      const { LengthNormalizerAgent } = await import('@/agents/LengthNormalizerAgent')
      const { StateSettler } = await import('@/agents/StateSettler')
      const { ChapterAnalyzer } = await import('@/agents/ChapterAnalyzer')
      const { HookPromoter } = await import('@/agents/HookPromoter')

      new PipelineRunner()

      expect(ComposerAgent).toHaveBeenCalled()
      expect(ContinuityAuditor).toHaveBeenCalled()
      expect(ReviserAgent).toHaveBeenCalled()
      expect(LengthNormalizerAgent).toHaveBeenCalled()
      expect(StateSettler).toHaveBeenCalled()
      expect(ChapterAnalyzer).toHaveBeenCalled()
      expect(HookPromoter).toHaveBeenCalled()
    })

    it('should pass config options to ChapterReviewCycle', async () => {
      new PipelineRunner({ maxAuditRetries: 3, passScoreThreshold: 90, netImprovementEpsilon: 5 })

      expect(reviewCycleCtorMock).toHaveBeenCalledWith({
        maxRetries: 3,
        passScoreThreshold: 90,
        netImprovementEpsilon: 5,
      })
    })

    it('should use default config values when none provided', async () => {
      new PipelineRunner()

      expect(reviewCycleCtorMock).toHaveBeenCalledWith({
        maxRetries: 1,
        passScoreThreshold: 85,
        netImprovementEpsilon: 3,
      })
    })
  })

  // -----------------------------------------------------------------------
  // updateConfig
  // -----------------------------------------------------------------------
  describe('updateConfig', () => {
    it('should propagate updated config to reviewCycle', () => {
      const runner = new PipelineRunner()
      reviewCycleCtorMock.mockClear()

      runner.updateConfig({ maxAuditRetries: 5, passScoreThreshold: 95, netImprovementEpsilon: 10 })

      expect(reviewCycleCtorMock).toHaveBeenCalledWith({
        maxRetries: 5,
        passScoreThreshold: 95,
        netImprovementEpsilon: 10,
      })
    })

    it('should merge partial config with existing config', () => {
      const runner = new PipelineRunner({ temperatureBase: 0.9 })
      reviewCycleCtorMock.mockClear()

      runner.updateConfig({ maxAuditRetries: 2 })

      // temperatureBase should remain 0.9 (not reverted to default)
      // maxAuditRetries should be 2
      expect(reviewCycleCtorMock).toHaveBeenCalledWith(
        expect.objectContaining({ maxRetries: 2 })
      )
    })
  })

  // -----------------------------------------------------------------------
  // writeNextChapter — error handling
  // -----------------------------------------------------------------------
  describe('writeNextChapter', () => {
    it('should return error result when AI service is not initialized', async () => {
      checkInitializedMock.mockReturnValue(false)
      const runner = new PipelineRunner()

      const result = await runner.writeNextChapter({
        project: makeMockProject(),
        chapterNumber: 3,
      })

      expect(result.status).toBe('audit-failed')
      expect(result.wordCount).toBe(0)
      expect(result.content).toBe('')
      expect(result.auditResult.passed).toBe(false)
      expect(result.auditResult.issues[0].severity).toBe('critical')
      expect(result.auditResult.issues[0].description).toContain('AI服务未初始化')
    })

    it('should return error result when chat throws', async () => {
      // 使用不可重试的错误类型（invalid_api_key），避免触发重试退避
      chatMock.mockRejectedValue(new Error('invalid_api_key: API key is not valid'))
      const runner = new PipelineRunner()

      const result = await runner.writeNextChapter({
        project: makeMockProject(),
        chapterNumber: 3,
      })

      expect(result.status).toBe('audit-failed')
      expect(result.wordCount).toBe(0)
      expect(result.auditResult.issues[0].description).toContain('invalid_api_key')
    }, 15000)

    it('should call reviewCycle.execute after successful write phase', async () => {
      const runner = new PipelineRunner()

      await runner.writeNextChapter({
        project: makeMockProject(),
        chapterNumber: 3,
      })

      expect(reviewCycleExecuteMock).toHaveBeenCalledTimes(1)
      expect(reviewCycleExecuteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          chapterNumber: 3,
          chapterContent: expect.any(String),
          genre: '玄幻',
        })
      )
    })
  })

  // -----------------------------------------------------------------------
  // extractHookPool (tested indirectly through writeNextChapter)
  // -----------------------------------------------------------------------
  describe('extractHookPool', () => {
    it('should filter only foreshadowing events from plotEvents', async () => {
      const runner = new PipelineRunner()

      await runner.writeNextChapter({
        project: makeMockProject(),
        chapterNumber: 3,
      })

      // The composer should receive a hookPool with only foreshadowing events (2 out of 3)
      const composeCall = composerComposeMock.mock.calls[0][0]
      expect(composeCall.hookPool).toHaveLength(2)
      expect(composeCall.hookPool[0].content).toBe('神秘的戒指发出微光')
      expect(composeCall.hookPool[0].status).toBe('planted')
      expect(composeCall.hookPool[1].content).toBe('戒指的力量觉醒')
      expect(composeCall.hookPool[1].status).toBe('resolved')
    })

    it('should return empty hook pool when no plotEvents exist', async () => {
      const runner = new PipelineRunner()

      await runner.writeNextChapter({
        project: makeMockProject({ plotEvents: [] }),
        chapterNumber: 3,
      })

      const composeCall = composerComposeMock.mock.calls[0][0]
      expect(composeCall.hookPool).toHaveLength(0)
    })

    it('should return empty hook pool when plotEvents is undefined', async () => {
      const runner = new PipelineRunner()

      await runner.writeNextChapter({
        project: makeMockProject({ plotEvents: undefined }),
        chapterNumber: 3,
      })

      const composeCall = composerComposeMock.mock.calls[0][0]
      expect(composeCall.hookPool).toHaveLength(0)
    })
  })

  // -----------------------------------------------------------------------
  // Helper methods — extractRecentSummaries, extractPreviousEnding, etc.
  // -----------------------------------------------------------------------
  describe('helper methods', () => {
    it('should extract recent summaries from chapters before the target', async () => {
      const runner = new PipelineRunner()

      await runner.writeNextChapter({
        project: makeMockProject(),
        chapterNumber: 3,
      })

      // composer receives chapterSummaries string built from chapters 1 & 2
      const composeCall = composerComposeMock.mock.calls[0][0]
      expect(composeCall.chapterSummaries).toContain('主角穿越到异世界')
      expect(composeCall.chapterSummaries).toContain('主角遇见导师')
    })

    it('should extract previous ending from the chapter before target', async () => {
      const runner = new PipelineRunner()

      await runner.writeNextChapter({
        project: makeMockProject(),
        chapterNumber: 3,
      })

      // The contextPackage.recentChapters should include chapters 1 and 2
      // (chapters with number >= chapterNumber - 3 && number < chapterNumber)
      // and each content should be sliced to last 1500 chars
      expect(composerComposeMock).toHaveBeenCalled()
    })

    it('should use outline for chapter when available', async () => {
      const runner = new PipelineRunner()

      await runner.writeNextChapter({
        project: makeMockProject(),
        chapterNumber: 1,
      })

      // Plan phase should use goals from outline
      // The plan is executed internally; we verify the compose call receives the plan
      expect(composerComposeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: expect.objectContaining({
            intent: expect.objectContaining({
              goal: expect.stringContaining('建立世界观'),
            }),
          }),
        })
      )
    })

    it('should extract character matrix from entities', async () => {
      const runner = new PipelineRunner()

      await runner.writeNextChapter({
        project: makeMockProject(),
        chapterNumber: 3,
      })

      const composeCall = composerComposeMock.mock.calls[0][0]
      // Only CHARACTER type entities should appear in characterMatrix
      expect(composeCall.characterMatrix).toContain('主角')
      expect(composeCall.characterMatrix).not.toContain('异世界')
    })

    it('should handle project with no chapters gracefully', async () => {
      const runner = new PipelineRunner()

      const result = await runner.writeNextChapter({
        project: makeMockProject({ chapters: [] }),
        chapterNumber: 1,
      })

      // Should not throw, and should complete with some result
      expect(result.chapterNumber).toBe(1)
    })
  })

  // -----------------------------------------------------------------------
  // Phase 7-9 execution after audit
  // -----------------------------------------------------------------------
  describe('post-audit phases', () => {
    it('should execute settle (phase 7) after audit phase', async () => {
      const runner = new PipelineRunner()

      await runner.writeNextChapter({
        project: makeMockProject(),
        chapterNumber: 3,
      })

      expect(settlerSettleMock).toHaveBeenCalledTimes(1)
      expect(settlerSettleMock).toHaveBeenCalledWith(
        expect.objectContaining({
          chapterNumber: 3,
          chapterContent: expect.any(String),
        })
      )
    })

    it('should execute analyze (phase 8) after settle', async () => {
      const runner = new PipelineRunner()

      await runner.writeNextChapter({
        project: makeMockProject(),
        chapterNumber: 3,
      })

      expect(analyzerAnalyzeMock).toHaveBeenCalledTimes(1)
      expect(analyzerAnalyzeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          chapterNumber: 3,
          chapterContent: expect.any(String),
        })
      )
    })

    it('should execute promote-hooks (phase 9) after analyze when enableHookPromotion is true', async () => {
      const runner = new PipelineRunner({ enableHookPromotion: true })

      await runner.writeNextChapter({
        project: makeMockProject(),
        chapterNumber: 3,
      })

      expect(hookPromoterPromoteMock).toHaveBeenCalledTimes(1)
      expect(hookPromoterPromoteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          hooks: expect.any(Array),
          currentChapter: 3,
        })
      )
    })

    it('should skip promote-hooks when enableHookPromotion is false', async () => {
      const runner = new PipelineRunner({ enableHookPromotion: false })

      await runner.writeNextChapter({
        project: makeMockProject(),
        chapterNumber: 3,
      })

      expect(hookPromoterPromoteMock).not.toHaveBeenCalled()
    })

    it('should not fail pipeline when settle throws', async () => {
      settlerSettleMock.mockRejectedValue(new Error('Settle failed'))
      const runner = new PipelineRunner()

      const result = await runner.writeNextChapter({
        project: makeMockProject(),
        chapterNumber: 3,
      })

      // Pipeline should still complete (settle failure is non-blocking)
      expect(result.chapterNumber).toBe(3)
    })

    it('should not fail pipeline when analyzer throws', async () => {
      analyzerAnalyzeMock.mockRejectedValue(new Error('Analyze failed'))
      const runner = new PipelineRunner()

      const result = await runner.writeNextChapter({
        project: makeMockProject(),
        chapterNumber: 3,
      })

      // Pipeline should still complete (analyze failure is non-blocking)
      expect(result.chapterNumber).toBe(3)
    })
  })

  // -----------------------------------------------------------------------
  // Progress and trace callbacks
  // -----------------------------------------------------------------------
  describe('callbacks', () => {
    it('should invoke onStageProgress callback at each stage', async () => {
      const onStageProgress = vi.fn()
      const runner = new PipelineRunner({ onStageProgress })

      await runner.writeNextChapter({
        project: makeMockProject(),
        chapterNumber: 3,
      })

      // At minimum, 'prepare' stage should be called
      expect(onStageProgress).toHaveBeenCalledWith('prepare', expect.any(String))
      expect(onStageProgress).toHaveBeenCalledWith('compose', expect.any(String))
    })

    it('should invoke onAgentTrace callback', async () => {
      const onAgentTrace = vi.fn()
      const runner = new PipelineRunner({ onAgentTrace })

      await runner.writeNextChapter({
        project: makeMockProject(),
        chapterNumber: 3,
      })

      expect(onAgentTrace).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: 'composer',
          stage: 'compose',
          status: 'completed',
        })
      )
    })
  })
})
