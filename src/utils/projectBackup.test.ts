import { describe, expect, it, vi } from 'vitest'
import type { Project } from '@/types'
import type { Entity, StateEvent } from '@/types/sandbox'
import {
  createProjectBackup,
  parseProjectBackupJson,
  reassignProjectBackupIds,
} from './projectBackup'

function project(input: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    title: '星海纪元',
    description: '含有中文、换行\n和 "引号" 的项目',
    genre: '科幻',
    targetWords: 100000,
    currentWords: 2,
    status: 'draft',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    chapters: [
      { id: 'c2', number: 2, title: '第二章', content: '后文', wordCount: 1, status: 'draft', createdAt: new Date(), updatedAt: new Date() },
      { id: 'c1', number: 1, title: '第一章', content: '前文', wordCount: 1, status: 'draft', createdAt: new Date(), updatedAt: new Date() },
    ],
    config: {},
    ...input,
  } as Project
}

function entity(id: string, projectId = 'project-1'): Entity {
  return {
    id,
    projectId,
    type: 'CHARACTER',
    name: id,
    aliases: [],
    importance: 'major',
    category: '',
    systemPrompt: '',
    isArchived: false,
    createdAt: 1,
  }
}

function stateEvent(id: string, chapterNumber: number, projectId = 'project-1'): StateEvent {
  return {
    id,
    projectId,
    chapterNumber,
    entityId: 'hero',
    eventType: 'PROPERTY_UPDATE',
    payload: { key: 'mood', value: id },
    source: 'AI_EXTRACTED',
  }
}

describe('projectBackup utilities', () => {
  it('creates a versioned deterministic project backup with V5 sandbox data', () => {
    vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-04-25T00:00:00.000Z')

    const backup = createProjectBackup(
      project(),
      [entity('z'), entity('a'), entity('other', 'other-project')],
      [stateEvent('event-2', 2), stateEvent('event-1', 1), stateEvent('other-event', 1, 'other-project')]
    )

    expect(backup.schemaVersion).toBe(1)
    expect(backup.exportedAt).toBe('2026-04-25T00:00:00.000Z')
    expect(backup.project.chapters.map(chapter => chapter.id)).toEqual(['c1', 'c2'])
    expect(backup.sandbox.entities.map(item => item.id)).toEqual(['a', 'z'])
    expect(backup.sandbox.stateEvents.map(item => item.id)).toEqual(['event-1', 'event-2'])
  })

  it('parses valid backup JSON and preserves inert text content', () => {
    const backup = createProjectBackup(project(), [entity('hero')], [stateEvent('event-1', 1)])
    const result = parseProjectBackupJson(JSON.stringify(backup))

    expect(result.errors).toEqual([])
    expect(result.backup?.project.description).toContain('"引号"')
    expect(result.backup?.sandbox.entities[0].name).toBe('hero')
  })

  it('rejects malformed, unsupported, and invalid backup payloads', () => {
    expect(parseProjectBackupJson('{bad json').errors).toEqual(['备份文件不是有效的 JSON'])
    expect(parseProjectBackupJson(JSON.stringify({ schemaVersion: 999 })).errors).toEqual(expect.arrayContaining([
      '不支持的备份版本',
      '备份缺少导出时间',
      '备份缺少有效项目数据',
      '备份缺少 V5 沙盒数据',
    ]))

    const invalid = createProjectBackup(project(), [entity('hero')], [stateEvent('event-1', 1)]) as any
    invalid.sandbox.entities[0].type = 'INVALID'
    expect(parseProjectBackupJson(JSON.stringify(invalid)).errors).toEqual(['备份实体数据无效'])
  })

  it('rejects oversized backup files', () => {
    const hugeJson = `{"schemaVersion":1,"padding":"${'x'.repeat(50 * 1024 * 1024)}"}`

    expect(parseProjectBackupJson(hugeJson).errors).toEqual(['备份文件过大'])
  })

  it('rejects backups with duplicate ids or broken V5 references', () => {
    const duplicateChapter = createProjectBackup(
      project({
        chapters: [
          { id: 'same', number: 1, title: '第一章', content: '前文', wordCount: 1, status: 'draft' },
          { id: 'same', number: 2, title: '第二章', content: '后文', wordCount: 1, status: 'draft' },
        ] as Project['chapters'],
      }),
      [entity('hero')],
      [stateEvent('event-1', 1)]
    )
    expect(parseProjectBackupJson(JSON.stringify(duplicateChapter)).errors).toContain('备份章节 ID 重复')

    const duplicateEntity = createProjectBackup(project(), [entity('hero'), entity('hero')], [stateEvent('event-1', 1)])
    expect(parseProjectBackupJson(JSON.stringify(duplicateEntity)).errors).toContain('备份实体 ID 重复')

    const duplicateEvent = createProjectBackup(project(), [entity('hero')], [stateEvent('event-1', 1), stateEvent('event-1', 2)])
    expect(parseProjectBackupJson(JSON.stringify(duplicateEvent)).errors).toContain('备份状态事件 ID 重复')

    const mismatchedProject = createProjectBackup(project(), [entity('hero')], [stateEvent('event-1', 1)]) as any
    mismatchedProject.sandbox.entities[0].projectId = 'other-project'
    expect(parseProjectBackupJson(JSON.stringify(mismatchedProject)).errors).toContain('备份项目 ID 不一致')

    const missingEntityReference = createProjectBackup(project(), [entity('hero')], [stateEvent('event-1', 1)]) as any
    missingEntityReference.sandbox.stateEvents[0].entityId = 'missing-entity'
    expect(parseProjectBackupJson(JSON.stringify(missingEntityReference)).errors).toContain('备份状态事件引用了不存在的实体')
  })

  it('reassigns project id across project, chapters, entities, and state events', () => {
    const reassigned = reassignProjectBackupIds(
      createProjectBackup(project(), [entity('hero')], [stateEvent('event-1', 1)]),
      'project-new'
    )

    expect(reassigned.project.id).toBe('project-new')
    expect(reassigned.project.chapters).toHaveLength(2)
    expect(reassigned.sandbox.entities.every(item => item.projectId === 'project-new')).toBe(true)
    expect(reassigned.sandbox.stateEvents.every(item => item.projectId === 'project-new')).toBe(true)
  })
})
