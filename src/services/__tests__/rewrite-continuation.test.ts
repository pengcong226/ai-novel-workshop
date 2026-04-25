import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project } from '@/types'
import type { StateEvent } from '@/types/sandbox'
import type { ExtractedPlotEvent } from '@/types/deep-import'
import type { PlotEventRecord, StateDiffReport } from '@/types/rewrite-continuation'
import { RewriteContinuationService } from '../rewrite-continuation'

const mocks = vi.hoisted(() => {
  const projectStore = {
    currentProject: null as Project | null,
    saveCurrentProject: vi.fn(),
  }

  const sandboxStore = {
    currentChapter: 0,
    entities: [],
    stateEvents: [] as StateEvent[],
    deleteStateEventsByChapterRange: vi.fn(),
    batchAddStateEvents: vi.fn(),
  }

  return {
    projectStore,
    sandboxStore,
    executeBatchGeneration: vi.fn(),
    cancelBatchGeneration: vi.fn(),
    captureSnapshot: vi.fn(() => []),
    computeRewriteDiffReport: vi.fn(),
    writeEncryptedLocalStorage: vi.fn(),
    readEncryptedLocalStorage: vi.fn(),
    uuidv4: vi.fn(() => 'plot-id-1'),
  }
})

vi.mock('@/stores/project', () => ({
  useProjectStore: () => mocks.projectStore,
}))

vi.mock('@/stores/sandbox', () => ({
  useSandboxStore: () => mocks.sandboxStore,
}))

vi.mock('@/services/generation-scheduler', () => ({
  GenerationScheduler: vi.fn(() => ({
    executeBatchGeneration: mocks.executeBatchGeneration,
    cancelBatchGeneration: mocks.cancelBatchGeneration,
  })),
}))

vi.mock('@/utils/stateDiff', () => ({
  captureSnapshot: mocks.captureSnapshot,
  computeRewriteDiffReport: mocks.computeRewriteDiffReport,
}))

vi.mock('@/utils/crypto', () => ({
  writeEncryptedLocalStorage: mocks.writeEncryptedLocalStorage,
  readEncryptedLocalStorage: mocks.readEncryptedLocalStorage,
}))

