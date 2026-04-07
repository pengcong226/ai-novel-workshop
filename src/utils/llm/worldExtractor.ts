/**
 * LLM驱动的世界观提取模块
 */

import type { LLMProviderConfig, AnalysisMode, LLMWorldSetting, AnalysisProgress, QuickModeSampling } from './types'
import { callLLMWithValidation } from './llmCaller'
import { worldSettingSchema } from './schemas'
import { selectRepresentativeChapters } from './textChunker'
import { getWorldExtractionPrompt } from './prompts/worldPrompts'

/**
 * 提取世界观
 */
export async function extractWorldWithLLM(
  _text: string,
  chapters: Array<{ number: number; content: string }>,
  mode: AnalysisMode,
  config: LLMProviderConfig,
  quickModeSampling: QuickModeSampling,
  onProgress?: (progress: AnalysisProgress) => void
): Promise<LLMWorldSetting> {
  console.log('[世界观提取] 开始，模式:', mode)

  onProgress?.({
    stage: 'world',
    current: 0,
    total: 100,
    message: '提取世界观设定...'
  })

  // 选择要分析的章节
  let chaptersToAnalyze: Array<{ number: number; content: string }>

  if (mode === 'quick') {
    // 快速模式：分析首/中/尾各5章
    chaptersToAnalyze = selectRepresentativeChapters(
      chapters,
      quickModeSampling.worldExtraction.chapters
    )
  } else {
    // 完整模式：分析所有章节
    chaptersToAnalyze = chapters
  }

  console.log('[世界观提取] 分析章节数:', chaptersToAnalyze.length)

  // 合并章节内容
  const textToAnalyze = chaptersToAnalyze
    .map(ch => ch.content)
    .join('\n\n')

  const worldSetting = (await callLLMWithValidation(
    getWorldExtractionPrompt(textToAnalyze),
    worldSettingSchema,
    config,
    { maxRetries: 2 }
  )) as any

  console.log('[世界观提取] 提取完成:', worldSetting.worldType)

  onProgress?.({
    stage: 'world',
    current: 100,
    total: 100,
    message: '世界观提取完成'
  })

  return worldSetting
}
