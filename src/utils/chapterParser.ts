/**
 * 章节解析器
 * 自动检测章节标题并分割文本
 */

import { getLogger } from '@/utils/logger'

const logger = getLogger('chapterParser')

export interface ParsedChapter {
  number: number
  title: string
  content: string
  startIndex: number
  endIndex: number
  wordCount: number
}

export interface ChapterPattern {
  name: string
  pattern: RegExp
  titleExtractor: (match: RegExpMatchArray) => string
}

export interface ChapterPatternOption {
  name: string
}

/**
 * 常见章节标题模式
 *
 * 排序原则：越具体的模式越靠前，宽泛模式靠后。
 * detectChapterPattern 会按匹配数量 × 连续性评分选最优。
 */
const CHAPTER_PATTERNS: ChapterPattern[] = [
  // ── 双层结构（最具体，优先匹配）──
  {
    name: '卷章节',
    pattern: /^第[零一二两三四五六七八九十百千万\d]+卷\s*第[零一二两三四五六七八九十百千万\d]+章.+/gm,
    titleExtractor: (match) => match[0].trim()
  },

  // ── 中文量词系列 ──
  {
    name: '第X章',
    pattern: /^第[零一二两三四五六七八九十百千万\d]+章.+/gm,
    titleExtractor: (match) => match[0].trim()
  },
  {
    name: '第X回',
    pattern: /^第[零一二两三四五六七八九十百千万\d]+回.+/gm,
    titleExtractor: (match) => match[0].trim()
  },
  {
    name: '第X节',
    pattern: /^第[零一二两三四五六七八九十百千万\d]+节.+/gm,
    titleExtractor: (match) => match[0].trim()
  },
  {
    name: '第X篇',
    pattern: /^第[零一二两三四五六七八九十百千万\d]+篇.+/gm,
    titleExtractor: (match) => match[0].trim()
  },
  {
    name: '第X部',
    pattern: /^第[零一二两三四五六七八九十百千万\d]+部.+/gm,
    titleExtractor: (match) => match[0].trim()
  },
  {
    name: '第X集',
    pattern: /^第[零一二两三四五六七八九十百千万\d]+集.+/gm,
    titleExtractor: (match) => match[0].trim()
  },
  {
    name: '第X話',
    pattern: /^第[零一二两三四五六七八九十百千万\d]+話.+/gm,
    titleExtractor: (match) => match[0].trim()
  },
  {
    name: '第X幕',
    pattern: /^第[零一二两三四五六七八九十百千万\d]+幕.+/gm,
    titleExtractor: (match) => match[0].trim()
  },

  // ── 括号包裹 ──
  {
    name: '【第X章】',
    pattern: /^【第[零一二两三四五六七八九十百千万\d]+[章节回篇部集話幕]】.+/gm,
    titleExtractor: (match) => match[0].trim()
  },

  // ── 无编号特殊章节（序章/终章/番外等）──
  {
    name: '特殊章节',
    pattern: /^(序章|引子|楔子|前言|序言|自序|他序|终章|尾声|后记|跋|番外|附录)[：:\s].*$/gm,
    titleExtractor: (match) => match[0].trim()
  },

  // ── 英文格式 ──
  {
    name: 'Chapter X',
    pattern: /^Chapter\s+[IVXLCDM\d]+.*$/gim,
    titleExtractor: (match) => match[0].trim()
  },

  // ── 纯数字编号（最宽泛，放最后）──
  {
    name: '数字编号',
    pattern: /^\d+[.、\s].+$/gm,
    titleExtractor: (match) => match[0].trim()
  }
]

export function getChapterPatterns(): ChapterPattern[] {
  return [...CHAPTER_PATTERNS]
}

export function getChapterPatternOptions(): ChapterPatternOption[] {
  return CHAPTER_PATTERNS.map(pattern => ({ name: pattern.name }))
}

const CN_DIGIT: Record<string, number> = {
  '零': 0, '〇': 0,
  '一': 1, '壹': 1,
  '二': 2, '贰': 2, '两': 2,
  '三': 3, '叁': 3,
  '四': 4, '肆': 4,
  '五': 5, '伍': 5,
  '六': 6, '陆': 6,
  '七': 7, '柒': 7,
  '八': 8, '捌': 8,
  '九': 9, '玖': 9
}

