/**
 * 文本分块工具
 * 用于将长文本分割成适合LLM处理的块
 */

import type { LLMProvider, TextChunk } from './types'
import { countTokens } from './tokenizer'

/**
 * 智能文本分块
 * @param text 要分割的文本
 * @param maxTokensPerChunk 每块最大token数
 * @param provider LLM提供商（用于token计数）
 * @param overlap 块之间的重叠字符数（保持上下文连续性）
 * @returns 文本块数组
 */
export function splitTextForLLM(
  text: string,
  maxTokensPerChunk: number = 50000,
  provider: LLMProvider = 'anthropic',
  overlap: number = 500
): TextChunk[] {
  const chunks: TextChunk[] = []

  // 如果文本很短，直接返回
  const totalTokens = countTokens(text, provider)
  if (totalTokens <= maxTokensPerChunk) {
    return [{
      index: 0,
      text,
      startPosition: 0,
      endPosition: text.length,
      tokenCount: totalTokens
    }]
  }

  // 按段落分割
  const paragraphs = text.split(/\n\n+/)

  let currentChunk = ''
  let currentStartPosition = 0
  let currentIndex = 0

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i]
    const testChunk = currentChunk + (currentChunk ? '\n\n' : '') + paragraph

    const testTokens = countTokens(testChunk, provider)

    // 如果加上这个段落不超过限制，就添加
    if (testTokens <= maxTokensPerChunk) {
      currentChunk = testChunk
    } else {
      // 如果当前块不为空，先保存
      if (currentChunk) {
        const tokenCount = countTokens(currentChunk, provider)
        chunks.push({
          index: currentIndex++,
          text: currentChunk,
          startPosition: currentStartPosition,
          endPosition: currentStartPosition + currentChunk.length,
          tokenCount
        })

        // 添加重叠区域（保持上下文连续性）
        if (overlap > 0 && i > 0) {
          const overlapText = getOverlapText(currentChunk, overlap)
          currentChunk = overlapText + '\n\n' + paragraph
          currentStartPosition = currentStartPosition + currentChunk.length - overlapText.length - paragraph.length - 2
        } else {
          currentChunk = paragraph
          currentStartPosition = text.indexOf(paragraph, currentStartPosition)
        }
      } else {
        // 如果单个段落就超过限制，需要强制分割
        const forcedChunks = forceSplitParagraph(paragraph, maxTokensPerChunk, provider, overlap)

        for (const forcedChunk of forcedChunks) {
          forcedChunk.index = currentIndex++
          chunks.push(forcedChunk)
        }

        currentChunk = ''
        // 找下一个段落的位置
        const nextParagraph = paragraphs[i + 1] || ''
        if (nextParagraph) {
          const pos = text.indexOf(nextParagraph, currentStartPosition)
          if (pos !== -1) {
            currentStartPosition = pos
          }
        }
      }
    }
  }

  // 保存最后一块
  if (currentChunk) {
    const tokenCount = countTokens(currentChunk, provider)
    chunks.push({
      index: currentIndex,
      text: currentChunk,
      startPosition: currentStartPosition,
      endPosition: currentStartPosition + currentChunk.length,
      tokenCount
    })
  }

  return chunks
}

/**
 * 获取重叠文本
 */
function getOverlapText(text: string, overlapChars: number): string {
  if (text.length <= overlapChars) {
    return text
  }

  // 尝试在段落边界分割
  const lastParagraphBreak = text.lastIndexOf('\n\n', text.length - overlapChars)

  if (lastParagraphBreak !== -1 && text.length - lastParagraphBreak <= overlapChars * 1.5) {
    return text.slice(lastParagraphBreak + 2)
  }

  // 尝试在句子边界分割
  const lastSentenceBreak = text.lastIndexOf('。', text.length - overlapChars)

  if (lastSentenceBreak !== -1 && text.length - lastSentenceBreak <= overlapChars * 1.5) {
    return text.slice(lastSentenceBreak + 1)
  }

  // 直接截取
  return text.slice(-overlapChars)
}

/**
 * 强制分割超长段落
 */
function forceSplitParagraph(
  paragraph: string,
  maxTokens: number,
  provider: LLMProvider,
  overlap: number
): TextChunk[] {
  const chunks: TextChunk[] = []

  // 按句子分割
  const sentences = paragraph.match(/[^。！？]+[。！？]/g) || [paragraph]

  let currentChunk = ''
  let currentStart = 0

  for (const sentence of sentences) {
    const testChunk = currentChunk + sentence
    const testTokens = countTokens(testChunk, provider)

    if (testTokens <= maxTokens) {
      currentChunk = testChunk
    } else {
      if (currentChunk) {
        chunks.push({
          index: 0,  // 会被外层覆盖
          text: currentChunk,
          startPosition: currentStart,
          endPosition: currentStart + currentChunk.length,
          tokenCount: countTokens(currentChunk, provider)
        })

        // 添加重叠
        if (overlap > 0) {
          const overlapText = currentChunk.slice(-overlap)
          currentChunk = overlapText + sentence
          currentStart = currentStart + currentChunk.length - overlapText.length - sentence.length
        } else {
          currentChunk = sentence
          currentStart += currentChunk.length
        }
      } else {
        // 单个句子就超长，按字符分割
        const charChunks = splitByChars(sentence, maxTokens, provider, overlap)
        chunks.push(...charChunks)
        currentChunk = ''
        currentStart += sentence.length
      }
    }
  }

  if (currentChunk) {
    chunks.push({
      index: 0,
      text: currentChunk,
      startPosition: currentStart,
      endPosition: currentStart + currentChunk.length,
      tokenCount: countTokens(currentChunk, provider)
    })
  }

  return chunks
}

/**
 * 按字符数分割
 */
function splitByChars(
  text: string,
  maxTokens: number,
  provider: LLMProvider,
  overlap: number
): TextChunk[] {
  const chunks: TextChunk[] = []

  // 估算字符/token比例
  const avgCharsPerToken = 3
  const maxChars = maxTokens * avgCharsPerToken

  let start = 0
  let index = 0

  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length)
    const chunkText = text.slice(start, end)

    chunks.push({
      index: index++,
      text: chunkText,
      startPosition: start,
      endPosition: end,
      tokenCount: countTokens(chunkText, provider)
    })

    start = end - overlap
  }

  return chunks
}

/**
 * 提取文本的采样部分
 * 用于快速模式
 */
export function sampleText(
  text: string,
  startChars: number,
  endChars: number
): { start: string; end: string } {
  const start = text.slice(0, startChars)
  const end = text.slice(-endChars)

  return { start, end }
}

/**
 * 选择代表性章节
 * 用于世界观提取
 */
export function selectRepresentativeChapters(
  chapters: Array<{ number: number; content: string }>,
  mode: 'first-5-middle-5-last-5' | 'all'
): Array<{ number: number; content: string }> {
  if (mode === 'all') {
    return chapters
  }

  const selected: Array<{ number: number; content: string }> = []

  // 前5章
  const first5 = chapters.slice(0, 5)
  selected.push(...first5)

  // 中间5章
  const middleStart = Math.floor(chapters.length / 2) - 2
  const middle5 = chapters.slice(middleStart, middleStart + 5)
  selected.push(...middle5)

  // 最后5章
  const last5 = chapters.slice(-5)
  selected.push(...last5)

  // 去重
  const seen = new Set<number>()
  return selected.filter(ch => {
    if (seen.has(ch.number)) {
      return false
    }
    seen.add(ch.number)
    return true
  })
}
