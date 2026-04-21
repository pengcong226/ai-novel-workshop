/**
 * State Diff Engine
 *
 * Computes structured diffs between entity state snapshots at different chapters.
 * Used by the rewrite workflow to show what changed and by the UI for timeline navigation.
 *
 * Also exports the canonical `replayReducer` — the single source of truth for
 * replaying StateEvents onto Entity seeds. sandbox.ts activeEntitiesState delegates here.
 */

import type { Entity, StateEvent, EntityRelation } from '@/types/sandbox'
import type {
  EntityStateSnapshot,
  StateDiffItem,
  StateDiffReport,
  RewriteRange,
  BrokenForeshadowing,
  PlotEventRecord
} from '@/types/rewrite-continuation'

// ============================================================================
// Snapshot Capture — standalone non-reactive reducer
// ============================================================================

interface ReducedEntity {
  entityId: string
  entityName: string
  entityType: Entity['type']
  properties: Record<string, string>
  relations: Array<{ targetId: string; targetName: string; type: string; attitude?: string }>
  location: string | null
  vitalStatus: string
  abilities: Array<{ name: string; status: string; acquiredChapter: number }>
}

function isSortedByChapter(events: StateEvent[]): boolean {
  for (let i = 1; i < events.length; i++) {
    if (events[i - 1].chapterNumber > events[i].chapterNumber) {
      return false
    }
  }
  return true
}

/**
 * Canonical event-sourcing reducer — the single source of truth for replaying
 * StateEvents onto Entity seeds. Both sandbox.ts activeEntitiesState and
 * captureSnapshot() delegate to this function.
 */
export function replayReducer(
  entities: Entity[],
  stateEvents: StateEvent[],
  chapterNumber: number
): Record<string, ReducedEntity> {
  const nameMap = new Map<string, string>() // entityId → name
  const reduced: Record<string, ReducedEntity> = {}

  // Seed all entities with default state
  for (const entity of entities) {
    reduced[entity.id] = {
      entityId: entity.id,
      entityName: entity.name,
      entityType: entity.type,
      properties: {},
      relations: [],
      location: null,
      vitalStatus: 'alive',
      abilities: []
    }
    nameMap.set(entity.id, entity.name)
  }

  // Apply events in order
  const relevantEvents = isSortedByChapter(stateEvents)
    ? stateEvents
    : [...stateEvents].sort((a, b) => a.chapterNumber - b.chapterNumber)

  for (const event of relevantEvents) {
    if (event.chapterNumber > chapterNumber) {
      break
    }
    const target = reduced[event.entityId]
    if (!target) continue

    switch (event.eventType) {
      case 'PROPERTY_UPDATE':
        if (event.payload.key && event.payload.value !== undefined) {
          target.properties[event.payload.key] = event.payload.value
        }
        break
      case 'RELATION_ADD':
        if (event.payload.targetId && event.payload.relationType) {
          const targetName = nameMap.get(event.payload.targetId) || event.payload.targetId
          target.relations.push({
            targetId: event.payload.targetId,
            targetName,
            type: event.payload.relationType,
            attitude: event.payload.attitude
          })
        }
        break
      case 'RELATION_REMOVE':
        if (event.payload.targetId) {
          target.relations = target.relations.filter(
            (r: EntityRelation) => r.targetId !== event.payload.targetId ||
              (event.payload.relationType && r.type !== event.payload.relationType)
          )
        }
        break
      case 'RELATION_UPDATE':
        if (event.payload.targetId && event.payload.attitude) {
          const rel = target.relations.find((r: EntityRelation) => r.targetId === event.payload.targetId)
          if (rel) {
            rel.attitude = event.payload.attitude
          }
        }
        break
      case 'LOCATION_MOVE':
        if (event.payload.coordinates) {
          target.location = `${event.payload.coordinates.x},${event.payload.coordinates.y}`
        } else if (event.payload.value) {
          target.location = event.payload.value
        }
        break
      case 'VITAL_STATUS_CHANGE':
        if (event.payload.status) {
          target.vitalStatus = event.payload.status
        }
        break
      case 'ABILITY_CHANGE':
        if (event.payload.abilityName && event.payload.abilityStatus) {
          const existing = target.abilities.find(a => a.name === event.payload.abilityName)
          if (existing) {
            existing.status = event.payload.abilityStatus as 'active' | 'sealed' | 'lost'
          } else {
            target.abilities.push({
              name: event.payload.abilityName,
              status: event.payload.abilityStatus as 'active' | 'sealed' | 'lost',
              acquiredChapter: event.chapterNumber
            })
          }
        }
        break
    }
  }

  return reduced
}

