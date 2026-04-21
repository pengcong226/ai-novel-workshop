/**
 * Rewrite/Continuation Workflow Orchestrator
 *
 * Coordinates the two authoring workflows:
 *   1. Continuation — generate new chapters after the last imported chapter
 *   2. Rewrite — replace a range of chapters with new direction
 */

import { v4 as uuidv4 } from 'uuid'
import { useSandboxStore } from '@/stores/sandbox'
import { useProjectStore } from '@/stores/project'
import { GenerationScheduler, type BatchGenerationOptions } from '@/services/generation-scheduler'
import { captureSnapshot, computeRewriteDiffReport } from '@/utils/stateDiff'
import type { StateEvent } from '@/types/sandbox'
import type {
  ContinuationOptions,
  RewriteOptions,
  StateDiffReport,
  RewriteBackup,
  PlotEventRecord
} from '@/types/rewrite-continuation'
import type { ExtractedPlotEvent } from '@/types/deep-import'
import { getLogger } from '@/utils/logger'
import { encryptApiKeyV2, decryptApiKeyV2, isEncryptedApiKey } from '@/utils/crypto'

const logger = getLogger('rewrite-continuation')

const BACKUP_KEY_PREFIX = 'rewrite_backup_'

export class RewriteContinuationService {
  private scheduler = new GenerationScheduler()
  private backup: RewriteBackup | null = null

  // --------------------------------------------------------------------------
  // Continuation
  // --------------------------------------------------------------------------

  async continueNovel(options: ContinuationOptions): Promise<void> {
    const sandboxStore = useSandboxStore()

    // Set currentChapter so the context builder produces the correct snapshot
    sandboxStore.currentChapter = options.startChapter - 1

    const batchOptions: BatchGenerationOptions = {
      startChapter: options.startChapter,
      count: options.count,
      autoSave: options.autoSave,
      autoUpdateSettings: options.autoExtract,
      extractPlotEvents: options.extractPlotEvents,
      enableAntiRetcon: options.enableAntiRetcon,
      enableCheckpoint: true,
      checkpointInterval: 10
    }

    await this.scheduler.executeBatchGeneration(batchOptions)
  }

  // --------------------------------------------------------------------------
  // Rewrite
  // --------------------------------------------------------------------------

  async startRewrite(options: RewriteOptions): Promise<StateDiffReport> {
    const sandboxStore = useSandboxStore()
    const projectStore = useProjectStore()
    const project = projectStore.currentProject
    if (!project) throw new Error('No project selected')

    const { range } = options

    // 1. Capture baseline snapshot at range.start - 1
    const baselineSnapshot = captureSnapshot(
      sandboxStore.entities,
      sandboxStore.stateEvents,
      range.start - 1
    )

    // 2. Capture pre-rewrite snapshot at range.end
    const preRewriteSnapshot = captureSnapshot(
      sandboxStore.entities,
      sandboxStore.stateEvents,
      range.end
    )

    // 3. Backup affected chapters and state events
    this.backup = this.createBackup(sandboxStore, project, range)
    await this.persistBackup(this.backup)

    // 4. Delete state events in the rewrite range
    await sandboxStore.deleteStateEventsByChapterRange(range.start, range.end)

    // 5. Set currentChapter to range.start - 1 for context
    sandboxStore.currentChapter = range.start - 1

    // 6. Generate replacement chapters
    const batchOptions: BatchGenerationOptions = {
      startChapter: range.start,
      count: range.end - range.start + 1,
      autoSave: options.autoSave,
      autoUpdateSettings: true,
      rewriteDirectionPrompt: options.newDirectionPrompt,
      extractPlotEvents: options.extractPlotEvents,
      enableAntiRetcon: options.enableAntiRetcon,
      enableCheckpoint: false
    }

    await this.scheduler.executeBatchGeneration(batchOptions)

    // 7. Capture post-rewrite snapshot
    const plotEvents = (project.plotEvents || []) as PlotEventRecord[]
    const report = computeRewriteDiffReport(
      sandboxStore.entities,
      sandboxStore.stateEvents,
      range,
      plotEvents,
      undefined,
      {
        baselineSnapshot,
        preRewriteSnapshot
      }
    )

    return report
  }

  async acceptRewrite(): Promise<void> {
    const projectStore = useProjectStore()
    // Clear backup — changes are committed
    if (this.backup) {
      this.clearPersistedBackup(this.backup.projectId)
      this.backup = null
    }
    await projectStore.saveCurrentProject()
    logger.info('Rewrite accepted and committed')
  }

