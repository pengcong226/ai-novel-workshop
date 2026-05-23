/**
 * 自动摘要生成系统
 *
 * 核心功能：
 * 1. 为每章生成摘要（200-500字）
 * 2. 滑动窗口摘要策略
 * 3. 多层次摘要（章节→卷→全书）
 * 4. 自动提取关键信息
 * 5. 在章节完成时自动触发
 */

import type { Chapter } from '@/types'
import { useAIStore } from '@/stores/ai'
import { SUMMARY_SYSTEM_PROMPT } from './systemPrompts'
import { safeParseAIJson } from './safeParseAIJson'
import { getLogger } from '@/utils/logger'
const logger = getLogger('utils:summarizer')

/**
 * 摘要层级
 */
export enum SummaryLevel {
  CHAPTER = 'chapter',      // 章节摘要
  VOLUME = 'volume',        // 卷摘要
  BOOK = 'book'            // 全书摘要
}

/**
 * 摘要详细度
 */
export enum SummaryDetail {
  FULL = 'full',           // 完整内容（最近3章）
  DETAILED = 'detailed',   // 详细摘要（500字，4-10章前）
  BRIEF = 'brief',         // 简要摘要（200字，11-30章前）
  MINIMAL = 'minimal'      // 极简摘要（100字，30章前）
}

/**
 * 章节摘要接口
 */
export interface ChapterSummaryData {
  id: string
  chapterNumber: number
  title: string
  summary: string              // 摘要内容
  keyEvents: string[]          // 关键事件
  characters: string[]         // 出场人物
  locations: string[]          // 场景地点
  plotProgression: string      // 剧情推进描述
  emotionalTone?: string       // 情感基调
  conflicts?: string[]         // 冲突
  resolutions?: string[]       // 解决方案
  wordCount: number            // 原文字数
  summaryWordCount: number     // 摘要字数
  tokenCount: number           // token数估算
  createdAt: Date              // 创建时间
  updatedAt: Date              // 更新时间
  level: SummaryLevel
  detail: SummaryDetail
  sourceHash?: string          // 正文哈希
  summaryVersion?: number      // 摘要版本
}

/**
 * 卷摘要接口
 */
export interface VolumeSummaryData {
  id: string
  volumeNumber: number
  volumeTitle: string
  startChapter: number
  endChapter: number
  summary: string
  mainEvents: string[]
  characterArcs: string[]
  theme: string
  createdAt: Date
  updatedAt: Date
}

/**
 * 摘要生成配置
 */
export interface SummaryConfig {
  targetLength: number         // 目标字数
  maxTokens: number            // 最大token数
  extractKeywords: boolean     // 是否提取关键词
  analyzeEmotion: boolean      // 是否分析情感
  extractConflict: boolean     // 是否提取冲突
  provider?: string            // 指定AI提供商
  model?: string               // 指定模型
  currentChapterNumber?: number // 当前最新章节号
}

/**
 * 摘要质量检查结果
 */
export interface SummaryQualityCheck {
  isValid: boolean
  issues: string[]
  suggestions: string[]
  score: number  // 0-10
  completeness: number  // 0-1，关键信息完整度
  coherence: number  // 0-1，连贯性
  conciseness: number  // 0-1，简洁性
}

export const SUMMARY_GENERATION_VERSION = 2

/**
 * 简单的token计数（中文：1字≈1.5token，英文：1词≈1token）
 */
export function estimateTokens(text: string): number {
  if (!text) return 0

  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length
  const otherChars = text.length - chineseChars - englishWords

  return Math.ceil(chineseChars * 1.5 + englishWords * 1.2 + otherChars * 0.5)
}

/**
 * 根据章节距离确定摘要详细度
 */
export function determineSummaryDetail(
  chapterNumber: number,
  currentChapterNumber: number
): SummaryDetail {
  const distance = currentChapterNumber - chapterNumber

  if (distance <= 3) {
    return SummaryDetail.FULL
  } else if (distance <= 10) {
    return SummaryDetail.DETAILED
  } else if (distance <= 30) {
    return SummaryDetail.BRIEF
  } else {
    return SummaryDetail.MINIMAL
  }
}

/**
 * 根据详细度确定目标长度
 */
export function getTargetLength(detail: SummaryDetail): number {
  switch (detail) {
    case SummaryDetail.FULL:
      return 0  // 完整内容不生成摘要
    case SummaryDetail.DETAILED:
      return 500
    case SummaryDetail.BRIEF:
      return 200
    case SummaryDetail.MINIMAL:
      return 100
    default:
      return 200
  }
}

export function createContentHash(content: string): string {
  let hash = 0

  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash + content.charCodeAt(i)) | 0
  }

  return `summary-${Math.abs(hash)}`
}