/**
 * Replay the event-sourcing reducer up to a given chapter number
 * and return EntityStateSnapshot[].
 */
export function captureSnapshot(
  entities: Entity[],
  stateEvents: StateEvent[],
  chapterNumber: number
): EntityStateSnapshot[] {
  const reduced = replayReducer(entities, stateEvents, chapterNumber)

  // Convert to snapshot format (strip acquiredChapter from abilities)
  return Object.values(reduced).map(r => ({
    entityId: r.entityId,
    entityName: r.entityName,
    entityType: r.entityType,
    properties: { ...r.properties },
    relations: r.relations.map(rel => ({ ...rel })),
    location: r.location,
    vitalStatus: r.vitalStatus,
    abilities: r.abilities.map(a => ({ name: a.name, status: a.status }))
  }))
}

// ============================================================================
// State Diff Computation
// ============================================================================

/**
 * Compare two entity state snapshots and produce structured diffs.
 */
export function computeStateDiff(
  before: EntityStateSnapshot[],
  after: EntityStateSnapshot[]
): StateDiffItem[] {
  const diffs: StateDiffItem[] = []
  const beforeMap = new Map(before.map(s => [s.entityId, s]))
  const afterMap = new Map(after.map(s => [s.entityId, s]))

  const allIds = new Set([...beforeMap.keys(), ...afterMap.keys()])

  for (const id of allIds) {
    const b = beforeMap.get(id)
    const a = afterMap.get(id)

    // Entity added
    if (!b && a) {
      diffs.push({
        entityId: a.entityId,
        entityName: a.entityName,
        category: 'entity_added',
        description: `新实体: ${a.entityName} (${a.entityType})`,
        before: '',
        after: `${a.entityType} - ${a.entityName}`,
        accepted: null
      })
      continue
    }

    // Entity removed
    if (b && !a) {
      diffs.push({
        entityId: b.entityId,
        entityName: b.entityName,
        category: 'entity_removed',
        description: `实体消失: ${b.entityName} (${b.entityType})`,
        before: `${b.entityType} - ${b.entityName}`,
        after: '',
        accepted: null
      })
      continue
    }

    if (!b || !a) continue

    // Compare properties
    const allProps = new Set([...Object.keys(b.properties), ...Object.keys(a.properties)])
    for (const key of allProps) {
      const bv = b.properties[key]
      const av = a.properties[key]
      if (bv === undefined && av !== undefined) {
        diffs.push({
          entityId: id, entityName: a.entityName,
          category: 'property_added',
          description: `${a.entityName} 新增属性 ${key}`,
          before: '', after: av, accepted: null
        })
      } else if (bv !== undefined && av === undefined) {
        diffs.push({
          entityId: id, entityName: a.entityName,
          category: 'property_removed',
          description: `${a.entityName} 移除属性 ${key}`,
          before: bv, after: '', accepted: null
        })
      } else if (bv !== av) {
        diffs.push({
          entityId: id, entityName: a.entityName,
          category: 'property_changed',
          description: `${a.entityName} 属性 ${key} 变化`,
          before: bv || '', after: av || '', accepted: null
        })
      }
    }

    // Compare relations
    const bRels = new Set(b.relations.map(r => `${r.targetId}:${r.type}`))
    const aRels = new Set(a.relations.map(r => `${r.targetId}:${r.type}`))

    for (const rel of a.relations) {
      const key = `${rel.targetId}:${rel.type}`
      if (!bRels.has(key)) {
        diffs.push({
          entityId: id, entityName: a.entityName,
          category: 'relation_added',
          description: `${a.entityName} 新增关系 → ${rel.targetName} (${rel.type})`,
          before: '', after: `${rel.type} → ${rel.targetName}`, accepted: null
        })
      }
    }

    for (const rel of b.relations) {
      const key = `${rel.targetId}:${rel.type}`
      if (!aRels.has(key)) {
        diffs.push({
          entityId: id, entityName: b.entityName,
          category: 'relation_removed',
          description: `${b.entityName} 移除关系 → ${rel.targetName} (${rel.type})`,
          before: `${rel.type} → ${rel.targetName}`, after: '', accepted: null
        })
      }
    }

    // Check for attitude changes on existing relations
    for (const aRel of a.relations) {
      const bRel = b.relations.find(r => r.targetId === aRel.targetId && r.type === aRel.type)
      if (bRel && bRel.attitude !== aRel.attitude) {
        diffs.push({
          entityId: id, entityName: a.entityName,
          category: 'relation_changed',
          description: `${a.entityName} 对 ${aRel.targetName} 态度变化`,
          before: bRel.attitude || '未知', after: aRel.attitude || '未知', accepted: null
        })
      }
    }

    // Compare location
    if (b.location !== a.location) {
      diffs.push({
        entityId: id, entityName: a.entityName,
        category: 'location_changed',
        description: `${a.entityName} 位置变化`,
        before: b.location || '未知', after: a.location || '未知', accepted: null
      })
    }

    // Compare vital status
    if (b.vitalStatus !== a.vitalStatus) {
      diffs.push({
        entityId: id, entityName: a.entityName,
        category: 'vital_status_changed',
        description: `${a.entityName} 生死状态变化`,
        before: b.vitalStatus, after: a.vitalStatus, accepted: null
      })
    }

    // Compare abilities
    const bAbilities = new Map(b.abilities.map(a => [a.name, a.status]))
    for (const ab of a.abilities) {
      const bStatus = bAbilities.get(ab.name)
      if (bStatus === undefined) {
        diffs.push({
          entityId: id, entityName: a.entityName,
          category: 'ability_changed',
          description: `${a.entityName} 新增能力: ${ab.name} (${ab.status})`,
          before: '', after: `${ab.name}: ${ab.status}`, accepted: null
        })
      } else if (bStatus !== ab.status) {
        diffs.push({
          entityId: id, entityName: a.entityName,
          category: 'ability_changed',
          description: `${a.entityName} 能力 ${ab.name} 状态变化`,
          before: `${ab.name}: ${bStatus}`, after: `${ab.name}: ${ab.status}`, accepted: null
        })
      }
    }
  }

  return diffs
}

