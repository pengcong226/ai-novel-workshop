/**
 * 会话轨迹导入类型定义
 * @module types/conversation-trace
 */

import type { WorldbookEntry } from './worldbook'
import type { KnowledgeEntry } from './knowledge-base'

export type TraceRole = 'user' | 'assistant' | 'system' | 'tool' | 'other'

/**
 * JSONL 原始记录
 */
export interface ConversationTraceRecord {
  [key: string]: unknown
}

/**
 * 归一化消息
 */
export interface TraceMessage {
  role: TraceRole
  content: string
  timestamp?: number
  sourceLine: number
  sourceRecord?: ConversationTraceRecord
}

/**
 * 解析错误
 */
export interface TraceParseError {
  line: number
  message: string
  rawLine: string
}

/**
 * 解析统计
 */
export interface TraceParseStats {
  totalLines: number
  parsedRecords: number
  includedMessages: number
  filteredMessages: number
  parseErrors: number
}

/**
 * 解析选项
 */
export interface ConversationTraceParseOptions {
  includeRoles?: TraceRole[]
  includeEmptyContent?: boolean
  maxMessages?: number
  maxErrors?: number
  maxErrorRawLineLength?: number
  maxLineLength?: number
  includeSourceRecord?: boolean
  onProgress?: (current: number, total: number) => void
}

/**
 * 解析结果
 */
export interface ConversationTraceParseResult {
  messages: TraceMessage[]
  errors: TraceParseError[]
  stats: TraceParseStats
}

/**
 * 抽取来源引用
 */
export interface TraceSourceRef {
  line: number
  role: TraceRole
  snippet: string
}

export type TraceArtifactType =
  | 'worldbook'
  | 'knowledge'
  | 'character_profile'
  | 'world_fact'
  | 'timeline_event'

/**
 * 抽取物
 */
export interface TraceExtractedArtifact {
  id: string
  type: TraceArtifactType
  title: string
  confidence: number
  source: TraceSourceRef[]
  payload:
    | Partial<WorldbookEntry>
    | Partial<KnowledgeEntry>
    | Record<string, unknown>
}

export interface TraceExtractStats {
  totalMessages: number
  processedMessages: number
  artifacts: number
  skippedMessages: number
}

/**
 * 抽取结果
 */
export interface TraceExtractResult {
  artifacts: TraceExtractedArtifact[]
  stats: TraceExtractStats
  warnings: string[]
}

export type TraceConflictTarget =
  | 'world'
  | 'characters'
  | 'worldbook'
  | 'knowledge'
  | 'character_card'

export type TraceConflictType =
  | 'duplicate'
  | 'field_mismatch'
  | 'value_conflict'
  | 'schema_mismatch'

/**
 * 冲突项
 */
export interface TraceConflict {
  id: string
  target: TraceConflictTarget
  type: TraceConflictType
  reason: string
  existingValue?: unknown
  incomingValue?: unknown
  artifactId: string
}

export type TraceReviewAction = 'apply' | 'skip' | 'merge'

/**
 * 审核队列项
 */
export interface TraceReviewItem {
  id: string
  artifact: TraceExtractedArtifact
  conflicts: TraceConflict[]
  action: TraceReviewAction
  note?: string
}

/**
 * 应用统计
 */
export interface TraceApplyStats {
  reviewed: number
  applied: number
  skipped: number
  merged: number
  conflicts: number
}

/**
 * 导入会话记录
 */
export interface TraceImportSession {
  id: string
  fileName: string
  importedAt: Date
  parse: TraceParseStats
  extractCount: number
  reviewCount: number
  apply: TraceApplyStats
}
