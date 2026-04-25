import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Chapter, Project, ProjectConfig } from '@/types'
import type { Entity } from '@/types/sandbox'
import { GenerationScheduler } from '../generation-scheduler'

const mocks = vi.hoisted(() => {
  const projectStore = {
    currentProject: null as Project | null,
    saveChapter: vi.fn(),
    saveCurrentProject: vi.fn(),
  }

  const aiStore = {
    checkInitialized: vi.fn(() => true),
    chatStream: vi.fn(),
    chat: vi.fn(),
  }

  const sandboxStore = {
    currentChapter: 0,
    activeEntitiesState: {},
    entities: [] as Entity[],
    stateEvents: [],
    batchAddEntities: vi.fn(),
    batchAddStateEvents: vi.fn(),
    buildNameToIdMap: vi.fn(() => new Map()),
  }

  const taskManager = {
    createTask: vi.fn(() => ({ id: 'task-1' })),
    updateTask: vi.fn(),
    completeTask: vi.fn(),
    failTask: vi.fn(),
    addToast: vi.fn(),
  }

  const processorRegistry = {
    processPipeline: vi.fn(async (_phase: string, payload: { chapter: Chapter }) => ({ chapter: payload.chapter })),
  }

  return {
    projectStore,
    aiStore,
    sandboxStore,
    taskManager,
    processorRegistry,
    buildChapterContext: vi.fn(async () => ({
      warnings: [],
      totalTokens: 123,
    })),
    contextToPromptPayload: vi.fn(() => ({
      systemMessage: 'system prompt',
      userMessage: 'user prompt',
    })),
    extendOutlineWithLLM: vi.fn(async () => []),
    validateChapterLogic: vi.fn(async () => ({ passed: true })),
    createQualityChecker: vi.fn(() => ({
      checkChapter: vi.fn(async () => ({ overallScore: 92 })),
    })),
    convertPlotEvents: vi.fn(() => [{ id: 'plot-record-1' }]),
    safeParseAIJson: vi.fn((content: string) => JSON.parse(content)),
  }
})

vi.mock('@/stores/project', () => ({
  useProjectStore: () => mocks.projectStore,
}))

vi.mock('@/stores/ai', () => ({
  useAIStore: () => mocks.aiStore,
}))

vi.mock('@/stores/sandbox', () => ({
  useSandboxStore: () => mocks.sandboxStore,
}))

vi.mock('@/stores/taskManager', () => ({
  useTaskManager: () => mocks.taskManager,
}))

vi.mock('@/stores/plugin', () => ({
  usePluginStore: () => ({
    getRegistries: () => ({ processor: mocks.processorRegistry }),
  }),
}))

vi.mock('@/utils/contextBuilder', () => ({
  buildChapterContext: mocks.buildChapterContext,
  contextToPromptPayload: mocks.contextToPromptPayload,
}))

vi.mock('@/utils/llm/outlineGenerator', () => ({
  extendOutlineWithLLM: mocks.extendOutlineWithLLM,
}))

vi.mock('@/utils/llm/antiRetconValidator', () => ({
  validateChapterLogic: mocks.validateChapterLogic,
}))

vi.mock('@/utils/qualityChecker', () => ({
  createQualityChecker: mocks.createQualityChecker,
}))

vi.mock('@/services/rewrite-continuation', () => ({
  RewriteContinuationService: {
    convertPlotEvents: mocks.convertPlotEvents,
  },
}))

vi.mock('@/services/deep-import-schemas', () => ({
  EXTRACT_PLOT_EVENTS_SCHEMA: { name: 'extract_plot_events' },
  PLOT_EXTRACTION_SYSTEM: 'plot extraction system',
}))

vi.mock('@/utils/safeParseAIJson', () => ({
  safeParseAIJson: mocks.safeParseAIJson,
}))

