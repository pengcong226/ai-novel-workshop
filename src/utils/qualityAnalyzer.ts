/**
 * 小说质量分析器
 * 分析导入小说的质量指标
 */

export interface QualityMetrics {
  overall: number
  dimensions: {
    plot: number        // 情节完整性
    character: number   // 人物塑造
    pacing: number      // 节奏把控
    consistency: number // 一致性
    readability: number // 可读性
  }
  issues: QualityIssue[]
  suggestions: string[]
}

export interface QualityIssue {
  type: 'error' | 'warning' | 'info'
  dimension: string
  description: string
  location?: string
  suggestion: string
}

/**
 * 分析情节完整性
 */
function analyzePlot(chapters: Array<{ content: string }>): number {
  let score = 100

  // 检查是否有明显的开端、发展、高潮、结局
  const totalChapters = chapters.length

  if (totalChapters < 10) {
    score -= 20 // 篇幅太短
  }

  // 检查章节长度一致性
  const chapterLengths = chapters.map(ch => ch.content.length)
  const avgLength = chapterLengths.reduce((a, b) => a + b, 0) / chapterLengths.length
  const variance = chapterLengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / chapterLengths.length
  const stdDev = Math.sqrt(variance)
  const cv = stdDev / avgLength // 变异系数

  if (cv > 0.5) {
    score -= 15 // 章节长度差异过大
  }

  // 检查是否有明显的情节转折词
  const allText = chapters.map(ch => ch.content).join('\n')
  const turningPointKeywords = ['但是', '然而', '突然', '转折', '危机', '困境']
  const turningPointCount = turningPointKeywords.reduce((count, word) => count + (allText.match(new RegExp(word, 'g')) || []).length, 0)

  if (turningPointCount < totalChapters * 0.3) {
    score -= 10 // 情节转折点太少
  }

  return Math.max(0, Math.min(100, score))
}

/**
 * 分析人物塑造
 */
function analyzeCharacters(characters: Array<{ name: string; description: string; occurrences: number }>): number {
  let score = 100

  if (characters.length === 0) {
    return 0
  }

  // 检查主角出场频率
  const protagonist = characters[0]
  if (protagonist.occurrences < 50) {
    score -= 20 // 主角出场太少
  }

  // 检查人物描述完整性
  const charactersWithDescription = characters.filter(ch => ch.description && ch.description.length > 20)
  if (charactersWithDescription.length < characters.length * 0.3) {
    score -= 15 // 人物描述不完整
  }

  // 检查人物数量分布
  if (characters.length < 3) {
    score -= 25 // 人物太少
  } else if (characters.length > 100) {
    score -= 10 // 人物太多，可能混乱
  }

  // 检查配角出场分布
  if (characters.length >= 5) {
    const supportingCharacters = characters.slice(1, 5)
    const avgOccurrences = supportingCharacters.reduce((sum, ch) => sum + ch.occurrences, 0) / supportingCharacters.length

    if (avgOccurrences < protagonist.occurrences * 0.1) {
      score -= 10 // 配角出场太少
    }
  }

  return Math.max(0, Math.min(100, score))
}

/**
 * 分析节奏把控
 */
function analyzePacing(chapters: Array<{ content: string }>): number {
  let score = 100

  // 检查章节长度分布
  const chapterLengths = chapters.map(ch => ch.content.length)
  const avgLength = chapterLengths.reduce((a, b) => a + b, 0) / chapterLengths.length

  // 检查开头章节（前3章）
  const beginningLengths = chapterLengths.slice(0, 3)
  const beginningAvg = beginningLengths.reduce((a, b) => a + b, 0) / beginningLengths.length

  if (beginningAvg < avgLength * 0.5) {
    score -= 15 // 开头太短
  } else if (beginningAvg > avgLength * 1.5) {
    score -= 10 // 开头太长
  }

  // 检查结尾章节（后3章）
  const endingLengths = chapterLengths.slice(-3)
  const endingAvg = endingLengths.reduce((a, b) => a + b, 0) / endingLengths.length

  if (endingAvg < avgLength * 0.5) {
    score -= 15 // 结尾太短
  }

  // 检查中间章节长度变化
  const middleLengths = chapterLengths.slice(3, -3)
  if (middleLengths.length > 5) {
    const middleVariance = calculateVariance(middleLengths)
    if (middleVariance > 0.3) {
      score -= 10 // 中间章节长度不稳定
    }
  }

  return Math.max(0, Math.min(100, score))
}

/**
 * 分析一致性
 */
function analyzeConsistency(
  characters: Array<{ name: string; description: string }>,
  chapters: Array<{ content: string }>
): number {
  let score = 100

  const allText = chapters.map(ch => ch.content).join('\n')

  // 检查人物名称一致性
  const nameVariants = new Map<string, Set<string>>()
  for (const character of characters) {
    const variants = new Set<string>()
    // 简单检查：查找人物名称的常见变体
    const nameParts = character.name.split(/[·•·\-]/)
    if (nameParts.length > 1) {
      nameParts.forEach(part => variants.add(part.trim()))
    }
    variants.add(character.name)
    nameVariants.set(character.name, variants)
  }

  // 检查术语一致性（简化版）
  const _terms = ['修炼', '境界', '灵气', '法术', '功法']
  const termVariants: Record<string, string[]> = {
    '修炼': ['修练', '修行'],
    '境界': ['层级', '等级'],
    '灵气': ['灵力', '元气'],
    '法术': ['法术', '法技'],
    '功法': ['功法', '功技']
  }

  for (const [term, variants] of Object.entries(termVariants)) {
    const hasTerm = allText.includes(term)
    const hasVariant = variants.some(v => allText.includes(v))

    if (hasTerm && hasVariant) {
      score -= 5 // 术语不一致
    }
  }

  return Math.max(0, Math.min(100, score))
}

