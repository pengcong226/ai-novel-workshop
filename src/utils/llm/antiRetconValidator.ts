import { useAIStore } from '@/stores/ai'
import type { Project, ChapterOutline } from '@/types'
import type { ChatMessage } from '@/types/ai'
import { safeParseAIJson } from '../safeParseAIJson'
import { sanitizeForPrompt } from '@/utils/inputSanitizer'

export interface RetconViolation {
  category: string;       // ConStory-Bench 编码，如 "A3", "D1", "E2"
  description: string;    // 具体描述
  evidence?: string;      // 原文引用
}

export interface RetconValidationResult {
  passed: boolean;
  reason?: string;
  suggestedFixPrompt?: string;
  violations?: RetconViolation[];  // V4: ConStory-Bench 19 项结构化违规
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

  const safeRules = sanitizeForPrompt(rules, { maxLength: rules.length, escapeBraces: false })
  const safeCharacters = sanitizeForPrompt(charactersInvolved, { maxLength: charactersInvolved.length, escapeBraces: false })
  const safeContentForReview = sanitizeForPrompt(contentForReview, { maxLength: contentForReview.length })
  const safeGoals = sanitizeForPrompt((chapterOutline.goals || []).join('；') || '无明确目标', { maxLength: 1000 })

  const prompt = `你是一个铁面无私的"网文逻辑审查官"（哨兵模型）。
你的任务是审查最新章节的小说正文，判断它是否严重违背了世界观法则、人物状态、或基本逻辑。
只抓严重的"吃书"漏洞，忽略细节瑕疵和主观文学判断。

【审查矩阵 — ConStory-Bench 19 项校验协议】

A. 角色塑造 (Character Portrayal)
  A1. 记忆矛盾：角色遗忘或错误引用自己经历的事件
  A2. 知识冲突：角色知晓了不应知道的信息（元知识泄漏）
  A3. 技能波动：角色能力水平未经合理铺垫突然变化
  A4. 性格突变：角色核心性格特质无因偏移

B. 事实与细节 (Factual Details)
  B1. 外貌不匹配：角色外貌描述与设定矛盾
  B2. 命名混淆：角色/地点/物品名称前后不一致
  B3. 数量错误：人数、距离、金额等数值矛盾
  B4. 物品归属：物品所有权或位置与此前设定冲突

C. 叙事与风格 (Narrative Style)
  C1. 视角偏移：无意中切换叙述人称或视角
  C2. 语气不一：同一角色对话风格突然改变
  C3. 文体断裂：行文风格与前文不连贯

D. 时间线与情节 (Timeline & Plot)
  D1. 绝对时间矛盾：具体日期/时刻前后冲突
  D2. 持续时间错误：事件持续时长不合理
  D3. 因果违背：结果发生在原因之前
  D4. 已解决伏笔重复：已收束的暗线被再次展开

E. 世界观 (World Building)
  E1. 核心规则违背：力量/魔法体系自相矛盾
  E2. 地理矛盾：地点间距离/方位描述与地图设定冲突
  E3. 社会规范冲突：角色行为逻辑违背所设定的社会结构
  E4. 科技水平偏差：出现超出或低于世界观科技水平的元素

【全局约束】
世界法则：
${safeRules}

本章涉及人物及状态记录：
${safeCharacters}

本章原定大纲目标：
${safeGoals}

【被审查的正文】
${safeContentForReview}

请逐项检查上述 19 项，做出裁决。以 JSON 格式输出：
{
  "passed": true或false,
  "reason": "如果false，一句话概括主要问题",
  "violations": [
    { "category": "编码如A3", "description": "具体描述", "evidence": "原文中支撑此判定的关键句（30字以内）" }
  ],
  "suggestedFixPrompt": "如果false，给写作模型的修正指令"
}`

  const messages: ChatMessage[] = [
    { role: 'system', content: '你是严格输出原生 JSON 的逻辑审查程序。不要输出 markdown 标记。只关注严重的逻辑冲突，不要吹毛求疵。' },
    { role: 'user', content: prompt }
  ]

  try {
    const response = await aiStore.chat(
      messages,
      { type: 'check', complexity: 'low', priority: 'speed' },
      { maxTokens: 1000, response_format: { type: 'json_object' } }
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
