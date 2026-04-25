import type { Entity } from '@/types/sandbox'

export type EntityLocation = string | { x: number; y: number } | null | undefined

export function formatEntityLocation(location: EntityLocation): string {
  if (!location) return ''
  return typeof location === 'string' ? location : `(${location.x}, ${location.y})`
}

export function buildNameToIdMapFromEntities(entities: Entity[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const entity of entities) {
    map[entity.name] = entity.id
    for (const alias of entity.aliases) {
      map[alias] = entity.id
    }
  }
  return map
}
