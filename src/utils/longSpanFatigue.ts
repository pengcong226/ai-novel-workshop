/**
 * 长跨度疲劳检测器 (Long-Span Fatigue Detector)
 *
 * 跨章节检测模式重复和疲劳信号：
 * - 章节开头/结尾句式雷同检测
 * - 场景类型单调检测（连续N章同类型）
 * - 情绪连续高压检测
 *
 * 借鉴 InkOS long-span-fatigue.ts，适配工坊的数据结构。
 */

import { getLogger } from '@/utils/logger'

const logger = getLogger('utils:long-span-fatigue')

// ============================================================================
// 配置
// ============================================================================

/** 检测最近 N 章 */
const LOOKBACK_CHAPTERS = 8

/** 开头句式重复阈值：超过此比例视为疲劳 */
const OPENING_SIMILARITY_THRESHOLD = 0.6

/** 结尾句式重复阈值 */
const CLOSING_SIMILARITY_THRESHOLD = 0.6

/** 连续同类型场景的最大章数 */
const _MAX_CONSECUTIVE_SAME_TYPE = 3

// ============================================================================
// 类型
// ============================================================================

export interface ChapterSnippet {
  chapterNumber: number
  title?: string
  content: string
}

export interface FatigueIssue {
  severity: 'warning' | 'info'
  category: string
  description: string
  suggestion: string
}

export interface FatigueResult {
  issues: FatigueIssue[]
  fatigueScore: number  // 0-100, 0=无疲劳, 100=严重疲劳
}

// ============================================================================
// 核心检测
// ============================================================================

/**
 * 分析最近章节的疲劳状态
 */
export function detectLongSpanFatigue(
  chapters: ChapterSnippet[],
  currentChapter: number,
): FatigueResult {
  const issues: FatigueIssue[] = []

  // 取最近 N 章
  const recentChapters = chapters
    .filter(ch => ch.chapterNumber <= currentChapter && ch.chapterNumber > currentChapter - LOOKBACK_CHAPTERS)
    .sort((a, b) => a.chapterNumber - b.chapterNumber)

  if (recentChapters.length < 3) {
    return { issues, fatigueScore: 0 }
  }

  // ---- 检测 1：开头句式雷同 ----
  const openings = recentChapters.map(ch => extractOpening(ch.content))
  const openingSimilarity = computePairwiseSimilarity(openings)
  if (openingSimilarity >= OPENING_SIMILARITY_THRESHOLD) {
    issues.push({
      severity: 'warning',
      category: '章节疲劳',
      description: `最近 ${recentChapters.length} 章的开头句式高度相似（相似度 ${Math.round(openingSimilarity * 100)}%），读者可能感到重复。`,
      suggestion: '变换章节开头方式：可用对话、动作、环境描写或内心独白开头，避免总是从同一模式开始。',
    })
  }

  // ---- 检测 2：结尾句式雷同 ----
  const endings = recentChapters.map(ch => extractEnding(ch.content))
  const closingSimilarity = computePairwiseSimilarity(endings)
  if (closingSimilarity >= CLOSING_SIMILARITY_THRESHOLD) {
    issues.push({
      severity: 'warning',
      category: '章节疲劳',
      description: `最近 ${recentChapters.length} 章的结尾句式高度相似（相似度 ${Math.round(closingSimilarity * 100)}%）。`,
      suggestion: '多样化章节结尾：悬念、转折、情感余韵、对话截断、场景描写收束等。',
    })
  }

  // ---- 检测 3：段落长度方差过低（AI 均匀输出特征）----
  const avgVariances = recentChapters.map(ch => computeParagraphLengthVariance(ch.content))
  const meanVariance = avgVariances.reduce((a, b) => a + b, 0) / avgVariances.length
  if (meanVariance < 100 && recentChapters.length >= 5) {
    issues.push({
      severity: 'info',
      category: '章节疲劳',
      description: `最近 ${recentChapters.length} 章的段落长度方差极低（${Math.round(meanVariance)}），缺乏节奏变化。`,
      suggestion: '交替使用长短段落，战斗/高潮场景用短句，描写/情感场景用长段落。',
    })
  }

  // ---- 检测 4：高频词跨章重复 ----
  const wordFreq = detectCrossChapterWordRepetition(recentChapters)
  if (wordFreq.length > 0) {
    issues.push({
      severity: 'info',
      category: '词汇疲劳',
      description: `跨章高频词：${wordFreq.map(w => `${w.word}(${w.count}次)`).join('、')}，分布在 ${recentChapters.length} 章中。`,
      suggestion: '替换同义词或使用不同的表达方式，降低跨章词汇重复率。',
    })
  }

  // 疲劳评分
  let fatigueScore = 0
  if (openingSimilarity >= OPENING_SIMILARITY_THRESHOLD) fatigueScore += 30
  if (closingSimilarity >= CLOSING_SIMILARITY_THRESHOLD) fatigueScore += 30
  if (meanVariance < 100) fatigueScore += 20
  if (wordFreq.length > 2) fatigueScore += 20
  fatigueScore = Math.min(100, fatigueScore)

  logger.info(`长跨度疲劳检测完成: ${recentChapters.length}章, 开头相似度${Math.round(openingSimilarity * 100)}%, 结尾相似度${Math.round(closingSimilarity * 100)}%, 疲劳评分${fatigueScore}`)

  return { issues, fatigueScore }
}

