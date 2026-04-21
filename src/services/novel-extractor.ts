/**
 * Novel Extractor Engine — Incremental chapter-by-chapter extraction pipeline
 *
 * Uses LLM Tool Calling to extract Entity + StateEvent from each chapter.
 * Supports full mode (every chapter) and smart sampling mode (LLM quick-scan first).
 * Results are cached per-chapter and can be resumed after interruption.
 */

import { v4 as uuidv4 } from 'uuid'
import { useAIStore } from '@/stores/ai'
import { getLogger } from '@/utils/logger'
import { safeParseAIJson } from '@/utils/safeParseAIJson'
import {
  EXTRACT_NOVEL_ENTITIES_SCHEMA,
  EXTRACT_STATE_EVENTS_SCHEMA,
  EXTRACT_PLOT_EVENTS_SCHEMA,
  PLOT_EXTRACTION_SYSTEM,
  QUICK_SCAN_CHAPTER_SCHEMA
} from './deep-import-schemas'
import type { ParsedChapter } from '@/utils/chapterParser'
import type { Entity, StateEvent } from '@/types/sandbox'
import type {
  DeepImportOptions,
  DeepImportEstimate,
  DeepImportSession,
  ChapterExtractionResult,
  BatchExtractionResult,
  ExtractionProgress,
  EntitySummaryMap,
  EntitySummary,
  SandboxCommitOps,
  ExtractNovelEntitiesOutput,
  ExtractStateEventsOutput,
  ExtractPlotEventsOutput,
  SerializedDeepImportSession
} from '@/types/deep-import'
import { serializeSession as serialize, deserializeSession as deserialize } from '@/types/deep-import'
import { encryptApiKeyV2, decryptApiKeyV2, isEncryptedApiKey } from '@/utils/crypto'

const logger = getLogger('novel:extractor')

// ============================================================================
// Constants
// ============================================================================

/** Maximum consecutive chapter failures before auto-pause */
const MAX_CONSECUTIVE_FAILURES = 5

/** Nearby chapter window for full entity summaries */
const NEARBY_WINDOW = 5

/** Maximum token budget for entity summary section */
const MAX_ENTITY_SUMMARY_TOKENS = 3000

/** Approximate characters per token for Chinese text */
const CHARS_PER_TOKEN = 1.5

/** Default cost per 1K tokens (GPT-4o pricing fallback) */
const DEFAULT_COST_PER_1K_INPUT = 0.0025
const DEFAULT_COST_PER_1K_OUTPUT = 0.01

// ============================================================================
// System Prompts
// ============================================================================

const ENTITY_EXTRACTION_SYSTEM = `你是一位专业的小说分析师。你的任务是从给定的小说章节中提取实体信息。

规则：
1. 提取该章节中出现或被提及的所有重要实体（人物、势力、地点、知识/规则、物品、概念、世界）
2. 对于已知实体，如果本章揭示了新信息，请更新其描述或别名
3. 对于新发现的实体关系，请记录关系类型和态度
4. 每个提取项必须附带原文引用（evidence.quote）和字符偏移（evidence.offset）
5. 不要提取仅在背景中一笔带过的实体——只提取对剧情有实际影响的
6. 人物实体应包含外貌、性格、能力等在该章节中展现的特征
7. importance判断标准：
   - critical: 主角、核心反派、关键剧情推动者
   - major: 重要配角、主要势力、关键地点
   - minor: 次要角色、一般地点
   - background: 仅提及的路人、背景设定
   8. 如果输入包含多个章节，每个提取项必须标注正确的chapterNumber，evidence.offset相对于该章节内容计算`

const STATE_EXTRACTION_SYSTEM = `你是一位精确的小说状态追踪器。你的任务是从给定的章节中提取实体状态的变更事件。

规则：
1. 只提取该章节中明确发生的状态变更，不要推测
2. 每个事件必须包含entityName和eventType
3. 不适用的字段请留空字符串""
4. 每个事件必须附带原文引用（evidence.quote）和字符偏移（evidence.offset）
5. PROPERTY_UPDATE: 用于实体属性的变更（如修为等级、职位变化等）
6. RELATION_ADD/REMOVE/UPDATE: 用于实体间关系的建立、解除或态度变化
7. LOCATION_MOVE: 用于实体位置的转移
8. VITAL_STATUS_CHANGE: 用于生死状态变化（死亡、重伤、康复等）
9. ABILITY_CHANGE: 用于能力获得、失去或状态变化
10. 如果输入包含多个章节，每个事件必须标注正确的chapterNumber，evidence.offset相对于该章节内容计算`

const QUICK_SCAN_SYSTEM = `你是一位小说章节分类器。快速判断该章节是否包含重要的实体引入或状态变更。
关键章节通常包含：新角色登场、重要地点首次出现、势力变化、能力获得/失去、重大事件发生。`

// ============================================================================
// NovelExtractor Class
// ============================================================================

export class NovelExtractor {
  private projectId: string
  private options: DeepImportOptions
  private onProgress?: (progress: ExtractionProgress) => void
  private abortController: AbortController | null = null
  private isAborted = false
  private isPaused = false
  private pausePromise: Promise<void> | null = null
  private resolvePause: (() => void) | null = null

