/**
 * LLM驱动的章节检测模块
 */

import type { LLMProviderConfig, AnalysisMode, LLMChapter, ChapterPattern, AnalysisProgress, QuickModeSampling } from './types'
import { callLLMWithValidation } from './llmCaller'
import { chapterListSchema, chapterPatternSchema } from './schemas'
import { sampleText } from './textChunker'
import { getChapterPatternPrompt, getChapterListPrompt } from './prompts/chapterPrompts'

/**
 * 检测章节
 */
export async function detectChaptersWithLLM(
  text: string,
  mode: AnalysisMode,
  config: LLMProviderConfig,
  quickModeSampling: QuickModeSampling,
  onProgress?: (progress: AnalysisProgress) => void
): Promise<{ chapters: LLMChapter[]; pattern: ChapterPattern }> {
  console.log('[章节检测] 开始，模式:', mode)

  // 计算文本统计信息
  const totalChars = text.length
  const estimatedChapters = Math.floor(totalChars / 3000) // 假设平均每章3000字

  // 第一轮：识别章节模式
  onProgress?.({
    stage: 'pattern',
    current: 0,
    total: 100,
    message: `识别章节模式（分析前${quickModeSampling.chapterDetection.start}字...）`
  })

  const patternText = mode === 'quick'
    ? sampleText(text, quickModeSampling.chapterDetection.start, quickModeSampling.chapterDetection.end).start +
      '\n\n...中间省略...\n\n' +
      sampleText(text, quickModeSampling.chapterDetection.start, quickModeSampling.chapterDetection.end).end
    : text

  const patternResult = await callLLMWithValidation(
    getChapterPatternPrompt(patternText),
    chapterPatternSchema,
    config,
    { maxRetries: 2 }
  )

  const pattern: ChapterPattern = patternResult as any
  console.log('[章节检测] 识别到模式:', pattern.pattern, '置信度:', pattern.confidence)

  // 等待1秒，避免QPS限制
  await new Promise(resolve => setTimeout(resolve, 1000))

  // 第二轮：提取章节列表
  onProgress?.({
    stage: 'chapters',
    current: 33,
    total: 100,
    message: `提取章节列表（预计${estimatedChapters}章，分析中...）`
  })

  const listText = mode === 'quick'
    ? text.slice(0, Math.floor(text.length * 0.3)) +
      '\n\n...中间省略...\n\n' +
      text.slice(-Math.floor(text.length * 0.2))
    : text

  let chapters: LLMChapter[] = (await callLLMWithValidation(
    getChapterListPrompt(pattern.pattern, listText),
    chapterListSchema,
    config,
    { maxRetries: 2 }
  )) as any

  console.log('[章节检测] 提取到章节数:', chapters.length)

  // 更新进度，显示实际章节数
  onProgress?.({
    stage: 'chapters',
    current: 50,
    total: 100,
    message: `已识别${chapters.length}章，正在验证...`
  })

  // 第三轮：验证和修正（导入时跳过，在项目中验证）
  const issues = validateChapters(chapters, text)

  if (issues.length > 0) {
    console.log('[章节检测] 发现问题:', issues.length, '个')
    console.log('[章节检测] 问题列表:', issues)
    console.log('[章节检测] ⚠️ 导入时跳过验证，可在项目编辑器中手动验证和修正')
  } else {
    console.log('[章节检测] ✅ 章节验证通过，无需修正')
  }

  // 填充章节内容
  chapters = chapters.map(ch => ({
    ...ch,
    content: text.slice(ch.startPosition, ch.endPosition),
    wordCount: countWords(text.slice(ch.startPosition, ch.endPosition))
  }))

  console.log('[章节检测] 完成，最终章节数:', chapters.length)

  onProgress?.({
    stage: 'chapters',
    current: 100,
    total: 100,
    message: '章节检测完成'
  })

  return { chapters, pattern }
}

/**
 * 验证章节列表
 */
function validateChapters(
  chapters: LLMChapter[],
  text: string
): string[] {
  const issues: string[] = []

  // 检查章节号连续性
  for (let i = 1; i < chapters.length; i++) {
    if (chapters[i].number !== chapters[i - 1].number + 1) {
      issues.push(`章节号不连续：第${chapters[i - 1].number}章之后是第${chapters[i].number}章`)
    }
  }

  // 检查位置连续性
  for (let i = 1; i < chapters.length; i++) {
    if (chapters[i].startPosition !== chapters[i - 1].endPosition) {
      issues.push(`位置不连续：第${chapters[i - 1].number}章结束于${chapters[i - 1].endPosition}，第${chapters[i].number}章开始于${chapters[i].startPosition}`)
    }
  }

  // 检查空白章节
  for (const ch of chapters) {
    if (ch.endPosition - ch.startPosition < 100) {
      issues.push(`第${ch.number}章内容过短（少于100字符）`)
    }
  }

  // 检查是否覆盖全文
  if (chapters.length > 0) {
    const firstChapter = chapters[0]
    const lastChapter = chapters[chapters.length - 1]

    if (firstChapter.startPosition !== 0) {
      issues.push(`第一个章节不是从文本开头开始（位置${firstChapter.startPosition}）`)
    }

    if (lastChapter.endPosition !== text.length) {
      issues.push(`最后一个章节不是文本结尾（位置${lastChapter.endPosition}，文本总长度${text.length}）`)
    }
  }

  return issues
}

/**
 * 统计字数
 */
function countWords(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length
  const numbers = (text.match(/\d+/g) || []).length
  return chineseChars + englishWords + numbers
}