vi.mock('uuid', () => ({
  v4: mocks.uuidv4,
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    title: '星海纪元',
    description: '',
    genre: '科幻',
    targetWords: 100000,
    currentWords: 0,
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    chapters: [
      { id: 'c1', number: 1, title: '第一章', content: '旧正文一', wordCount: 4, status: 'draft', createdAt: new Date(), updatedAt: new Date() },
      { id: 'c2', number: 2, title: '第二章', content: '旧正文二', wordCount: 4, status: 'draft', createdAt: new Date(), updatedAt: new Date() },
      { id: 'c3', number: 3, title: '第三章', content: '旧正文三', wordCount: 4, status: 'draft', createdAt: new Date(), updatedAt: new Date() },
    ],
    config: {},
    ...overrides,
  } as Project
}

function stateEvent(input: Partial<StateEvent> & Pick<StateEvent, 'id' | 'chapterNumber' | 'entityId' | 'eventType'>): StateEvent {
  return {
    projectId: 'project-1',
    payload: {},
    source: 'AI_EXTRACTED',
    ...input,
  }
}

function diffReport(): StateDiffReport {
  return {
    baselineSnapshot: [],
    preRewriteSnapshot: [],
    postRewriteSnapshot: [],
    diffs: [],
    brokenForeshadowing: [],
    newEntities: [],
    removedEntityIds: [],
  }
}

describe('RewriteContinuationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.projectStore.currentProject = project()
    mocks.projectStore.saveCurrentProject.mockResolvedValue(undefined)
    mocks.sandboxStore.currentChapter = 0
    mocks.sandboxStore.entities = []
    mocks.sandboxStore.stateEvents = []
    mocks.sandboxStore.deleteStateEventsByChapterRange.mockResolvedValue(undefined)
    mocks.sandboxStore.batchAddStateEvents.mockResolvedValue(undefined)
    mocks.executeBatchGeneration.mockResolvedValue(undefined)
    mocks.writeEncryptedLocalStorage.mockResolvedValue(undefined)
    mocks.readEncryptedLocalStorage.mockResolvedValue(null)
    mocks.captureSnapshot.mockReturnValue([])
    mocks.computeRewriteDiffReport.mockReturnValue(diffReport())
    mocks.uuidv4.mockReturnValue('plot-id-1')
  })

  it('continues from the chapter before the generation range and forwards scheduler options', async () => {
    const service = new RewriteContinuationService()

    await service.continueNovel({
      startChapter: 8,
      count: 3,
      extractPlotEvents: true,
      enableAntiRetcon: false,
      autoSave: true,
      autoExtract: false,
    })

    expect(mocks.sandboxStore.currentChapter).toBe(7)
    expect(mocks.executeBatchGeneration).toHaveBeenCalledWith({
      startChapter: 8,
      count: 3,
      autoSave: true,
      autoUpdateSettings: false,
      extraction: {
        extractPlotEvents: true,
        enableAntiRetcon: false,
      },
      enableCheckpoint: true,
      checkpointInterval: 10,
    })
  })

  it('requires a selected project before rewrite starts', async () => {
    mocks.projectStore.currentProject = null
    const service = new RewriteContinuationService()

    await expect(service.startRewrite({
      range: { start: 2, end: 3 },
      newDirectionPrompt: '改写为更紧张的逃亡线',
      extractPlotEvents: true,
      enableAntiRetcon: true,
      autoSave: true,
    })).rejects.toThrow('No project selected')
  })

  it('backs up rewrite range, deletes old state events, runs rewrite generation, and returns diff report', async () => {
    const report = diffReport()
    mocks.computeRewriteDiffReport.mockReturnValue(report)
    mocks.sandboxStore.stateEvents = [
      stateEvent({ id: 'before', chapterNumber: 1, entityId: 'hero', eventType: 'PROPERTY_UPDATE' }),
      stateEvent({ id: 'inside', chapterNumber: 2, entityId: 'hero', eventType: 'LOCATION_MOVE', payload: { value: '星门' } }),
      stateEvent({ id: 'after', chapterNumber: 4, entityId: 'hero', eventType: 'PROPERTY_UPDATE' }),
    ]
    const service = new RewriteContinuationService()

    await expect(service.startRewrite({
      range: { start: 2, end: 3 },
      newDirectionPrompt: '改写为更紧张的逃亡线',
      extractPlotEvents: true,
      enableAntiRetcon: false,
      autoSave: false,
    })).resolves.toBe(report)

    expect(mocks.captureSnapshot).toHaveBeenNthCalledWith(1, mocks.sandboxStore.entities, mocks.sandboxStore.stateEvents, 1)
    expect(mocks.captureSnapshot).toHaveBeenNthCalledWith(2, mocks.sandboxStore.entities, mocks.sandboxStore.stateEvents, 3)
    expect(mocks.writeEncryptedLocalStorage).toHaveBeenCalledWith('rewrite_backup_project-1', expect.objectContaining({
      projectId: 'project-1',
      range: { start: 2, end: 3 },
      chapters: [
        { number: 2, title: '第二章', content: '旧正文二', wordCount: 4 },
        { number: 3, title: '第三章', content: '旧正文三', wordCount: 4 },
      ],
      stateEvents: [expect.objectContaining({ id: 'inside', chapterNumber: 2 })],
    }))
    expect(mocks.sandboxStore.deleteStateEventsByChapterRange).toHaveBeenCalledWith(2, 3)
    expect(mocks.sandboxStore.currentChapter).toBe(1)
    expect(mocks.executeBatchGeneration).toHaveBeenCalledWith({
      startChapter: 2,
      count: 2,
      autoSave: false,
      autoUpdateSettings: true,
      rewrite: {
        directionPrompt: '改写为更紧张的逃亡线',
      },
      extraction: {
        extractPlotEvents: true,
        enableAntiRetcon: false,
      },
      enableCheckpoint: false,
    })
    expect(mocks.computeRewriteDiffReport).toHaveBeenCalledWith(
      mocks.sandboxStore.entities,
      mocks.sandboxStore.stateEvents,
      { start: 2, end: 3 },
      [],
      undefined,
      { baselineSnapshot: [], preRewriteSnapshot: [] }
    )
  })

  it('restores backed up chapters, state events, and plot events when rejecting rewrite', async () => {
    const plotEvent: PlotEventRecord = {
      id: 'plot-1',
      projectId: 'project-1',
      chapterNumber: 2,
      description: '旧伏笔',
      type: 'foreshadowing_planted',
      importance: 6,
      involvedEntityIds: ['hero'],
      evidence: '旧伏笔证据',
      createdAt: 1,
    }
    const currentProject = project({ plotEvents: [plotEvent] } as Partial<Project>)
    mocks.projectStore.currentProject = currentProject
    mocks.sandboxStore.stateEvents = [
      stateEvent({ id: 'inside', chapterNumber: 2, entityId: 'hero', eventType: 'LOCATION_MOVE', payload: { value: '星门' } }),
    ]
    const service = new RewriteContinuationService()

    await service.startRewrite({
      range: { start: 2, end: 3 },
      newDirectionPrompt: '改写方向',
      extractPlotEvents: false,
      enableAntiRetcon: true,
      autoSave: true,
    })
    currentProject.chapters[1].title = '改写章'
    currentProject.chapters[1].content = '改写正文'
    currentProject.chapters[1].wordCount = 99
    currentProject.plotEvents = []

    await service.rejectRewrite()

    expect(mocks.sandboxStore.deleteStateEventsByChapterRange).toHaveBeenLastCalledWith(2, 3)
    expect(mocks.sandboxStore.batchAddStateEvents).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'inside', chapterNumber: 2 }),
    ])
    expect(currentProject.chapters[1]).toMatchObject({ title: '第二章', content: '旧正文二', wordCount: 4 })
    expect(currentProject.plotEvents).toEqual([plotEvent])
    expect(mocks.projectStore.saveCurrentProject).toHaveBeenCalled()
  })

  it('converts extracted plot events to persisted records and filters unknown entity names', () => {
    vi.spyOn(Date, 'now').mockReturnValue(12345)
    mocks.uuidv4.mockReturnValueOnce('plot-id-1').mockReturnValueOnce('plot-id-2')
    const extracted: ExtractedPlotEvent[] = [
      {
        chapterNumber: 10,
        description: '白榆埋下星门钥匙伏笔',
        type: 'foreshadowing_planted',
        importance: 7,
        involvedEntities: ['白榆', '未知者', '林照'],
        estimatedResolutionChapter: 18,
        evidence: { quote: '白榆将钥匙藏入星门底座。', offset: 12 },
      },
      {
        chapterNumber: 10,
        description: '林照发现舰队背叛',
        type: 'betrayal',
        importance: 9,
        involvedEntities: ['林照'],
        resolvedForeshadowingFromChapter: 3,
        evidence: { quote: '舰队调转炮口。', offset: 40 },
      },
    ]

    expect(RewriteContinuationService.convertPlotEvents(extracted, 'project-1', 10, {
      白榆: 'ally',
      林照: 'hero',
    })).toEqual([
      {
        id: 'plot-id-1',
        projectId: 'project-1',
        chapterNumber: 10,
        description: '白榆埋下星门钥匙伏笔',
        type: 'foreshadowing_planted',
        importance: 7,
        involvedEntityIds: ['ally', 'hero'],
        estimatedResolutionChapter: 18,
        resolvedForeshadowingFromChapter: undefined,
        evidence: '白榆将钥匙藏入星门底座。',
        createdAt: 12345,
      },
      {
        id: 'plot-id-2',
        projectId: 'project-1',
        chapterNumber: 10,
        description: '林照发现舰队背叛',
        type: 'betrayal',
        importance: 9,
        involvedEntityIds: ['hero'],
        estimatedResolutionChapter: undefined,
        resolvedForeshadowingFromChapter: 3,
        evidence: '舰队调转炮口。',
        createdAt: 12345,
      },
    ])
  })

  it('returns pending backup from encrypted storage and null on read failure', async () => {
    const backup = {
      projectId: 'project-1',
      range: { start: 2, end: 3 },
      chapters: [],
      stateEvents: [],
      plotEvents: [],
      createdAt: 123,
    }
    mocks.readEncryptedLocalStorage.mockResolvedValueOnce(backup)

    await expect(RewriteContinuationService.checkPendingBackup('project-1')).resolves.toBe(backup)

    mocks.readEncryptedLocalStorage.mockRejectedValueOnce(new Error('storage unavailable'))
    await expect(RewriteContinuationService.checkPendingBackup('project-1')).resolves.toBeNull()
  })
})
