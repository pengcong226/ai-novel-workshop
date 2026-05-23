/**
 * LLM分析主入口
 * 协调所有分析模块的执行流程
 */

import {
  AnalysisMode,
  LLMProviderConfig,
  AnalysisProgress,
  LLMAnalysisResult,
  LLMChapter,
  LLMCharacter,
  QuickModeSampling,
  DEFAULT_QUICK_MODE_SAMPLING
} from './types'
import { getLogger } from '@/utils/logger'

const logger = getLogger('llm:analyzer')
import { cacheManager } from './cacheManager'
import { detectChaptersWithLLM } from './chapterDetector'
import { extractCharactersWithLLM } from './characterExtractor'
import { extractWorldWithLLM } from './worldExtractor'
import { generateOutlineWithLLM } from './outlineGenerator'

/**
 * 分析小说
 */
export async function analyzeNovelWithLLM(
  text: string,
  mode: AnalysisMode,
  config: LLMProviderConfig,
  quickModeSampling: QuickModeSampling = DEFAULT_QUICK_MODE_SAMPLING,
  onProgress?: (progress: AnalysisProgress) => void
): Promise<LLMAnalysisResult> {
  logger.info('开始分析，模式:', mode)
  const startTime = Date.now()

  // 检查缓存
  const _cache = await cacheManager.loadCache(text)
  const lastStage = await cacheManager.getLastStage(text)

  if (lastStage && lastStage !== 'complete') {
    logger.info('检测到未完成的分析，最后阶段:', lastStage)
    // 可以实现断点续传逻辑
  }

  try {
    // 1. 章节检测
    onProgress?.({
      stage: 'chapters',
      current: 0,
      total: 100,
      message: '检测章节...'
    })

    const chaptersResult = await detectChaptersWithLLM(
      text,
      mode,
      config,
      quickModeSampling,
      (progress) => {
        onProgress?.({
          stage: 'chapters',
          current: progress.current,
          total: 100,
          message: progress.message
        })
      }
    )

    await cacheManager.saveStage(text, mode, 'chapterDetection', chaptersResult)

    // 2. 人物识别
    onProgress?.({
      stage: 'characters',
      current: 0,
      total: 100,
      message: '识别人物...'
    })

    const extractableChapters = chaptersResult.chapters
      .filter(c => c.content !== undefined)
      .map(c => ({ number: c.number, title: c.title, content: c.content as string }))

    const charactersResult = await extractCharactersWithLLM(
      text,
      extractableChapters,
      mode,
      config,
      quickModeSampling,
      (progress) => {
        onProgress?.({
          stage: 'characters',
          current: progress.current,
          total: 100,
          message: progress.message
        })
      }
    )

    await cacheManager.saveStage(text, mode, 'characterExtraction', charactersResult)

    // 3. 世界观提取
    onProgress?.({
      stage: 'world',
      current: 0,
      total: 100,
      message: '提取世界观...'
    })

    const worldSetting = await extractWorldWithLLM(
      text,
      extractableChapters,
      mode,
      config,
      quickModeSampling,
      (progress) => {
        onProgress?.({
          stage: 'world',
          current: progress.current,
          total: 100,
          message: progress.message
        })
      }
    )

    await cacheManager.saveStage(text, mode, 'worldExtraction', worldSetting)

    // 4. 大纲生成
    onProgress?.({
      stage: 'outline',
      current: 0,
      total: 100,
      message: '生成大纲...'
    })

    const outline = await generateOutlineWithLLM(
      extractableChapters,
      config,
      (progress) => {
        onProgress?.({
          stage: 'outline',
          current: progress.current,
          total: 100,
          message: progress.message
        })
      }
    )

    await cacheManager.saveStage(text, mode, 'outlineGeneration', outline)

    // 5. 计算统计信息
    const stats = calculateStats(chaptersResult.chapters, charactersResult.characters, startTime)

    // 6. 返回完整结果
    const result: LLMAnalysisResult = {
      mode,
      chapters: chaptersResult.chapters,
      chapterPattern: chaptersResult.pattern,
      characters: charactersResult.characters,
      relationships: charactersResult.relationships,
      worldSetting,
      outline,
      stats,
      errors: []
    }

    await cacheManager.saveStage(text, mode, 'complete', result)

    onProgress?.({
      stage: 'complete',
      current: 100,
      total: 100,
      message: '分析完成'
    })

    logger.info('分析完成，耗时:', stats.analysisTime, 'ms')

    return result

  } catch (error) {
    logger.error('分析失败:', error)

    const errorResult: LLMAnalysisResult = {
      mode,
      chapters: [],
      chapterPattern: {
        pattern: '',
        examples: [],
        estimatedTotal: 0,
        confidence: 0
      },
      characters: [],
      relationships: [],
      worldSetting: {
        worldType: '',
        era: '',
        majorFactions: [],
        keyLocations: [],
        description: ''
      },
      outline: {
        mainPlot: '',
        subPlots: [],
        keyEvents: []
      },
      stats: {
        totalWords: 0,
        totalChapters: 0,
        avgWordsPerChapter: 0,
        analysisTime: Date.now() - startTime,
        tokenUsage: {
          input: 0,
          output: 0
        }
      },
      errors: [{
        stage: 'unknown',
        message: error instanceof Error ? error.message : String(error),
        retryable: false
      }]
    }

    return errorResult
  }
}

/**
 * 计算统计信息
 */
function calculateStats(
  chapters: LLMChapter[],
  _characters: LLMCharacter[],
  startTime: number
): LLMAnalysisResult['stats'] {
  const totalWords = chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0)
  const totalChapters = chapters.length
  const avgWordsPerChapter = totalChapters > 0 ? Math.round(totalWords / totalChapters) : 0

  return {
    totalWords,
    totalChapters,
    avgWordsPerChapter,
    analysisTime: Date.now() - startTime,
    tokenUsage: {
      input: 0,  // TODO: 从实际调用中累计
      output: 0
    }
  }
}

/**
 * 从缓存恢复分析
 */
export async function resumeAnalysisFromCache(
  text: string
): Promise<LLMAnalysisResult | null> {
  const cache = await cacheManager.loadCache(text)

  if (!cache || !cache.complete) {
    return null
  }

  return cache.complete
}

/**
 * 获取分析进度
 */
export async function getAnalysisProgress(
  text: string
): Promise<string | null> {
  return await cacheManager.getLastStage(text)
}