// ============================================================================
// Rewrite Diff Report
// ============================================================================

/**
 * Compute a full StateDiffReport for the rewrite workflow.
 */
export function computeRewriteDiffReport(
  entities: Entity[],
  stateEvents: StateEvent[],
  range: RewriteRange,
  plotEvents?: PlotEventRecord[],
  newEntities?: Entity[],
  snapshots?: {
    baselineSnapshot?: EntityStateSnapshot[]
    preRewriteSnapshot?: EntityStateSnapshot[]
  }
): StateDiffReport {
  const baselineSnapshot = snapshots?.baselineSnapshot ?? captureSnapshot(entities, stateEvents, range.start - 1)
  const preRewriteSnapshot = snapshots?.preRewriteSnapshot ?? captureSnapshot(entities, stateEvents, range.end)

  // After rewrite, re-capture with new data
  const postRewriteSnapshot = captureSnapshot(
    [...entities, ...(newEntities || [])],
    stateEvents,
    range.end
  )

  const diffs = computeStateDiff(preRewriteSnapshot, postRewriteSnapshot)

  // Check for broken foreshadowing
  const brokenForeshadowing: BrokenForeshadowing[] = []
  if (plotEvents) {
    const plantedForeshadowing = plotEvents.filter(
      e => e.type === 'foreshadowing_planted' && e.chapterNumber < range.start
    )
    for (const foreshadow of plantedForeshadowing) {
      const resolution = plotEvents.find(
        e => e.type === 'foreshadowing_resolved' &&
          e.resolvedForeshadowingFromChapter === foreshadow.chapterNumber
      )
      // If foreshadowing was resolved in the rewritten range, it's broken
      if (resolution && resolution.chapterNumber >= range.start && resolution.chapterNumber <= range.end) {
        brokenForeshadowing.push({
          plantedInChapter: foreshadow.chapterNumber,
          description: foreshadow.description,
          brokenByChapter: resolution.chapterNumber,
          reason: `伏笔在第${foreshadow.chapterNumber}章埋下，原在第${resolution.chapterNumber}章解决，该章已被改写`
        })
      }
      // If foreshadowing was supposed to be resolved after the range but the setup is changed
      if (!resolution || resolution.chapterNumber > range.end) {
        const setupChanged = diffs.some(
          d => foreshadow.involvedEntityIds.includes(d.entityId) &&
            (d.category === 'vital_status_changed' || d.category === 'entity_removed')
        )
        if (setupChanged) {
          brokenForeshadowing.push({
            plantedInChapter: foreshadow.chapterNumber,
            description: foreshadow.description,
            brokenByChapter: range.start,
            reason: `伏笔涉及的角色在第${foreshadow.chapterNumber}章埋下后状态发生重大变化`
          })
        }
      }
    }
  }

  // Find removed entity IDs
  const preIds = new Set(preRewriteSnapshot.map(s => s.entityId))
  const postIds = new Set(postRewriteSnapshot.map(s => s.entityId))
  const removedEntityIds = [...preIds].filter(id => !postIds.has(id))

  return {
    baselineSnapshot,
    preRewriteSnapshot,
    postRewriteSnapshot,
    diffs,
    brokenForeshadowing,
    newEntities: newEntities || [],
    removedEntityIds
  }
}