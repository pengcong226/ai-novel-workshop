/**
 * 章节拆分工具 (Chapter Splitter)
 *
 * 将超长章节自动拆分为合理长度的子章节。
 * 以段落为最小拆分单位，优先在场景切换点拆分。
 */

import { getLogger } from '@/utils/logger'
import { countChars } from '@/agents/LengthNormalizerAgent'

const logger = getLogger('utils:chapter-splitter')

// ============================================================================
// 类型
// ============================================================================

export interface SplitChapter {
  /** 子章节序号（从1开始） */
  index: number
  /** 子章节标题 */
  title: string
  /** 子章节内容 */
  content: string
  /** 字数 */
  wordCount: number
}

export interface SplitOptions {
  /** 目标字数范围（最小值） */
  minWordCount?: number
  /** 目标字数范围（最大值） */
  maxWordCount?: number
  /** 原始章节标题 */
  originalTitle?: string
}

// ============================================================================
// 核心拆分逻辑
// ============================================================================

/**
 * 将超长章节拆分为多个子章节
 * @param content 原始章节内容
 * @param options 拆分选项
 * @returns 拆分后的子章节数组（如果不需要拆分则返回原数组）
 */
export function splitChapter(
  content: string,
  options: SplitOptions = {},
): SplitChapter[] {
  const {
    minWordCount = 1500,
    maxWordCount = 4000,
    originalTitle = '章节',
  } = options

  const totalWords = countChars(content)

  // 不需要拆分
  if (totalWords <= maxWordCount) {
    return [{
      index: 1,
      title: originalTitle,
      content,
      wordCount: totalWords,
    }]
  }

  // 按段落分割
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0)
  const targetParts = Math.ceil(totalWords / maxWordCount)

  logger.info(`章节拆分: ${totalWords}字 → 目标${targetParts}部分`)

  // 贪心算法：累积段落直到达到目标字数
  const parts: Array<{ paragraphs: string[]; wordCount: number }> = []
  let currentPart: string[] = []
  let currentWords = 0
  const targetPerPart = Math.ceil(totalWords / targetParts)

  for (const para of paragraphs) {
    const paraWords = countChars(para)

    // 如果当前部分加上这个段落会超过目标，且当前部分已有足够内容
    if (currentWords + paraWords > targetPerPart && currentWords >= minWordCount) {
      parts.push({ paragraphs: [...currentPart], wordCount: currentWords })
      currentPart = []
      currentWords = 0
    }

    currentPart.push(para)
    currentWords += paraWords
  }

  // 最后一部分
  if (currentPart.length > 0) {
    // 如果太短，合并到上一部分
    if (currentWords < minWordCount && parts.length > 0) {
      parts[parts.length - 1].paragraphs.push(...currentPart)
      parts[parts.length - 1].wordCount += currentWords
    } else {
      parts.push({ paragraphs: currentPart, wordCount: currentWords })
    }
  }

  // 生成子章节
  const result: SplitChapter[] = parts.map((part, i) => ({
    index: i + 1,
    title: parts.length > 1 ? `${originalTitle}（${i + 1}/${parts.length}）` : originalTitle,
    content: part.paragraphs.join('\n\n'),
    wordCount: part.wordCount,
  }))

  logger.info(`章节拆分完成: ${result.length}个子章节，字数=[${result.map(r => r.wordCount).join(', ')}]`)

  return result
}
