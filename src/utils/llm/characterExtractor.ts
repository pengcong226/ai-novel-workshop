/**
 * LLM驱动的人物识别模块
 */

import type { LLMProviderConfig, AnalysisMode, LLMCharacter, LLMRelationship, AnalysisProgress, QuickModeSampling } from './types'
import { callLLMWithValidation } from './llmCaller'
import { characterListSchema, relationshipListSchema } from './schemas'
import { getCharacterExtractionPrompt, getRelationshipExtractionPrompt } from './prompts/characterPrompts'

/**
 * 提取人物
 */
export async function extractCharactersWithLLM(
  text: string,
  chapters: Array<{ number: number; content: string }>,
  mode: AnalysisMode,
  config: LLMProviderConfig,
  quickModeSampling: QuickModeSampling,
  onProgress?: (progress: AnalysisProgress) => void
): Promise<{ characters: LLMCharacter[]; relationships: LLMRelationship[] }> {
  console.log('[人物识别] 开始，模式:', mode)

  // 第一轮：识别主要人物
  onProgress?.({
    stage: 'characters',
    current: 0,
    total: 100,
    message: '识别主要人物...'
  })

  // 选择要分析的章节
  let chaptersToAnalyze: Array<{ number: number; content: string }>

  if (mode === 'quick') {
    // 快速模式：分析前20%章节
    const minChapters = quickModeSampling.characterExtraction.minChapters
    const maxChapters = quickModeSampling.characterExtraction.maxChapters
    const percentage = Math.ceil(chapters.length * 0.2)
    const numChapters = Math.min(maxChapters, Math.max(minChapters, percentage))
    chaptersToAnalyze = chapters.slice(0, numChapters)
  } else {
    // 完整模式：分析所有章节
    chaptersToAnalyze = chapters
  }

  console.log('[人物识别] 分析章节数:', chaptersToAnalyze.length)

  // 合并章节内容
  const textToAnalyze = chaptersToAnalyze
    .map(ch => ch.content)
    .join('\n\n')

  const characters = (await callLLMWithValidation(
    getCharacterExtractionPrompt(textToAnalyze),
    characterListSchema,
    config,
    { maxRetries: 2 }
  )) as any

  console.log('[人物识别] 识别到人物数:', characters.length)

  // 第二轮：提取人物关系
  onProgress?.({
    stage: 'characters',
    current: 50,
    total: 100,
    message: '提取人物关系...'
  })

  const relationships = (await callLLMWithValidation(
    getRelationshipExtractionPrompt(characters, textToAnalyze),
    relationshipListSchema,
    config,
    { maxRetries: 2 }
  )) as any

  console.log('[人物识别] 提取到关系数:', relationships.length)

  onProgress?.({
    stage: 'characters',
    current: 100,
    total: 100,
    message: '人物识别完成'
  })

  return { characters, relationships }
}
