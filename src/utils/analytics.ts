/**
 * Privacy-first local analytics module.
 *
 * Tracks user interactions within the app without any external services,
 * PII, or content data. All data is stored locally in localStorage.
 *
 * @module utils/analytics
 */

import { getLogger } from '@/utils/logger'

const logger = getLogger('analytics')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EventCategory = 'navigation' | 'ai' | 'editor' | 'sandbox'

export type EventAction =
  // navigation
  | 'page_view'
  | 'panel_open'
  | 'panel_close'
  // ai
  | 'chapter_generate_start'
  | 'chapter_generate_complete'
  | 'chapter_generate_fail'
  | 'ai_request'
  | 'ai_error'
  // editor
  | 'chapter_edit_open'
  | 'chapter_edit_save'
  | 'feature_use'
  | 'export'
  // sandbox
  | 'project_create'
  | 'entity_create'
  | 'state_event_add'
  | 'deep_import_start'
  | 'deep_import_complete'
  | 'error'

export interface AnalyticsEvent {
  /** Unique event ID */
  id: string
  /** Event category */
  category: EventCategory
  /** Event action */
  action: EventAction
  /** ISO timestamp */
  timestamp: string
  /** Session ID */
  sessionId: string
  /** Anonymous event properties (no PII, no content) */
  properties: Record<string, string | number | boolean>
}

export interface SessionInfo {
  id: string
  startedAt: string
  lastEventAt: string
  eventCount: number
}

