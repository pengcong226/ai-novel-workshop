/**
 * Deep Import Session Composable
 *
 * Reactive wrapper around NovelExtractor for use in Vue components.
 * Manages session state, progress tracking, and commit operations.
 */

import { ref, computed } from 'vue'
import { useSandboxStore } from '@/stores/sandbox'
import { useProjectStore } from '@/stores/project'
import { getErrorMessage } from '@/utils/getErrorMessage'
import { NovelExtractor } from '@/services/novel-extractor'
import { RewriteContinuationService } from '@/services/rewrite-continuation'
import type { ParsedChapter } from '@/utils/chapterParser'
import type {
  DeepImportOptions,
  DeepImportSession,
  DeepImportEstimate,
  ExtractionProgress,
  ChapterExtractionResult,
  SandboxCommitOps
} from '@/types/deep-import'
import type { Entity } from '@/types/sandbox'
import type { PlotEventRecord } from '@/types/rewrite-continuation'
import { getLogger } from '@/utils/logger'

const logger = getLogger('deep-import:session')

const session = ref<DeepImportSession | null>(null)
const extractor = ref<NovelExtractor | null>(null)
const isRunning = ref(false)
const isPaused = ref(false)
const progress = ref<ExtractionProgress | null>(null)
const parsedChapters = ref<ParsedChapter[]>([])
const currentStep = ref(0)  // 0=upload, 1=config, 2=progress, 3=confirm
const error = ref<string | null>(null)
const activeOptions = ref<DeepImportOptions | null>(null)
const activeKeyChapters = ref<number[] | undefined>(undefined)
const QUICK_SCAN_CONCURRENCY = 4

