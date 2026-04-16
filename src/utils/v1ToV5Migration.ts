/**
 * V1 到 V5 架构迁移脚本
 * 
 * 将旧版 Character 数据转换为 V5 的 Entity + StateEvent 架构
 * 支持修仙小说设定（powerLevel 重要性推断）
 */

import type { Character, Ability, Relationship, WorldSetting } from '../types'
import type { WorldbookEntry } from '../types/worldbook'
import type { Entity, StateEvent, EntityImportance, EntityType } from '../types/sandbox'

/**
 * 迁移结果
 */
export interface MigrationResult {
  entities: Entity[]
  stateEvents: StateEvent[]
}

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return crypto.randomUUID()
}

/**
 * 根据 powerLevel 推断实体重要性
 * 
 * 修仙等级参考（从高到低）：
 * - 大乘、渡劫 -> critical
 * - 合体、炼虚、元婴 -> critical  
 * - 金丹、筑基 -> major
 * - 练气、凡人 -> minor
 */
function inferImportance(powerLevel?: string): EntityImportance {
  if (!powerLevel) return 'major'
  
  const criticalLevels = ['大乘', '渡劫', '合体', '炼虚', '元婴']
  const majorLevels = ['金丹', '筑基']
  
  const upperLevel = powerLevel.toUpperCase()
  
  if (criticalLevels.some(level => upperLevel.includes(level.toUpperCase()))) {
    return 'critical'
  }
  
  if (majorLevels.some(level => upperLevel.includes(level.toUpperCase()))) {
    return 'major'
  }
  
  return 'minor'
}

/**
 * 将单个 Character 转换为 Entity
 */
function characterToEntity(character: Character, projectId: string): Entity {
  return {
    id: character.id,
    projectId,
    type: 'CHARACTER' as EntityType,
    name: character.name,
    aliases: character.aliases || [],
    importance: inferImportance(character.powerLevel),
    category: character.gender === 'male' ? '男性角色' : character.gender === 'female' ? '女性角色' : '其他',
    systemPrompt: buildCharacterPrompt(character),
    isArchived: character.isArchived || false,
    createdAt: Date.now()
  }
}

/**
 * 构建 Character 的系统提示词
 */
function buildCharacterPrompt(character: Character): string {
  const parts: string[] = []
  
  parts.push(`【${character.name}】`)
  
  if (character.aliases.length > 0) {
    parts.push(`别名：${character.aliases.join('、')}`)
  }
  
  parts.push(`性别：${character.gender === 'male' ? '男' : character.gender === 'female' ? '女' : '其他'}`)
  parts.push(`年龄：${character.age}`)
  
  if (character.powerLevel) {
    parts.push(`修为：${character.powerLevel}`)
  }
  
  parts.push(`外貌：${character.appearance}`)
  parts.push(`性格：${character.personality.join('、')}`)
  parts.push(`价值观：${character.values.join('、')}`)
  parts.push(`背景：${character.background}`)
  parts.push(`动机：${character.motivation}`)
  
  if (character.abilities.length > 0) {
    parts.push(`能力：${character.abilities.map(a => `${a.name}(${a.level})`).join('、')}`)
  }
  
  return parts.join('\n')
}

/**
 * 将 Character 关系转换为 RELATION_ADD StateEvent
 */
function relationshipsToEvents(
  character: Character,
  projectId: string
): StateEvent[] {
  return character.relationships.map((rel: Relationship) => ({
    id: generateId(),
    projectId,
    chapterNumber: rel.startChapter || 1,
    entityId: character.id,
    eventType: 'RELATION_ADD' as const,
    payload: {
      targetId: rel.targetId,
      relationType: rel.type,
      attitude: rel.description
    },
    source: 'MIGRATION' as const
  }))
}

/**
 * 将 Character 能力转换为 ABILITY_CHANGE StateEvent
 */
function abilitiesToEvents(
  character: Character,
  projectId: string
): StateEvent[] {
  return character.abilities.map((ability: Ability) => ({
    id: generateId(),
    projectId,
    chapterNumber: 1,
    entityId: character.id,
    eventType: 'ABILITY_CHANGE' as const,
    payload: {
      abilityName: ability.name,
      abilityStatus: ability.level
    },
    source: 'MIGRATION' as const
  }))
}

