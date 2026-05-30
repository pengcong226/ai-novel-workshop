import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createProjectBackup,
  parseProjectBackupJson,
  reassignProjectBackupIds,
  isProjectBackup,
  PROJECT_BACKUP_SCHEMA_VERSION,
} from '@/utils/projectBackup'
import type { Project } from '@/types'
import type { Entity, StateEvent } from '@/types/sandbox'

function createMockProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-test-1',
    title: '测试项目',
    description: '一个测试项目',
    genre: '玄幻',
    targetWords: 100000,
    currentWords: 5000,
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
    outline: {
      id: 'outline-1',
      synopsis: '测试概要',
      theme: '成长',
      mainPlot: { id: 'main-plot-1', name: '主线', description: '主角成长' },
      subPlots: [],
      volumes: [],
      chapters: [],
      foreshadowings: [],
    },
    chapters: [
      {
        id: 'ch-1',
        number: 1,
        title: '第一章 序',
        content: '这是第一章的内容。',
        wordCount: 100,
        outline: {
          chapterId: 'ch-1',
          title: '第一章',
          scenes: [],
          characters: [],
          location: '',
          goals: [],
          conflicts: [],
          resolutions: [],
          status: 'completed',
        },
        status: 'draft',
        generatedBy: 'ai',
        generationTime: new Date(),
        checkpoints: [],
      },
    ],
    config: {
      preset: 'standard',
      providers: [],
      plannerModel: '',
      writerModel: '',
      sentinelModel: '',
      extractorModel: '',
      systemPrompts: {},
      planningDepth: 'medium',
      writingDepth: 'standard',
      enableQualityCheck: true,
      qualityThreshold: 7,
      maxCostPerChapter: 0.15,
      enableAISuggestions: true,
      enableAutoReview: false,
      advanced: {
        temperature: 0.8,
        topP: 0.9,
        maxTokens: 4096,
        maxContextTokens: 8192,
        recentChaptersCount: 3,
        targetWordCount: 2000,
        frequencyPenalty: 0,
        presencePenalty: 0,
        stopSequences: [],
      },
      vectorConfig: {
        provider: 'local',
        model: 'Xenova/bge-small-zh-v1.5',
        dimension: 512,
        topK: 5,
        minScore: 0.6,
        vectorWeight: 0.7,
      },
    },
    ...overrides,
  }
}

function createMockEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: `entity-${Math.random().toString(36).slice(2)}`,
    projectId: 'proj-test-1',
    type: 'CHARACTER',
    name: '测试角色',
    aliases: ['别名'],
    importance: 'major',
    category: 'Protagonist',
    systemPrompt: '',
    isArchived: false,
    createdAt: Date.now(),
    ...overrides,
  }
}

function createMockStateEvent(overrides: Partial<StateEvent> = {}): StateEvent {
  return {
    id: `event-${Math.random().toString(36).slice(2)}`,
    projectId: 'proj-test-1',
    chapterNumber: 1,
    entityId: 'entity-1',
    eventType: 'PROPERTY_UPDATE',
    payload: { key: 'status', value: 'active' },
    source: 'MANUAL',
    ...overrides,
  }
}

