/**
 * Typed event definitions for the application event bus.
 *
 * All application-level events are declared here as a single map type.
 * Add new event families by extending `AppEventMap`.
 */
import type { Chapter, Project } from './index'
import type { Entity, EntityType } from './sandbox'

// ============================================================================
// Chapter Events
// ============================================================================

export interface ChapterGeneratedPayload {
  chapter: Chapter
  modelUsed?: string
  generationTimeMs: number
}

export interface ChapterSavedPayload {
  chapter: Chapter
}

export interface ChapterDeletedPayload {
  chapterId: string
  chapterNumber: number
}

// ============================================================================
// Project Events
// ============================================================================

export interface ProjectOpenedPayload {
  projectId: string
  title: string
}

export interface ProjectClosedPayload {
  projectId: string
}

export interface ProjectSavedPayload {
  projectId: string
  updatedAt: Date
}

// ============================================================================
// Entity Events
// ============================================================================

export interface EntityCreatedPayload {
  entity: Entity
}

export interface EntityUpdatedPayload {
  entity: Entity
  changedFields: string[]
}

export interface EntityDeletedPayload {
  entityId: string
  entityType: EntityType
  entityName: string
}

// ============================================================================
// AI Events
// ============================================================================

export interface AIStartedPayload {
  taskType: string
  modelId?: string
  chapterNumber?: number
}

export interface AICompletedPayload {
  taskType: string
  modelId?: string
  chapterNumber?: number
  durationMs: number
  tokenUsage?: { input: number; output: number }
}

export interface AIFailedPayload {
  taskType: string
  modelId?: string
  chapterNumber?: number
  error: string
}

// ============================================================================
// Outline Events
// ============================================================================

export interface OutlineChangedPayload {
  projectId: string
  outline: unknown
}

// ============================================================================
// Central Event Map
// ============================================================================

/**
 * Canonical map of every event the application can emit.
 *
 * - Keys are event names (string literal union).
 * - Values are the payload type for that event.
 *
 * To add a new event, add a key/value pair here. The rest of the type
 * system (EventBus, useEventBus) will enforce it automatically.
 */
export interface AppEventMap {
  // Chapter lifecycle
  'chapter:generated': ChapterGeneratedPayload
  'chapter:saved': ChapterSavedPayload
  'chapter:deleted': ChapterDeletedPayload

  // Project lifecycle
  'project:opened': ProjectOpenedPayload
  'project:closed': ProjectClosedPayload
  'project:saved': ProjectSavedPayload

  // Entity lifecycle (V5 sandbox)
  'entity:created': EntityCreatedPayload
  'entity:updated': EntityUpdatedPayload
  'entity:deleted': EntityDeletedPayload

  // AI generation
  'ai:started': AIStartedPayload
  'ai:completed': AICompletedPayload
  'ai:failed': AIFailedPayload

  // Outline
  'outline:changed': OutlineChangedPayload
}

/** Union of all event names. */
export type AppEventName = keyof AppEventMap

/** Lookup the payload type for a given event name. */
export type AppEventPayload<T extends AppEventName> = AppEventMap[T]