/**
 * 将 Character 当前状态转换为 StateEvent
 */
function currentStateToEvents(
  character: Character,
  projectId: string
): StateEvent[] {
  const events: StateEvent[] = []
  
  if (!character.currentState) return events
  
  const { currentState } = character
  
  // 位置迁移
  if (currentState.location) {
    events.push({
      id: generateId(),
      projectId,
      chapterNumber: 1,
      entityId: character.id,
      eventType: 'LOCATION_MOVE' as const,
      payload: {
        value: currentState.location
      },
      source: 'MIGRATION' as const
    })
  }
  
  // 状态更新（健康状态、身体状况等）
  if (currentState.status || currentState.physicalState) {
    events.push({
      id: generateId(),
      projectId,
      chapterNumber: 1,
      entityId: character.id,
      eventType: 'PROPERTY_UPDATE' as const,
      payload: {
        key: 'status',
        value: currentState.physicalState || currentState.status
      },
      source: 'MIGRATION' as const
    })
  }
  
  // 生存状态
  if (currentState.vitalStatus) {
    events.push({
      id: generateId(),
      projectId,
      chapterNumber: 1,
      entityId: character.id,
      eventType: 'VITAL_STATUS_CHANGE' as const,
      payload: {
        status: currentState.vitalStatus
      },
      source: 'MIGRATION' as const
    })
  }
  
  // 势力归属
  if (currentState.faction) {
    events.push({
      id: generateId(),
      projectId,
      chapterNumber: 1,
      entityId: character.id,
      eventType: 'PROPERTY_UPDATE' as const,
      payload: {
        key: 'faction',
        value: currentState.faction
      },
      source: 'MIGRATION' as const
    })
  }
  
  return events
}

/**
 * 将 WorldSetting 转换为 V5 Entity + StateEvent
 *
 * 映射规则：
 * - 世界本体 -> WORLD entity
 * - 势力 -> FACTION entities
 * - 地点 -> LOCATION entities
 * - 世界规则 -> LORE entities
 * - 力量体系 -> LORE entity
 */