/**
 * 分析可读性
 */
function analyzeReadability(chapters: Array<{ content: string }>): number {
  let score = 100

  const allText = chapters.map(ch => ch.content).join('\n')

  // 检查段落长度
  const paragraphs = allText.split(/\n\n+/)
  const avgParagraphLength = paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphs.length

  if (avgParagraphLength > 500) {
    score -= 15 // 段落太长
  } else if (avgParagraphLength < 50) {
    score -= 10 // 段落太短
  }

  // 检查句子长度
  const sentences = allText.split(/[。！？]/)
  const avgSentenceLength = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length

  if (avgSentenceLength > 100) {
    score -= 15 // 句子太长
  }

  // 检查标点符号使用
  const punctuationCount = (allText.match(/[，。！？；：""''、]/g) || []).length
  const charCount = allText.length

  if (punctuationCount / charCount < 0.02) {
    score -= 20 // 标点符号太少
  } else if (punctuationCount / charCount > 0.1) {
    score -= 10 // 标点符号太多
  }

  return Math.max(0, Math.min(100, score))
}

/**
 * 计算方差
 */
function calculateVariance(numbers: number[]): number {
  const avg = numbers.reduce((a, b) => a + b, 0) / numbers.length
  const variance = numbers.reduce((sum, num) => sum + Math.pow(num - avg, 2), 0) / numbers.length
  return Math.sqrt(variance) / avg
}

/**
 * 生成质量问题和建议
 */
function generateIssuesAndSuggestions(
  plot: number,
  character: number,
  pacing: number,
  consistency: number,
  readability: number,
  _chapters: Array<{ content: string }>,
  characters: Array<{ name: string; description: string; occurrences: number }>
): { issues: QualityIssue[]; suggestions: string[] } {
  const issues: QualityIssue[] = []
  const suggestions: string[] = []

  // 情节问题
  if (plot < 70) {
    issues.push({
      type: 'warning',
      dimension: '情节',
      description: '情节完整性不足，可能缺少转折点或章节长度不均',
      suggestion: '增加情节转折点，平衡章节长度'
    })
    suggestions.push('建议在关键节点增加矛盾冲突，丰富情节层次')
  }

  // 人物问题
  if (character < 70) {
    if (characters.length === 0) {
      issues.push({
        type: 'error',
        dimension: '人物',
        description: '未识别到主要人物',
        suggestion: '检查人物名称提取规则，手动补充人物信息'
      })
    } else if (characters.length < 3) {
      issues.push({
        type: 'warning',
        dimension: '人物',
        description: '人物数量较少',
        suggestion: '考虑增加配角丰富故事层次'
      })
    } else {
      issues.push({
        type: 'warning',
        dimension: '人物',
        description: '人物塑造不够丰满',
        suggestion: '增加人物描写和内心活动'
      })
    }
    suggestions.push('建议为主要人物添加详细的外貌、性格和背景描述')
  }

  // 节奏问题
  if (pacing < 70) {
    issues.push({
      type: 'warning',
      dimension: '节奏',
      description: '故事节奏把控需要改进',
      suggestion: '调整章节长度，确保开头、高潮、结尾节奏合理'
    })
    suggestions.push('建议加快或放缓某些章节的叙事节奏')
  }

  // 一致性问题
  if (consistency < 70) {
    issues.push({
      type: 'info',
      dimension: '一致性',
      description: '存在术语或设定不一致的情况',
      suggestion: '统一术语使用，建立设定词典'
    })
    suggestions.push('建议建立术语表，确保设定一致性')
  }

  // 可读性问题
  if (readability < 70) {
    issues.push({
      type: 'warning',
      dimension: '可读性',
      description: '文本可读性有待提升',
      suggestion: '优化段落和句子长度，合理使用标点符号'
    })
    suggestions.push('建议将长段落拆分，避免过长句子')
  }

  // 正面建议
  if (plot >= 85) {
    suggestions.push('情节结构良好，继续保持')
  }

  if (character >= 85) {
    suggestions.push('人物塑造丰满，人物关系清晰')
  }

  return { issues, suggestions }
}

/**
 * 分析小说质量
 */
export async function analyzeQuality(
  chapters: Array<{ content: string }>,
  characters: Array<{ name: string; description: string; occurrences: number }>,
  onProgress?: (progress: number) => void
): Promise<QualityMetrics> {
  // 分析各个维度
  const plot = analyzePlot(chapters)
  onProgress?.(20)

  const character = analyzeCharacters(characters)
  onProgress?.(40)

  const pacing = analyzePacing(chapters)
  onProgress?.(60)

  const consistency = analyzeConsistency(characters, chapters)
  onProgress?.(80)

  const readability = analyzeReadability(chapters)
  onProgress?.(100)

  // 计算总分
  const overall = Math.round((plot * 0.25 + character * 0.25 + pacing * 0.2 + consistency * 0.15 + readability * 0.15))

  // 生成问题和建议
  const { issues, suggestions } = generateIssuesAndSuggestions(
    plot, character, pacing, consistency, readability,
    chapters, characters
  )

  return {
    overall,
    dimensions: {
      plot,
      character,
      pacing,
      consistency,
      readability
    },
    issues,
    suggestions
  }
}
