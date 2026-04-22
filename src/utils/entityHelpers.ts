import type { Entity } from '@/types/sandbox'

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
