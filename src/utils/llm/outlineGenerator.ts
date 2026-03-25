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

  const outline = await callLLMWithValidation(
    getOutlineGenerationPrompt(chapters),
    outlineSchema,
    config,
    { maxRetries: 2 }
  )

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

  const prompt = `请为我的小说续写接下来的 ${count} 章大纲（从第 ${startChapter} 章开始）。

${world?.name ? '世界观：' + world.name : ''}
${world?.era ? '时代背景：' + world.era.time + '，科技水平：' + world.era.techLevel : ''}
${world?.factions?.length ? '主要势力：' + world.factions.map(f => f.name).join('、') : ''}

【主线剧情】：${existingOutline.mainPlot.name} - ${existingOutline.mainPlot.description}

【前文大纲参考（最近5章）】：
${recentOutlinesText}

请务必保持剧情的连贯性，推动主线发展，并以以下 JSON 数组格式返回新大纲（只要一个名为 chapters 的数组）：
{
  "chapters": [
    {
      "title": "第X章标题",
      "scenes": [
        { "description": "场景描述", "location": "地点", "characters": ["人物1"] }
      ],
      "characters": ["主要人物"],
      "location": "主要地点",
      "goals": ["章节目标1"],
      "conflicts": ["冲突1"],
      "resolutions": ["解决方案1"],
      "foreshadowingToPlant": ["要埋设的伏笔"],
      "foreshadowingToResolve": ["要揭示的伏笔"]
    }
  ]
}
请只返回 JSON 格式，不要有任何 Markdown 代码块标记以外的废话。`

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
      status: 'planned'
    }))
  } catch (error) {
    console.error('解析续写大纲失败:', error, jsonStr)
    throw new Error('解析续写大纲失败')
  }
}