function buildFallbackSummary(
  chapter: Chapter,
  targetLength: number,
  detail: SummaryDetail
): ChapterSummaryData {
  const normalizedContent = chapter.content.replace(/\s+/g, ' ').trim()
  const fragments = normalizedContent
    .split(/[。！？!?]/)
    .map(fragment => fragment.trim())
    .filter(Boolean)

  const fallbackSummary = fragments
    .slice(0, Math.max(2, Math.min(5, Math.ceil(targetLength / 80))))
    .join('。')
    .slice(0, Math.max(targetLength, 120))

  const summary = fallbackSummary || normalizedContent.slice(0, Math.max(targetLength, 120))
  const keyEvents = fragments.slice(0, 3).map(fragment => fragment.slice(0, 40))

  return {
    id: `summary-${chapter.id}`,
    chapterNumber: chapter.number,
    title: chapter.title,
    summary,
    keyEvents,
    characters: [],
    locations: [],
    plotProgression: keyEvents.join('；'),
    wordCount: chapter.wordCount,
    summaryWordCount: summary.length,
    tokenCount: estimateTokens(summary),
    createdAt: new Date(),
    updatedAt: new Date(),
    level: SummaryLevel.CHAPTER,
    detail,
    sourceHash: createContentHash(chapter.content),
    summaryVersion: SUMMARY_GENERATION_VERSION
  }
}

function validateSummaryContent(summary: string, chapter: Chapter, targetLength: number): boolean {
  const normalizedSummary = summary.trim()

  if (!normalizedSummary) {
    return false
  }

  const maxAllowedLength = Math.min(
    Math.max(targetLength * 1.8, 150),
    Math.ceil(chapter.content.length * 0.35)
  )

  if (normalizedSummary.length > maxAllowedLength) {
    return false
  }

  if (normalizedSummary === chapter.content.trim()) {
    return false
  }

  return true
}

/**
 * 生成章节摘要
 */
export async function generateChapterSummary(
  chapter: Chapter,
  config?: Partial<SummaryConfig>
): Promise<ChapterSummaryData> {
  const aiStore = useAIStore()

  if (!aiStore.checkInitialized()) {
    throw new Error('AI服务未初始化，请先配置模型')
  }

  const currentChapterNumber = config?.currentChapterNumber || chapter.number + 4
  const rawDetail = determineSummaryDetail(chapter.number, currentChapterNumber)
  const detail = rawDetail === SummaryDetail.FULL ? SummaryDetail.DETAILED : rawDetail
  const targetLength = config?.targetLength || getTargetLength(detail)
  const prompt = buildSummaryPrompt(chapter, targetLength, config)
  const sourceHash = createContentHash(chapter.content)

  try {
    const messages = [{
      role: 'user' as const,
      content: prompt
    }]

    const response = await aiStore.chat(messages, {
      type: 'check',
      complexity: 'medium',
      priority: 'balanced'
    }, {
      maxTokens: Math.min(config?.maxTokens || Math.max(targetLength * 4, 600), 1200),
      temperature: 0.3
    })

    const parsedSummary = parseSummaryResponse(response.content, chapter, targetLength)
    const result: ChapterSummaryData = {
      ...parsedSummary,
      wordCount: chapter.wordCount,
      summaryWordCount: parsedSummary.summary.length,
      tokenCount: estimateTokens(parsedSummary.summary),
      createdAt: new Date(),
      updatedAt: new Date(),
      level: SummaryLevel.CHAPTER,
      detail,
      sourceHash,
      summaryVersion: SUMMARY_GENERATION_VERSION
    }

    if (!validateSummaryContent(result.summary, chapter, targetLength)) {
      logger.warn(`第${chapter.number}章摘要未通过压缩校验，使用降级摘要`)
      return buildFallbackSummary(chapter, targetLength, detail)
    }

    const quality = checkSummaryQuality(result)
    if (!quality.isValid) {
      logger.warn(`第${chapter.number}章摘要质量较低，使用降级摘要`, quality.issues)
      return buildFallbackSummary(chapter, targetLength, detail)
    }

    return result
  } catch (error) {
    logger.error('生成摘要失败，使用降级摘要:', error)
    return buildFallbackSummary(chapter, targetLength, detail)
  }
}

/**
 * 构建摘要生成提示词
 */
