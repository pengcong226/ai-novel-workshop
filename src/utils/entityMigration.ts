import type { Character } from '@/types'
import type { CharacterV3, CharacterStateSlice } from '@/types/entity'

/**
 * 将旧版 Character 转换为新版 CharacterV3
 * 用于数据迁移和兼容
 */
export function migrateCharacterToV3(old: Character): CharacterV3 {
  const initialSlice: CharacterStateSlice = {
    chapterIndex: 0,
    vitalStatus: 'alive',
    physicalState: (old as any).currentState?.status || '健康',
    location: (old as any).currentState?.location || '未知',
    faction: (old as any).currentState?.faction || '无',
    powerLevel: (old as any).powerLevel || '未知',
    currentGoal: (old as any).motivation || '',
    inventory: [],
    abilities: ((old as any).abilities || []).map((a: any) => ({
      name: a.name,
      status: 'active' as const,
      acquiredChapter: 0
    })),
    trigger: '初始状态'
  }

  return {
    id: old.id,
    type: 'CHARACTER',
    name: old.name,
    aliases: old.aliases || [],
    isArchived: false,
    keywords: [old.name, ...(old.aliases || [])],
    createdAtChapter: 0,
    importance: (old as any).tags?.includes('protagonist') ? 'critical' :
                (old as any).tags?.includes('supporting') ? 'major' : 'minor',

    coreIdentity: {
      gender: (old as any).gender || 'other',
      birthChapter: 0,
      fundamentalTraits: [
        (old as any).background,
        ...((old as any).personality || [])
      ].filter(Boolean).join('。')
    },

    stateTimeline: [initialSlice],
    relationships: ((old as any).relationships || []).map((r: any) => ({
      targetId: r.targetId || r.characterId,
      targetName: r.targetId || r.characterId, // 需后续填充真名
      type: r.type,
      intensity: 50,
      sinceChapter: r.startChapter || 0,
      description: r.description
    })),

    narrativeProfile: [
      `${old.name}，${(old as any).gender === 'male' ? '男' : (old as any).gender === 'female' ? '女' : ''}。`,
      (old as any).background,
      (old as any).personality?.length ? `性格特征：${(old as any).personality.join('、')}` : '',
      (old as any).motivation ? `核心动机：${(old as any).motivation}` : ''
    ].filter(Boolean).join('\n'),

    lastNarrativeUpdate: 0
  }
}