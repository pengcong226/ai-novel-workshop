/**
 * 章节解析器
 * 自动检测章节标题并分割文本
 */

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

/**
 * 常见章节标题模式
 */
const CHAPTER_PATTERNS: ChapterPattern[] = [
  {
    name: '第X章',
    pattern: /^第[零一二三四五六七八九十百千万\d]+章[\s\S].+/gm,
    titleExtractor: (match) => match[0].trim()
  },
  {
    name: '第X章(无空格)',
    pattern: /^第[零一二三四五六七八九十百千万]+章.+/gm,
    titleExtractor: (match) => match[0].trim()
  },
  {
    name: 'Chapter X',
    pattern: /^Chapter\s+\d+.*$/gim,
    titleExtractor: (match) => match[0].trim()
  },
  {
    name: '数字编号',
    pattern: /^\d+[\.\、\s].+$/gm,
    titleExtractor: (match) => match[0].trim()
  },
  {
    name: '卷章节',
    pattern: /^第[零一二三四五六七八九十百千万\d]+卷\s*第[零一二三四五六七八九十百千万\d]+章.+/gm,
    titleExtractor: (match) => match[0].trim()
  },
  {
    name: '【章节】',
    pattern: /^【第[零一二三四五六七八九十百千万\d]+章】.+/gm,
    titleExtractor: (match) => match[0].trim()
  },
  {
    name: '章节标记',
    pattern: /^[\[【第].*[\]】].*$/gm,
    titleExtractor: (match) => match[0].trim()
  },
  {
    name: '章节标题',
    pattern: /^章节\s*\d+.+/gm,
    titleExtractor: (match) => match[0].trim()
  }
]

/**
 * 检测文本中最可能的章节模式
 */
export function detectChapterPattern(text: string): ChapterPattern | null {
  const scores: { pattern: ChapterPattern; count: number; consistency: number }[] = []

  // 取文本的前10000字符进行检测，提高性能
  const sampleText = text.slice(0, 10000)

  for (const pattern of CHAPTER_PATTERNS) {
    try {
      const matches = sampleText.match(pattern.pattern)
      if (matches && matches.length >= 1) {
        // 检查章节编号的连续性
        const numbers = matches.map(m => extractChapterNumber(m)).filter(n => n > 0)
        const consistency = numbers.length > 0 ? calculateNumberConsistency(numbers) : 0

        scores.push({
          pattern,
          count: matches.length,
          consistency
        })
      }
    } catch (error) {
      console.warn(`Pattern ${pattern.name} failed:`, error)
    }
  }

  if (scores.length === 0) {
    return null
  }

  // 优先选择匹配数量多且编号连续的模式
  scores.sort((a, b) => {
    const scoreA = a.count * a.consistency
    const scoreB = b.count * b.consistency
    return scoreB - scoreA
  })

  return scores[0].pattern
}

/**
 * 从章节标题提取章节号
 */
function extractChapterNumber(title: string): number {
  // 匹配数字
  const numMatch = title.match(/\d+/)
  if (numMatch) {
    return parseInt(numMatch[0])
  }

  // 匹配中文数字
  const chineseNumMap: Record<string, number> = {
    '零': 0, '一': 1, '二': 2, '三': 3, '四': 4,
    '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
    '十': 10, '百': 100, '千': 1000, '万': 10000
  }

  // 简单的中文数字转换（仅处理一到九十九）
  const chineseMatch = title.match(/[一二三四五六七八九十]+/)
  if (chineseMatch) {
    const str = chineseMatch[0]
    if (str === '十') return 10
    if (str.startsWith('十')) return 10 + (chineseNumMap[str[1]] || 0)
    if (str.endsWith('十')) return (chineseNumMap[str[0]] || 0) * 10
    return chineseNumMap[str] || 0
  }

  return 0
}

/**
 * 计算章节编号的连续性得分
 */
function calculateNumberConsistency(numbers: number[]): number {
  if (numbers.length < 2) return 0

  let consistentCount = 0
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] > numbers[i - 1]) {
      consistentCount++
    }
  }

  return consistentCount / (numbers.length - 1)
}

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
    const number = extractChapterNumber(title) || i + 1

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
  // 移除空白字符
  const cleanText = text.replace(/\s+/g, '')

  // 统计中文字符
  const chineseChars = (cleanText.match(/[\u4e00-\u9fa5]/g) || []).length

  // 统计英文单词
  const englishWords = (cleanText.match(/[a-zA-Z]+/g) || []).length

  // 统计数字
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