function buildSummaryPrompt(
  chapter: Chapter,
  targetLength: number,
  config?: Partial<SummaryConfig>
): string {
  const parts: string[] = []

  parts.push(SUMMARY_SYSTEM_PROMPT)
  parts.push('')
  parts.push(`请为以下章节生成一份${targetLength}字左右的高密度摘要，目标是原文长度的10%-20%。`)
  parts.push('')
  parts.push('【章节信息】')
  parts.push(`标题：第${chapter.number}章 ${chapter.title}`)
  parts.push(`字数：${chapter.wordCount}字`)
  parts.push('')
  parts.push('【章节内容】')
  parts.push(chapter.content)
  parts.push('')
  parts.push('【摘要要求】')
  parts.push('1. 必须压缩原文，不得直接复述整章或复制原文大段句子')
  parts.push(`2. 控制在${targetLength}字左右，允许上下浮动20%`)
  parts.push('3. 提炼关键事件、角色状态变化、新增设定、伏笔与冲突')
  parts.push('4. 保留关键因果链与剧情推进，不写空泛评价')
  parts.push('5. 使用客观、信息密集的中文，避免文学化铺写')

  if (config?.analyzeEmotion) {
    parts.push('6. 补充情感基调')
  }

  if (config?.extractConflict) {
    parts.push('7. 补充冲突与解决情况')
  }

  parts.push('')
  parts.push('【输出格式】')
  parts.push('只返回合法 JSON，不要使用 Markdown 代码块：')
  parts.push('{')
  parts.push('  "summary": "摘要内容",')
  parts.push('  "keyEvents": ["事件1", "事件2"],')
  parts.push('  "characters": ["人物1", "人物2"],')
  parts.push('  "locations": ["地点1", "地点2"],')
  parts.push('  "plotProgression": "剧情推进描述",')
  parts.push('  "emotionalTone": "情感基调",')
  parts.push('  "conflicts": ["冲突1"],')
  parts.push('  "resolutions": ["解决1"]')
  parts.push('}')

  return parts.join('\n')
}

/**
 * 解析摘要响应
 */
function parseSummaryResponse(
  response: string,
  chapter: Chapter,
  targetLength: number
): Omit<ChapterSummaryData, 'wordCount' | 'summaryWordCount' | 'tokenCount' | 'createdAt' | 'updatedAt' | 'level' | 'detail'> {
  try {
    const data = safeParseAIJson<any>(response)
    if (!data) throw new Error('无法解析摘要 JSON')

    return {
      id: `summary-${chapter.id}`,
      chapterNumber: chapter.number,
      title: chapter.title,
      summary: data.summary || '',
      keyEvents: data.keyEvents || [],
      characters: data.characters || [],
      locations: data.locations || [],
      plotProgression: data.plotProgression || '',
      emotionalTone: data.emotionalTone,
      conflicts: data.conflicts || [],
      resolutions: data.resolutions || []
    }
  } catch (error) {
    logger.error('解析摘要响应失败:', error)
    logger.info('原始响应:', response)

    // 如果解析失败，返回一个基本摘要
    return {
      id: `summary-${chapter.id}`,
      chapterNumber: chapter.number,
      title: chapter.title,
      summary: response.substring(0, targetLength),
      keyEvents: [],
      characters: [],
      locations: [],
      plotProgression: ''
    }
  }
}

/**
 * 质量检查
 */
export function checkSummaryQuality(summary: ChapterSummaryData): SummaryQualityCheck {
  const issues: string[] = []
  const suggestions: string[] = []
  let score = 10

  // 检查摘要长度
  const targetLength = getTargetLength(summary.detail)
  if (targetLength > 0) {
    const lengthRatio = summary.summaryWordCount / targetLength

    if (lengthRatio < 0.7) {
      issues.push(`摘要过短（${summary.summaryWordCount}字，建议${targetLength}字）`)
      score -= 2
      suggestions.push('建议补充更多关键信息')
    } else if (lengthRatio > 1.5) {
      issues.push(`摘要过长（${summary.summaryWordCount}字，建议${targetLength}字）`)
      score -= 1
      suggestions.push('建议精简冗余内容')
    }
  }

  // 检查关键信息完整度
  let completeness = 1.0

  if (summary.keyEvents.length === 0) {
    issues.push('缺少关键事件')
    score -= 1
    completeness -= 0.25
    suggestions.push('建议提取主要事件')
  }

  if (summary.characters.length === 0) {
    issues.push('缺少出场人物')
    score -= 0.5
    completeness -= 0.15
    suggestions.push('建议标注出场人物')
  }

  if (summary.locations.length === 0) {
    issues.push('缺少场景地点')
    score -= 0.5
    completeness -= 0.1
    suggestions.push('建议标注场景地点')
  }

  if (!summary.plotProgression || summary.plotProgression.length === 0) {
    issues.push('缺少剧情推进描述')
    score -= 1
    completeness -= 0.25
    suggestions.push('建议描述剧情推进')
  }

  // 检查连贯性（简单检查）
  let coherence = 1.0
  if (summary.summary.length > 50) {
    // 检查是否有连接词
    const connectors = ['然后', '接着', '随后', '于是', '但是', '然而', '因此', '所以']
    const hasConnector = connectors.some(c => summary.summary.includes(c))

    if (!hasConnector) {
      coherence -= 0.2
      suggestions.push('建议添加连接词提升连贯性')
    }
  }

  // 检查简洁性
  let conciseness = 1.0
  if (summary.summaryWordCount > 0) {
    // 简单检查重复词汇
    const words = summary.summary.split(/\s+/)
    const uniqueWords = new Set(words)
    const repetitionRate = 1 - (uniqueWords.size / words.length)

    if (repetitionRate > 0.3) {
      conciseness -= repetitionRate * 0.5
      score -= 1
      suggestions.push('建议减少重复表述')
    }
  }

  return {
    isValid: score >= 6,
    issues,
    suggestions,
    score: Math.max(0, score),
    completeness,
    coherence,
    conciseness
  }
}

