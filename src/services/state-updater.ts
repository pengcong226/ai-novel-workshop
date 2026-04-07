import type { CharacterV3, CharacterStateSlice } from '@/types/entity'
import { safeParseAIJson } from '@/utils/safeParseAIJson'
import { useAIStore } from '@/stores/ai'
import type { ChatMessage } from '@/types/ai'

/**
 * AI 提取的状态变更意图
 */
export interface StateShift {
  entityId: string
  entityName: string
  field: string
  oldValue: string
  newValue: string
  evidence: string  // 原文中的引文支撑
}

/**
 * 叙事档案增量变更
 */
export interface NarrativeDiff {
  entityId: string
  additions: string[]   // 需要添加到档案的内容
  removals: string[]    // 需要从档案中删除的内容
}

export interface UpdateResult {
  appliedShifts: StateShift[]
  rejectedShifts: StateShift[]
  narrativeDiffs: NarrativeDiff[]
}

/**
 * 步骤1：提取器 - 从新章节中提取状态变更
 */
export async function extractStateShifts(
  chapterContent: string,
  involvedCharacters: CharacterV3[],
  chapterIndex: number
): Promise<{ shifts: StateShift[], narrativeDiffs: NarrativeDiff[] }> {
  const aiStore = useAIStore()

  const characterSummary = involvedCharacters.map(c => {
    const latest = c.stateTimeline[c.stateTimeline.length - 1]
    return `- ${c.name}(${c.id}): 状态=${latest?.physicalState || '未知'}, 位置=${latest?.location || '未知'}, 目标=${latest?.currentGoal || '未知'}`
  }).join('\n')

  const prompt = `你是一个精确的状态追踪系统。请分析以下新章节内容，提取所有角色状态的变更。

【当前角色状态】
${characterSummary}

【新章节内容（第${chapterIndex}章）】
${chapterContent}

请输出 JSON 格式：
{
  "shifts": [
    {
      "entityId": "角色ID",
      "entityName": "角色名",
      "field": "变更的字段(physicalState/location/faction/currentGoal/vitalStatus)",
      "oldValue": "旧值",
      "newValue": "新值",
      "evidence": "原文中支撑此变更的具体引用文本(必须是原文的直接引用)"
    }
  ],
  "narrativeDiffs": [
    {
      "entityId": "角色ID",
      "additions": ["需要添加到叙事档案的新信息"],
      "removals": ["需要从叙事档案中删除的过时信息"]
    }
  ]
}

注意：
- 只输出实际发生了变化的字段
- evidence 字段必须是章节原文中的直接引用
- 如果没有变化，返回空数组`

  const messages: ChatMessage[] = [
    { role: 'system', content: '你是一个精确的叙事状态追踪系统。只输出 JSON，不要解释。' },
    { role: 'user', content: prompt }
  ]

  const response = await aiStore.chat(messages, {
    type: 'check',
    complexity: 'medium',
    priority: 'quality'
  })

  const parsed = safeParseAIJson<{ shifts: StateShift[], narrativeDiffs: NarrativeDiff[] }>(response.content)
  return parsed || { shifts: [], narrativeDiffs: [] }
}

/**
 * 步骤2：验证器 - 验证状态变更在原文中有引文支撑
 */
export function verifyStateShifts(
  shifts: StateShift[],
  chapterContent: string
): { approved: StateShift[], rejected: StateShift[] } {
  const approved: StateShift[] = []
  const rejected: StateShift[] = []

  for (const shift of shifts) {
    // 检查 evidence 是否真的出现在原文中
    // 使用模糊匹配（去除空格和标点后比较）
    const normalizedContent = chapterContent.replace(/[\s\p{P}]/gu, '')
    const normalizedEvidence = shift.evidence.replace(/[\s\p{P}]/gu, '')

    if (normalizedEvidence.length > 5 && normalizedContent.includes(normalizedEvidence)) {
      approved.push(shift)
    } else {
      // 降级：检查是否有核心关键词匹配
      const keywords = shift.newValue.split(/[，,、\s]+/).filter(w => w.length >= 2)
      const hasKeywordSupport = keywords.some(kw => chapterContent.includes(kw))

      if (hasKeywordSupport) {
        approved.push(shift)
      } else {
        console.warn(`[StateUpdater] 拒绝幻觉变更: ${shift.entityName}.${shift.field} → ${shift.newValue}，原文无支撑`)
        rejected.push(shift)
      }
    }
  }

  return { approved, rejected }
}

/**
 * 步骤3：应用已验证的状态变更
 */
export function applyStateShifts(
  character: CharacterV3,
  approvedShifts: StateShift[],
  chapterIndex: number
): CharacterV3 {
  if (approvedShifts.length === 0) return character

  // 复制最新的状态切片
  const latest = character.stateTimeline[character.stateTimeline.length - 1]
  const newSlice: CharacterStateSlice = {
    ...JSON.parse(JSON.stringify(latest)),
    chapterIndex,
    trigger: approvedShifts.map(s => `${s.field}: ${s.oldValue} → ${s.newValue}`).join('; ')
  }

  // 应用每个变更
  for (const shift of approvedShifts) {
    switch (shift.field) {
      case 'physicalState': newSlice.physicalState = shift.newValue; break
      case 'location': newSlice.location = shift.newValue; break
      case 'faction': newSlice.faction = shift.newValue; break
      case 'currentGoal': newSlice.currentGoal = shift.newValue; break
      case 'vitalStatus':
        newSlice.vitalStatus = shift.newValue as any
        if (shift.newValue === 'dead') {
          character.coreIdentity.deathChapter = chapterIndex
        }
        break
      case 'powerLevel': newSlice.powerLevel = shift.newValue; break
    }
  }

  // 追加新切片（不覆盖旧的）
  character.stateTimeline.push(newSlice)
  return character
}

/**
 * 应用叙事档案的增量更新
 */
export function applyNarrativeDiff(
  character: CharacterV3,
  diff: NarrativeDiff,
  chapterIndex: number
): CharacterV3 {
  let profile = character.narrativeProfile

  // 添加新内容
  for (const addition of diff.additions) {
    profile += '\n' + addition
  }

  // 删除过时内容（简单的文本替换）
  for (const removal of diff.removals) {
    profile = profile.replace(removal, '')
  }

  // 清理多余空行
  profile = profile.replace(/\n{3,}/g, '\n\n').trim()

  character.narrativeProfile = profile
  character.lastNarrativeUpdate = chapterIndex
  return character
}

export async function runStateUpdatePipeline(
  chapterContent: string,
  involvedCharacters: CharacterV3[],
  chapterIndex: number
): Promise<UpdateResult> {
  const { shifts, narrativeDiffs } = await extractStateShifts(chapterContent, involvedCharacters, chapterIndex)
  const { approved, rejected } = verifyStateShifts(shifts, chapterContent)

  for (const shift of approved) {
    const character = involvedCharacters.find(c => c.id === shift.entityId || c.name === shift.entityName)
    if (character) {
      applyStateShifts(character, [shift], chapterIndex)
    }
  }

  for (const diff of narrativeDiffs) {
    const character = involvedCharacters.find(c => c.id === diff.entityId)
    if (character) {
      applyNarrativeDiff(character, diff, chapterIndex)
    }
  }

  return {
    appliedShifts: approved,
    rejectedShifts: rejected,
    narrativeDiffs
  }
}