import type { Project } from '@/types'
import type { Entity, StateEvent } from '@/types/sandbox'

export const PROJECT_BACKUP_SCHEMA_VERSION = 1

export interface ProjectBackupV1 {
  schemaVersion: 1
  exportedAt: string
  project: Project
  sandbox: {
    entities: Entity[]
    stateEvents: StateEvent[]
  }
}

export interface ParsedProjectBackup {
  backup: ProjectBackupV1 | null
  errors: string[]
}

const ENTITY_TYPES = new Set(['CHARACTER', 'FACTION', 'LOCATION', 'LORE', 'ITEM', 'CONCEPT', 'WORLD'])
const ENTITY_IMPORTANCE = new Set(['critical', 'major', 'minor', 'background'])
const STATE_EVENT_TYPES = new Set([
  'PROPERTY_UPDATE',
  'RELATION_ADD',
  'RELATION_REMOVE',
  'RELATION_UPDATE',
  'LOCATION_MOVE',
  'VITAL_STATUS_CHANGE',
  'ABILITY_CHANGE',
])
const STATE_EVENT_SOURCES = new Set(['MANUAL', 'AI_EXTRACTED', 'MIGRATION'])

const MAX_BACKUP_JSON_BYTES = 50 * 1024 * 1024
const MAX_BACKUP_CHAPTERS = 20_000
const MAX_BACKUP_ENTITIES = 100_000
const MAX_BACKUP_STATE_EVENTS = 200_000
const MAX_BACKUP_TEXT_BYTES = 20 * 1024 * 1024

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function isEntity(value: unknown): value is Entity {
  return isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.projectId === 'string' &&
    typeof value.type === 'string' &&
    ENTITY_TYPES.has(value.type) &&
    typeof value.name === 'string' &&
    isStringArray(value.aliases) &&
    typeof value.importance === 'string' &&
    ENTITY_IMPORTANCE.has(value.importance) &&
    typeof value.category === 'string' &&
    typeof value.systemPrompt === 'string' &&
    typeof value.isArchived === 'boolean' &&
    typeof value.createdAt === 'number'
}

function isStateEvent(value: unknown): value is StateEvent {
  return isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.projectId === 'string' &&
    typeof value.chapterNumber === 'number' &&
    Number.isFinite(value.chapterNumber) &&
    typeof value.entityId === 'string' &&
    typeof value.eventType === 'string' &&
    STATE_EVENT_TYPES.has(value.eventType) &&
    isRecord(value.payload) &&
    typeof value.source === 'string' &&
    STATE_EVENT_SOURCES.has(value.source)
}

function isChapter(value: unknown): value is Project['chapters'][number] {
  return isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.number === 'number' &&
    Number.isFinite(value.number) &&
    typeof value.title === 'string' &&
    typeof value.content === 'string' &&
    typeof value.wordCount === 'number' &&
    Number.isFinite(value.wordCount)
}

function hasNoDuplicates(values: string[]): boolean {
  return new Set(values).size === values.length
}

function isProject(value: unknown): value is Project {
  if (!isRecord(value)) return false

  return typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.description === 'string' &&
    typeof value.genre === 'string' &&
    typeof value.targetWords === 'number' &&
    typeof value.currentWords === 'number' &&
    typeof value.status === 'string' &&
    Array.isArray(value.chapters) &&
    value.chapters.every(isChapter) &&
    isRecord(value.config)
}

export function createProjectBackup(project: Project, entities: Entity[], stateEvents: StateEvent[]): ProjectBackupV1 {
  const sortedChapters = [...(project.chapters || [])].sort((left, right) => (left.number || 0) - (right.number || 0))
  const sortedEntities = [...entities]
    .filter(entity => entity.projectId === project.id)
    .sort((left, right) => left.id.localeCompare(right.id))
  const sortedStateEvents = [...stateEvents]
    .filter(event => event.projectId === project.id)
    .sort((left, right) => (left.chapterNumber - right.chapterNumber) || left.id.localeCompare(right.id))

  return {
    schemaVersion: PROJECT_BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    project: {
      ...project,
      chapters: sortedChapters,
    },
    sandbox: {
      entities: sortedEntities,
      stateEvents: sortedStateEvents,
    },
  }
}

