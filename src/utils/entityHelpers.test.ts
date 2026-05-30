import { describe, it, expect } from 'vitest'
import { formatEntityLocation, buildNameToIdMapFromEntities } from './entityHelpers'
import type { Entity } from '@/types/sandbox'

function makeEntity(overrides: Partial<Entity> & Pick<Entity, 'id' | 'name'>): Entity {
  return {
    projectId: 'project-1',
    type: 'CHARACTER',
    aliases: [],
    importance: 'major',
    category: '',
    systemPrompt: '',
    isArchived: false,
    createdAt: 1,
    ...overrides,
  }
}

describe('formatEntityLocation', () => {
  it('returns empty string for null', () => {
    expect(formatEntityLocation(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(formatEntityLocation(undefined)).toBe('')
  })

  it('returns empty string for empty string', () => {
    expect(formatEntityLocation('')).toBe('')
  })

  it('returns the string directly when given a string', () => {
    expect(formatEntityLocation('星门')).toBe('星门')
  })

  it('formats coordinates as "(x, y)" when given an object', () => {
    expect(formatEntityLocation({ x: 12, y: 8 })).toBe('(12, 8)')
  })

  it('formats zero coordinates correctly', () => {
    expect(formatEntityLocation({ x: 0, y: 0 })).toBe('(0, 0)')
  })

  it('formats negative coordinates correctly', () => {
    expect(formatEntityLocation({ x: -3, y: -7 })).toBe('(-3, -7)')
  })

  it('formats large coordinates correctly', () => {
    expect(formatEntityLocation({ x: 9999, y: 10000 })).toBe('(9999, 10000)')
  })
})

describe('buildNameToIdMapFromEntities', () => {
  it('returns empty map for empty entities array', () => {
    expect(buildNameToIdMapFromEntities([])).toEqual({})
  })

  it('maps entity name to entity id', () => {
    const entities = [makeEntity({ id: 'hero-1', name: '林照' })]
    const map = buildNameToIdMapFromEntities(entities)
    expect(map['林照']).toBe('hero-1')
  })

  it('maps entity aliases to entity id', () => {
    const entities = [makeEntity({ id: 'hero-1', name: '林照', aliases: ['小林', '林少侠'] })]
    const map = buildNameToIdMapFromEntities(entities)
    expect(map['小林']).toBe('hero-1')
    expect(map['林少侠']).toBe('hero-1')
    expect(map['林照']).toBe('hero-1')
  })

  it('handles multiple entities', () => {
    const entities = [
      makeEntity({ id: 'hero-1', name: '林照', aliases: ['小林'] }),
      makeEntity({ id: 'ally-1', name: '白榆', aliases: ['榆姐'] }),
    ]
    const map = buildNameToIdMapFromEntities(entities)
    expect(map['林照']).toBe('hero-1')
    expect(map['小林']).toBe('hero-1')
    expect(map['白榆']).toBe('ally-1')
    expect(map['榆姐']).toBe('ally-1')
  })

  it('overwrites earlier entry when multiple entities share the same name/alias', () => {
    const entities = [
      makeEntity({ id: 'first', name: '同名', aliases: [] }),
      makeEntity({ id: 'second', name: '同名', aliases: [] }),
    ]
    const map = buildNameToIdMapFromEntities(entities)
    // Last entity wins
    expect(map['同名']).toBe('second')
  })

  it('handles entities with no aliases', () => {
    const entities = [makeEntity({ id: 'id-1', name: '无别名', aliases: [] })]
    const map = buildNameToIdMapFromEntities(entities)
    expect(Object.keys(map)).toEqual(['无别名'])
  })

  it('handles entities with many aliases', () => {
    const entities = [
      makeEntity({
        id: 'multi-alias',
        name: '正式名',
        aliases: ['别名1', '别名2', '别名3', '别名4'],
      }),
    ]
    const map = buildNameToIdMapFromEntities(entities)
    expect(Object.keys(map)).toHaveLength(5)
    for (const key of ['正式名', '别名1', '别名2', '别名3', '别名4']) {
      expect(map[key]).toBe('multi-alias')
    }
  })

  it('handles entity names that look like aliases of another', () => {
    const entities = [
      makeEntity({ id: 'a', name: '张三', aliases: ['李四'] }),
      makeEntity({ id: 'b', name: '李四', aliases: ['张三'] }),
    ]
    const map = buildNameToIdMapFromEntities(entities)
    // Second entity overwrites the first's alias/name
    expect(map['张三']).toBe('b')
    expect(map['李四']).toBe('b')
  })
})
