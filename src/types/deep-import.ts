/**
 * Deep Novel Import Pipeline — Type Definitions
 *
 * LLM-driven incremental extraction of Entity + StateEvent from novel text.
 * Three Tool Calling schemas:
 *   1. extract_novel_entities  — identify entities, updates, and relations
 *   2. extract_state_events    — extract state changes per chapter
 *   3. extract_plot_events     — extract plot-level events (Phase 3)
 */

import type { Entity, StateEvent, EntityType, EntityImportance, StateEventType } from './sandbox'

// ============================================================================
// Evidence — every extracted fact must include a quote from the original text
// ============================================================================

export interface Evidence {
  /** Original text quote supporting this extraction (~80 chars max) */
  quote: string
  /** Character offset of the quote within the chapter content */
  offset: number
}

// ============================================================================
// Schema 1: extract_novel_entities
// ============================================================================

export interface ExtractedEntityCandidate {
  /** Chapter number where this entity was discovered */
  chapterNumber: number
  /** Entity display name as it appears in the text */
  name: string
  /** Alternative names, nicknames, titles */
  aliases: string[]
  /** Maps to Entity.type */
  type: EntityType
  /** Maps to Entity.importance */
  importance: EntityImportance
  /** Free-form category label (e.g., 'protagonist', 'sect', 'weapon') */
  category: string
  /** Detailed description or background — maps to Entity.systemPrompt */
  description: string
  /** Evidence that this entity exists in this chapter */
  evidence: Evidence
}

export interface ExtractedEntityUpdate {
  /** Chapter number where this update was discovered */
  chapterNumber: number
  /** Name of a KNOWN entity that appears with new information */
  entityName: string
  /** Updated description or additional background revealed in this chapter */
  updatedDescription: string
  /** New aliases discovered in this chapter */
  newAliases: string[]
  /** Importance change — only if chapter reveals reclassification (undefined = no change) */
  importanceChange?: EntityImportance
  /** Evidence for the update */
  evidence: Evidence
}

export interface ExtractedRelation {
  /** Chapter number where this relation was discovered */
  chapterNumber: number
  /** Source entity name (already known or newly extracted) */
  sourceName: string
  /** Target entity name */
  targetName: string
  /** Relation type (e.g., 'master-disciple', 'ally', 'rival', 'parent-child') */
  relationType: string
  /** Attitude descriptor (e.g., 'loyal', 'hostile', 'neutral', 'ambivalent') */
  attitude: string
  /** Evidence for this relation */
  evidence: Evidence
}

export interface ExtractNovelEntitiesOutput {
  /** New entities discovered in this chapter */
  newEntities: ExtractedEntityCandidate[]
  /** Updates to previously known entities */
  entityUpdates: ExtractedEntityUpdate[]
  /** Relations discovered in this chapter */
  relations: ExtractedRelation[]
}

// ============================================================================
// Schema 2: extract_state_events
// ============================================================================

export interface ExtractedStateEvent {
  /** Chapter number where this state event occurred */
  chapterNumber: number
  /** Name of the entity this event applies to */
  entityName: string
  /** The state event type */
  eventType: StateEventType
  /** For PROPERTY_UPDATE: the property key */
  key?: string
  /** For PROPERTY_UPDATE: the new value */
  value?: string
  /** For RELATION_ADD/REMOVE/UPDATE: target entity name */
  targetName?: string
  /** For RELATION_ADD/REMOVE: relation type */
  relationType?: string
  /** For RELATION_UPDATE: new attitude */
  attitude?: string
  /** For VITAL_STATUS_CHANGE: the new status */
  status?: string
  /** For ABILITY_CHANGE: ability name */
  abilityName?: string
  /** For ABILITY_CHANGE: ability status ('active', 'sealed', 'lost') */
  abilityStatus?: string
  /** For LOCATION_MOVE: new location description (text, not coordinates) */
  locationDescription?: string
  /** Evidence for this state change */
  evidence: Evidence
}

export interface ExtractStateEventsOutput {
  /** State events extracted from this chapter */
  events: ExtractedStateEvent[]
}

// ============================================================================
// Schema 3: extract_plot_events (defined now, invoked in Phase 3)
// ============================================================================

export type PlotEventType =
  | 'foreshadowing_planted'
  | 'foreshadowing_resolved'
  | 'turning_point'
  | 'climax'
  | 'revelation'
  | 'betrayal'
  | 'alliance_formed'
  | 'alliance_broken'
  | 'power_shift'
  | 'sacrifice'

export interface ExtractedPlotEvent {
  /** Chapter number where this plot event occurred */
  chapterNumber: number
  /** What happened */
  description: string
  /** Classification of the plot event */
  type: PlotEventType
  /** Importance on a 1-10 scale where 10 is world-changing */
  importance: number
  /** Entity names involved in this event */
  involvedEntities: string[]
  /** For foreshadowing_planted: best guess for which chapter resolves it */
  estimatedResolutionChapter?: number
  /** For foreshadowing_resolved: which chapter planted it */
  resolvedForeshadowingFromChapter?: number
  /** Evidence quote */
  evidence: Evidence
}

export interface ExtractPlotEventsOutput {
  /** Plot-level events extracted from this chapter */
  plotEvents: ExtractedPlotEvent[]
}

// ============================================================================
// Pipeline Internal Types
// ============================================================================

