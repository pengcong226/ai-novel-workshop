import { getLogger } from './logger'

const log = getLogger('chapterCadence')

export interface CadenceChapter {
  number: number
  title: string
  contentPreview?: string
}

export interface CadenceWarning {
  type: 'monotone_scene' | 'sustained_tension' | 'title_homogenization'
  severity: 'warning' | 'info'
  message: string
  affectedChapters: number[]
}

export interface CadenceResult {
  chapterTypes: Map<number, string>
  warnings: CadenceWarning[]
  tensionCurve: number[]
}

// 场景类型及其关键词
const SCENE_RULES: Array<{ type: string; keywords: string[]; tension: number }> = [
  { type: '战斗', keywords: ['战斗', '攻', '杀', '剑', '刀', '拳', '击', '伤', '血', '死'], tension: 8 },
  { type: '日常', keywords: ['日常', '吃饭', '聊天', '散步', '闲', '休息', '宿舍', '校园'], tension: 3 },
  { type: '过渡', keywords: ['过渡', '启程', '出发', '离开', '前往', '路途', '旅途'], tension: 4 },
  { type: '高潮', keywords: ['高潮', '突破', '觉醒', '蜕变', '顿悟', '决战', '最终'], tension: 10 },
  { type: '喘息', keywords: ['喘息', '平静', '安宁', '恢复', '疗伤', '修炼', '沉淀'], tension: 2 },
]

const DEFAULT_TENSION = 5 // 叙事类型
const HIGH_TENSION_TYPES = new Set(['战斗', '高潮'])

const STOPWORDS = new Set(['的', '了', '在', '是', '和', '与', '而', '但', '也', '都', '就', '不', '有', '这', '那', '他', '她', '它', '我', '你', '们', '个', '到', '被', '把', '让', '对', '从', '着', '过', '去', '来', '上', '下', '中', '大', '小', '一', '人', '为', '说', '道'])

// ---- 内部辅助函数 ----

function classifyChapter(title: string, contentPreview?: string): { type: string; tension: number } {
  const text = title + ' ' + (contentPreview ?? '').slice(0, 200)

  for (const rule of SCENE_RULES) {
    for (const kw of rule.keywords) {
      if (text.includes(kw)) {
        return { type: rule.type, tension: rule.tension }
      }
    }
  }

  return { type: '叙事', tension: DEFAULT_TENSION }
}

function detectMonotoneScene(
  chapters: CadenceChapter[],
  typeMap: Map<number, string>,
  windowSize: number
): CadenceWarning[] {
  const warnings: CadenceWarning[] = []
  if (chapters.length < windowSize) return warnings

  const recent = chapters.slice(-windowSize)
  const types = recent.map(c => typeMap.get(c.number) ?? '叙事')

  // 检测连续 ≥3 章相同类型
  let runStart = 0
  for (let i = 1; i <= types.length; i++) {
    if (i === types.length || types[i] !== types[runStart]) {
      const runLen = i - runStart
      if (runLen >= 3) {
        const affected = recent.slice(runStart, i).map(c => c.number)
        warnings.push({
          type: 'monotone_scene',
          severity: 'warning',
          message: `最近 ${windowSize} 章中有 ${runLen} 章连续为「${types[runStart]}」类型，节奏过于单调`,
          affectedChapters: affected,
        })
      }
      runStart = i
    }
  }

  return warnings
}

function detectSustainedTension(
  chapters: CadenceChapter[],
  typeMap: Map<number, string>,
  windowSize: number
): CadenceWarning[] {
  const warnings: CadenceWarning[] = []
  if (chapters.length < windowSize) return warnings

  const recent = chapters.slice(-windowSize)

  let runStart = -1
  for (let i = 0; i <= recent.length; i++) {
    const isHigh = i < recent.length && HIGH_TENSION_TYPES.has(typeMap.get(recent[i].number) ?? '')
    if (isHigh) {
      if (runStart < 0) runStart = i
    } else {
      if (runStart >= 0) {
        const runLen = i - runStart
        if (runLen >= 3) {
          const affected = recent.slice(runStart, i).map(c => c.number)
          warnings.push({
            type: 'sustained_tension',
            severity: 'warning',
            message: `最近 ${windowSize} 章中有 ${runLen} 章连续高张力（战斗/高潮），读者可能疲劳`,
            affectedChapters: affected,
          })
        }
        runStart = -1
      }
    }
  }

  return warnings
}

function extractWords(text: string): string[] {
  // 简单的中文分词：按标点和空格拆分后，取长度 >=2 且非停用词的 token
  const tokens = text.split(/[，。！？、；：""''（）《》\s,.!?\-—…[]【】]+/).filter(Boolean)
  const words: string[] = []
  for (const token of tokens) {
    // 对中文逐字提取长度为2的滑动窗口作为"词"
    if (/[\u4e00-\u9fff]/.test(token)) {
      for (let i = 0; i < token.length - 1; i++) {
        const word = token.slice(i, i + 2)
        if (!STOPWORDS.has(word)) {
          words.push(word)
        }
      }
    } else if (token.length >= 2 && !STOPWORDS.has(token)) {
      words.push(token)
    }
  }
  return words
}

function detectTitleHomogenization(
  chapters: CadenceChapter[],
  windowSize: number
): CadenceWarning[] {
  const warnings: CadenceWarning[] = []
  if (chapters.length < windowSize) return warnings

  const recent = chapters.slice(-windowSize)
  const freq: Record<string, number[]> = {}

  for (const ch of recent) {
    const words = extractWords(ch.title)
    for (const w of words) {
      if (!freq[w]) freq[w] = []
      freq[w].push(ch.number)
    }
  }

  for (const [word, chapterNums] of Object.entries(freq)) {
    if (chapterNums.length >= 3) {
      warnings.push({
        type: 'title_homogenization',
        severity: 'info',
        message: `最近 ${windowSize} 章的标题中，词语「${word}」出现了 ${chapterNums.length} 次，标题可能过于同质化`,
        affectedChapters: chapterNums,
      })
    }
  }

  return warnings
}

// ---- 导出主函数 ----

export function analyzeChapterCadence(
  chapters: CadenceChapter[],
  windowSize = 5
): CadenceResult {
  log.info('开始章节节奏分析', { chapterCount: chapters.length, windowSize })

  const chapterTypes = new Map<number, string>()
  const tensionCurve: number[] = []

  // 1. 分类每章
  for (const ch of chapters) {
    const { type, tension } = classifyChapter(ch.title, ch.contentPreview)
    chapterTypes.set(ch.number, type)
    tensionCurve.push(tension)
  }

  log.info('章节分类完成', {
    types: Object.fromEntries(chapterTypes),
    tensionCurve,
  })

  // 2. 各项检测
  const warnings: CadenceWarning[] = [
    ...detectMonotoneScene(chapters, chapterTypes, windowSize),
    ...detectSustainedTension(chapters, chapterTypes, windowSize),
    ...detectTitleHomogenization(chapters, windowSize),
  ]

  log.info('节奏分析完成', { warningCount: warnings.length })

  return { chapterTypes, warnings, tensionCurve }
}