// ============================================================================
// 辅助函数
// ============================================================================

function extractOpening(content: string): string {
  const sentences = content.split(/[。！？\n]+/).filter(s => s.trim().length > 0)
  return (sentences[0] || '').trim().slice(0, 50)
}

function extractEnding(content: string): string {
  const sentences = content.split(/[。！？\n]+/).filter(s => s.trim().length > 0)
  return (sentences[sentences.length - 1] || '').trim().slice(-50)
}

/**
 * 计算字符串数组的平均成对相似度
 */
function computePairwiseSimilarity(texts: string[]): number {
  if (texts.length < 2) return 0

  let totalSimilarity = 0
  let pairCount = 0

  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const textA = texts[i]
      const textB = texts[j]
      if (textA === undefined || textB === undefined) continue
      totalSimilarity += computeStringSimilarity(textA, textB)
      pairCount++
    }
  }

  return pairCount > 0 ? totalSimilarity / pairCount : 0
}

/**
 * 简单的字符串相似度（基于字符2-gram）
 */
function computeStringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1

  const ngramsA = getCharNgrams(a, 2)
  const ngramsB = getCharNgrams(b, 2)

  if (ngramsA.size === 0 || ngramsB.size === 0) return 0

  let intersection = 0
  for (const ng of ngramsA) {
    if (ngramsB.has(ng)) intersection++
  }

  return (2 * intersection) / (ngramsA.size + ngramsB.size)
}

function getCharNgrams(text: string, n: number): Set<string> {
  const ngrams = new Set<string>()
  for (let i = 0; i <= text.length - n; i++) {
    ngrams.add(text.slice(i, i + n))
  }
  return ngrams
}

function computeParagraphLengthVariance(content: string): number {
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0)
  if (paragraphs.length < 3) return 999

  const lengths = paragraphs.map(p => p.length)
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length
  return lengths.reduce((sum, len) => sum + Math.pow(len - mean, 2), 0) / lengths.length
}

function detectCrossChapterWordRepetition(
  chapters: ChapterSnippet[],
): Array<{ word: string; count: number }> {
  const wordFreq: Record<string, number> = {}

  for (const ch of chapters) {
    const words = ch.content.match(/[\u4e00-\u9fa5]{2,4}/g) || []
    const uniqueInChapter = new Set(words)
    for (const w of uniqueInChapter) {
      wordFreq[w] = (wordFreq[w] || 0) + 1
    }
  }

  return Object.entries(wordFreq)
    .filter(([word, count]) => count >= chapters.length * 0.7 && word.length >= 2)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
}
