import { describe, expect, it } from 'vitest'
import { captureSnapshot, computeStateDiff, replayReducer } from './stateDiff'
import type { Entity, StateEvent } from '@/types/sandbox'

function entity(id: string, name: string, type: Entity['type'] = 'CHARACTER'): Entity {
  return {
    id,
    projectId: 'project-1',
    type,
    name,
    aliases: [],
    importance: 'major',
    category: '',
    systemPrompt: '',
    isArchived: false,
    createdAt: 1,
  }
}

function event(input: Partial<StateEvent> & Pick<StateEvent, 'id' | 'chapterNumber' | 'entityId' | 'eventType'>): StateEvent {
  return {
    projectId: 'project-1',
    payload: {},
    source: 'AI_EXTRACTED',
    ...input,
  }
}

describe('stateDiff replay reducer', () => {
  it('replays chapter-scoped property, location, status, and ability events', () => {
    const entities = [entity('hero', '林照')]
    const events: StateEvent[] = [
      event({ id: 'e3', chapterNumber: 3, entityId: 'hero', eventType: 'VITAL_STATUS_CHANGE', payload: { status: 'dead' } }),
      event({ id: 'e1', chapterNumber: 1, entityId: 'hero', eventType: 'PROPERTY_UPDATE', payload: { key: 'mood', value: '警惕' } }),
      event({ id: 'e4', chapterNumber: 4, entityId: 'hero', eventType: 'ABILITY_CHANGE', payload: { abilityName: '星火', abilityStatus: 'sealed' } }),
      event({ id: 'e2', chapterNumber: 2, entityId: 'hero', eventType: 'LOCATION_MOVE', payload: { coordinates: { x: 12, y: 8 } } }),
    ]

    const chapter2 = replayReducer(entities, events, 2).hero
    expect(chapter2.properties).toEqual({ mood: '警惕' })
    expect(chapter2.location).toBe('12,8')
    expect(chapter2.vitalStatus).toBe('alive')
    expect(chapter2.abilities).toEqual([])

    const chapter4 = replayReducer(entities, events, 4).hero
    expect(chapter4.vitalStatus).toBe('dead')
    expect(chapter4.abilities).toEqual([{ name: '星火', status: 'sealed', acquiredChapter: 4 }])
  })

  it('applies relation add, update, and selective remove deterministically', () => {
    const entities = [entity('hero', '林照'), entity('ally', '白榆'), entity('enemy', '玄烬')]
    const events: StateEvent[] = [
      event({ id: 'rel-1', chapterNumber: 1, entityId: 'hero', eventType: 'RELATION_ADD', payload: { targetId: 'ally', relationType: 'ally', attitude: '信任' } }),
      event({ id: 'rel-2', chapterNumber: 2, entityId: 'hero', eventType: 'RELATION_ADD', payload: { targetId: 'enemy', relationType: 'enemy', attitude: '戒备' } }),
      event({ id: 'rel-3', chapterNumber: 3, entityId: 'hero', eventType: 'RELATION_UPDATE', payload: { targetId: 'ally', attitude: '怀疑' } }),
      event({ id: 'rel-4', chapterNumber: 4, entityId: 'hero', eventType: 'RELATION_REMOVE', payload: { targetId: 'enemy', relationType: 'enemy' } }),
    ]

    const state = replayReducer(entities, events, 4).hero

    expect(state.relations).toEqual([
      { targetId: 'ally', targetName: '白榆', type: 'ally', attitude: '怀疑' },
    ])
  })

  it('ignores events for unknown entities and malformed payloads', () => {
    const entities = [entity('hero', '林照')]
    const events: StateEvent[] = [
      event({ id: 'unknown', chapterNumber: 1, entityId: 'ghost', eventType: 'PROPERTY_UPDATE', payload: { key: 'mood', value: '不存在' } }),
      event({ id: 'malformed-prop', chapterNumber: 1, entityId: 'hero', eventType: 'PROPERTY_UPDATE', payload: { value: '缺 key' } }),
      event({ id: 'malformed-rel', chapterNumber: 1, entityId: 'hero', eventType: 'RELATION_ADD', payload: { targetId: 'x' } }),
    ]

    expect(replayReducer(entities, events, 1).hero).toMatchObject({
      properties: {},
      relations: [],
      location: null,
      vitalStatus: 'alive',
      abilities: [],
    })
  })

  it('captures immutable snapshots without acquired chapter implementation detail', () => {
    const entities = [entity('hero', '林照')]
    const snapshot = captureSnapshot(entities, [
      event({ id: 'ability', chapterNumber: 1, entityId: 'hero', eventType: 'ABILITY_CHANGE', payload: { abilityName: '星火', abilityStatus: 'active' } }),
    ], 1)

    expect(snapshot).toEqual([
      expect.objectContaining({
        entityId: 'hero',
        abilities: [{ name: '星火', status: 'active' }],
      }),
    ])
  })
})

describe('stateDiff diff computation', () => {
  it('reports changed properties, relations, location, status, and abilities', () => {
    const before = captureSnapshot([entity('hero', '林照'), entity('ally', '白榆')], [
      event({ id: 'before-prop', chapterNumber: 1, entityId: 'hero', eventType: 'PROPERTY_UPDATE', payload: { key: 'mood', value: '平静' } }),
      event({ id: 'before-rel', chapterNumber: 1, entityId: 'hero', eventType: 'RELATION_ADD', payload: { targetId: 'ally', relationType: 'friend' } }),
    ], 1)
    const after = captureSnapshot([entity('hero', '林照'), entity('ally', '白榆')], [
      event({ id: 'after-prop', chapterNumber: 1, entityId: 'hero', eventType: 'PROPERTY_UPDATE', payload: { key: 'mood', value: '坚定' } }),
      event({ id: 'after-loc', chapterNumber: 2, entityId: 'hero', eventType: 'LOCATION_MOVE', payload: { value: '星门' } }),
      event({ id: 'after-status', chapterNumber: 2, entityId: 'hero', eventType: 'VITAL_STATUS_CHANGE', payload: { status: 'injured' } }),
      event({ id: 'after-ability', chapterNumber: 2, entityId: 'hero', eventType: 'ABILITY_CHANGE', payload: { abilityName: '星火', abilityStatus: 'active' } }),
    ], 2)

    const categories = computeStateDiff(before, after).map(diff => diff.category)

    expect(categories).toEqual(expect.arrayContaining([
      'property_changed',
      'relation_removed',
      'location_changed',
      'vital_status_changed',
      'ability_changed',
    ]))
  })
})
