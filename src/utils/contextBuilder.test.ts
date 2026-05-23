import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  buildAuthorsNote,
  buildCharacterInfo,
  buildStateConstraints,
  buildWorldInfo,
  inferCurrentScene,
} from './contextBuilder'
import { useSandboxStore } from '@/stores/sandbox'
import type { Chapter, Project } from '@/types'
import type { Entity, StateEvent } from '@/types/sandbox'
import type { ResolvedEntity } from '@/stores/sandbox'

function entity(input: Partial<Entity> & Pick<Entity, 'id' | 'type' | 'name'>): Entity {
  return {
    projectId: 'project-1',
    aliases: [],
    importance: 'major',
    category: '',
    systemPrompt: '',
    isArchived: false,
    createdAt: 1,
    ...input,
  }
}

function resolved(base: Entity, overrides: Partial<ResolvedEntity> = {}): ResolvedEntity {
  return {
    ...base,
    properties: {},
    relations: [],
    location: null,
    vitalStatus: 'alive',
    abilities: [],
    ...overrides,
  }
}

function stateEvent(input: Partial<StateEvent> & Pick<StateEvent, 'id' | 'chapterNumber' | 'entityId' | 'eventType'>): StateEvent {
  return {
    projectId: 'project-1',
    payload: {},
    source: 'AI_EXTRACTED',
    ...input,
  }
}

function chapter(input: Partial<Chapter>): Chapter {
  return {
    id: 'chapter-1',
    number: 1,
    title: '第一章',
    content: '',
    wordCount: 0,
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...input,
  } as Chapter
}

function project(input: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    title: '星海纪元',
    genre: '科幻',
    description: '',
    targetWords: 1000000,
    currentWords: 0,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    chapters: [],
    config: {},
    ...input,
  } as Project
}

describe('contextBuilder key modules', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('builds first-chapter and continuation author notes', () => {
    expect(buildAuthorsNote(1, [])).toContain('这是第一章')

    const note = buildAuthorsNote(5, [chapter({ content: '林照在星门前停下，白榆举起灯，远处传来舰队轰鸣。' })])

    expect(note).toContain('这是第5章')
    expect(note).toContain('必须严格承接前文剧情')
    expect(note).toContain('前文结尾情况')
    expect(note).toContain('绝对禁止')
    expect(note).toContain('重新开始剧情')
  })

  it('infers current scene from active character locations before falling back to text tail', () => {
    const sandboxStore = useSandboxStore()
    const hero = entity({ id: 'hero', type: 'CHARACTER', name: '林照' })
    sandboxStore.entities = [hero]
    sandboxStore.stateEvents = [
      stateEvent({ id: 'loc', chapterNumber: 1, entityId: 'hero', eventType: 'LOCATION_MOVE', payload: { coordinates: { x: 4, y: 7 } } }),
    ]
    sandboxStore.currentChapter = 1

    expect(inferCurrentScene([chapter({ content: '林照推开星门大厅的门。' })])).toBe('(4, 7)')
    expect(inferCurrentScene([chapter({ content: '没有已知角色，但前文仍然需要保留连续性。' })])).toContain('前文末段')
  })

  it('builds state constraints only for involved resolved entities', () => {
    const hero = entity({ id: 'hero', type: 'CHARACTER', name: '林照' })
    const ignored = entity({ id: 'ignored', type: 'CHARACTER', name: '未出场者' })

    const constraints = buildStateConstraints([hero, ignored], {
      hero: resolved(hero, {
        properties: { status: '重伤', faction: '天工盟' },
        location: { x: 3, y: 9 },
        vitalStatus: 'alive',
      }),
      ignored: resolved(ignored, { vitalStatus: 'dead' }),
    }, ['林照'])

    expect(constraints).toContain('角色状态约束')
    expect(constraints).toContain('- 林照: 当前状态:重伤, 当前位置:(3, 9), 所属阵营:天工盟')
    expect(constraints).not.toContain('未出场者')
  })

  it('builds world info from V5 world, factions, and rules', () => {
    const sandboxStore = useSandboxStore()
    const world = entity({ id: 'world', type: 'WORLD', name: '玄苍界' })
    const faction = entity({ id: 'faction', type: 'FACTION', name: '天工盟', systemPrompt: '掌控星门工坊。' })
    const rule = entity({ id: 'rule', type: 'LORE', name: '灵能守恒', category: 'world-rule', systemPrompt: '灵能不可凭空生成。' })
    const archivedRule = entity({ id: 'archived', type: 'LORE', name: '废弃规则', category: 'world-rule', isArchived: true })
    sandboxStore.entities = [world, faction, rule, archivedRule]
    sandboxStore.stateEvents = [
      stateEvent({ id: 'era', chapterNumber: 1, entityId: 'world', eventType: 'PROPERTY_UPDATE', payload: { key: 'eraTime', value: '远未来' } }),
      stateEvent({ id: 'tech', chapterNumber: 1, entityId: 'world', eventType: 'PROPERTY_UPDATE', payload: { key: 'eraTechLevel', value: '星际文明' } }),
      stateEvent({ id: 'faction-desc', chapterNumber: 1, entityId: 'faction', eventType: 'PROPERTY_UPDATE', payload: { key: 'description', value: '负责维护星门。' } }),
      stateEvent({ id: 'rule-desc', chapterNumber: 1, entityId: 'rule', eventType: 'PROPERTY_UPDATE', payload: { key: 'description', value: '所有灵能转化必须守恒。' } }),
    ]
    sandboxStore.currentChapter = 1

    const info = buildWorldInfo(project(), chapter({}), [chapter({ content: '天工盟重新点亮星门。' })])

    expect(info).toContain('【核心世界观】')
    expect(info).toContain('名称：玄苍界')
    expect(info).toContain('时代：远未来 | 科技水平：星际文明')
    expect(info).toContain('【相关势力】')
    expect(info).toContain('天工盟：负责维护星门。')
    expect(info).toContain('灵能守恒：所有灵能转化必须守恒。')
    expect(info).not.toContain('废弃规则')
  })

  it('builds character info from outline and recent chapter mentions while skipping inactive characters', () => {
    const sandboxStore = useSandboxStore()
    const hero = entity({ id: 'hero', type: 'CHARACTER', name: '林照', importance: 'critical', systemPrompt: '主角，持有星火。' })
    const dead = entity({ id: 'dead', type: 'CHARACTER', name: '玄烬', systemPrompt: '旧敌。' })
    sandboxStore.entities = [hero, dead]
    sandboxStore.stateEvents = [
      stateEvent({ id: 'hero-status', chapterNumber: 1, entityId: 'hero', eventType: 'PROPERTY_UPDATE', payload: { key: 'status', value: '警惕' } }),
      stateEvent({ id: 'hero-loc', chapterNumber: 1, entityId: 'hero', eventType: 'LOCATION_MOVE', payload: { coordinates: { x: 1, y: 2 } } }),
      stateEvent({ id: 'dead-status', chapterNumber: 1, entityId: 'dead', eventType: 'VITAL_STATUS_CHANGE', payload: { status: 'dead' } }),
    ]
    sandboxStore.currentChapter = 1

    const info = buildCharacterInfo(
      chapter({ outline: { characters: ['林照'] } as Chapter['outline'] }),
      [chapter({ content: '林照回望玄烬倒下的地方。' })]
    )

    expect(info).toContain('【人物设定】')
    expect(info).toContain('林照')
    expect(info).toContain('主角，持有星火。')
    expect(info).not.toContain('玄烬')
  })
})