const CN_UNIT: Record<string, number> = {
  '十': 10, '拾': 10,
  '百': 100, '佰': 100,
  '千': 1000, '仟': 1000,
  '万': 10000, '億': 100000000
}

/**
 * 将中文数字串转换为阿拉伯数字
 *
 * 支持范围：0 ~ 9999（网文章节编号足够）
 * 示例：
 *   '三' → 3
 *   '十二' → 12
 *   '一百零三' → 103
 *   '两百五十' → 250
 *   '三千八百二十一' → 3821
 *   '九千九百九十九' → 9999
 */
function chineseToNumber(str: string): number {
  if (!str) return 0

  // 纯数字直接返回
  if (/^\d+$/.test(str)) return parseInt(str, 10)

  let result = 0
  let current = 0  // 当前累积的数值

  for (const ch of str) {
    if (CN_DIGIT[ch] !== undefined) {
      current = CN_DIGIT[ch]
    } else if (CN_UNIT[ch] !== undefined) {
      const unit = CN_UNIT[ch]

      if (unit === 10000) {
        // "万"：当前值 * 10000，加上之前累积的 result
        result = (result + (current || 1)) * unit
        current = 0
      } else if (current === 0 && unit === 10) {
        // "十二" → 十前面没有数字，视为 10
        result += unit
      } else {
        result += current * unit
        current = 0
      }
    }
  }

  return result + current
}

// ============================================================================
// 罗马数字 → 阿拉伯数字转换
// ============================================================================

const ROMAN_MAP: Record<string, number> = {
  'I': 1, 'V': 5, 'X': 10, 'L': 50,
  'C': 100, 'D': 500, 'M': 1000
}

/**
 * 将罗马数字转换为阿拉伯数字
 * 示例：'XIV' → 14, 'III' → 3, 'XL' → 40
 */
function romanToNumber(str: string): number {
  let result = 0
  const upper = str.toUpperCase()

  for (let i = 0; i < upper.length; i++) {
    const current = ROMAN_MAP[upper[i]]
    if (!current) return 0

    const next = ROMAN_MAP[upper[i + 1]]
    if (next && next > current) {
      result -= current
    } else {
      result += current
    }
  }

  return result
}

// ============================================================================
// 特殊章节编号映射
// ============================================================================

const SPECIAL_CHAPTER_NUMBERS: Record<string, number> = {
  '序章': 0, '引子': 0, '楔子': 0, '前言': 0, '序言': 0, '自序': 0, '他序': 0,
  '终章': 0, '尾声': 0, '后记': 0, '跋': 0,
  '番外': 0, '附录': 0
}

// ============================================================================
// 章节号提取
// ============================================================================

/**
 * 从章节标题提取章节号
 */
function extractChapterNumber(title: string): number {
  // 1. 检查特殊章节（序章/终章/番外等）
  for (const [keyword, num] of Object.entries(SPECIAL_CHAPTER_NUMBERS)) {
    if (title.startsWith(keyword)) return num
  }

  // 2. 阿拉伯数字优先
  const numMatch = title.match(/\d+/)
  if (numMatch) {
    return parseInt(numMatch[0], 10)
  }

  // 3. 中文数字
  const chineseMatch = title.match(/[零〇一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟億]+/)
  if (chineseMatch) {
    const num = chineseToNumber(chineseMatch[0])
    if (num > 0) return num
  }

  // 4. 罗马数字（仅匹配明确章节位）
  const chapterRomanMatch = title.match(/\bChapter\s+([IVXLCDM]+)\b/i)
  if (chapterRomanMatch) {
    const num = romanToNumber(chapterRomanMatch[1])
    if (num > 0) return num
  }

  const chineseRomanMatch = title.match(/^第([IVXLCDM]+)[章节回篇部集話幕]/i)
  if (chineseRomanMatch) {
    const num = romanToNumber(chineseRomanMatch[1])
    if (num > 0) return num
  }

  return 0
}

// ============================================================================
// 模式检测
// ============================================================================

/**
 * 计算章节编号的连续性得分（0~1）
 *
 * 严格递增（差=1）满分，跳跃递增（差>1）扣分，非递增零分。
 */
