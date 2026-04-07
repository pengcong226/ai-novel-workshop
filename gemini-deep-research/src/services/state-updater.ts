/**
 * 增量状态更新引擎 V3
 *
 * PGVU 闭环中 Update 阶段的核心实现
 * 采用增量 diff + 双重验证，替代高风险的全量重写
 *
 * 流程：
 * 1. 提取器 (Extractor)：从新章节中提取状态变更意图
 * 2. 验证器 (Verifier)：在原文中查找引文支撑，拒绝幻觉
 * 3. 应用器 (Applier)：将验证通过的变更写入角色状态
 */

import type {
  StateShift, NarrativeDiff, StateUpdateResult
} from '@/types/entity'
import type { Character } from '@/types'
import { safeParseAIJson } from '@/utils/safeParseAIJson'
import { useAIStore } from '@/stores/ai'
import type { ChatMessage } from '@/types/ai'

// ===== 步骤1：提取器 =====

/**
 * 从新章节中提取状态变更
 * 输入当前角色状态 + 新章节内容
 * 输出增量 StateShift 和 NarrativeDiff
 */
export async function extractStateShifts(
  chapterContent: string,
  involvedCharacters: Character[],
  chapterIndex: number
): Promise<{ shifts: StateShift[], narrativeDiffs: NarrativeDiff[] }> {
  const aiStore = useAIStore()

  const characterSummary = involvedCharacters.map(c => {
    const state = c.currentState
    return `- ${c.name}(${c.id}): 状态=${state?.status || '未知'}, 位置=${state?.location || '未知'}, 阵营=${state?.faction || '未知'}`
  }).join('\n')

  const prompt = `你是一个精确的叙事状态追踪系统。分析以下新章节，提取所有角色状态的变更。

【当前角色状态】
${characterSummary}

【新章节内容（第${chapterIndex}章）】
${chapterContent.substring(0, 12000)}

请输出严格的 JSON 格式（不要任何其他文字）：
{
  "shifts": [
    {
      "entityId": "角色ID",
      "entityName": "角色名",
      "field": "变更字段(physicalState/location/faction/currentGoal/vitalStatus/powerLevel)",
      "oldValue": "旧值",
      "newValue": "新值",
      "evidence": "原文中支撑此变更的直接引用（30字以内的关键句）"
    }
  ],
  "narrativeDiffs": [
    {
      "entityId": "角色ID",
      "additions": ["需要添加到叙事档案的新信息"],
      "removals": ["需要删除的过时信息"]
    }
  ]
}

规则：
- 只输出实际发生了变化的字段
- evidence 必须是章节原文的直接引用
- 如果没有变化，返回空数组
- 不要推测或假设章节中未明确描述的变化`

  const messages: ChatMessage[] = [
    { role: 'system', content: '你是一个精确的叙事状态追踪系统。只输出 JSON，不要解释。' },
    { role: 'user', content: prompt }
  ]

  try {
    const response = await aiStore.chat(messages, {
      type: 'check',
      complexity: 'medium',
      priority: 'quality'
    })

    const parsed = safeParseAIJson<{ shifts: StateShift[], narrativeDiffs: NarrativeDiff[] }>(response.content)
    return parsed || { shifts: [], narrativeDiffs: [] }
  } catch (error) {
    console.error('[StateUpdater] 提取器调用失败:', error)
    return { shifts: [], narrativeDiffs: [] }
  }
}

// ===== 步骤2：验证器 =====

/**
 * 验证状态变更在原文中有引文支撑
 * 拒绝幻觉——如果 evidence 在原文中找不到，则拒绝该变更
 */
export function verifyStateShifts(
  shifts: StateShift[],
  chapterContent: string
): { approved: StateShift[], rejected: StateShift[] } {
  const approved: StateShift[] = []
  const rejected: StateShift[] = []

  // V3-fix: 预计算不变量，避免循环内重复正则替换
  const normalizedContent = chapterContent.replace(/[\s，。！？、；：""''（）\u00a0]/g, '')
  const paragraphs = chapterContent.split(/\n{2,}|\r\n{2,}/)

  for (const shift of shifts) {
    if (!shift.evidence || shift.evidence.length < 3) {
      rejected.push(shift)
      continue
    }

    // 去除标点和空格后做模糊匹配
    const normalizedEvidence = shift.evidence.replace(/[\s，。！？、；：""''（）\u00a0]/g, '')

    if (normalizedEvidence.length >= 4 && normalizedContent.includes(normalizedEvidence)) {
      approved.push(shift)
    } else {
      // V3-fix: 降级匹配要求角色名 + 状态关键词在同一段落中共现
      // 避免 "重伤"、"死亡" 等常见词在任意战斗章节中误匹配
      const keywords = shift.newValue.split(/[，,、\s]+/).filter(w => w.length >= 2)
      const hasCoOccurrence = keywords.length > 0 && paragraphs.some(p =>
        p.includes(shift.entityName) && keywords.some(kw => p.includes(kw))
      )

      if (hasCoOccurrence) {
        approved.push(shift)
      } else {
        console.warn(`[StateUpdater] 拒绝幻觉变更: ${shift.entityName}.${shift.field} → "${shift.newValue}"，原文无支撑`)
        rejected.push(shift)
      }
    }
  }

  return { approved, rejected }
}

// ===== 步骤3：应用器 =====

/**
 * 将验证通过的状态变更应用到角色（兼容旧 Character 类型）
 */
export function applyStateShiftsToCharacter(
  character: Character,
  approvedShifts: StateShift[],
  _chapterIndex: number
): Character {
  if (approvedShifts.length === 0) return character

  // 确保 currentState 存在
  if (!character.currentState) {
    character.currentState = {
      location: '',
      status: '',
      faction: '',
      updatedAt: Date.now()
    }
  }

  for (const shift of approvedShifts) {
    switch (shift.field) {
      case 'location':
        character.currentState.location = shift.newValue
        break
      case 'physicalState':
        character.currentState.status = shift.newValue
        break
      case 'faction':
        character.currentState.faction = shift.newValue
        break
      case 'vitalStatus':
        character.currentState.status = shift.newValue
        break
      case 'powerLevel':
        // V3-fix: 覆盖旧等级标注，而非无限追加
        if (shift.newValue) {
          const baseStatus = (character.currentState.status || '').replace(/（[^）]*）$/, '')
          character.currentState.status = baseStatus + `（${shift.newValue}）`
        }
        break
    }
    character.currentState.updatedAt = Date.now()
  }

  return character
}

/**
 * 执行完整的增量状态追踪管线
 * 提取 → 验证 → 应用
 */
export async function runStateUpdatePipeline(
  chapterContent: string,
  characters: Character[],
  chapterIndex: number
): Promise<StateUpdateResult> {
  // 找出本章出场角色
  const involvedCharacters = characters.filter(c =>
    chapterContent.includes(c.name)
  )

  if (involvedCharacters.length === 0) {
    return { appliedShifts: [], rejectedShifts: [], narrativeDiffs: [] }
  }

  // 1. 提取
  const { shifts, narrativeDiffs } = await extractStateShifts(
    chapterContent,
    involvedCharacters,
    chapterIndex
  )

  // 2. 验证
  const { approved, rejected } = verifyStateShifts(shifts, chapterContent)

  // 3. 应用
  for (const shift of approved) {
    const char = characters.find(c => c.name === shift.entityName || c.id === shift.entityId)
    if (char) {
      applyStateShiftsToCharacter(char, [shift], chapterIndex)
    }
  }

  return {
    appliedShifts: approved,
    rejectedShifts: rejected,
    narrativeDiffs
  }
}
