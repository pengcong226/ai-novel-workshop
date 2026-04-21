/**
 * Rewrite/Continuation Workflow — Type Definitions
 *
 * Two workflows for authoring on top of an imported novel:
 *   1. Continuation — generate new chapters after the last imported chapter
 *   2. Rewrite — replace a range of chapters with new direction
 *
 * Both use the sandbox encyclopedia (Entity + StateEvent) for consistency.
 */

import type { Entity, EntityType } from './sandbox'
import type { PlotEventType } from './deep-import'

// ============================================================================
// Continuation
// ============================================================================

export interface ContinuationOptions {
  /** Chapter number to start generating from (typically lastChapter + 1) */
  startChapter: number
  /** Number of new chapters to generate */
  count: number
  /** Whether to extract plot events (foreshadowing arcs) in addition to entity/state */
  extractPlotEvents: boolean
  /** Whether to run anti-retcon validation on each chapter */
  enableAntiRetcon: boolean
  /** Auto-save each chapter after generation */
  autoSave: boolean
  /** Whether to auto-extract entities/state events after each chapter */
  autoExtract: boolean
}

// ============================================================================
// Rewrite
// ============================================================================

export interface RewriteRange {
  /** First chapter to rewrite (inclusive) */
  start: number
  /** Last chapter to rewrite (inclusive) */
  end: number
}

export interface RewriteOptions {
  /** The chapter range being rewritten */
  range: RewriteRange
  /** User-provided direction prompt for the rewrite */
  newDirectionPrompt: string
  /** Whether to extract plot events during rewrite */
  extractPlotEvents: boolean
  /** Whether to run anti-retcon validation */
  enableAntiRetcon: boolean
  /** Auto-save */
  autoSave: boolean
}

// ============================================================================
// State Diff
// ============================================================================

/** Serializable snapshot of an entity's reduced state at a given chapter */
export interface EntityStateSnapshot {
  entityId: string
  entityName: string
  entityType: EntityType
  properties: Record<string, string>
  relations: Array<{ targetId: string; targetName: string; type: string; attitude?: string }>
  location: string | null
  vitalStatus: string
  abilities: Array<{ name: string; status: string }>
}

export type StateDiffCategory =
  | 'property_added' | 'property_removed' | 'property_changed'
  | 'relation_added' | 'relation_removed' | 'relation_changed'
  | 'location_changed' | 'vital_status_changed' | 'ability_changed'
  | 'entity_added' | 'entity_removed'

export interface StateDiffItem {
  entityId: string
  entityName: string
  category: StateDiffCategory
  description: string
  before: string
  after: string
  /** null = pending review, true = accepted, false = rejected */
  accepted: boolean | null
}

export interface BrokenForeshadowing {
  plantedInChapter: number
  description: string
  brokenByChapter: number
  reason: string
}

export interface StateDiffReport {
  /** Snapshot at range.start - 1 (baseline) */
  baselineSnapshot: EntityStateSnapshot[]
  /** Snapshot at range.end (before rewrite) */
  preRewriteSnapshot: EntityStateSnapshot[]
  /** Snapshot after rewrite generation */
  postRewriteSnapshot: EntityStateSnapshot[]
  /** Structured diffs between pre-rewrite and post-rewrite */
  diffs: StateDiffItem[]
  /** Foreshadowing arcs that would be broken by the rewrite */
  brokenForeshadowing: BrokenForeshadowing[]
  /** New entities introduced by the rewrite */
  newEntities: Entity[]
  /** Entities that would be removed (no longer appear) */
  removedEntityIds: string[]
}

// ============================================================================
// Plot Event Record (lightweight persistence)
// ============================================================================

export interface PlotEventRecord {
  id: string
  projectId: string
  chapterNumber: number
  description: string
  type: PlotEventType
  importance: number
  involvedEntityIds: string[]
  estimatedResolutionChapter?: number
  resolvedForeshadowingFromChapter?: number
  evidence?: string
  createdAt: number
}

// ============================================================================
// Rewrite Backup (for rollback)
// ============================================================================

export interface RewriteBackup {
  projectId: string
  range: RewriteRange
  /** Serialized chapters in the range */
  chapters: Array<{ number: number; title: string; content: string; wordCount: number }>
  /** State events in the range */
  stateEvents: Array<{
    id: string; projectId: string; chapterNumber: number;
    entityId: string; eventType: string; payload: Record<string, unknown>;
    source: string
  }>
  /** Plot events before rewrite starts (for rollback) */
  plotEvents: PlotEventRecord[]
  /** Timestamp of backup creation */
  createdAt: number
}
