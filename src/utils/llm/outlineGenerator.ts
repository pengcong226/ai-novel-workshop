/**
 * LLM驱动的大纲生成模块
 */

import type { LLMProviderConfig, LLMOutline, AnalysisProgress } from './types'
import { callLLMWithValidation } from './llmCaller'
import { outlineSchema } from './schemas'
import { getOutlineGenerationPrompt } from './prompts/outlinePrompts'
import type { Project } from '@/types'
import { v4 as uuidv4 } from 'uuid'

/**
 * 生成大纲
 */
export async function generateOutlineWithLLM(
  chapters: Array<{ number: number; title: string; content: string }>,
  config: LLMProviderConfig,
  onProgress?: (progress: AnalysisProgress) => void
): Promise<LLMOutline> {
  console.log('[大纲生成] 开始')

  onProgress?.({
    stage: 'outline',
    current: 0,
    total: 100,
    message: '生成大纲...'
  })

  const outline = (await callLLMWithValidation(
    getOutlineGenerationPrompt(chapters),
    outlineSchema,
    config,
    { maxRetries: 2 }
  )) as any

  console.log('[大纲生成] 生成完成')

  onProgress?.({
    stage: 'outline',
    current: 100,
    total: 100,
    message: '大纲生成完成'
  })

  return outline
}

/**
 * 滚动生成（续写）大纲
 * 当现有章节大纲不足时，根据前文大纲和世界观继续生成后续大纲
 */
export async function extendOutlineWithLLM(
  project: Project,
  startChapter: number,
  count: number = 20
): Promise<any[]> {
  const { useAIStore } = await import('@/stores/ai')
  const aiStore = useAIStore()
  if (!aiStore.checkInitialized()) throw new Error('AI未初始化')

  const world = project.world
  const existingOutline = project.outline

  // 获取最近的5章大纲作为续写参考
  const recentOutlines = existingOutline.chapters.slice(Math.max(0, existingOutline.chapters.length - 5))
  const recentOutlinesText = recentOutlines.map(c => 
    `第${existingOutline.chapters.indexOf(c) + 1}章 ${c.title}\n目标: ${c.goals.join(',')}\n冲突: ${c.conflicts.join(',')}\n解决: ${c.resolutions.join(',')}`
  ).join('\n\n')

  // 提取未解决的伏笔 (Horizon Pre-fetch)
  const unresolvedForeshadowings = existingOutline.foreshadowings.filter(f => f.status === 'planted')
  const foreshadowingText = unresolvedForeshadowings.length > 0 
    ? unresolvedForeshadowings.map(f => `- [第${f.plantChapter}章埋下] ${f.description}`).join('\n')
    : '无'

  // 构建 Horizon Outline 推演 Prompt
  const prompt = `你现在是一位顶级网文架构大神的独立人格。请为目前的小说做推演并续写接下来的 ${count} 章大纲（从第 ${startChapter} 章开始）。

【设定坐标系】：
${world?.name ? '世界观：' + world.name : ''}
${world?.era ? '时代背景：' + world.era.time + '，科技水平：' + world.era.techLevel : ''}
${world?.factions?.length ? '主要势力：' + world.factions.map((f: any) => f.name).join('、') : ''}

【主线锚点】：${existingOutline.mainPlot.name} - ${existingOutline.mainPlot.description}

【待回收/悬而未决的因果线（伏笔）】：
${foreshadowingText}

【当前剧情节点（最近5章，推演基石）】：
${recentOutlinesText}

【工作要求】：
1. 剧情严密连贯：基于当前节点，推动主线锚点，不要原地灌水或突然跳跃。
2. 填坑动作：若剧情合适可以利用起上述“未干预期”的因果线/伏笔并标明回收。
3. 返回格式：必须以原生 JSON 返回，不要附加 markdown代码块之外的废话！

返回的 JSON 的格式要求如下：
{
  "_thought": "简短的推演思考过程：分析当前困局，推导接下来这几十章如何打破僵局、主角如何升级/揭秘，如何布局高潮",
  "chapters": [
    {
      "title": "第X章标题",
      "scenes": [
        { "description": "场景详细推演（什么人做了什么事）", "location": "某地点", "characters": ["张三", "李四"] }
      ],
      "characters": ["本章所有出场人物"],
      "location": "本章主舞台",
      "goals": ["主角/反派本章的核心目的1"],
      "conflicts": ["本章遭遇了什么阻力/冲突"],
      "resolutions": ["如何解决上述冲突的，取得了什么进展"],
      "foreshadowingToPlant": ["如果本章埋下了新伏笔，请写在这里，否则留空数组"],
      "foreshadowingToResolve": ["如果本章解决或提到了过去的伏笔，请写在这里，否则留空数组"]
    }
  ]
}`

  const messages = [{ role: 'user' as const, content: prompt }]
  const aiContext = { type: 'outline' as const, complexity: 'high' as const, priority: 'quality' as const }

  console.log(`[大纲续写] 开始生成第 ${startChapter} 到 ${startChapter + count - 1} 章大纲...`)
  
  const maxTokens = project.config?.advancedSettings?.maxTokens || 4000
  const response = await aiStore.chat(messages, aiContext, { maxTokens })

  let jsonStr = response.content.trim()
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1]
  } else {
    // 暴力提取花括号包裹的 JSON 对象
    const startIdx = jsonStr.indexOf('{')
    const endIdx = jsonStr.lastIndexOf('}')
    if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
      jsonStr = jsonStr.substring(startIdx, endIdx + 1)
    }
  }

  try {
    const parsed = JSON.parse(jsonStr)
    const newChapters = parsed.chapters || []
    
    return newChapters.map((c: any) => ({
      chapterId: uuidv4(),
      title: c.title || '',
      scenes: c.scenes?.map((s: any) =>
        typeof s === 'string' ? { id: uuidv4(), description: s, location: '', characters: [] } : { id: uuidv4(), ...s }
      ) || [],
      characters: c.characters || [],
      location: c.location || '',
      goals: c.goals || [],
      conflicts: c.conflicts || [],
      resolutions: c.resolutions || [],
      foreshadowingToPlant: c.foreshadowingToPlant || [],
      foreshadowingToResolve: c.foreshadowingToResolve || [],
      status: 'planned',
      generationPrompt: '' // 占位
    }))
  } catch (error) {
    console.error('解析续写大纲失败:', error, jsonStr)
    throw new Error('解析续写大纲失败')
  }
}
