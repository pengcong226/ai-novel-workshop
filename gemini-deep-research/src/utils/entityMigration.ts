/**
 * 旧 Character → 新 CharacterV3 迁移工具
 *
 * 用途：
 * 1. 数据迁移：将现有项目的角色数据升级到 V3 时序架构
 * 2. 兼容桥接：在 V3 类型与旧类型之间做无损转换
 * 3. 未来 UI 接入：为 V3 角色编辑器提供数据源
 */

import type { Character } from '@/types'
import type { CharacterV3, CharacterStateSlice, EntityRelation } from '@/types/entity'

/**
 * 将旧版 Character 转换为新版 CharacterV3
 */
export function migrateCharacterToV3(old: Character): CharacterV3 {
  // 从旧的 stateHistory 构建时序切片
  const stateTimeline: CharacterStateSlice[] = []

  // 初始状态切片
  const initialSlice: CharacterStateSlice = {
    chapterIndex: 0,
    vitalStatus: 'alive',
    physicalState: old.currentState?.status || '健康',
    location: old.currentState?.location || '未知',
    faction: old.currentState?.faction || '无',
    powerLevel: old.powerLevel || '未知',
    currentGoal: old.motivation || '',
    inventory: [],
    abilities: (old.abilities || []).map(a => ({
      name: a.name,
      status: 'active' as const,
      acquiredChapter: 0
    })),
    trigger: '初始状态'
  }
  stateTimeline.push(initialSlice)

  // 从 stateHistory 中恢复历史切片
  if (old.stateHistory && old.stateHistory.length > 0) {
    old.stateHistory.forEach(sh => {
      stateTimeline.push({
        chapterIndex: sh.chapter,
        vitalStatus: 'alive',
        physicalState: sh.status || initialSlice.physicalState,
        location: sh.location || initialSlice.location,
        faction: sh.faction || initialSlice.faction,
        powerLevel: initialSlice.powerLevel,
        currentGoal: initialSlice.currentGoal,
        inventory: [],
        abilities: initialSlice.abilities,
        trigger: sh.reason || `第${sh.chapter}章状态变更`
      })
    })
  }

  // 转换关系
  const relationships: EntityRelation[] = (old.relationships || []).map(r => ({
    targetId: r.targetId,
    targetName: r.targetId, // 真名需要在调用方填充
    type: r.type,
    intensity: 50,
    sinceChapter: r.startChapter || 0,
    description: r.description
  }))

  // 构建叙事档案
  const narrativeParts: string[] = []
  if (old.name) narrativeParts.push(`${old.name}`)
  if (old.gender) {
    const genderText = old.gender === 'male' ? '男' : old.gender === 'female' ? '女' : ''
    if (genderText) narrativeParts[0] += `，${genderText}`
  }
  if (old.age) narrativeParts[0] += `，${old.age}岁`
  narrativeParts[0] += '。'
  if (old.appearance) narrativeParts.push(`外貌：${old.appearance}`)
  if (old.background) narrativeParts.push(old.background)
  if (old.personality?.length) narrativeParts.push(`性格：${old.personality.join('、')}`)
  if (old.motivation) narrativeParts.push(`核心动机：${old.motivation}`)

  // 推断重要性
  let importance: CharacterV3['importance'] = 'minor'
  if (old.tags?.includes('protagonist')) importance = 'critical'
  else if (old.tags?.includes('antagonist')) importance = 'major'
  else if (old.tags?.includes('supporting')) importance = 'major'

  return {
    id: old.id,
    type: 'CHARACTER',
    name: old.name,
    aliases: old.aliases || [],
    isArchived: false,
    keywords: [old.name, ...(old.aliases || [])],
    createdAtChapter: 0,
    importance,

    coreIdentity: {
      gender: old.gender,
      birthChapter: 0,
      fundamentalTraits: [
        old.background,
        ...(old.personality || [])
      ].filter(Boolean).join('。')
    },

    stateTimeline,
    relationships,

    narrativeProfile: narrativeParts.filter(Boolean).join('\n'),
    lastNarrativeUpdate: 0
  }
}

/**
 * 将 CharacterV3 的最新状态同步回旧版 Character.currentState
 * 用于向后兼容：旧 UI 和旧逻辑仍然读取 currentState
 */
export function syncV3StateToLegacy(v3: CharacterV3, legacy: Character): Character {
  if (v3.stateTimeline.length === 0) return legacy

  const latest = v3.stateTimeline[v3.stateTimeline.length - 1]

  legacy.currentState = {
    location: latest.location,
    status: latest.physicalState,
    faction: latest.faction,
    updatedAt: Date.now()
  }

  return legacy
}

/**
 * 批量迁移项目中的所有角色
 */
export function migrateAllCharacters(characters: Character[]): CharacterV3[] {
  const v3Characters = characters.map(c => migrateCharacterToV3(c))

  // 填充关系中的 targetName
  for (const char of v3Characters) {
    for (const rel of char.relationships) {
      const target = v3Characters.find(c => c.id === rel.targetId)
      if (target) {
        rel.targetName = target.name
      }
    }
  }

  return v3Characters
}