export function worldSettingToEntities(
  world: WorldSetting,
  projectId: string
): MigrationResult {
  const entities: Entity[] = []
  const stateEvents: StateEvent[] = []

  // 1. WORLD entity
  const worldEntityId = generateId()
  const worldSystemPrompt = [
    `【${world.name || '未命名世界'}】`,
    world.era?.time ? `时代：${world.era.time}` : '',
    world.era?.techLevel ? `科技水平：${world.era.techLevel}` : '',
    world.era?.socialForm ? `社会形态：${world.era.socialForm}` : ''
  ].filter(Boolean).join('\n')

  entities.push({
    id: worldEntityId,
    projectId,
    type: 'WORLD' as EntityType,
    name: world.name || '未命名世界',
    aliases: [],
    importance: 'critical',
    category: 'world-core',
    systemPrompt: worldSystemPrompt,
    isArchived: false,
    createdAt: Date.now()
  })

  // Era PROPERTY_UPDATE events
  if (world.era?.time) {
    stateEvents.push({
      id: generateId(),
      projectId,
      chapterNumber: 0,
      entityId: worldEntityId,
      eventType: 'PROPERTY_UPDATE' as const,
      payload: { key: 'eraTime', value: world.era.time },
      source: 'MIGRATION' as const
    })
  }
  if (world.era?.techLevel) {
    stateEvents.push({
      id: generateId(),
      projectId,
      chapterNumber: 0,
      entityId: worldEntityId,
      eventType: 'PROPERTY_UPDATE' as const,
      payload: { key: 'eraTechLevel', value: world.era.techLevel },
      source: 'MIGRATION' as const
    })
  }
  if (world.era?.socialForm) {
    stateEvents.push({
      id: generateId(),
      projectId,
      chapterNumber: 0,
      entityId: worldEntityId,
      eventType: 'PROPERTY_UPDATE' as const,
      payload: { key: 'eraSocialForm', value: world.era.socialForm },
      source: 'MIGRATION' as const
    })
  }

  // PowerSystem is stored as a dedicated LORE entity (created below),
  // no need for a duplicate PROPERTY_UPDATE on the WORLD entity.

  // 2. FACTION entities
  for (const faction of world.factions) {
    const factionEntityId = generateId()
    entities.push({
      id: factionEntityId,
      projectId,
      type: 'FACTION' as EntityType,
      name: faction.name,
      aliases: [],
      importance: 'major',
      category: faction.type || 'faction',
      systemPrompt: faction.description || '',
      isArchived: false,
      createdAt: Date.now()
    })

    // Preserve V1 faction ID for cross-referencing
    stateEvents.push({
      id: generateId(),
      projectId,
      chapterNumber: 0,
      entityId: factionEntityId,
      eventType: 'PROPERTY_UPDATE' as const,
      payload: { key: 'factionId', value: faction.id },
      source: 'MIGRATION' as const
    })
  }

  // 3. LOCATION entities
  const importanceMap: Record<string, EntityImportance> = {
    high: 'critical',
    medium: 'major',
    low: 'minor'
  }

  for (const location of world.geography?.locations || []) {
    const locationEntityId = generateId()
    entities.push({
      id: locationEntityId,
      projectId,
      type: 'LOCATION' as EntityType,
      name: location.name,
      aliases: [],
      importance: importanceMap[location.importance] || 'minor',
      category: location.type || 'location',
      systemPrompt: location.description || '',
      isArchived: false,
      createdAt: Date.now()
    })

    // Faction association
    if (location.factionId) {
      stateEvents.push({
        id: generateId(),
        projectId,
        chapterNumber: 0,
        entityId: locationEntityId,
        eventType: 'PROPERTY_UPDATE' as const,
        payload: { key: 'factionId', value: location.factionId },
        source: 'MIGRATION' as const
      })
    }

    // Coordinates from position
    if (location.position) {
      stateEvents.push({
        id: generateId(),
        projectId,
        chapterNumber: 0,
        entityId: locationEntityId,
        eventType: 'LOCATION_MOVE' as const,
        payload: { coordinates: { x: location.position.x, y: location.position.y } },
        source: 'MIGRATION' as const
      })
    }
  }

  // 4. LORE entities for world rules
  for (const rule of world.rules) {
    entities.push({
      id: generateId(),
      projectId,
      type: 'LORE' as EntityType,
      name: rule.name,
      aliases: [],
      importance: 'major',
      category: 'world-rule',
      systemPrompt: rule.description || '',
      isArchived: false,
      createdAt: Date.now()
    })
  }

  // 5. LORE entity for power system
  if (world.powerSystem) {
    const levelDescriptions = world.powerSystem.levels
      ?.map(l => `${l.name}: ${l.description}`)
      .join('\n') || ''
    const powerSystemPrompt = [
      `力量体系：${world.powerSystem.name || '力量体系'}`,
      levelDescriptions
    ].filter(Boolean).join('\n')

    entities.push({
      id: generateId(),
      projectId,
      type: 'LORE' as EntityType,
      name: world.powerSystem.name || '力量体系',
      aliases: [],
      importance: 'critical',
      category: 'power-system',
      systemPrompt: powerSystemPrompt,
      isArchived: false,
      createdAt: Date.now()
    })
  }

  return { entities, stateEvents }
}

/**
 * 将 WorldbookEntry[] 转换为 V5 LORE Entity + StateEvent
 */