  async rejectRewrite(): Promise<void> {
    const sandboxStore = useSandboxStore()
    const projectStore = useProjectStore()
    const project = projectStore.currentProject

    if (!this.backup || !project) {
      logger.warn('No backup to restore from')
      return
    }

    // Restore state events: first delete any new events in the rewrite range,
    // then restore the backup events
    try {
      await sandboxStore.deleteStateEventsByChapterRange(this.backup.range.start, this.backup.range.end)
      await sandboxStore.batchAddStateEvents(this.backup.stateEvents as StateEvent[])
    } catch (e) {
      logger.error('Failed to restore state events:', e)
    }

    // Restore chapters
    for (const ch of this.backup.chapters) {
      const existing = project.chapters.find(c => c.number === ch.number)
      if (existing) {
        existing.content = ch.content
        existing.wordCount = ch.wordCount
        existing.title = ch.title
      }
    }

    // Restore plot events
    project.plotEvents = this.backup.plotEvents.map(event => ({ ...event }))

    // Clear backup
    this.clearPersistedBackup(this.backup.projectId)
    this.backup = null

    await projectStore.saveCurrentProject()
    logger.info('Rewrite rejected, state restored from backup')
  }

  cancel(): void {
    this.scheduler.cancelBatchGeneration()
  }

  // --------------------------------------------------------------------------
  // Plot Event Conversion
  // --------------------------------------------------------------------------

  static convertPlotEvents(
    extracted: ExtractedPlotEvent[],
    projectId: string,
    chapterNumber: number,
    nameToIdMap: Record<string, string>
  ): PlotEventRecord[] {
    return extracted.map(event => ({
      id: uuidv4(),
      projectId,
      chapterNumber,
      description: event.description,
      type: event.type,
      importance: event.importance,
      involvedEntityIds: event.involvedEntities
        .map(name => nameToIdMap[name])
        .filter((id): id is string => !!id),
      estimatedResolutionChapter: event.estimatedResolutionChapter,
      resolvedForeshadowingFromChapter: event.resolvedForeshadowingFromChapter,
      evidence: event.evidence?.quote,
      createdAt: Date.now()
    }))
  }

  // --------------------------------------------------------------------------
  // Backup Helpers
  // --------------------------------------------------------------------------

  private createBackup(
    sandboxStore: ReturnType<typeof useSandboxStore>,
    project: NonNullable<ReturnType<typeof useProjectStore>['currentProject']>,
    range: RewriteOptions['range']
  ): RewriteBackup {
    const chapters = project.chapters
      .filter(c => c.number >= range.start && c.number <= range.end)
      .map(c => ({
        number: c.number,
        title: c.title,
        content: c.content || '',
        wordCount: c.wordCount || 0
      }))

    const stateEvents = sandboxStore.stateEvents
      .filter(e => e.chapterNumber >= range.start && e.chapterNumber <= range.end)
      .map(e => ({
        id: e.id,
        projectId: e.projectId,
        chapterNumber: e.chapterNumber,
        entityId: e.entityId,
        eventType: e.eventType,
        payload: e.payload as Record<string, unknown>,
        source: e.source
      }))

    const plotEvents = ((project.plotEvents || []) as PlotEventRecord[]).map(event => ({ ...event }))

    return {
      projectId: project.id,
      range,
      chapters,
      stateEvents,
      plotEvents,
      createdAt: Date.now()
    }
  }

  private async persistBackup(backup: RewriteBackup): Promise<void> {
    try {
      const key = `${BACKUP_KEY_PREFIX}${backup.projectId}`
      const serialized = JSON.stringify(backup)
      const encrypted = await encryptApiKeyV2(serialized)
      localStorage.setItem(key, encrypted)
    } catch (e) {
      logger.warn('Failed to persist rewrite backup:', e)
    }
  }

  private clearPersistedBackup(projectId: string): void {
    try {
      localStorage.removeItem(`${BACKUP_KEY_PREFIX}${projectId}`)
    } catch (e) {
      logger.warn('Failed to clear persisted backup:', e)
    }
  }

  /**
   * Check for any pending rewrite backup (for crash recovery)
   */
  static async checkPendingBackup(projectId: string): Promise<RewriteBackup | null> {
    try {
      const key = `${BACKUP_KEY_PREFIX}${projectId}`
      const data = localStorage.getItem(key)
      if (!data) return null

      const payload = isEncryptedApiKey(data)
        ? await decryptApiKeyV2(data)
        : data

      return JSON.parse(payload) as RewriteBackup
    } catch {
      return null
    }
  }
}

export const rewriteContinuationService = new RewriteContinuationService()
