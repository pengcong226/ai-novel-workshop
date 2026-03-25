/**
 * Token计数工具
 * 支持多种LLM提供商的tokenizer
 */

import { encode } from 'gpt-tokenizer'
import type { LLMProvider } from './types'

/**
 * 统计文本的token数量
 * @param text 要统计的文本
 * @param provider LLM提供商类型
 * @returns token数量
 */
export function countTokens(text: string, provider: LLMProvider): number {
  switch (provider) {
    case 'openai':
      // 使用gpt-tokenizer（基于GPT-4的tokenizer）
      return encode(text).length

    case 'anthropic':
      // Claude tokenizer近似：中文约1.5字符/token
      return estimateClaudeTokens(text)

    case 'local':
    case 'custom':
    default:
      // 通用估算：平均3个字符1个token
      return Math.ceil(text.length / 3)
  }
}

/**
 * 估算Claude模型的token数量
 * Claude的tokenizer对中文更友好
 */
function estimateClaudeTokens(text: string): number {
  // 中文字符
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length

  // 英文单词
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length

  // 其他字符（标点、空格、数字等）
  const otherChars = text.length - chineseChars - englishWords

  // Claude tokenizer估算：
  // 中文：约1.5字符/token
  // 英文：约1词/token（1词平均约4字符）
  // 其他：约4字符/token
  return Math.ceil(
    chineseChars / 1.5 +
    englishWords +
    otherChars / 4
  )
}

/**
 * 计算文本块的token总数
 */
export function countChunksTokens(chunks: Array<{ text: string }>, provider: LLMProvider): number {
  return chunks.reduce((sum, chunk) => sum + countTokens(chunk.text, provider), 0)
}

/**
 * 估算成本（美元）
 */
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  inputPrice: number,  // 每1M tokens价格
  outputPrice: number   // 每1M tokens价格
): number {
  return (inputTokens * inputPrice + outputTokens * outputPrice) / 1000000
}