/**
 * 批量生成摘要
 */
export async function batchGenerateSummaries(
  chapters: Chapter[],
  onProgress?: (current: number, total: number, chapter: Chapter) => void
): Promise<ChapterSummaryData[]> {
  const summaries: ChapterSummaryData[] = []

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i]

    if (onProgress) {
      onProgress(i + 1, chapters.length, chapter)
    }

    try {
      const summary = await generateChapterSummary(chapter)
      summaries.push(summary)

      // 短暂延迟，避免API请求过快
      if (i < chapters.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    } catch (error) {
      logger.error(`生成第${chapter.number}章摘要失败:`, error)
      // 继续处理下一章
    }
  }

  return summaries
}

/**
 * 合并多个章节摘要为卷摘要
 */
export async function mergeToVolumeSummary(
  summaries: ChapterSummaryData[],
  volumeNumber: number,
  volumeTitle: string
): Promise<VolumeSummaryData> {
  const aiStore = useAIStore()

  if (!aiStore.checkInitialized()) {
    throw new Error('AI服务未初始化')
  }

  // 构建合并提示词
  const prompt = buildMergePrompt(summaries, volumeNumber, volumeTitle)

  try {
    const messages = [{
      role: 'user' as const,
      content: prompt
    }]

    const response = await aiStore.chat(messages, {
      type: 'check',
      complexity: 'medium',
      priority: 'balanced'
    }, {
      maxTokens: 1500,
      temperature: 0.7
    })

    const data = safeParseAIJson<any>(response.content)
    if (!data) throw new Error('无法解析摘要 JSON')

    return {
      id: `volume-summary-${volumeNumber}`,
      volumeNumber,
      volumeTitle,
      startChapter: Math.min(...summaries.map(s => s.chapterNumber)),
      endChapter: Math.max(...summaries.map(s => s.chapterNumber)),
      summary: data.summary || '',
      mainEvents: data.mainEvents || [],
      characterArcs: data.characterArcs || [],
      theme: data.theme || '',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  } catch (error) {
    logger.error('生成卷摘要失败:', error)
    throw error
  }
}

/**
 * 构建合并提示词
 */
function buildMergePrompt(
  summaries: ChapterSummaryData[],
  volumeNumber: number,
  volumeTitle: string
): string {
  const parts: string[] = []

  parts.push('你是一位专业的小说编辑，擅长提炼和整合信息。')
  parts.push('')
  parts.push(`请将以下章节摘要合并为第${volumeNumber}卷"${volumeTitle}"的卷摘要。`)
  parts.push('')
  parts.push('【章节摘要】')

  summaries.forEach(s => {
    parts.push(`\n第${s.chapterNumber}章 ${s.title}：`)
    parts.push(s.summary)
    parts.push(`关键事件：${s.keyEvents.join('、')}`)
    parts.push(`出场人物：${s.characters.join('、')}`)
  })

  parts.push('')
  parts.push('【输出要求】')
  parts.push('1. 字数控制在500-800字')
  parts.push('2. 提炼主要事件（3-5个）')
  parts.push('3. 总结人物成长弧线')
  parts.push('4. 概括本卷主题')
  parts.push('')
  parts.push('【输出格式】')
  parts.push('```json')
  parts.push('{')
  parts.push('  "summary": "卷摘要（500-800字）",')
  parts.push('  "mainEvents": ["事件1", "事件2", "事件3"],')
  parts.push('  "characterArcs": ["人物成长线1", "人物成长线2"],')
  parts.push('  "theme": "本卷主题"')
  parts.push('}')
  parts.push('```')

  return parts.join('\n')
}
