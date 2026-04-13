/**
 * 会话轨迹审核结果应用服务
 * @module services/conversation-trace-apply
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  TraceApplyStats,
  TraceExtractedArtifact,
  TraceImportSession,
  TraceParseStats,
  TraceReviewItem,
} from '@/types/conversation-trace'
import { useCharacterCardStore } from '@/stores/character-card'
import { useKnowledgeStore } from '@/stores/knowledge'
import { useProjectStore } from '@/stores/project'
import { useWorldbookStore } from '@/stores/worldbook'
import { indexExternalArtifacts } from '@/services/vector-service'

export type TracePersistAction = 'apply' | 'merge'

const MAX_INDEX_ARTIFACTS = 300

export interface TraceApplyDependencies {
  applyWorldbook: (artifacts: TraceExtractedArtifact[], action: TracePersistAction) => Promise<number | void>
  applyKnowledge: (artifacts: TraceExtractedArtifact[], action: TracePersistAction) => Promise<number | void>
  applyCharacterProfile: (artifacts: TraceExtractedArtifact[], action: TracePersistAction) => Promise<number | void>
  saveImportSession: (session: TraceImportSession) => Promise<void>
  indexArtifacts: (artifacts: TraceExtractedArtifact[]) => Promise<void>
}

export interface ApplyTraceReviewOptions {
  fileName: string
  parseStats: TraceParseStats
  deps?: TraceApplyDependencies
}

export interface ApplyTraceReviewResult {
  stats: TraceApplyStats
  session: TraceImportSession
  warnings?: string[]
}

function toObject(value: any): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function normalizePersistedCount(value: number | void, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value
  }
  return fallback
}

async function defaultApplyWorldbook(
  artifacts: TraceExtractedArtifact[],
  action: TracePersistAction
): Promise<number> {
  if (artifacts.length === 0) {
    return 0
  }

  const worldbookStore = useWorldbookStore()
  if (!worldbookStore.worldbook) {
    await worldbookStore.loadWorldbook()
  }

  const entries = artifacts.map(artifact => {
    const payload = toObject(artifact.payload)
    const key = Array.isArray(payload.key)
      ? payload.key.filter((item): item is string => typeof item === 'string')
      : []

    const keys = Array.isArray(payload.keys)
      ? payload.keys.filter((item): item is string => typeof item === 'string')
      : []

    const mergedKeys = [...key, ...keys]
    const uniqueKeys = Array.from(new Set(mergedKeys)).filter(Boolean)

    return {
      uid: Number(payload.uid) || Date.now() + Math.floor(Math.random() * 1000),
      key: uniqueKeys,
      keys: uniqueKeys,
      content: typeof payload.content === 'string' ? payload.content : '',
      comment: typeof payload.comment === 'string' ? payload.comment : artifact.title,
      constant: payload.constant === true,
      disable: payload.disable === true,
      enabled: payload.enabled !== false,
      insertion_order: typeof payload.insertion_order === 'number' ? payload.insertion_order : 100,
      source: 'conversation-trace',
    }
  })

  await worldbookStore.importEntries(entries as any, {
    merge: true,
    conflictResolution: action === 'merge' ? 'merge' : 'keep_both',
    deduplicate: true,
    enableAllEntries: false,
  })

  return entries.length
}

async function defaultApplyKnowledge(
  artifacts: TraceExtractedArtifact[],
  _action: TracePersistAction
): Promise<number> {
  if (artifacts.length === 0) {
    return 0
  }

  const knowledgeStore = useKnowledgeStore()
  await knowledgeStore.loadKnowledge()

  let applied = 0

  for (const artifact of artifacts) {
    const payload = toObject(artifact.payload)
    const content = typeof payload.content === 'string' ? payload.content.trim() : ''
    if (!content) {
      continue
    }

    await knowledgeStore.addEntry({
      content,
      comment: typeof payload.comment === 'string' ? payload.comment : artifact.title,
      tags: Array.isArray(payload.tags)
        ? payload.tags.filter((item): item is string => typeof item === 'string')
        : [],
      constant: true,
      disable: true,
      source: 'conversation-trace',
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    } as any)

    applied++
  }

  return applied
}

async function defaultApplyCharacterProfile(
  artifacts: TraceExtractedArtifact[],
  _action: TracePersistAction
): Promise<number> {
  if (artifacts.length === 0) {
    return 0
  }

  const characterCardStore = useCharacterCardStore()
  let updated = 0

  for (const artifact of artifacts) {
    const payload = toObject(artifact.payload)

    const updates: Record<string, string> = {}
    if (typeof payload.name === 'string' && payload.name.trim()) {
      updates.name = payload.name
    }
    if (typeof payload.personality === 'string' && payload.personality.trim()) {
      updates.personality = payload.personality
    }
    if (typeof payload.profile === 'string' && payload.profile.trim()) {
      updates.description = payload.profile
    }

    if (Object.keys(updates).length === 0) {
      continue
    }

    characterCardStore.updateCharacter(updates as any)
    updated++
  }

  return updated
}

async function defaultSaveImportSession(session: TraceImportSession): Promise<void> {
  const projectStore = useProjectStore()
  const project = projectStore.currentProject

  if (!project) {
    return
  }

  const history = Array.isArray(project.traceImportHistory) ? [...project.traceImportHistory] : []
  history.unshift(session)
  project.traceImportHistory = history.slice(0, 200)

  await projectStore.saveCurrentProject()
}

async function defaultIndexArtifacts(artifacts: TraceExtractedArtifact[]): Promise<void> {
  const projectStore = useProjectStore()
  const project = projectStore.currentProject
  if (!project) {
    return
  }

  const capped = artifacts.slice(0, MAX_INDEX_ARTIFACTS)
  if (capped.length === 0) {
    return
  }

  await indexExternalArtifacts(project.id, capped)
}

function createDefaultDeps(): TraceApplyDependencies {
  return {
    applyWorldbook: defaultApplyWorldbook,
    applyKnowledge: defaultApplyKnowledge,
    applyCharacterProfile: defaultApplyCharacterProfile,
    saveImportSession: defaultSaveImportSession,
    indexArtifacts: defaultIndexArtifacts,
  }
}

async function applyArtifactsForAction(
  items: TraceReviewItem[],
  action: TracePersistAction,
  deps: TraceApplyDependencies
): Promise<number> {
  if (items.length === 0) {
    return 0
  }

  const artifacts = items.map(item => item.artifact)
  const worldbookArtifacts = artifacts.filter(artifact => artifact.type === 'worldbook')
  const knowledgeArtifacts = artifacts.filter(
    artifact => artifact.type === 'knowledge' || artifact.type === 'timeline_event' || artifact.type === 'world_fact'
  )
  const characterArtifacts = artifacts.filter(artifact => artifact.type === 'character_profile')

  let persisted = 0

  if (worldbookArtifacts.length > 0) {
    const count = await deps.applyWorldbook(worldbookArtifacts, action)
    persisted += normalizePersistedCount(count, worldbookArtifacts.length)
  }

  if (knowledgeArtifacts.length > 0) {
    const count = await deps.applyKnowledge(knowledgeArtifacts, action)
    persisted += normalizePersistedCount(count, knowledgeArtifacts.length)
  }

  if (characterArtifacts.length > 0) {
    const count = await deps.applyCharacterProfile(characterArtifacts, action)
    persisted += normalizePersistedCount(count, characterArtifacts.length)
  }

  return persisted
}

export async function applyTraceReviewItems(
  reviewItems: TraceReviewItem[],
  options: ApplyTraceReviewOptions
): Promise<ApplyTraceReviewResult> {
  const deps = options.deps ?? createDefaultDeps()

  const applyItems = reviewItems.filter(item => item.action === 'apply')
  const mergeItems = reviewItems.filter(item => item.action === 'merge')
  const skipped = reviewItems.filter(item => item.action === 'skip').length

  const applied = await applyArtifactsForAction(applyItems, 'apply', deps)
  const merged = await applyArtifactsForAction(mergeItems, 'merge', deps)

  const warnings: string[] = []
  const actionableArtifacts = [...applyItems, ...mergeItems].map(item => item.artifact)

  if (actionableArtifacts.length > 0) {
    const artifactsToIndex = actionableArtifacts.slice(0, MAX_INDEX_ARTIFACTS)
    if (actionableArtifacts.length > artifactsToIndex.length) {
      warnings.push(`向量索引已截断，仅索引前 ${MAX_INDEX_ARTIFACTS} 条`)
    }

    try {
      await deps.indexArtifacts(artifactsToIndex)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      warnings.push(`向量索引失败: ${message}`)
    }
  }

  const stats: TraceApplyStats = {
    reviewed: reviewItems.length,
    applied,
    merged,
    skipped,
    conflicts: reviewItems.reduce((sum, item) => sum + item.conflicts.length, 0),
  }

  const session: TraceImportSession = {
    id: uuidv4(),
    fileName: options.fileName,
    importedAt: new Date(),
    parse: options.parseStats,
    extractCount: reviewItems.length,
    reviewCount: reviewItems.length,
    apply: stats,
  }

  await deps.saveImportSession(session)

  return {
    stats,
    session,
    warnings: warnings.length > 0 ? warnings : undefined,
  }
}