export function worldbookEntriesToEntities(
  entries: WorldbookEntry[],
  projectId: string
): MigrationResult {
  const entities: Entity[] = []
  const stateEvents: StateEvent[] = []

  for (const entry of entries) {
    const entityId = generateId()
    const name = entry.comment || entry.title || entry.key?.[0] || '未命名条目'

    entities.push({
      id: entityId,
      projectId,
      type: 'LORE' as EntityType,
      name,
      aliases: entry.key || entry.keys || [],
      importance: entry.constant ? 'critical' : 'minor',
      category: entry.novelWorkshop?.category || entry.category || 'general',
      systemPrompt: entry.content || '',
      isArchived: !!(entry.disable || entry.enabled === false),
      createdAt: Date.now()
    })

    // Preserve worldbook UID for stable cross-referencing
    if (entry.uid != null) {
      stateEvents.push({
        id: generateId(),
        projectId,
        chapterNumber: 0,
        entityId,
        eventType: 'PROPERTY_UPDATE' as const,
        payload: { key: 'worldbookUid', value: String(entry.uid) },
        source: 'MIGRATION' as const
      })
    }

    // Preserve worldbook position
    if (entry.position) {
      stateEvents.push({
        id: generateId(),
        projectId,
        chapterNumber: 0,
        entityId,
        eventType: 'PROPERTY_UPDATE' as const,
        payload: { key: 'worldbookPosition', value: entry.position },
        source: 'MIGRATION' as const
      })
    }

    // Preserve worldbook order
    if (entry.order != null) {
      stateEvents.push({
        id: generateId(),
        projectId,
        chapterNumber: 0,
        entityId,
        eventType: 'PROPERTY_UPDATE' as const,
        payload: { key: 'worldbookOrder', value: String(entry.order) },
        source: 'MIGRATION' as const
      })
    }
  }

  return { entities, stateEvents }
}

/**
 * 完整 V1 到 V5 迁移：角色 + 世界观 + 世界书
 *
 * 合并三部分迁移结果，返回统一的 Entity + StateEvent 集合
 */
export function migrateV1ToV5Full(
  projectData: {
    characters?: Character[]
    world?: WorldSetting
    worldbook?: { entries?: WorldbookEntry[] }
  },
  projectId: string
): MigrationResult {
  const allEntities: Entity[] = []
  const allStateEvents: StateEvent[] = []

  // 1. Character migration
  const charResult = migrateV1ToV5(projectData.characters || [], projectId)
  allEntities.push(...charResult.entities)
  allStateEvents.push(...charResult.stateEvents)

  // 2. WorldSetting migration
  if (projectData.world) {
    const worldResult = worldSettingToEntities(projectData.world, projectId)
    allEntities.push(...worldResult.entities)
    allStateEvents.push(...worldResult.stateEvents)
  }

  // 3. Worldbook migration
  if (projectData.worldbook?.entries) {
    const wbResult = worldbookEntriesToEntities(projectData.worldbook.entries, projectId)
    allEntities.push(...wbResult.entities)
    allStateEvents.push(...wbResult.stateEvents)
  }

  return { entities: allEntities, stateEvents: allStateEvents }
}

/**
 * 主迁移函数：将 V1 Character 数组转换为 V5 Entity + StateEvent
 * 
 * @param characters - 旧版 Character 数组
 * @param projectId - 项目 ID
 * @returns 迁移结果，包含 entities 和 stateEvents
 * 
 * @example
 * ```ts
 * import { migrateV1ToV5 } from './v1ToV5Migration'
 * 
 * const characters = project.characters
 * const { entities, stateEvents } = migrateV1ToV5(characters, project.id)
 * 
 * // 保存到 V5 存储
 * entities.forEach(e => sandboxStore.addEntity(e))
 * stateEvents.forEach(e => sandboxStore.addStateEvent(e))
 * ```
 */
export function migrateV1ToV5(
  characters: Character[],
  projectId: string
): MigrationResult {
  const entities: Entity[] = []
  const stateEvents: StateEvent[] = []
  
  for (const character of characters) {
    // 跳过已归档的角色（可选，根据需求调整）
    // if (character.isArchived) continue
    
    // 1. Character -> Entity
    entities.push(characterToEntity(character, projectId))
    
    // 2. relationships -> RELATION_ADD events
    stateEvents.push(...relationshipsToEvents(character, projectId))
    
    // 3. abilities -> ABILITY_CHANGE events
    stateEvents.push(...abilitiesToEvents(character, projectId))
    
    // 4. currentState -> LOCATION_MOVE, PROPERTY_UPDATE, VITAL_STATUS_CHANGE events
    stateEvents.push(...currentStateToEvents(character, projectId))
  }
  
  return { entities, stateEvents }
}