export function parseProjectBackupJson(json: string): ParsedProjectBackup {
  if (byteLength(json) > MAX_BACKUP_JSON_BYTES) {
    return { backup: null, errors: ['备份文件过大'] }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { backup: null, errors: ['备份文件不是有效的 JSON'] }
  }

  const errors: string[] = []
  if (!isRecord(parsed)) {
    return { backup: null, errors: ['备份文件结构无效'] }
  }

  if (parsed.schemaVersion !== PROJECT_BACKUP_SCHEMA_VERSION) {
    errors.push('不支持的备份版本')
  }
  if (typeof parsed.exportedAt !== 'string') {
    errors.push('备份缺少导出时间')
  }
  if (!isProject(parsed.project)) {
    errors.push('备份缺少有效项目数据')
  } else if (parsed.project.chapters.length > MAX_BACKUP_CHAPTERS) {
    errors.push('备份章节数量过多')
  } else if (parsed.project.chapters.some(chapter => byteLength(chapter.content) > MAX_BACKUP_TEXT_BYTES)) {
    errors.push('备份章节内容过大')
  }
  if (!isRecord(parsed.sandbox)) {
    errors.push('备份缺少 V5 沙盒数据')
  } else {
    if (!Array.isArray(parsed.sandbox.entities) || !parsed.sandbox.entities.every(isEntity)) {
      errors.push('备份实体数据无效')
    } else if (parsed.sandbox.entities.length > MAX_BACKUP_ENTITIES) {
      errors.push('备份实体数量过多')
    }
    if (!Array.isArray(parsed.sandbox.stateEvents) || !parsed.sandbox.stateEvents.every(isStateEvent)) {
      errors.push('备份状态事件数据无效')
    } else if (parsed.sandbox.stateEvents.length > MAX_BACKUP_STATE_EVENTS) {
      errors.push('备份状态事件数量过多')
    }
  }

  if (errors.length === 0) {
    const backup = parsed as unknown as ProjectBackupV1
    const projectId = backup.project.id
    const chapterIds = backup.project.chapters.map(chapter => chapter.id)
    const entityIds = backup.sandbox.entities.map(entity => entity.id)
    const stateEventIds = backup.sandbox.stateEvents.map(event => event.id)
    const entityIdSet = new Set(entityIds)

    if (!hasNoDuplicates(chapterIds)) errors.push('备份章节 ID 重复')
    if (!hasNoDuplicates(entityIds)) errors.push('备份实体 ID 重复')
    if (!hasNoDuplicates(stateEventIds)) errors.push('备份状态事件 ID 重复')
    if (!backup.sandbox.entities.every(entity => entity.projectId === projectId) ||
      !backup.sandbox.stateEvents.every(event => event.projectId === projectId)) {
      errors.push('备份项目 ID 不一致')
    }
    if (!backup.sandbox.stateEvents.every(event => entityIdSet.has(event.entityId))) {
      errors.push('备份状态事件引用了不存在的实体')
    }
  }

  if (errors.length > 0) {
    return { backup: null, errors }
  }

  return { backup: parsed as unknown as ProjectBackupV1, errors: [] }
}

export function isProjectBackup(value: unknown): value is ProjectBackupV1 {
  if (!isRecord(value)) return false
  return value.schemaVersion === PROJECT_BACKUP_SCHEMA_VERSION &&
    typeof value.exportedAt === 'string' &&
    isProject(value.project) &&
    isRecord(value.sandbox) &&
    Array.isArray(value.sandbox.entities) &&
    value.sandbox.entities.every(isEntity) &&
    Array.isArray(value.sandbox.stateEvents) &&
    value.sandbox.stateEvents.every(isStateEvent)
}

export function reassignProjectBackupIds(backup: ProjectBackupV1, nextProjectId: string): ProjectBackupV1 {
  return {
    ...backup,
    project: {
      ...backup.project,
      id: nextProjectId,
      chapters: backup.project.chapters.map(chapter => ({ ...chapter, projectId: nextProjectId })),
    },
    sandbox: {
      entities: backup.sandbox.entities.map(entity => ({ ...entity, projectId: nextProjectId })),
      stateEvents: backup.sandbox.stateEvents.map(event => ({ ...event, projectId: nextProjectId })),
    },
  }
}