  constructor(
    projectId: string,
    options: DeepImportOptions,
    onProgress?: (progress: ExtractionProgress) => void
  ) {
    this.projectId = projectId
    this.options = options
    this.onProgress = onProgress
  }

  // --------------------------------------------------------------------------
  // Cost Estimation
  // --------------------------------------------------------------------------

  estimateCost(chapters: ParsedChapter[]): DeepImportEstimate {
    const totalChapters = this.getChaptersToProcess(chapters).length
    const batchSize = this.options.batchSize || 1
    const totalBatches = Math.ceil(totalChapters / batchSize)
    const avgWordsPerChapter = chapters.reduce((sum, ch) => sum + ch.wordCount, 0) / Math.max(chapters.length, 1)

    // Per-chapter tokens
    const avgInputTokensPerChapter = Math.ceil(avgWordsPerChapter / CHARS_PER_TOKEN) + 1500
    const avgOutputTokensPerChapter = 800

    // Per-batch: content scales linearly, but system prompt + entity list overhead is once per batch
    const systemPromptOverhead = 1500
    const entityListOverhead = 3000

    const perBatchInputTokens = (avgInputTokensPerChapter * batchSize) + systemPromptOverhead + entityListOverhead
    const perBatchOutputTokens = avgOutputTokensPerChapter * batchSize

    const costPer1KInput = DEFAULT_COST_PER_1K_INPUT
    const costPer1KOutput = DEFAULT_COST_PER_1K_OUTPUT

    const costPerBatchUSD =
      (perBatchInputTokens / 1000) * costPer1KInput * 2 +
      (perBatchOutputTokens / 1000) * costPer1KOutput * 2

    const totalCostUSD = costPerBatchUSD * totalBatches
    const estimatedTimeMinutes = totalBatches * 0.5 * Math.min(batchSize, 3)

    return {
      estimatedChapters: totalChapters,
      avgInputTokensPerChapter: avgInputTokensPerChapter,
      avgOutputTokensPerChapter: avgOutputTokensPerChapter,
      costPerChapterUSD: Math.round((totalCostUSD / totalChapters) * 1000) / 1000,
      totalCostUSD: Math.round(totalCostUSD * 100) / 100,
      estimatedTimeMinutes: Math.ceil(estimatedTimeMinutes)
    }
  }

  // --------------------------------------------------------------------------
  // Main Extraction Pipeline
  // --------------------------------------------------------------------------