/** Per-chapter extraction result cache */
export interface ChapterExtractionResult {
  /** Chapter number */
  chapterNumber: number
  /** Entity extraction results */
  entities: ExtractNovelEntitiesOutput
  /** State event extraction results */
  stateEvents: ExtractStateEventsOutput
  /** Plot event results (only populated when extractPlotEvents is enabled) */
  plotEvents?: ExtractPlotEventsOutput
  /** Token usage for this chapter's extraction */
  tokenUsage: { input: number; output: number }
  /** Cost in USD */
  costUSD: number
  /** Timestamp of extraction */
  extractedAt: number
  /** Was this chapter extracted successfully? */
  status: 'success' | 'skipped' | 'error'
  /** Error message if status is 'error' */
  errorMessage?: string
}

/** Result of extracting a batch of chapters in a single LLM call set */
export interface BatchExtractionResult {
  /** 0-indexed batch number */
  batchIndex: number
  /** Chapter range covered by this batch */
  chapterRange: { start: number; end: number }
  /** Per-chapter results split from the batch LLM output */
  chapterResults: ChapterExtractionResult[]
  /** Aggregated token usage for the entire batch */
  tokenUsage: { input: number; output: number }
  /** Cost in USD */
  costUSD: number
  /** Timestamp of extraction */
  extractedAt: number
  /** Was this batch extracted successfully? */
  status: 'success' | 'error'
  /** Error message if status is 'error' */
  errorMessage?: string
}

/** Full import session state — persisted to allow resume */
export interface DeepImportSession {
  /** Unique session ID */
  id: string
  /** Project ID this import targets */
  projectId: string
  /** Total chapters in the novel */
  totalChapters: number
  /** Chapter numbers that have been extracted so far */
  extractedChapters: number[]
  /** Per-chapter results (keyed by chapterNumber) */
  results: Map<number, ChapterExtractionResult>
  /** Entity name → entityId mapping accumulated across all chapters */
  nameToIdMap: Record<string, string>
  /** Cumulative token usage */
  totalTokenUsage: { input: number; output: number }
  /** Cumulative cost in USD */
  totalCostUSD: number
  /** Session creation timestamp */
  createdAt: number
  /** Last update timestamp */
  updatedAt: number
  /** Extraction mode */
  mode: 'full' | 'smart_sampling'
  /** For smart sampling: chapters the user marked for deep parse */
  keyChapters?: number[]
  /** Is the session complete? */
  isComplete: boolean
}

/** Extraction options configured by the user */
export interface DeepImportOptions {
  /** Full: extract every chapter. Smart Sampling: LLM quick-scan, user picks key chapters */
  mode: 'full' | 'smart_sampling'
  /** Whether to also extract plot events (Phase 3 feature, currently disabled) */
  extractPlotEvents: boolean
  /** How many chapters between user-review checkpoints (0 = no checkpoints) */
  checkpointInterval: number
  /** Maximum cost in USD before auto-pause */
  maxCostUSD: number
  /** Number of chapters per batch LLM call (1 = single-chapter sequential, backward compatible) */
  batchSize: number
  /** Chapter range to extract (for partial re-extraction) */
  chapterRange?: { start: number; end: number }
}

/** Cost estimation returned before extraction starts */
export interface DeepImportEstimate {
  /** Estimated total chapters to process */
  estimatedChapters: number
  /** Estimated input tokens per chapter */
  avgInputTokensPerChapter: number
  /** Estimated output tokens per chapter */
  avgOutputTokensPerChapter: number
  /** Estimated cost per chapter in USD */
  costPerChapterUSD: number
  /** Estimated total cost in USD */
  totalCostUSD: number
  /** Estimated time in minutes */
  estimatedTimeMinutes: number
}

/** Progress event emitted during extraction */
export interface ExtractionProgress {
  /** Current chapter being processed */
  currentChapter: number
  /** Total chapters to process */
  totalChapters: number
  /** Phase within current chapter */
  phase: 'entity_extraction' | 'state_extraction' | 'plot_extraction' | 'review_checkpoint'
  /** Percentage complete (0-100) */
  percentage: number
  /** Cumulative token usage */
  tokenUsage: { input: number; output: number }
  /** Cumulative cost in USD */
  costUSD: number
  /** Status message for UI display */
  message: string
  /** Current batch number (1-indexed) */
  currentBatch?: number
  /** Total number of batches */
  totalBatches?: number
  /** Chapter range in the current batch */
  batchChapterRange?: { start: number; end: number } | null
}

/** Compact summary of known entities for injection into LLM prompt */
export interface EntitySummary {
  id: string
  name: string
  type: EntityType
  importance: EntityImportance
  /** One-line summary for context compression; full description for nearby chapters */
  summary: string
  /** Is this entity mentioned in a nearby chapter? Determines compression level */
  isNearby: boolean
}

/** Map of entity name → summary */
export type EntitySummaryMap = Map<string, EntitySummary>

/** Output of resolveToSandboxOps — ready to feed into sandboxStore */
export interface SandboxCommitOps {
  newEntities: Entity[]
  updatedEntities: Array<{ id: string; updates: Partial<Entity> }>
  stateEvents: StateEvent[]
}

// ============================================================================
// Serialization Helpers
// ============================================================================

/** JSON-safe representation of DeepImportSession (Map → Array) */
export interface SerializedDeepImportSession extends Omit<DeepImportSession, 'results'> {
  results: Array<[number, ChapterExtractionResult]>
}

/** Convert DeepImportSession to JSON-safe format */
export function serializeSession(session: DeepImportSession): SerializedDeepImportSession {
  return {
    ...session,
    results: Array.from(session.results.entries())
  }
}

/** Restore DeepImportSession from JSON-safe format */
export function deserializeSession(data: SerializedDeepImportSession): DeepImportSession {
  return {
    ...data,
    results: new Map(data.results)
  }
}