function calculateNumberConsistency(numbers: number[]): number {
  if (numbers.length < 2) return 0

  let score = 0
  for (let i = 1; i < numbers.length; i++) {
    const diff = numbers[i] - numbers[i - 1]
    if (diff === 1) {
      score += 1      // 完美连续
    } else if (diff > 1) {
      score += 0.5    // 跳跃但递增
    }
    // diff <= 0: 不加分
  }

  return score / (numbers.length - 1)
}

/**
 * 检测文本中最可能的章节模式
 */
export function detectChapterPattern(text: string): ChapterPattern | null {
  const scores: { pattern: ChapterPattern; count: number; consistency: number }[] = []

  // 取文本的前 20000 字符进行检测（增大采样范围以提高准确性）
  const sampleText = text.slice(0, 20000)

  for (const pattern of CHAPTER_PATTERNS) {
    try {
      const matches = sampleText.match(pattern.pattern)
      if (matches && matches.length >= 1) {
        const numbers = matches.map(m => extractChapterNumber(m)).filter(n => n > 0)
        const consistency = numbers.length > 0 ? calculateNumberConsistency(numbers) : 0

        scores.push({
          pattern,
          count: matches.length,
          consistency
        })
      }
    } catch (error) {
      logger.warn(`Pattern ${pattern.name} failed`, error)
    }
  }

  if (scores.length === 0) {
    return null
  }

  // 优先选择匹配数量多且编号连续的模式
  scores.sort((a, b) => {
    const scoreA = a.count * (0.3 + 0.7 * a.consistency)  // 连续性权重更高
    const scoreB = b.count * (0.3 + 0.7 * b.consistency)
    return scoreB - scoreA
  })

  return scores[0].pattern
}

// ============================================================================
// 文本解析
// ============================================================================

/**
 * 解析文本为章节列表
 */
export function parseChapters(text: string, pattern?: ChapterPattern | null): ParsedChapter[] {
  // 如果没有提供模式，自动检测
  const detectedPattern = pattern || detectChapterPattern(text)

  if (!detectedPattern) {
    // 如果没有检测到章节模式，将整个文本作为一章
    return [{
      number: 1,
      title: '第一章',
      content: text.trim(),
      startIndex: 0,
      endIndex: text.length,
      wordCount: countWords(text)
    }]
  }

  const matches = [...text.matchAll(detectedPattern.pattern)]

  if (matches.length === 0) {
    return [{
      number: 1,
      title: '第一章',
      content: text.trim(),
      startIndex: 0,
      endIndex: text.length,
      wordCount: countWords(text)
    }]
  }

  const chapters: ParsedChapter[] = []

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]
    const startIndex = match.index!
    const endIndex = i < matches.length - 1 ? matches[i + 1].index! : text.length

    const title = detectedPattern.titleExtractor(match)
    const content = text.slice(startIndex, endIndex).replace(title, '').trim()
    let number = extractChapterNumber(title)

    // 特殊章节（无数字）统一按出现顺序编号，保证正数且唯一
    if (number <= 0) number = i + 1

    chapters.push({
      number,
      title,
      content,
      startIndex,
      endIndex,
      wordCount: countWords(content)
    })
  }

  return chapters
}

/**
 * 统计字数（中英文混合）
 */
function countWords(text: string): number {
  const cleanText = text.replace(/\s+/g, '')
  const chineseChars = (cleanText.match(/[\u4e00-\u9fa5]/g) || []).length
  const englishWords = (cleanText.match(/[a-zA-Z]+/g) || []).length
  const numbers = (cleanText.match(/\d+/g) || []).length
  return chineseChars + englishWords + numbers
}

/**
 * 解析小说文本（从文件）
 */
export function parseNovelText(text: string): {
  chapters: ParsedChapter[]
  pattern: ChapterPattern | null
  stats: {
    totalWords: number
    totalChapters: number
    avgWordsPerChapter: number
  }
} {
  const pattern = detectChapterPattern(text)
  const chapters = parseChapters(text, pattern)
  const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0)

  return {
    chapters,
    pattern,
    stats: {
      totalWords,
      totalChapters: chapters.length,
      avgWordsPerChapter: Math.round(totalWords / chapters.length) || 0
    }
  }
}