vi.mock('@/utils/project-config-normalizer', () => ({
  normalizeProjectConfig: (config?: Partial<ProjectConfig>) => ({
    enableAutoReview: false,
    enableVectorRetrieval: false,
    enableQualityCheck: false,
    enableZeroTouchExtraction: false,
    advancedSettings: {
      targetWordCount: 2000,
      maxContextTokens: 128000,
      ...(config?.advancedSettings ?? {}),
    },
    agentConfigs: [],
    ...(config ?? {}),
  }),
}))

vi.mock('@/utils/characterExtractor', () => ({
  extractEntitiesWithAI: vi.fn(async () => ({ characters: [], worldbook: [], events: [] })),
  analyzeRelationships: vi.fn(() => []),
}))

vi.mock('@/utils/systemPrompts', () => ({
  mergeSystemPrompts: vi.fn(() => ({ extractor: 'extractor prompt' })),
}))

vi.mock('@/composables/useAuditLog', () => ({
  useAuditLog: () => ({ addLog: vi.fn() }),
}))

vi.mock('@/agents/AgentOrchestrator', () => ({
  AgentOrchestrator: vi.fn(() => ({
    runPhase: vi.fn(async () => ({ results: [] })),
  })),
}))

vi.mock('@/agents/PlannerAgent', () => ({
  PlannerAgent: vi.fn(),
}))

vi.mock('@/agents/EditorAgent', () => ({
  EditorAgent: vi.fn(),
}))

vi.mock('@/agents/ReaderAgent', () => ({
  ReaderAgent: vi.fn(),
}))

vi.mock('@/agents/SentinelAgent', () => ({
  SentinelAgent: vi.fn(),
}))

vi.mock('@/agents/ExtractorAgent', () => ({
  ExtractorAgent: vi.fn(),
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}))

function createProject(config: Partial<ProjectConfig> = {}): Project {
  return {
    id: 'project-1',
    title: '测试项目',
    description: '',
    genre: '玄幻',
    targetWords: 100000,
    currentWords: 0,
    status: 'writing',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    outline: {
      id: 'outline-1',
      synopsis: '',
      theme: '',
      mainPlot: { id: 'main', name: '主线', description: '' },
      subPlots: [],
      volumes: [],
      chapters: [],
      foreshadowings: [],
    },
    chapters: [],
    config: config as ProjectConfig,
  }
}

function createSchedulerOptions(overrides = {}) {
  return {
    startChapter: 1,
    count: 1,
    autoSave: true,
    autoUpdateSettings: false,
    ...overrides,
  }
}