export function useDeepImportSession() {
  // --------------------------------------------------------------------------
  // Reactive State
  // --------------------------------------------------------------------------

  const successfulResults = computed(() => {
    if (!session.value) return []
    return [...session.value.results.values()].filter(r => r.status === 'success')
  })

  const allExtractedEntities = computed(() =>
    successfulResults.value.flatMap(r => r.entities.newEntities)
  )

  const allExtractedStateEvents = computed(() =>
    successfulResults.value.flatMap(r => r.stateEvents.events)
  )

  const allExtractedPlotEvents = computed(() =>
    successfulResults.value.flatMap(r => r.plotEvents?.plotEvents ?? [])
  )

  const totalEntitiesCount = computed(() => allExtractedEntities.value.length)
  const totalStateEventsCount = computed(() => allExtractedStateEvents.value.length)
  const totalCostUSD = computed(() => session.value?.totalCostUSD ?? 0)

  // --------------------------------------------------------------------------
  // Cost Estimation
  // --------------------------------------------------------------------------

  function estimateCost(chapters: ParsedChapter[], options: DeepImportOptions): DeepImportEstimate {
    const projectStore = useProjectStore()
    const projectId = projectStore.currentProject?.id || ''
    const ext = new NovelExtractor(projectId, options)
    return ext.estimateCost(chapters)
  }

  // --------------------------------------------------------------------------
  // Start Extraction
  // --------------------------------------------------------------------------

  async function start(chapters: ParsedChapter[], options: DeepImportOptions): Promise<void> {
    const projectStore = useProjectStore()
    const sandboxStore = useSandboxStore()
    const projectId = projectStore.currentProject?.id || ''

    if (!projectId) {
      error.value = 'No project selected'
      return
    }

    activeOptions.value = options
    parsedChapters.value = chapters
    isRunning.value = true
    isPaused.value = false
    error.value = null

    const ext = new NovelExtractor(projectId, options, (p: ExtractionProgress) => {
      progress.value = p
      if (p.phase === 'review_checkpoint') {
        isPaused.value = true
      }
    })
    extractor.value = ext

    try {
      // Check for resumable session
      const resumable = await NovelExtractor.checkResumableSession(projectId)

      session.value = await ext.extractAll(
        chapters,
        sandboxStore.entities,
        resumable || undefined,
        activeKeyChapters.value
      )

      if (session.value.isComplete) {
        currentStep.value = 3
      }
    } catch (err) {
      error.value = getErrorMessage(err)
      logger.error('Deep import failed:', err)
    } finally {
      isRunning.value = false
    }
  }

  // --------------------------------------------------------------------------
  // Quick Scan (Smart Sampling Mode)
  // --------------------------------------------------------------------------

  async function quickScan(
    chapters: ParsedChapter[],
    onChapterScanned?: (chapterNumber: number, isKey: boolean, reason: string) => void
  ): Promise<Array<{ chapterNumber: number; isKeyChapter: boolean; reason: string; mentionedEntities: string[] }>> {
    const projectStore = useProjectStore()
    const projectId = projectStore.currentProject?.id || ''
    const ext = new NovelExtractor(projectId, {
      mode: 'smart_sampling',
      extractPlotEvents: false,
      checkpointInterval: 0,
      maxCostUSD: 5,
      batchSize: 1
    })

    const results = new Map<number, { chapterNumber: number; isKeyChapter: boolean; reason: string; mentionedEntities: string[] }>()
    const workers = Array.from({ length: Math.min(QUICK_SCAN_CONCURRENCY, chapters.length) }, async (_, workerIndex) => {
      for (let i = workerIndex; i < chapters.length; i += Math.min(QUICK_SCAN_CONCURRENCY, chapters.length)) {
        const chapter = chapters[i]
        try {
          const result = await ext.quickScanChapter(chapter)
          const merged = { chapterNumber: chapter.number, ...result }
          results.set(chapter.number, merged)
          onChapterScanned?.(chapter.number, result.isKeyChapter, result.reason)
        } catch (err) {
          results.set(chapter.number, {
            chapterNumber: chapter.number,
            isKeyChapter: false,
            reason: `Scan failed: ${getErrorMessage(err)}`,
            mentionedEntities: []
          })
        }
      }
    })

    await Promise.all(workers)

    return chapters
      .map(chapter => results.get(chapter.number))
      .filter((item): item is { chapterNumber: number; isKeyChapter: boolean; reason: string; mentionedEntities: string[] } => !!item)
  }

  // --------------------------------------------------------------------------
  // Pause / Resume / Abort
  // --------------------------------------------------------------------------

  function pause(): void {
    if (!extractor.value || !isRunning.value) return
    extractor.value.pause()
    isPaused.value = true
  }

  function resume(): void {
    if (!extractor.value || !isRunning.value) return
    extractor.value.resume()
    isPaused.value = false
  }

  function abort(): void {
    if (extractor.value) {
      extractor.value.abort()
    }
    isRunning.value = false
    isPaused.value = false
  }

  // --------------------------------------------------------------------------
  // Plot Event Persistence
  // --------------------------------------------------------------------------

  async function persistPlotEvents(): Promise<void> {
    if (!session.value) return
    const projectStore = useProjectStore()
    const project = projectStore.currentProject
    if (!project) return

    const sandboxStore = useSandboxStore()
    const nameToIdMap = sandboxStore.buildNameToIdMap()

    // Convert extracted plot events to PlotEventRecords
    const newRecords: PlotEventRecord[] = []
    for (const [chapterNum, result] of session.value.results) {
      if (result.status === 'success' && result.plotEvents) {
        const records = RewriteContinuationService.convertPlotEvents(
          result.plotEvents.plotEvents,
          project.id,
          chapterNum,
          nameToIdMap
        )
        newRecords.push(...records)
      }
    }

    if (newRecords.length > 0) {
      project.plotEvents = [...(project.plotEvents || []), ...newRecords]
      projectStore.debouncedSaveCurrentProject()
      logger.info(`Persisted ${newRecords.length} plot events to project`)
    }
  }

  // --------------------------------------------------------------------------
  // Entity Update Merge Helper
  // --------------------------------------------------------------------------

  async function applyEntityUpdates(updatedEntities: SandboxCommitOps['updatedEntities']): Promise<void> {
    const sandboxStore = useSandboxStore()
    const merged = new Map<string, Partial<Entity>>()
    for (const { id, updates } of updatedEntities) {
      merged.set(id, {
        ...(merged.get(id) ?? {}),
        ...updates
      })
    }

    if (merged.size > 0) {
      await Promise.all(
        [...merged.entries()].map(([id, updates]) =>
          sandboxStore.updateEntity(id, updates)
        )
      )
    }
  }

  // --------------------------------------------------------------------------
  // Commit Operations
  // --------------------------------------------------------------------------

  async function commitDrafts(): Promise<void> {
    if (!session.value || !extractor.value) return

    const sandboxStore = useSandboxStore()
    const ops = extractor.value.resolveToSandboxOps(session.value)

    try {
      for (const entity of ops.newEntities) {
        sandboxStore.addDraftEntity(entity)
      }

      for (const event of ops.stateEvents) {
        if (event.eventType === 'RELATION_ADD' && event.payload.targetId && event.payload.relationType) {
          sandboxStore.addDraftRelation(event.entityId, {
            targetId: event.payload.targetId,
            type: event.payload.relationType,
            attitude: event.payload.attitude
          })
        }
      }

      await sandboxStore.commitDrafts()

      const nonRelationEvents = ops.stateEvents.filter(
        e => e.eventType !== 'RELATION_ADD'
      )
      if (nonRelationEvents.length > 0) {
        await sandboxStore.batchAddStateEvents(nonRelationEvents)
      }

      await applyEntityUpdates(ops.updatedEntities)
      await persistPlotEvents()

      logger.info(`Committed ${ops.newEntities.length} entities and ${ops.stateEvents.length} state events as drafts`)
    } catch (err) {
      error.value = getErrorMessage(err)
      logger.error('Commit drafts failed:', err)
    }
  }

  async function commitDirect(): Promise<void> {
    if (!session.value || !extractor.value) return

    const sandboxStore = useSandboxStore()
    const ops = extractor.value.resolveToSandboxOps(session.value)

    try {
      if (ops.newEntities.length > 0) {
        await sandboxStore.batchAddEntities(ops.newEntities)
      }

      if (ops.stateEvents.length > 0) {
        await sandboxStore.batchAddStateEvents(ops.stateEvents)
      }

      await applyEntityUpdates(ops.updatedEntities)
      await persistPlotEvents()

      logger.info(`Direct committed ${ops.newEntities.length} entities and ${ops.stateEvents.length} state events`)
    } catch (err) {
      error.value = getErrorMessage(err)
      logger.error('Direct commit failed:', err)
    }
  }

  async function retryChapter(chapterNumber: number): Promise<void> {
    if (!session.value) return

    const chapter = parsedChapters.value.find(ch => ch.number === chapterNumber)
    if (!chapter) return

    const projectStore = useProjectStore()
    const projectId = projectStore.currentProject?.id || ''
    if (!projectId) return

    isRunning.value = true
    error.value = null

    try {
      progress.value = {
        currentChapter: chapterNumber,
        totalChapters: session.value.totalChapters,
        phase: 'entity_extraction',
        percentage: Math.round((session.value.extractedChapters.length / Math.max(session.value.totalChapters, 1)) * 100),
        tokenUsage: { ...session.value.totalTokenUsage },
        costUSD: session.value.totalCostUSD,
        message: `正在重试第${chapterNumber}章...`,
        currentBatch: undefined,
        totalBatches: undefined,
        batchChapterRange: { start: chapterNumber, end: chapterNumber }
      }

      const result = await retryChaptersInternal([chapter])
      if (!result.success) {
        throw new Error(result.errorMessage || `重试第${chapterNumber}章失败`)
      }
    } catch (err) {
      const message = getErrorMessage(err)
      error.value = message
      logger.error(`Retry chapter ${chapterNumber} failed:`, err)
    } finally {
      isRunning.value = false
    }
  }

  async function retryFailedChapters(): Promise<void> {
    if (!session.value || !extractor.value) return

    const failedNumbers = [...session.value.results.values()]
      .filter(result => result.status === 'error')
      .map(result => result.chapterNumber)

    if (failedNumbers.length === 0) return

    const failedChapters = parsedChapters.value
      .filter(chapter => failedNumbers.includes(chapter.number))
      .sort((a, b) => a.number - b.number)

    if (failedChapters.length === 0) return

    isRunning.value = true
    error.value = null

    try {
      progress.value = {
        currentChapter: failedChapters[0].number,
        totalChapters: session.value.totalChapters,
        phase: 'entity_extraction',
        percentage: Math.round((session.value.extractedChapters.length / Math.max(session.value.totalChapters, 1)) * 100),
        tokenUsage: { ...session.value.totalTokenUsage },
        costUSD: session.value.totalCostUSD,
        message: `正在重试失败章节（${failedChapters.length}章）...`,
        currentBatch: 1,
        totalBatches: 1,
        batchChapterRange: {
          start: failedChapters[0].number,
          end: failedChapters[failedChapters.length - 1].number
        }
      }

      const result = await retryChaptersInternal(failedChapters)
      if (!result.success) {
        throw new Error(result.errorMessage || '重试失败章节未完成')
      }
    } catch (err) {
      const message = getErrorMessage(err)
      error.value = message
      logger.error('Retry failed chapters failed:', err)
    } finally {
      isRunning.value = false
    }
  }

  function setKeyChapters(chapters?: number[]): void {
    activeKeyChapters.value = chapters && chapters.length > 0
      ? [...new Set(chapters)].sort((a, b) => a - b)
      : undefined
  }

  async function retryChaptersInternal(chaptersToRetry: ParsedChapter[]): Promise<{ success: boolean; errorMessage?: string }> {
    if (!session.value || !extractor.value || chaptersToRetry.length === 0) {
      return { success: false, errorMessage: 'No retry context' }
    }

    const projectStore = useProjectStore()
    const sandboxStore = useSandboxStore()
    const projectId = projectStore.currentProject?.id || ''
    if (!projectId) {
      return { success: false, errorMessage: 'No project selected' }
    }

    const retryOptions: DeepImportOptions = {
      mode: activeOptions.value?.mode ?? session.value.mode,
      extractPlotEvents: activeOptions.value?.extractPlotEvents ?? false,
      checkpointInterval: 0,
      maxCostUSD: Number.POSITIVE_INFINITY,
      batchSize: activeOptions.value?.batchSize ?? 1,
      chapterRange: {
        start: chaptersToRetry[0].number,
        end: chaptersToRetry[chaptersToRetry.length - 1].number
      }
    }

    const retryExtractor = new NovelExtractor(projectId, retryOptions, (p: ExtractionProgress) => {
      if (!session.value) return
      progress.value = {
        ...p,
        totalChapters: session.value.totalChapters,
        tokenUsage: { ...session.value.totalTokenUsage },
        costUSD: session.value.totalCostUSD,
        message: `重试中：${p.message}`
      }
    })

    const existingByChapter = new Map(session.value.results)
    const previousCosts = new Map<number, { input: number; output: number; costUSD: number }>()

    for (const chapter of chaptersToRetry) {
      const previous = existingByChapter.get(chapter.number)
      if (previous) {
        previousCosts.set(chapter.number, {
          input: previous.tokenUsage.input,
          output: previous.tokenUsage.output,
          costUSD: previous.costUSD
        })
      }
    }

    const chapterNumberSet = new Set(chaptersToRetry.map(ch => ch.number))

    const baseResults = new Map<number, ChapterExtractionResult>(
      [...existingByChapter.entries()].filter(([chapterNumber]) => !chapterNumberSet.has(chapterNumber))
    )

    const resumable: DeepImportSession = {
      ...session.value,
      results: baseResults,
      extractedChapters: session.value.extractedChapters.filter(
        chapterNumber => !chapterNumberSet.has(chapterNumber)
      ),
      isComplete: false,
      updatedAt: Date.now(),
      keyChapters: activeKeyChapters.value ? [...activeKeyChapters.value] : session.value.keyChapters
    }

    const retrySession = await retryExtractor.extractAll(
      chaptersToRetry,
      sandboxStore.entities,
      resumable,
      resumable.keyChapters
    )

    const failedChapters = chaptersToRetry
      .map(ch => retrySession.results.get(ch.number))
      .filter((result): result is ChapterExtractionResult => !!result && result.status === 'error')

    for (const chapter of chaptersToRetry) {
      const previous = previousCosts.get(chapter.number)
      const latest = retrySession.results.get(chapter.number)
      if (!previous || !latest) continue

      retrySession.totalTokenUsage.input -= previous.input
      retrySession.totalTokenUsage.output -= previous.output
      retrySession.totalCostUSD -= previous.costUSD

      retrySession.totalTokenUsage.input += latest.tokenUsage.input
      retrySession.totalTokenUsage.output += latest.tokenUsage.output
      retrySession.totalCostUSD += latest.costUSD
    }

    retrySession.totalTokenUsage.input = Math.max(0, retrySession.totalTokenUsage.input)
    retrySession.totalTokenUsage.output = Math.max(0, retrySession.totalTokenUsage.output)
    retrySession.totalCostUSD = Math.max(0, Math.round(retrySession.totalCostUSD * 10000) / 10000)

    retrySession.updatedAt = Date.now()
    retrySession.extractedChapters = Array.from(new Set(retrySession.extractedChapters)).sort((a, b) => a - b)
    retrySession.isComplete = retrySession.extractedChapters.length >= retrySession.totalChapters

    session.value = retrySession

    if (session.value.isComplete) {
      currentStep.value = 3
    }

    if (failedChapters.length > 0) {
      const failureSummary = failedChapters.map(item => `第${item.chapterNumber}章`).join('、')
      return {
        success: false,
        errorMessage: `以下章节重试仍失败：${failureSummary}`
      }
    }

    return { success: true }
  }

  // --------------------------------------------------------------------------
  // Check for Resumable Session
  // --------------------------------------------------------------------------

  async function checkResumableSession(): Promise<DeepImportSession | null> {
    const projectStore = useProjectStore()
    const projectId = projectStore.currentProject?.id || ''
    if (!projectId) return null
    return NovelExtractor.checkResumableSession(projectId)
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  function clearSession(): void {
    if (session.value) {
      const projectStore = useProjectStore()
      const projectId = projectStore.currentProject?.id || ''
      NovelExtractor.clearCachedSession(projectId, session.value.id)
    }
    session.value = null
    extractor.value = null
    isRunning.value = false
    isPaused.value = false
    progress.value = null
    parsedChapters.value = []
    currentStep.value = 0
    error.value = null
    activeOptions.value = null
    activeKeyChapters.value = undefined
  }

  return {
    // State
    session,
    extractor,
    isRunning,
    isPaused,
    progress,
    parsedChapters,
    currentStep,
    error,

    // Computed
    allExtractedEntities,
    allExtractedStateEvents,
    allExtractedPlotEvents,
    totalEntitiesCount,
    totalStateEventsCount,
    totalCostUSD,

    // Methods
    estimateCost,
    start,
    quickScan,
    pause,
    resume,
    abort,
    commitDrafts,
    commitDirect,
    retryChapter,
    retryFailedChapters,
    setKeyChapters,
    checkResumableSession,
    clearSession
  }
}