export interface AnalyticsSnapshot {
  /** Current session */
  session: SessionInfo
  /** Recent events (newest first) */
  events: AnalyticsEvent[]
  /** Aggregated counts by category */
  countsByCategory: Record<EventCategory, number>
  /** Aggregated counts by action */
  countsByAction: Record<string, number>
  /** Total event count */
  totalEvents: number
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

const STORAGE_KEY = '__app_analytics__'
const SESSION_KEY = '__analytics_session__'
const MAX_EVENTS = 2000
const MAX_STORAGE_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

let currentSessionId = ''
let currentSessionStart = ''

/** Listeners for new events. */
const listeners: Array<(event: AnalyticsEvent) => void> = []

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

function generateSessionId(): string {
  return `ses_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

function loadEvents(): AnalyticsEvent[] {
  if (!canUseStorage()) return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const events = JSON.parse(raw) as AnalyticsEvent[]
    // Prune old events
    const cutoff = Date.now() - MAX_STORAGE_AGE_MS
    return events.filter((e) => new Date(e.timestamp).getTime() > cutoff)
  } catch {
    return []
  }
}

function saveEvents(events: AnalyticsEvent[]): void {
  if (!canUseStorage()) return
  try {
    // Trim to max size, keeping newest
    const trimmed = events.slice(-MAX_EVENTS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Storage quota exceeded - silently drop
    logger.warn('analytics: failed to persist events (storage full)')
  }
}

function loadSession(): { id: string; startedAt: string } {
  if (!canUseStorage()) {
    return { id: generateSessionId(), startedAt: new Date().toISOString() }
  }
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { id: string; startedAt: string }
      // Reuse session if less than 30 minutes old
      if (Date.now() - new Date(parsed.startedAt).getTime() < 30 * 60 * 1000) {
        return parsed
      }
    }
  } catch {
    // Fall through to create new session
  }
  const newSession = { id: generateSessionId(), startedAt: new Date().toISOString() }
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(newSession))
  } catch {
    // Ignore
  }
  return newSession
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Initialize the analytics session. Call once at app startup.
 */
export function initAnalytics(): void {
  const session = loadSession()
  currentSessionId = session.id
  currentSessionStart = session.startedAt
  logger.debug(`analytics: session ${currentSessionId}`)
}

/**
 * Get the current session ID.
 */
export function getSessionId(): string {
  if (!currentSessionId) initAnalytics()
  return currentSessionId
}

/**
 * Track an analytics event. Silently no-ops if analytics is disabled or
 * storage is unavailable.
 *
 * @param category - event category
 * @param action - event action
 * @param properties - anonymous event properties (no PII, no content)
 */
export function trackEvent(
  category: EventCategory,
  action: EventAction,
  properties: Record<string, string | number | boolean> = {}
): void {
  if (!currentSessionId) initAnalytics()

  const event: AnalyticsEvent = {
    id: generateId(),
    category,
    action,
    timestamp: new Date().toISOString(),
    sessionId: currentSessionId,
    properties: { ...properties },
  }

  // Persist
  const events = loadEvents()
  events.push(event)
  saveEvents(events)

  // Notify listeners
  for (const listener of listeners) {
    try {
      listener(event)
    } catch {
      // Listener errors must not break analytics
    }
  }

  logger.debug(`analytics: [${category}/${action}]`, properties)
}

/**
 * Subscribe to new events. Returns an unsubscribe function.
 */
export function onAnalyticsEvent(listener: (event: AnalyticsEvent) => void): () => void {
  listeners.push(listener)
  return () => {
    const index = listeners.indexOf(listener)
    if (index !== -1) listeners.splice(index, 1)
  }
}

/**
 * Get a full analytics snapshot for display.
 */
export function getAnalyticsSnapshot(): AnalyticsSnapshot {
  const events = loadEvents()
  const sessionId = getSessionId()

  // Count by category
  const countsByCategory: Record<EventCategory, number> = {
    navigation: 0,
    ai: 0,
    editor: 0,
    sandbox: 0,
  }

  // Count by action
  const countsByAction: Record<string, number> = {}

  // Count by session
  let sessionEventCount = 0
  let lastEventAt = currentSessionStart

  for (const event of events) {
    countsByCategory[event.category] = (countsByCategory[event.category] || 0) + 1
    const actionKey = `${event.category}/${event.action}`
    countsByAction[actionKey] = (countsByAction[actionKey] || 0) + 1

    if (event.sessionId === sessionId) {
      sessionEventCount++
      if (event.timestamp > lastEventAt) {
        lastEventAt = event.timestamp
      }
    }
  }

  return {
    session: {
      id: sessionId,
      startedAt: currentSessionStart,
      lastEventAt,
      eventCount: sessionEventCount,
    },
    events: [...events].reverse(),
    countsByCategory,
    countsByAction,
    totalEvents: events.length,
  }
}

/**
 * Clear all stored analytics data.
 */
export function clearAnalytics(): void {
  if (!canUseStorage()) return
  localStorage.removeItem(STORAGE_KEY)
}

/**
 * Export all analytics data as a JSON string (for dev/debug purposes).
 */
export function exportAnalytics(): string {
  const snapshot = getAnalyticsSnapshot()
  return JSON.stringify(snapshot, null, 2)
}

// ---------------------------------------------------------------------------
// Convenience tracking functions
// ---------------------------------------------------------------------------

/**
 * Track a page navigation.
 */
export function trackPageView(pageName: string): void {
  trackEvent('navigation', 'page_view', { page: pageName })
}

/**
 * Track panel open/close.
 */
export function trackPanelAction(panelName: string, action: 'panel_open' | 'panel_close'): void {
  trackEvent('navigation', action, { panel: panelName })
}

/**
 * Track chapter generation start.
 */
export function trackGenerationStart(chapterNumber: number): void {
  trackEvent('ai', 'chapter_generate_start', { chapter: chapterNumber })
}

/**
 * Track chapter generation completion.
 */
export function trackGenerationComplete(data: {
  chapterNumber: number
  durationMs: number
  wordCount: number
  totalTokens: number
  revised: boolean
  auditScore: number
}): void {
  trackEvent('ai', 'chapter_generate_complete', {
    chapter: data.chapterNumber,
    duration_ms: Math.round(data.durationMs),
    word_count: data.wordCount,
    total_tokens: data.totalTokens,
    revised: data.revised,
    audit_score: data.auditScore,
  })
}

/**
 * Track chapter generation failure.
 */
export function trackGenerationFail(data: {
  chapterNumber: number
  durationMs: number
  errorCategory: string
}): void {
  trackEvent('ai', 'chapter_generate_fail', {
    chapter: data.chapterNumber,
    duration_ms: Math.round(data.durationMs),
    error_category: data.errorCategory,
  })
}

/**
 * Track project creation.
 */
export function trackProjectCreate(data: { genre: string; targetWords: number }): void {
  trackEvent('sandbox', 'project_create', {
    genre: data.genre,
    target_words: data.targetWords,
  })
}

/**
 * Track feature usage.
 */
export function trackFeatureUse(featureName: string, detail?: string): void {
  const props: Record<string, string | number | boolean> = { feature: featureName }
  if (detail) props.detail = detail
  trackEvent('editor', 'feature_use', props)
}

/**
 * Track error occurrences (no PII, no content).
 */
export function trackError(category: EventCategory, errorCategory: string, recoverable: boolean): void {
  trackEvent(category, 'error', {
    error_category: errorCategory,
    recoverable,
  })
}

/**
 * Track export action.
 */
export function trackExport(format: string): void {
  trackEvent('editor', 'export', { format })
}