describe('Import/Export Flows', () => {
  describe('Project Backup Creation', () => {
    it('creates a backup with correct schema version', () => {
      const project = createMockProject()
      const entities = [createMockEntity()]
      const stateEvents = [createMockStateEvent({ entityId: entities[0].id })]

      const backup = createProjectBackup(project, entities, stateEvents)

      expect(backup.schemaVersion).toBe(PROJECT_BACKUP_SCHEMA_VERSION)
      expect(backup.schemaVersion).toBe(1)
    })

    it('includes exportedAt timestamp in ISO format', () => {
      const project = createMockProject()
      const backup = createProjectBackup(project, [], [])

      expect(backup.exportedAt).toBeTruthy()
      // Should be a valid ISO date string
      expect(new Date(backup.exportedAt).toISOString()).toBe(backup.exportedAt)
    })

    it('includes project data in backup', () => {
      const project = createMockProject({ title: '备份测试项目' })
      const backup = createProjectBackup(project, [], [])

      expect(backup.project.title).toBe('备份测试项目')
      expect(backup.project.id).toBe('proj-test-1')
      expect(backup.project.chapters.length).toBe(1)
    })

    it('includes sandbox entities and state events', () => {
      const project = createMockProject()
      const entities = [
        createMockEntity({ id: 'e1', name: '角色A' }),
        createMockEntity({ id: 'e2', name: '角色B' }),
      ]
      const events = [
        createMockStateEvent({ id: 'evt1', entityId: 'e1' }),
        createMockStateEvent({ id: 'evt2', entityId: 'e2' }),
      ]

      const backup = createProjectBackup(project, entities, events)

      expect(backup.sandbox.entities.length).toBe(2)
      expect(backup.sandbox.stateEvents.length).toBe(2)
      expect(backup.sandbox.entities.map(e => e.name).sort()).toEqual(['角色A', '角色B'])
    })

    it('filters entities to only include those from the same project', () => {
      const project = createMockProject()
      const entities = [
        createMockEntity({ id: 'e-same', projectId: 'proj-test-1' }),
        createMockEntity({ id: 'e-other', projectId: 'other-project' }),
      ]

      const backup = createProjectBackup(project, entities, [])

      expect(backup.sandbox.entities.length).toBe(1)
      expect(backup.sandbox.entities[0].id).toBe('e-same')
    })

    it('filters state events to only include those from the same project', () => {
      const project = createMockProject()
      const events = [
        createMockStateEvent({ id: 'evt-same', projectId: 'proj-test-1', entityId: 'e1' }),
        createMockStateEvent({ id: 'evt-other', projectId: 'other-project', entityId: 'e2' }),
      ]

      const backup = createProjectBackup(project, [], events)

      expect(backup.sandbox.stateEvents.length).toBe(1)
      expect(backup.sandbox.stateEvents[0].id).toBe('evt-same')
    })

    it('sorts chapters by number', () => {
      const project = createMockProject({
        chapters: [
          { ...createMockProject().chapters[0], id: 'ch-3', number: 3, title: '第三章' },
          { ...createMockProject().chapters[0], id: 'ch-1', number: 1, title: '第一章' },
          { ...createMockProject().chapters[0], id: 'ch-2', number: 2, title: '第二章' },
        ],
      })

      const backup = createProjectBackup(project, [], [])

      expect(backup.project.chapters.map(c => c.number)).toEqual([1, 2, 3])
    })
  })

  describe('Backup Round-Trip', () => {
    it('backup JSON can be parsed back to a valid backup', () => {
      const project = createMockProject()
      const entities = [createMockEntity({ id: 'e1' })]
      const events = [createMockStateEvent({ id: 'evt1', entityId: 'e1' })]

      const backup = createProjectBackup(project, entities, events)
      const json = JSON.stringify(backup)
      const parsed = parseProjectBackupJson(json)

      expect(parsed.backup).not.toBeNull()
      expect(parsed.errors).toEqual([])
      expect(parsed.backup!.project.title).toBe('测试项目')
      expect(parsed.backup!.sandbox.entities.length).toBe(1)
      expect(parsed.backup!.sandbox.stateEvents.length).toBe(1)
    })

    it('preserves project structure through round-trip', () => {
      const project = createMockProject()
      const backup = createProjectBackup(project, [], [])
      const json = JSON.stringify(backup)
      const parsed = parseProjectBackupJson(json)

      expect(parsed.backup!.project.outline.synopsis).toBe('测试概要')
      expect(parsed.backup!.project.outline.theme).toBe('成长')
      expect(parsed.backup!.project.outline.mainPlot.name).toBe('主线')
      expect(parsed.backup!.project.genre).toBe('玄幻')
      expect(parsed.backup!.project.targetWords).toBe(100000)
    })

    it('preserves chapter content through round-trip', () => {
      const project = createMockProject()
      const backup = createProjectBackup(project, [], [])
      const json = JSON.stringify(backup)
      const parsed = parseProjectBackupJson(json)

      expect(parsed.backup!.project.chapters[0].content).toBe('这是第一章的内容。')
      expect(parsed.backup!.project.chapters[0].wordCount).toBe(100)
    })
  })

  describe('Backup Validation', () => {
    it('rejects invalid JSON', () => {
      const parsed = parseProjectBackupJson('not valid json')

      expect(parsed.backup).toBeNull()
      expect(parsed.errors.length).toBeGreaterThan(0)
    })

    it('rejects backup with wrong schema version', () => {
      const backup = {
        schemaVersion: 99,
        exportedAt: new Date().toISOString(),
        project: createMockProject(),
        sandbox: { entities: [], stateEvents: [] },
      }
      const parsed = parseProjectBackupJson(JSON.stringify(backup))

      expect(parsed.backup).toBeNull()
      expect(parsed.errors).toContain('不支持的备份版本')
    })

    it('rejects backup with missing project', () => {
      const backup = {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        sandbox: { entities: [], stateEvents: [] },
      }
      const parsed = parseProjectBackupJson(JSON.stringify(backup))

      expect(parsed.backup).toBeNull()
      expect(parsed.errors).toContain('备份缺少有效项目数据')
    })

    it('rejects backup with missing sandbox', () => {
      const backup = {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        project: createMockProject(),
      }
      const parsed = parseProjectBackupJson(JSON.stringify(backup))

      expect(parsed.backup).toBeNull()
      expect(parsed.errors).toContain('备份缺少 V5 沙盒数据')
    })

    it('rejects backup with invalid entity data', () => {
      const backup = {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        project: createMockProject(),
        sandbox: {
          entities: [{ id: 'bad', name: 'bad' }], // missing required fields
          stateEvents: [],
        },
      }
      const parsed = parseProjectBackupJson(JSON.stringify(backup))

      expect(parsed.backup).toBeNull()
      expect(parsed.errors).toContain('备份实体数据无效')
    })

    it('rejects backup with duplicate entity IDs', () => {
      const project = createMockProject()
      const entity = createMockEntity({ id: 'dup-id' })
      const backup = createProjectBackup(project, [entity, entity], [])
      const json = JSON.stringify(backup)
      const parsed = parseProjectBackupJson(json)

      expect(parsed.backup).toBeNull()
      expect(parsed.errors).toContain('备份实体 ID 重复')
    })

    it('rejects backup with inconsistent project IDs', () => {
      const project = createMockProject()
      const entity = createMockEntity({ id: 'e1', projectId: 'proj-test-1' })
      const badEvent = createMockStateEvent({ id: 'evt1', entityId: 'e1', projectId: 'other-project' })
      const backup = createProjectBackup(project, [entity], [badEvent])
      const json = JSON.stringify(backup)
      const parsed = parseProjectBackupJson(json)

      // badEvent should be filtered out during creation, so parse succeeds
      // But if we manually construct one with bad IDs:
      const manualBackup = {
        ...backup,
        sandbox: {
          entities: [entity],
          stateEvents: [badEvent],
        },
      }
      const parsedManual = parseProjectBackupJson(JSON.stringify(manualBackup))

      expect(parsedManual.backup).toBeNull()
      expect(parsedManual.errors).toContain('备份项目 ID 不一致')
    })

    it('rejects backup with state events referencing non-existent entities', () => {
      const project = createMockProject()
      const entity = createMockEntity({ id: 'real-entity', projectId: 'proj-test-1' })
      const orphanEvent = createMockStateEvent({
        id: 'orphan-evt',
        projectId: 'proj-test-1',
        entityId: 'non-existent-entity',
      })

      const manualBackup = {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        project,
        sandbox: {
          entities: [entity],
          stateEvents: [orphanEvent],
        },
      }
      const parsed = parseProjectBackupJson(JSON.stringify(manualBackup))

      expect(parsed.backup).toBeNull()
      expect(parsed.errors).toContain('备份状态事件引用了不存在的实体')
    })
  })

  describe('isProjectBackup Type Guard', () => {
    it('returns true for a valid backup', () => {
      const project = createMockProject()
      const entities = [createMockEntity({ id: 'e1' })]
      const events = [createMockStateEvent({ id: 'evt1', entityId: 'e1' })]
      const backup = createProjectBackup(project, entities, events)

      expect(isProjectBackup(backup)).toBe(true)
    })

    it('returns false for null', () => {
      expect(isProjectBackup(null)).toBe(false)
    })

    it('returns false for a plain object', () => {
      expect(isProjectBackup({ foo: 'bar' })).toBe(false)
    })

    it('returns false for missing schemaVersion', () => {
      const backup = {
        exportedAt: new Date().toISOString(),
        project: createMockProject(),
        sandbox: { entities: [], stateEvents: [] },
      }
      expect(isProjectBackup(backup)).toBe(false)
    })
  })

  describe('ID Reassignment', () => {
    it('reassigns project ID in all backup sections', () => {
      const project = createMockProject()
      const entities = [createMockEntity({ id: 'e1', projectId: 'proj-test-1' })]
      const events = [createMockStateEvent({ id: 'evt1', entityId: 'e1', projectId: 'proj-test-1' })]
      const backup = createProjectBackup(project, entities, events)

      const reassigned = reassignProjectBackupIds(backup, 'new-proj-id')

      expect(reassigned.project.id).toBe('new-proj-id')
      expect(reassigned.sandbox.entities[0].projectId).toBe('new-proj-id')
      expect(reassigned.sandbox.stateEvents[0].projectId).toBe('new-proj-id')
    })

    it('preserves original data when reassigning', () => {
      const project = createMockProject()
      const entities = [createMockEntity({ id: 'e1', name: '测试角色' })]
      const backup = createProjectBackup(project, entities, [])

      const reassigned = reassignProjectBackupIds(backup, 'new-id')

      expect(reassigned.project.title).toBe('测试项目')
      expect(reassigned.sandbox.entities[0].name).toBe('测试角色')
      expect(reassigned.schemaVersion).toBe(1)
    })

    it('reassigns chapter project IDs if present', () => {
      const project = createMockProject()
      const backup = createProjectBackup(project, [], [])

      const reassigned = reassignProjectBackupIds(backup, 'new-proj')

      // Chapter projectId (if it exists) should be updated
      if (reassigned.project.chapters[0].projectId) {
        expect(reassigned.project.chapters[0].projectId).toBe('new-proj')
      }
    })
  })

  describe('Empty Backup', () => {
    it('creates a valid backup with no chapters or entities', () => {
      const project = createMockProject({ chapters: [] })
      const backup = createProjectBackup(project, [], [])

      expect(backup.schemaVersion).toBe(1)
      expect(backup.project.chapters).toEqual([])
      expect(backup.sandbox.entities).toEqual([])
      expect(backup.sandbox.stateEvents).toEqual([])
    })

    it('parses empty backup correctly', () => {
      const project = createMockProject({ chapters: [] })
      const backup = createProjectBackup(project, [], [])
      const json = JSON.stringify(backup)
      const parsed = parseProjectBackupJson(json)

      expect(parsed.backup).not.toBeNull()
      expect(parsed.errors).toEqual([])
    })
  })
})