  async extractAll(
    chapters: ParsedChapter[],
    existingEntities?: Entity[],
    resumeFrom?: DeepImportSession,
    keyChaptersOverride?: number[]
  ): Promise<DeepImportSession> {
    this.isAborted = false
    this.isPaused = false
    this.pausePromise = null
    this.resolvePause = null
    this.abortController = new AbortController()

    const chaptersToProcess = this.getChaptersToProcess(chapters)

    // Initialize or resume session
    let session: DeepImportSession
    if (resumeFrom) {
      session = resumeFrom
      logger.info(`Resuming deep import session ${session.id}, ${session.extractedChapters.length} chapters already done`)
    } else {
      session = {
        id: uuidv4(),
        projectId: this.projectId,
        totalChapters: chaptersToProcess.length,
        extractedChapters: [],
        results: new Map(),
        nameToIdMap: {},
        totalTokenUsage: { input: 0, output: 0 },
        totalCostUSD: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        mode: this.options.mode,
        isComplete: false
      }
      // Seed nameToIdMap from existing entities
      if (existingEntities) {
        for (const entity of existingEntities) {
          session.nameToIdMap[entity.name] = entity.id
          for (const alias of entity.aliases) {
            session.nameToIdMap[alias] = entity.id
          }
        }
      }
    }

    if (keyChaptersOverride && keyChaptersOverride.length > 0) {
      session.keyChapters = [...new Set(keyChaptersOverride)].sort((a, b) => a - b)
    }

    // Build known entity list (from existing + previously extracted)
    const knownEntities = this.buildKnownEntities(existingEntities || [], session)

    let consecutiveFailures = 0
    const batchSize = this.options.batchSize || 1
    const totalBatches = Math.ceil(chaptersToProcess.length / batchSize)

    // Split chapters into batches
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      if (this.isAborted) break
      await this.waitIfPaused()

      const batchStart = batchIndex * batchSize
      const batchEnd = Math.min(batchStart + batchSize, chaptersToProcess.length)
      const batchChapters = chaptersToProcess.slice(batchStart, batchEnd)

      // Skip batch if all chapters already extracted
      if (batchChapters.every(ch => session.extractedChapters.includes(ch.number))) continue

      // Smart sampling: skip non-key chapters
      if (this.options.mode === 'smart_sampling' && session.keyChapters) {
        const allSkipped = batchChapters.every(ch => !session.keyChapters!.includes(ch.number))
        if (allSkipped) {
          for (const ch of batchChapters) {
            session.results.set(ch.number, {
              chapterNumber: ch.number,
              entities: { newEntities: [], entityUpdates: [], relations: [] },
              stateEvents: { events: [] },
              tokenUsage: { input: 0, output: 0 },
              costUSD: 0,
              extractedAt: Date.now(),
              status: 'skipped'
            })
            session.extractedChapters.push(ch.number)
          }
          continue
        }
      }

      // Build entity summary map using first chapter of batch for nearby window
      const entitySummaryMap = this.buildEntitySummaryMap(
        knownEntities, batchChapters[0].number, session
      )

      // Get prev chapter content for batch context
      const prevChapterContent = this.getPreviousChapterContent(
        chapters, batchChapters[0].number
      )

      // Progress emission with batch info
      this.emitProgress({
        currentChapter: batchChapters[0].number,
        totalChapters: session.totalChapters,
        phase: 'entity_extraction',
        percentage: Math.round((session.extractedChapters.length / session.totalChapters) * 100),
        tokenUsage: { ...session.totalTokenUsage },
        costUSD: session.totalCostUSD,
        message: batchSize > 1
          ? `正在提取第${batchChapters[0].number}-${batchChapters[batchChapters.length-1].number}章 (批次${batchIndex+1}/${totalBatches})...`
          : `正在提取第${batchChapters[0].number}章的实体信息...`,
        currentBatch: batchIndex + 1,
        totalBatches,
        batchChapterRange: { start: batchChapters[0].number, end: batchChapters[batchChapters.length-1].number }
      })

      try {
        const batchResult = await this.extractBatch(batchChapters, entitySummaryMap, prevChapterContent)

        // Process each chapter result from the batch
        for (const result of batchResult.chapterResults) {
          session.results.set(result.chapterNumber, result)
          session.extractedChapters.push(result.chapterNumber)

          if (result.status === 'success') {
            for (const entity of result.entities.newEntities) {
              const id = uuidv4()
              session.nameToIdMap[entity.name] = id
              for (const alias of entity.aliases) {
                session.nameToIdMap[alias] = id
              }
              knownEntities.push({
                id,
                projectId: this.projectId,
                type: entity.type,
                name: entity.name,
                aliases: entity.aliases,
                importance: entity.importance,
                category: entity.category,
                systemPrompt: entity.description,
                isArchived: false,
                createdAt: Date.now()
              })
            }
          }
        }

        session.totalTokenUsage.input += batchResult.tokenUsage.input
        session.totalTokenUsage.output += batchResult.tokenUsage.output
        session.totalCostUSD += batchResult.costUSD
        session.updatedAt = Date.now()

        consecutiveFailures = 0

        await this.cacheSession(session)

        if (session.totalCostUSD >= this.options.maxCostUSD) {
          logger.warn(`Cost limit reached: $${session.totalCostUSD.toFixed(2)} >= $${this.options.maxCostUSD}`)
          break
        }

        // Check checkpoint interval
        if (this.options.checkpointInterval > 0 && session.extractedChapters.length % this.options.checkpointInterval === 0) {
          this.emitProgress({
            currentChapter: batchChapters[0].number,
            totalChapters: session.totalChapters,
            phase: 'review_checkpoint',
            percentage: Math.round((session.extractedChapters.length / session.totalChapters) * 100),
            tokenUsage: { ...session.totalTokenUsage },
            costUSD: session.totalCostUSD,
            message: `已完成${session.extractedChapters.length}章，等待审核...`,
            currentBatch: batchIndex + 1,
            totalBatches,
            batchChapterRange: { start: batchChapters[0].number, end: batchChapters[batchChapters.length-1].number }
          })
          this.pause()
        }
      } catch (err) {
        logger.error(`Batch ${batchIndex + 1} extraction failed:`, err)
        // On batch failure, mark all chapters in batch as error
        for (const ch of batchChapters) {
          session.results.set(ch.number, {
            chapterNumber: ch.number,
            entities: { newEntities: [], entityUpdates: [], relations: [] },
            stateEvents: { events: [] },
            tokenUsage: { input: 0, output: 0 },
            costUSD: 0,
            extractedAt: Date.now(),
            status: 'error',
            errorMessage: err instanceof Error ? err.message : String(err)
          })
        }
        consecutiveFailures++
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          logger.error(`${MAX_CONSECUTIVE_FAILURES} consecutive failures, auto-pausing`)
          break
        }
      }
    }

    session.isComplete = session.extractedChapters.length >= session.totalChapters
    session.updatedAt = Date.now()

    return session
  }

  // --------------------------------------------------------------------------
  // Single Chapter Extraction (thin wrapper around extractBatch)
  // --------------------------------------------------------------------------

  async extractChapter(
    chapter: ParsedChapter,
    knownEntityMap: EntitySummaryMap,
    prevChapterContent?: string
  ): Promise<ChapterExtractionResult> {
    const batchResult = await this.extractBatch([chapter], knownEntityMap, prevChapterContent)
    return batchResult.chapterResults[0]
  }

  // --------------------------------------------------------------------------
  // Batch Extraction
  // --------------------------------------------------------------------------

  async extractBatch(
    chapters: ParsedChapter[],
    knownEntityMap: EntitySummaryMap,
    prevBatchContent?: string
  ): Promise<BatchExtractionResult> {
    const aiStore = useAIStore()
    const batchIndex = 0 // caller assigns batch index externally

    // Build entity list for prompt
    const entityListStr = this.formatEntityListForPrompt(knownEntityMap)

    // Concatenate chapters with delimiters
    const chaptersContent = chapters.map(ch =>
      `\n\n---\n## 第${ch.number}章: ${ch.title}\n\n${ch.content}`
    ).join('')

    // --- Call 1: Entity extraction ---
    const entitySystemMsg = ENTITY_EXTRACTION_SYSTEM +
      (entityListStr ? `\n\n已知实体列表：\n${entityListStr}` : '')

    const entityUserMsg = chaptersContent +
      (prevBatchContent ? `\n\n---\n上一批末尾章节内容（供上下文参考）：\n${prevBatchContent.slice(-500)}` : '')

    const entityMaxTokens = Math.min(2000 * chapters.length, 32000)

    const entityRes = await aiStore.chat(
      [
        { role: 'system', content: entitySystemMsg },
        { role: 'user', content: entityUserMsg }
      ],
      { type: 'state_extraction', complexity: 'medium', priority: 'quality' },
      {
        maxTokens: entityMaxTokens,
        response_format: {
          type: 'json_schema',
          json_schema: EXTRACT_NOVEL_ENTITIES_SCHEMA
        }
      }
    )

    let entitiesOutput: ExtractNovelEntitiesOutput = { newEntities: [], entityUpdates: [], relations: [] }
    const entityParsed = safeParseAIJson<ExtractNovelEntitiesOutput>(entityRes.content)
    if (entityParsed) {
      entitiesOutput = entityParsed
    } else {
      try {
        entitiesOutput = JSON.parse(entityRes.content)
      } catch {
        logger.warn('Failed to parse entity extraction result')
      }
    }

    // --- Call 2: State event extraction ---
    this.emitProgress({
      currentChapter: chapters[0].number,
      totalChapters: 0, // filled by caller
      phase: 'state_extraction',
      percentage: 0,
      tokenUsage: { input: 0, output: 0 },
      costUSD: 0,
      message: chapters.length > 1
        ? `正在提取第${chapters[0].number}-${chapters[chapters.length-1].number}章的状态事件...`
        : `正在提取第${chapters[0].number}章的状态事件...`
    })

    const stateSystemMsg = STATE_EXTRACTION_SYSTEM +
      (entityListStr ? `\n\n已知实体列表：\n${entityListStr}` : '')

    const stateMaxTokens = Math.min(1000 * chapters.length, 16000)

    const stateRes = await aiStore.chat(
      [
        { role: 'system', content: stateSystemMsg },
        { role: 'user', content: chaptersContent }
      ],
      { type: 'state_extraction', complexity: 'low', priority: 'speed' },
      {
        maxTokens: stateMaxTokens,
        response_format: {
          type: 'json_schema',
          json_schema: EXTRACT_STATE_EVENTS_SCHEMA
        }
      }
    )

    let stateOutput: ExtractStateEventsOutput = { events: [] }
    const stateParsed = safeParseAIJson<ExtractStateEventsOutput>(stateRes.content)
    if (stateParsed) {
      stateOutput = stateParsed
    } else {
      try {
        stateOutput = JSON.parse(stateRes.content)
      } catch {
        logger.warn('Failed to parse state extraction result')
      }
    }

    // --- Optional Call 3: Plot event extraction (Phase 3) ---
    let plotOutput: ExtractPlotEventsOutput | undefined
    let plotCostUSD = 0
    if (this.options.extractPlotEvents) {
      this.emitProgress({
        currentChapter: chapters[0].number,
        totalChapters: 0,
        phase: 'plot_extraction',
        percentage: 0,
        tokenUsage: { input: 0, output: 0 },
        costUSD: 0,
        message: chapters.length > 1
          ? `正在提取第${chapters[0].number}-${chapters[chapters.length-1].number}章的情节事件...`
          : `正在提取第${chapters[0].number}章的情节事件...`
      })

      const plotMaxTokens = Math.min(800 * chapters.length, 16000)

      const plotRes = await aiStore.chat(
        [
          { role: 'system', content: PLOT_EXTRACTION_SYSTEM },
          { role: 'user', content: chaptersContent }
        ],
        { type: 'check', complexity: 'low', priority: 'speed' },
        {
          maxTokens: plotMaxTokens,
          response_format: {
            type: 'json_schema',
            json_schema: EXTRACT_PLOT_EVENTS_SCHEMA
          }
        }
      )

      const plotParsed = safeParseAIJson<ExtractPlotEventsOutput>(plotRes.content)
      if (plotParsed) {
        plotOutput = plotParsed
      }
      plotCostUSD = plotRes.cost?.totalUSD || 0
    }

    // Calculate total token usage and cost
    const totalInputTokens = (entityRes.usage?.inputTokens || 0) + (stateRes.usage?.inputTokens || 0)
    const totalOutputTokens = (entityRes.usage?.outputTokens || 0) + (stateRes.usage?.outputTokens || 0)
    const totalCostUSD = (entityRes.cost?.totalUSD || 0) + (stateRes.cost?.totalUSD || 0) + plotCostUSD

    // Split results by chapter
    const chapterResults = this.splitBatchResults(
      chapters,
      entitiesOutput,
      stateOutput,
      plotOutput,
      totalInputTokens,
      totalOutputTokens,
      totalCostUSD
    )

    return {
      batchIndex,
      chapterRange: { start: chapters[0].number, end: chapters[chapters.length - 1].number },
      chapterResults,
      tokenUsage: { input: totalInputTokens, output: totalOutputTokens },
      costUSD: totalCostUSD,
      extractedAt: Date.now(),
      status: 'success'
    }
  }

  // --------------------------------------------------------------------------
  // Batch Result Splitting
  // --------------------------------------------------------------------------

  private splitBatchResults(
    chapters: ParsedChapter[],
    entitiesOutput: ExtractNovelEntitiesOutput,
    stateOutput: ExtractStateEventsOutput,
    plotOutput: ExtractPlotEventsOutput | undefined,
    totalInputTokens: number,
    totalOutputTokens: number,
    totalCostUSD: number
  ): ChapterExtractionResult[] {
    const chapterNumbers = chapters.map(ch => ch.number)
    const chapterSet = new Set(chapterNumbers)

    // Group items by chapterNumber
    const entitiesByChapter = new Map<number, ExtractNovelEntitiesOutput>()
    const stateByChapter = new Map<number, ExtractStateEventsOutput>()
    const plotByChapter = new Map<number, ExtractPlotEventsOutput>()

    // Initialize empty containers for each chapter
    for (const chNum of chapterNumbers) {
      entitiesByChapter.set(chNum, { newEntities: [], entityUpdates: [], relations: [] })
      stateByChapter.set(chNum, { events: [] })
      plotByChapter.set(chNum, { plotEvents: [] })
    }

    // Distribute entity items
    for (const entity of entitiesOutput.newEntities) {
      const chNum = chapterSet.has(entity.chapterNumber) ? entity.chapterNumber : chapterNumbers[0]
      const bucket = entitiesByChapter.get(chNum)!
      bucket.newEntities.push(entity)
    }
    for (const update of entitiesOutput.entityUpdates) {
      const chNum = chapterSet.has(update.chapterNumber) ? update.chapterNumber : chapterNumbers[0]
      const bucket = entitiesByChapter.get(chNum)!
      bucket.entityUpdates.push(update)
    }
    for (const rel of entitiesOutput.relations) {
      const chNum = chapterSet.has(rel.chapterNumber) ? rel.chapterNumber : chapterNumbers[0]
      const bucket = entitiesByChapter.get(chNum)!
      bucket.relations.push(rel)
    }

    // Distribute state events
    for (const evt of stateOutput.events) {
      const chNum = chapterSet.has(evt.chapterNumber) ? evt.chapterNumber : chapterNumbers[0]
      const bucket = stateByChapter.get(chNum)!
      bucket.events.push(evt)
    }

    // Distribute plot events
    if (plotOutput) {
      for (const evt of plotOutput.plotEvents) {
        const chNum = chapterSet.has(evt.chapterNumber) ? evt.chapterNumber : chapterNumbers[0]
        const bucket = plotByChapter.get(chNum)!
        bucket.plotEvents.push(evt)
      }
    }

    // Count total items for proportional cost distribution
    const totalItems =
      entitiesOutput.newEntities.length +
      entitiesOutput.entityUpdates.length +
      entitiesOutput.relations.length +
      stateOutput.events.length +
      (plotOutput?.plotEvents.length || 0)

    // Build per-chapter results
    return chapters.map(ch => {
      const chNum = ch.number
      const entities = entitiesByChapter.get(chNum)!
      const stateEvents = stateByChapter.get(chNum)!

      const chapterItemCount =
        entities.newEntities.length +
        entities.entityUpdates.length +
        entities.relations.length +
        stateEvents.events.length

      const plotEvents = plotByChapter.get(chNum)!
      const totalChapterItems = chapterItemCount + (plotEvents?.plotEvents.length || 0)

      // Proportional token/cost distribution
      const proportion = totalItems > 0 ? totalChapterItems / totalItems : 1 / chapters.length
      const chapterInputTokens = Math.round(totalInputTokens * proportion)
      const chapterOutputTokens = Math.round(totalOutputTokens * proportion)
      const chapterCostUSD = Math.round(totalCostUSD * proportion * 10000) / 10000

      const hasPlotData = plotOutput && plotEvents.plotEvents.length > 0

      return {
        chapterNumber: chNum,
        entities,
        stateEvents,
        plotEvents: hasPlotData ? plotEvents : undefined,
        tokenUsage: { input: chapterInputTokens, output: chapterOutputTokens },
        costUSD: chapterCostUSD,
        extractedAt: Date.now(),
        status: 'success' as const
      }
    })
  }

  // --------------------------------------------------------------------------
  // Quick Scan (Smart Sampling Mode)
  // --------------------------------------------------------------------------

  async quickScanChapter(
    chapter: ParsedChapter
  ): Promise<{ isKeyChapter: boolean; reason: string; mentionedEntities: string[] }> {
    const aiStore = useAIStore()

    const res = await aiStore.chat(
      [
        { role: 'system', content: QUICK_SCAN_SYSTEM },
        { role: 'user', content: `章节标题：${chapter.title}\n章节编号：${chapter.number}\n\n${chapter.content}` }
      ],
      { type: 'check', complexity: 'low', priority: 'speed' },
      {
        maxTokens: 200,
        response_format: {
          type: 'json_schema',
          json_schema: QUICK_SCAN_CHAPTER_SCHEMA
        }
      }
    )

    const parsed = safeParseAIJson<{ isKeyChapter: boolean; reason: string; mentionedEntities: string[] }>(res.content)
    if (parsed) return parsed

    try {
      return JSON.parse(res.content)
    } catch {
      return { isKeyChapter: false, reason: 'Parse failed', mentionedEntities: [] }
    }
  }

  // --------------------------------------------------------------------------
  // Resolve to Sandbox Operations
  // --------------------------------------------------------------------------

  resolveToSandboxOps(session: DeepImportSession): SandboxCommitOps {
    const newEntities: Entity[] = []
    const updatedEntities: Array<{ id: string; updates: Partial<Entity> }> = []
    const stateEvents: StateEvent[] = []

    // Pass 1: Create entities and build final nameToIdMap
    const finalNameToIdMap: Record<string, string> = { ...session.nameToIdMap }

    for (const [, result] of session.results) {
      if (result.status !== 'success') continue

      for (const candidate of result.entities.newEntities) {
        // Skip if entity already mapped (avoid duplicates)
        if (finalNameToIdMap[candidate.name]) continue

        const entityId = uuidv4()
        finalNameToIdMap[candidate.name] = entityId
        for (const alias of candidate.aliases) {
          if (!finalNameToIdMap[alias]) {
            finalNameToIdMap[alias] = entityId
          }
        }

        newEntities.push({
          id: entityId,
          projectId: this.projectId,
          type: candidate.type,
          name: candidate.name,
          aliases: candidate.aliases,
          importance: candidate.importance,
          category: candidate.category,
          systemPrompt: candidate.description,
          isArchived: false,
          createdAt: Date.now()
        })
      }

      // Apply entity updates
      for (const update of result.entities.entityUpdates) {
        const entityId = finalNameToIdMap[update.entityName]
        if (!entityId) {
          logger.warn(`Entity update for unknown entity: ${update.entityName}`)
          continue
        }

        const updates: Partial<Entity> = {}
        if (update.updatedDescription) {
          updates.systemPrompt = update.updatedDescription
        }
        if (update.newAliases.length > 0) {
          // We'll need to merge aliases during actual update
          updates.aliases = update.newAliases
        }
        if (update.importanceChange) {
          updates.importance = update.importanceChange
        }

        if (Object.keys(updates).length > 0) {
          updatedEntities.push({ id: entityId, updates })
        }
      }
    }

    // Pass 2: Create state events, resolving names to IDs
    for (const [chapterNum, result] of session.results) {
      if (result.status !== 'success') continue

      // Entity relations as RELATION_ADD events
      for (const rel of result.entities.relations) {
        const sourceId = finalNameToIdMap[rel.sourceName]
        const targetId = finalNameToIdMap[rel.targetName]
        if (!sourceId || !targetId) {
          logger.warn(`Relation with unknown entity: ${rel.sourceName} → ${rel.targetName}`)
          continue
        }

        stateEvents.push({
          id: uuidv4(),
          projectId: this.projectId,
          chapterNumber: chapterNum,
          entityId: sourceId,
          eventType: 'RELATION_ADD',
          payload: {
            targetId,
            relationType: rel.relationType,
            attitude: rel.attitude
          },
          source: 'AI_EXTRACTED'
        })
      }

      // State events
      for (const evt of result.stateEvents.events) {
        const entityId = finalNameToIdMap[evt.entityName]
        if (!entityId) {
          logger.warn(`State event for unknown entity: ${evt.entityName}`)
          continue
        }

        const payload: StateEvent['payload'] = {}

        if (evt.key && evt.value) {
          payload.key = evt.key
          payload.value = evt.value
        }
        if (evt.targetName) {
          const targetId = finalNameToIdMap[evt.targetName]
          if (targetId) payload.targetId = targetId
        }
        if (evt.relationType) payload.relationType = evt.relationType
        if (evt.attitude) payload.attitude = evt.attitude
        if (evt.status) payload.status = evt.status
        if (evt.abilityName) payload.abilityName = evt.abilityName
        if (evt.abilityStatus) payload.abilityStatus = evt.abilityStatus
        if (evt.locationDescription) {
          payload.key = 'location'
          payload.value = evt.locationDescription
        }

        stateEvents.push({
          id: uuidv4(),
          projectId: this.projectId,
          chapterNumber: chapterNum,
          entityId,
          eventType: evt.eventType,
          payload,
          source: 'AI_EXTRACTED'
        })
      }
    }

    return { newEntities, updatedEntities, stateEvents }
  }

  // --------------------------------------------------------------------------
  // Abort
  // --------------------------------------------------------------------------

  abort(): void {
    this.isAborted = true
    this.isPaused = false
    if (this.resolvePause) {
      this.resolvePause()
      this.resolvePause = null
      this.pausePromise = null
    }
    if (this.abortController) {
      this.abortController.abort()
    }
    logger.info('Novel extraction aborted by user')
  }

  pause(): void {
    if (this.isAborted || this.isPaused) return
    this.isPaused = true
    if (!this.pausePromise) {
      this.pausePromise = new Promise(resolve => {
        this.resolvePause = resolve
      })
    }
    logger.info('Novel extraction paused')
  }

  resume(): void {
    if (!this.isPaused) return
    this.isPaused = false
    if (this.resolvePause) {
      this.resolvePause()
    }
    this.resolvePause = null
    this.pausePromise = null
    logger.info('Novel extraction resumed')
  }

  private async waitIfPaused(): Promise<void> {
    if (!this.isPaused) return
    if (!this.pausePromise) {
      this.pausePromise = new Promise(resolve => {
        this.resolvePause = resolve
      })
    }
    await this.pausePromise
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private getChaptersToProcess(chapters: ParsedChapter[]): ParsedChapter[] {
    let filtered = chapters

    if (this.options.chapterRange) {
      filtered = chapters.filter(
        ch => ch.number >= this.options.chapterRange!.start && ch.number <= this.options.chapterRange!.end
      )
    }

    return filtered
  }

  private buildKnownEntities(existingEntities: Entity[], session: DeepImportSession): Entity[] {
    const knownEntities = [...existingEntities]
    const knownEntityIds = new Set(knownEntities.map(e => e.id))

    // Add entities from previous extraction results
    for (const [, result] of session.results) {
      if (result.status !== 'success') continue
      for (const candidate of result.entities.newEntities) {
        const existingId = session.nameToIdMap[candidate.name]
        if (existingId && !knownEntityIds.has(existingId)) {
          knownEntities.push({
            id: existingId,
            projectId: this.projectId,
            type: candidate.type,
            name: candidate.name,
            aliases: candidate.aliases,
            importance: candidate.importance,
            category: candidate.category,
            systemPrompt: candidate.description,
            isArchived: false,
            createdAt: Date.now()
          })
          knownEntityIds.add(existingId)
        }
      }
    }

    return knownEntities
  }

  private buildEntitySummaryMap(
    knownEntities: Entity[],
    currentChapterNumber: number,
    session: DeepImportSession
  ): EntitySummaryMap {
    const summaryMap = new Map<string, EntitySummary>()

    // Determine which entities were mentioned in nearby chapters
    const nearbyEntityNames = new Set<string>()
    for (const [chNum, result] of session.results) {
      if (Math.abs(chNum - currentChapterNumber) <= NEARBY_WINDOW && result.status === 'success') {
        for (const entity of result.entities.newEntities) {
          nearbyEntityNames.add(entity.name)
        }
        for (const update of result.entities.entityUpdates) {
          nearbyEntityNames.add(update.entityName)
        }
        for (const evt of result.stateEvents.events) {
          nearbyEntityNames.add(evt.entityName)
        }
      }
    }

    // Build summaries with compression
    let totalTokens = 0
    const sortedEntities = [...knownEntities].sort((a, b) => {
      // Sort by importance (critical first), then by nearby status
      const importanceOrder = { critical: 0, major: 1, minor: 2, background: 3 }
      const impDiff = importanceOrder[a.importance] - importanceOrder[b.importance]
      if (impDiff !== 0) return impDiff
      return (nearbyEntityNames.has(b.name) ? 0 : 1) - (nearbyEntityNames.has(a.name) ? 0 : 1)
    })

    for (const entity of sortedEntities) {
      const isNearby = nearbyEntityNames.has(entity.name)
      let summary: string

      if (isNearby) {
        // Full description for nearby entities
        summary = entity.systemPrompt
      } else if (entity.importance === 'background') {
        // Minimal for background entities not nearby
        summary = `${entity.name} (${entity.type})`
      } else {
        // One-line summary for active but distant entities
        const truncated = entity.systemPrompt.length > 60
          ? entity.systemPrompt.slice(0, 60) + '...'
          : entity.systemPrompt
        summary = `${entity.name} (${entity.type}, ${entity.importance}): ${truncated}`
      }

      const estimatedTokens = Math.ceil(summary.length / CHARS_PER_TOKEN)
      if (totalTokens + estimatedTokens > MAX_ENTITY_SUMMARY_TOKENS) {
        // Truncate: just add name + type
        summary = `${entity.name} (${entity.type})`
        const minimalTokens = Math.ceil(summary.length / CHARS_PER_TOKEN)
        if (totalTokens + minimalTokens > MAX_ENTITY_SUMMARY_TOKENS) break
        totalTokens += minimalTokens
      } else {
        totalTokens += estimatedTokens
      }

      summaryMap.set(entity.name, {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        importance: entity.importance,
        summary,
        isNearby
      })
    }

    return summaryMap
  }

  private formatEntityListForPrompt(summaryMap: EntitySummaryMap): string {
    if (summaryMap.size === 0) return ''

    const lines: string[] = []
    for (const [name, summary] of summaryMap) {
      if (summary.isNearby) {
        lines.push(`【${name}】(${summary.type}, ${summary.importance}): ${summary.summary}`)
      } else {
        lines.push(`- ${summary.summary}`)
      }
    }

    return lines.join('\n')
  }

  private getPreviousChapterContent(chapters: ParsedChapter[], currentChapterNumber: number): string | undefined {
    const prevChapter = chapters.find(ch => ch.number === currentChapterNumber - 1)
    return prevChapter?.content
  }

  private emitProgress(progress: ExtractionProgress): void {
    if (this.onProgress) {
      this.onProgress(progress)
    }
  }

  private async cacheSession(session: DeepImportSession): Promise<void> {
    try {
      const serialized = serialize(session)
      const key = `${this.projectId}_deep_import_${session.id}`
      const payload = JSON.stringify(serialized)
      const encryptedPayload = await encryptApiKeyV2(payload)
      localStorage.setItem(key, encryptedPayload)
      NovelExtractor.addSessionKeyToIndex(this.projectId, key)
    } catch (err) {
      logger.warn('Failed to cache session:', err)
    }
  }

  private static getSessionPrefix(projectId: string): string {
    return `${projectId}_deep_import_`
  }

  private static getIndexKey(projectId: string): string {
    return `${projectId}_deep_import_index`
  }

  private static readIndex(projectId: string): { exists: boolean; keys: string[] } {
    const indexKey = this.getIndexKey(projectId)
    const raw = localStorage.getItem(indexKey)
    if (raw == null) return { exists: false, keys: [] }

    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        localStorage.removeItem(indexKey)
        return { exists: false, keys: [] }
      }
      const keys = parsed.filter((item): item is string => typeof item === 'string')
      return { exists: true, keys }
    } catch {
      localStorage.removeItem(indexKey)
      return { exists: false, keys: [] }
    }
  }

  private static writeIndex(projectId: string, keys: string[]): void {
    const indexKey = this.getIndexKey(projectId)
    localStorage.setItem(indexKey, JSON.stringify(keys))
  }

  private static addSessionKeyToIndex(projectId: string, sessionKey: string): void {
    const { keys } = this.readIndex(projectId)
    if (!keys.includes(sessionKey)) {
      this.writeIndex(projectId, [...keys, sessionKey])
    }
  }

  private static removeSessionKeyFromIndex(projectId: string, sessionKey: string): void {
    const { keys } = this.readIndex(projectId)
    const next = keys.filter(key => key !== sessionKey)
    this.writeIndex(projectId, next)
  }

  private static async parseCachedSession(key: string): Promise<DeepImportSession | null> {
    const raw = localStorage.getItem(key)
    if (!raw) return null

    try {
      const payload = isEncryptedApiKey(raw)
        ? await decryptApiKeyV2(raw)
        : raw
      const serialized: SerializedDeepImportSession = JSON.parse(payload)
      return deserialize(serialized)
    } catch {
      localStorage.removeItem(key)
      return null
    }
  }

  private static getProjectSessionKeysByScan(projectId: string): string[] {
    const prefix = this.getSessionPrefix(projectId)
    const indexKey = this.getIndexKey(projectId)
    const keys: string[] = []

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      if (!key.startsWith(prefix)) continue
      if (key === indexKey) continue
      keys.push(key)
    }

    return keys
  }

  // --------------------------------------------------------------------------
  // Static: Check for resumable sessions
  // --------------------------------------------------------------------------

  static async checkResumableSession(projectId: string): Promise<DeepImportSession | null> {
    try {
      const { exists, keys: indexedKeys } = this.readIndex(projectId)

      if (exists) {
        const validKeys: string[] = []
        let firstIncomplete: DeepImportSession | null = null

        for (const key of indexedKeys) {
          const session = await this.parseCachedSession(key)
          if (!session) continue
          validKeys.push(key)
          if (!firstIncomplete && !session.isComplete) {
            firstIncomplete = session
          }
        }

        this.writeIndex(projectId, validKeys)
        return firstIncomplete
      }

      // Legacy fallback: scan localStorage by prefix, then backfill index
      const scannedKeys = this.getProjectSessionKeysByScan(projectId)
      const validKeys: string[] = []
      let firstIncomplete: DeepImportSession | null = null

      for (const key of scannedKeys) {
        const session = await this.parseCachedSession(key)
        if (!session) continue
        validKeys.push(key)
        if (!firstIncomplete && !session.isComplete) {
          firstIncomplete = session
        }
      }

      this.writeIndex(projectId, validKeys)
      return firstIncomplete
    } catch (err) {
      logger.warn('Failed to check for resumable sessions:', err)
    }
    return null
  }

  static clearCachedSession(projectId: string, sessionId: string): void {
    const key = `${projectId}_deep_import_${sessionId}`
    localStorage.removeItem(key)
    this.removeSessionKeyFromIndex(projectId, key)
  }
}
