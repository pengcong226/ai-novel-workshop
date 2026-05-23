/**
 * 会话轨迹冲突检测与审核队列
 * @module services/conversation-trace-conflict
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  TraceConflict,
  TraceExtractedArtifact,
  TraceReviewItem,
} from '@/types/conversation-trace'

export interface TraceConflictSnapshot {
  worldbookEntries?: Array<Record<string, unknown>>
  knowledgeEntries?: Array<Record<string, unknown>>
  hasWorldStructure?: boolean
  hasCharacterStructure?: boolean
}

export interface TraceConflictResult {
  items: TraceReviewItem[]
  conflicts: TraceConflict[]
}

function asStringArray(value: any): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function getEntryKeys(entry: Record<string, unknown>): string[] {
  const key = asStringArray(entry.key)
  const keys = asStringArray(entry.keys)
  return [...key, ...keys]
}

function findWorldbookConflicts(
  artifact: TraceExtractedArtifact,
  snapshot: TraceConflictSnapshot
): TraceConflict[] {
  const existing = snapshot.worldbookEntries ?? []
  const payload = artifact.payload as Record<string, unknown>
  const incomingKeys = getEntryKeys(payload)

  if (incomingKeys.length === 0) {
    return []
  }

  const conflicts: TraceConflict[] = []

  for (const entry of existing) {
    const keys = getEntryKeys(entry)
    const duplicated = incomingKeys.some(key => keys.includes(key))

    if (duplicated) {
      conflicts.push({
        id: uuidv4(),
        target: 'worldbook',
        type: 'duplicate',
        reason: '世界书关键词与现有条目重复',
        existingValue: keys,
        incomingValue: incomingKeys,
        artifactId: artifact.id,
      })
    }
  }

  return conflicts
}

function findKnowledgeConflicts(
  artifact: TraceExtractedArtifact,
  snapshot: TraceConflictSnapshot
): TraceConflict[] {
  const existing = snapshot.knowledgeEntries ?? []
  const payload = artifact.payload as Record<string, unknown>
  const incomingContent = typeof payload.content === 'string' ? payload.content.trim() : ''

  if (!incomingContent) {
    return []
  }

  const duplicated = existing.some(entry => {
    const content = typeof entry.content === 'string' ? entry.content.trim() : ''
    return content.length > 0 && content === incomingContent
  })

  if (!duplicated) {
    return []
  }

  return [
    {
      id: uuidv4(),
      target: 'knowledge',
      type: 'duplicate',
      reason: '知识库内容与现有条目重复',
      incomingValue: incomingContent,
      artifactId: artifact.id,
    },
  ]
}

function findStructureConflicts(
  artifact: TraceExtractedArtifact,
  snapshot: TraceConflictSnapshot
): TraceConflict[] {
  if (artifact.type === 'world_fact' && snapshot.hasWorldStructure) {
    return [
      {
        id: uuidv4(),
        target: 'world',
        type: 'value_conflict',
        reason: '结构层世界观已存在，默认进入人工审核',
        artifactId: artifact.id,
      },
    ]
  }

  if (artifact.type === 'character_profile' && snapshot.hasCharacterStructure) {
    return [
      {
        id: uuidv4(),
        target: 'characters',
        type: 'value_conflict',
        reason: '结构层人物设定已存在，默认进入人工审核',
        artifactId: artifact.id,
      },
    ]
  }

  return []
}

function detectConflicts(
  artifact: TraceExtractedArtifact,
  snapshot: TraceConflictSnapshot
): TraceConflict[] {
  const conflicts: TraceConflict[] = []

  if (artifact.type === 'worldbook') {
    conflicts.push(...findWorldbookConflicts(artifact, snapshot))
  }

  if (artifact.type === 'knowledge' || artifact.type === 'timeline_event') {
    conflicts.push(...findKnowledgeConflicts(artifact, snapshot))
  }

  conflicts.push(...findStructureConflicts(artifact, snapshot))

  return conflicts
}

export function buildTraceReviewQueue(
  artifacts: TraceExtractedArtifact[],
  snapshot: TraceConflictSnapshot = {}
): TraceConflictResult {
  const allConflicts: TraceConflict[] = []
  const items: TraceReviewItem[] = []

  for (const artifact of artifacts) {
    const conflicts = detectConflicts(artifact, snapshot)
    allConflicts.push(...conflicts)

    items.push({
      id: uuidv4(),
      artifact,
      conflicts,
      action: conflicts.length > 0 ? 'skip' : 'apply',
    })
  }

  return {
    items,
    conflicts: allConflicts,
  }
}