describe('GenerationScheduler', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((handler: TimerHandler) => {
      if (typeof handler === 'function') handler()
      return 0 as unknown as ReturnType<typeof setTimeout>
    })

    mocks.projectStore.currentProject = createProject()
    mocks.projectStore.saveChapter.mockResolvedValue(undefined)
    mocks.projectStore.saveCurrentProject.mockResolvedValue(undefined)

    mocks.aiStore.checkInitialized.mockReturnValue(true)
    mocks.aiStore.chatStream.mockImplementation(async (_messages, onEvent) => {
      onEvent({ type: 'chunk', chunk: '流式' })
      onEvent({ type: 'chunk', chunk: '正文' })
      return { content: '流式正文' }
    })
    mocks.aiStore.chat.mockResolvedValue({ content: '普通正文' })

    mocks.sandboxStore.currentChapter = 0
    mocks.sandboxStore.activeEntitiesState = {}
    mocks.sandboxStore.entities = []
    mocks.sandboxStore.stateEvents = []
    mocks.sandboxStore.batchAddEntities.mockResolvedValue(undefined)
    mocks.sandboxStore.batchAddStateEvents.mockResolvedValue(undefined)
    mocks.sandboxStore.buildNameToIdMap.mockReturnValue(new Map())

    mocks.taskManager.createTask.mockReturnValue({ id: 'task-1' })
    mocks.taskManager.updateTask.mockReset()
    mocks.taskManager.completeTask.mockReset()
    mocks.taskManager.failTask.mockReset()
    mocks.taskManager.addToast.mockReset()

    mocks.processorRegistry.processPipeline.mockImplementation(async (_phase, payload) => ({ chapter: payload.chapter }))
    mocks.buildChapterContext.mockResolvedValue({ warnings: [], totalTokens: 123 })
    mocks.contextToPromptPayload.mockReturnValue({ systemMessage: 'system prompt', userMessage: 'user prompt' })
    mocks.extendOutlineWithLLM.mockResolvedValue([])
    mocks.validateChapterLogic.mockResolvedValue({ passed: true })
    mocks.convertPlotEvents.mockReturnValue([{ id: 'plot-record-1' }])
    mocks.safeParseAIJson.mockImplementation((content: string) => JSON.parse(content))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws when project is missing or AI is not initialized', async () => {
    const scheduler = new GenerationScheduler()

    mocks.projectStore.currentProject = null
    await expect(scheduler.executeBatchGeneration(createSchedulerOptions())).rejects.toThrow('系统未初始化或项目未加载')

    mocks.projectStore.currentProject = createProject()
    mocks.aiStore.checkInitialized.mockReturnValue(false)
    await expect(scheduler.executeBatchGeneration(createSchedulerOptions())).rejects.toThrow('系统未初始化或项目未加载')
  })

  it('streams chapter content, saves generated chapter, and advances current chapter', async () => {
    const scheduler = new GenerationScheduler()

    await scheduler.executeBatchGeneration(createSchedulerOptions())

    expect(mocks.buildChapterContext).toHaveBeenCalledWith(
      mocks.projectStore.currentProject,
      expect.objectContaining({ number: 1, title: '第1章' }),
      undefined,
      128000,
      undefined
    )
    expect(mocks.aiStore.chatStream).toHaveBeenCalledWith(
      [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'user prompt' },
      ],
      expect.any(Function),
      { type: 'chapter', complexity: 'high', priority: 'quality' },
      { maxTokens: 4000, temperature: 0.7 }
    )
    expect(mocks.projectStore.saveChapter).toHaveBeenCalledWith(expect.objectContaining({
      number: 1,
      content: '流式正文',
      wordCount: 4,
    }))
    expect(mocks.sandboxStore.currentChapter).toBe(1)
    expect(mocks.taskManager.completeTask).toHaveBeenCalledWith('task-1', '成功生成 1 个章节')
  })

  it('falls back to non-stream chat when streaming fails', async () => {
    const scheduler = new GenerationScheduler()
    mocks.aiStore.chatStream.mockRejectedValueOnce(new Error('stream down'))
    mocks.aiStore.chat.mockResolvedValueOnce({ content: '后备正文' })

    await scheduler.executeBatchGeneration(createSchedulerOptions())

    expect(mocks.aiStore.chat).toHaveBeenCalledWith(
      [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'user prompt' },
      ],
      { type: 'chapter', complexity: 'high', priority: 'quality' },
      { maxTokens: 4000, temperature: 0.7 }
    )
    expect(mocks.projectStore.saveChapter).toHaveBeenCalledWith(expect.objectContaining({ content: '后备正文' }))
  })

  it('stages chapters when autoSave is false and flushes them at the end', async () => {
    const scheduler = new GenerationScheduler()
    const project = createProject()
    mocks.projectStore.currentProject = project

    await scheduler.executeBatchGeneration(createSchedulerOptions({ autoSave: false }))

    expect(project.chapters).toHaveLength(1)
    expect(project.chapters[0]).toMatchObject({ number: 1, content: '流式正文' })
    expect(mocks.projectStore.saveChapter).toHaveBeenCalledWith(expect.objectContaining({ number: 1, content: '流式正文' }))
    expect(mocks.projectStore.saveCurrentProject).toHaveBeenCalledTimes(1)
  })

  it('stops at a checkpoint when confirmation rejects continuation', async () => {
    const scheduler = new GenerationScheduler()
    const onCheckpointConfirm = vi.fn(async () => false)

    await scheduler.executeBatchGeneration(createSchedulerOptions({
      count: 2,
      enableCheckpoint: true,
      checkpointInterval: 1,
      callbacks: {
        onCheckpointConfirm,
      },
    }))

    expect(onCheckpointConfirm).toHaveBeenCalledWith(1)
    expect(mocks.projectStore.saveChapter).toHaveBeenCalledTimes(1)
    expect(mocks.taskManager.failTask).toHaveBeenCalledWith('task-1', '于检查点处由用户手动终止')
    expect(mocks.taskManager.completeTask).not.toHaveBeenCalled()
  })

  it('extracts plot events when plot extraction is enabled', async () => {
    const scheduler = new GenerationScheduler()
    const project = createProject()
    mocks.projectStore.currentProject = project
    mocks.aiStore.chat.mockResolvedValueOnce({
      content: JSON.stringify({
        plotEvents: [
          { title: '伏笔出现', eventType: 'foreshadowing', description: '玉佩发光' },
        ],
      }),
    })

    await scheduler.executeBatchGeneration(createSchedulerOptions({
      extraction: { extractPlotEvents: true },
    }))

    expect(mocks.safeParseAIJson).toHaveBeenCalledWith(expect.stringContaining('plotEvents'))
    expect(mocks.convertPlotEvents).toHaveBeenCalledWith(
      [{ title: '伏笔出现', eventType: 'foreshadowing', description: '玉佩发光' }],
      'project-1',
      1,
      expect.any(Map)
    )
    expect(project.plotEvents).toEqual([{ id: 'plot-record-1' }])
  })

  it('registers sentinel and extractor in post-generation agent flow', async () => {
    const scheduler = new GenerationScheduler()
    const project = createProject({
      enableAutoReview: true,
      agentConfigs: [
        { role: 'sentinel', enabled: true, phase: 'post-generation', priority: 2 },
        { role: 'editor', enabled: true, phase: 'post-generation', priority: 5 },
        { role: 'extractor', enabled: true, phase: 'post-generation', priority: 10 },
      ],
    })
    mocks.projectStore.currentProject = project

    await scheduler.executeBatchGeneration(createSchedulerOptions())
    await Promise.resolve()

    const { AgentOrchestrator } = await import('@/agents/AgentOrchestrator')
    expect(AgentOrchestrator).toHaveBeenCalledWith(expect.objectContaining({
      agents: expect.arrayContaining([
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
      ]),
      configs: expect.arrayContaining([
        expect.objectContaining({ role: 'sentinel', enabled: true }),
        expect.objectContaining({ role: 'extractor', enabled: true }),
      ]),
    }))
  })

  it('persists state events when auto update sees high-impact content', async () => {
    const scheduler = new GenerationScheduler()
    const project = createProject({ enableZeroTouchExtraction: false })
    mocks.projectStore.currentProject = project
    mocks.sandboxStore.entities = [{
      id: 'entity-1',
      projectId: 'project-1',
      type: 'CHARACTER',
      name: '主角',
      aliases: [],
      importance: 'major',
      category: '角色',
      systemPrompt: '',
      isArchived: false,
      createdAt: 1710000000000,
    }]
    mocks.aiStore.chatStream.mockImplementationOnce(async () => ({ content: '主角突破境界' }))
    mocks.aiStore.chat.mockResolvedValueOnce({
      content: JSON.stringify({
        events: [
          { entityName: '主角', eventType: 'PROPERTY_UPDATE', details: '突破境界' },
        ],
      }),
    })

    await scheduler.executeBatchGeneration(createSchedulerOptions({ autoUpdateSettings: true }))

    expect(mocks.sandboxStore.batchAddStateEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        projectId: 'project-1',
        chapterNumber: 1,
        entityId: 'entity-1',
        eventType: 'PROPERTY_UPDATE',
        payload: expect.objectContaining({ value: '突破境界' }),
      }),
    ])
  })
})
