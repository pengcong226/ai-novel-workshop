import { useAIStore } from '@/stores/ai'
import type { Project, ChapterOutline } from '@/types'
import type { ChatMessage } from '@/types/ai'
import { safeParseAIJson } from '../safeParseAIJson'

export interface RetconValidationResult {
  passed: boolean;
  reason?: string;
  suggestedFixPrompt?: string;
  violations?: string[];  // V3: 具体违规分类列表
}

/**
 * 防吃书与逻辑冲突验证器 V3（哨兵模型）
 *
 * V3 升级点：
 * 1. 检查全文（最多 8000 字符），而非仅前 3000 字
 * 2. 使用统一的 safeParseAIJson 解析
 * 3. 注入更丰富的角色状态（位置、阵营、物品等）
 * 4. 基于 ConStory-Bench 5大类验证矩阵
 */
export async function validateChapterLogic(
  project: Project,
  chapterOutline: ChapterOutline,
  generatedContent: string
): Promise<RetconValidationResult> {
  const aiStore = useAIStore()
  if (!aiStore.checkInitialized()) {
    return { passed: true }
  }

  // 构建世界法则约束
  const rules = project.world?.rules?.map(r => r.name + ': ' + r.description).join('\n') || '无明确世界法则。'

  // V3: 更丰富的角色状态信息
  const charactersInvolved = (chapterOutline.characters || []).map(charName => {
    const char = project.characters.find(c => c.name === charName)
    if (char) {
      const state = char.currentState
      const parts = [`${char.name}`]
      if (char.background) parts.push(`身份:${char.background.substring(0, 40)}`)
      if (state?.status) parts.push(`状态:${state.status}`)
      if (state?.location) parts.push(`位置:${state.location}`)
      if (state?.faction) parts.push(`阵营:${state.faction}`)
      // 能力列表
      if (char.abilities && char.abilities.length > 0) {
        parts.push(`能力:${char.abilities.map(a => a.name).join('、')}`)
      }
      return parts.join(' | ')
    }
    return charName
  }).join('\n')

  // V3-fix: 段落边界感知的截取，避免在对话中间切断导致验证器误报
  let contentForReview = generatedContent
  if (generatedContent.length > 8000) {
    // 找到前 4000 字符附近的段落边界
    const headEnd = generatedContent.lastIndexOf('\n', 4000)
    const headCut = headEnd > 3000 ? headEnd : 4000
    // 找到倒数 4000 字符附近的段落边界
    const tailStart = generatedContent.indexOf('\n', generatedContent.length - 4000)
    const tailCut = tailStart > 0 && tailStart < generatedContent.length - 3000
      ? tailStart
      : generatedContent.length - 4000
    contentForReview = generatedContent.substring(0, headCut)
      + '\n\n...(中段省略)...\n\n'
      + generatedContent.substring(tailCut)
  }

  const prompt = `你是一个铁面无私的"网文逻辑审查官"（哨兵模型）。
你的任务是审查最新章节的小说正文，判断它是否严重违背了世界观法则、人物状态、或基本逻辑。
只抓严重的"吃书"漏洞，忽略细节瑕疵。

【审查矩阵 — 五大类违规】
1. 时间线与情节逻辑：事件顺序矛盾、无因之果、被遗弃的伏笔
2. 角色塑造：已死角色出场、记忆矛盾、技能波动、性格突变
3. 世界观与规则：力量体系违规、地理位置矛盾、社会规范冲突
4. 事实与细节：外貌/武器/名称不匹配、数量不一致
5. 叙事与风格：视角混乱（无意中切换人称）、语调突变

【全局约束】
世界法则：
${rules}

本章涉及人物及状态记录：
${charactersInvolved}

本章原定大纲目标：
${(chapterOutline.goals || []).join('；') || '无明确目标'}

【被审查的正文】
${contentForReview}

请逐项检查上述五大类，做出裁决。以 JSON 格式输出：
{
  "passed": true或false,
  "reason": "如果false，指出具体吃书指控",
  "violations": ["违规类别1: 具体描述", "违规类别2: 具体描述"],
  "suggestedFixPrompt": "如果false，给写作模型的修正指令"
}`

  const messages: ChatMessage[] = [
    { role: 'system', content: '你是严格输出原生 JSON 的逻辑审查程序。不要输出 markdown 标记。' },
    { role: 'user', content: prompt }
  ]

  try {
    const response = await aiStore.chat(
      messages,
      { type: 'check', complexity: 'low', priority: 'speed' },
      { maxTokens: 1000 }
    )

    const result = safeParseAIJson<RetconValidationResult>(response.content)
    if (result && typeof result.passed === 'boolean') {
      return result
    }

    return { passed: true }
  } catch (err) {
    console.warn('[防吃书哨兵] 检测解析失败，为防止死锁，默认放行。', err)
    return { passed: true }
  }
}
