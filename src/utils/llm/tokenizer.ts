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
      // 使用统一的token估算函数
      return estimateTokens(text)

    case 'local':
    case 'custom':
    default:
      // 通用估算：平均3个字符1个token
      return Math.ceil(text.length / 3)
  }
}

/**
 * 统一的Token估算函数（fallback模式）
 * 用于所有模块的token数量近似计算，确保一致性
 *
 * 估算策略：
 * - 中文：约1.5 token/字符（即1字符 ≈ 1.5 token）
 * - 英文：约4字符/token（BPE tokenizer的典型表现）
 * - 其他（标点、数字、空格等）：约3字符/token
 */
export function estimateTokens(text: string): number {
  if (!text) return 0

  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const englishChars = (text.match(/[a-zA-Z]+/g) || []).join('').length
  const otherChars = text.length - chineseChars - englishChars

  return Math.ceil(
    chineseChars * 1.5 +
    englishChars / 4 +
    otherChars / 3
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
