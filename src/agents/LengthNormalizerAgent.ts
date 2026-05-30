/**
 * LengthNormalizerAgent（字数标准化器）
 *
 * 当章节字数超出硬范围时，通过 LLM 修正（压缩或扩展）到目标区间。
 * 字数在范围内时不执行任何操作。
 */

import { getLogger } from '@/utils/logger'
import type {
  NormalizeLengthInput,
  NormalizeLengthOutput,
  LengthSpec,
  TokenUsage,
} from '@/services/pipeline/types'

const logger = getLogger('agent:normalizer')

// ============================================================================
// 字数计算工具
// ============================================================================

/**
 * 计算中文字符数（不含空格和标点的纯文字数）
 * 与 gpt-tokenizer 的计数方式保持一致
 */
export function countChars(content: string): number {
  // 移除空白字符后计算
  return content.replace(/\s/g, '').length
}

/**
 * 判断字数是否在范围内
 */
export function checkLengthRange(
  wordCount: number,
  spec: LengthSpec
): 'in-range' | 'soft-low' | 'soft-high' | 'hard-low' | 'hard-high' {
  if (wordCount < spec.hardMin) return 'hard-low'
  if (wordCount > spec.hardMax) return 'hard-high'
  if (wordCount < spec.softMin) return 'soft-low'
  if (wordCount > spec.softMax) return 'soft-high'
  return 'in-range'
}

/**
 * 构建 LengthSpec
 */
export function buildLengthSpec(targetWordCount: number): LengthSpec {
  return {
    target: targetWordCount,
    softMin: Math.round(targetWordCount * 0.85),
    softMax: Math.round(targetWordCount * 1.15),
    hardMin: Math.round(targetWordCount * 0.7),
    hardMax: Math.round(targetWordCount * 1.5),
    countingMode: 'chars',
  }
}

// ============================================================================
// Normalizer Prompt
// ============================================================================

function buildCompressPrompt(content: string, target: number, current: number): string {
  return `请将以下章节正文压缩到约 ${target} 字（当前 ${current} 字）。

## 压缩规则
1. 保留所有关键情节、对话要点和角色互动
2. 删除冗余描写、重复表述和不影响情节的过渡段
3. 精简过长的环境描写和心理描写
4. 不改变事实、人名、地名和关键信息
5. 保持叙事连贯性

## 原文
${content}

直接输出压缩后的完整正文，不要添加任何解释。`
}

function buildExpandPrompt(content: string, target: number, current: number, intent?: string): string {
  return `请将以下章节正文扩展到约 ${target} 字（当前 ${current} 字）。

## 扩展规则
1. 丰富场景描写和环境细节
2. 深化角色心理活动和情感刻画
3. 增加角色间的互动对话
4. 补充过渡段落和节奏缓冲
5. 不引入新的支线或未计划的情节
6. 保持与已有内容的一致性
${intent ? `\n## 章节意图\n${intent}` : ''}

## 原文
${content}

直接输出扩展后的完整正文，不要添加任何解释。`
}

// ============================================================================
// LengthNormalizerAgent 主类
// ============================================================================

export class LengthNormalizerAgent {
  private aiStore: any = null

  private async getAIStore() {
    if (!this.aiStore) {
      const { useAIStore } = await import('@/stores/ai')
      this.aiStore = useAIStore()
    }
    return this.aiStore
  }

  /**
   * 执行字数标准化
   */
  async normalize(input: NormalizeLengthInput): Promise<NormalizeLengthOutput> {
    const { content, lengthSpec, chapterIntent } = input
    const currentCount = countChars(content)
    const range = checkLengthRange(currentCount, lengthSpec)

    const emptyUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

    // 在范围内，不需要标准化
    if (range === 'in-range') {
      logger.info(`[Normalizer] 字数 ${currentCount} 在范围内（${lengthSpec.softMin}-${lengthSpec.softMax}），跳过`)
      return {
        normalizedContent: content,
        finalCount: currentCount,
        applied: false,
        mode: 'none',
        tokenUsage: emptyUsage,
      }
    }

    // 软范围外但硬范围内，记录警告但不触发LLM
    if (range === 'soft-low' || range === 'soft-high') {
      const direction = range === 'soft-low' ? '偏少' : '偏多'
      logger.info(`[Normalizer] 字数 ${currentCount} 软范围外（目标 ${lengthSpec.target}），${direction}，不触发标准化`)
      return {
        normalizedContent: content,
        finalCount: currentCount,
        applied: false,
        mode: 'none',
        warning: `字数${direction}（${currentCount}/${lengthSpec.target}），但在可接受范围内`,
        tokenUsage: emptyUsage,
      }
    }

    // 硬范围外，需要标准化
    const mode = range === 'hard-low' ? 'expand' : 'compress'
    logger.info(`[Normalizer] 字数 ${currentCount} 硬范围外，触发 ${mode}（目标 ${lengthSpec.target}）`)

    try {
      const aiStore = await this.getAIStore()
      if (!aiStore.checkInitialized()) {
        logger.warn('[Normalizer] AI未初始化，跳过标准化')
        return {
          normalizedContent: content,
          finalCount: currentCount,
          applied: false,
          mode: 'none',
          warning: 'AI未初始化，无法执行字数标准化',
          tokenUsage: emptyUsage,
        }
      }

      const prompt = mode === 'compress'
        ? buildCompressPrompt(content, lengthSpec.target, currentCount)
        : buildExpandPrompt(content, lengthSpec.target, currentCount, chapterIntent)

      const response = await aiStore.chat(
        [{ role: 'user', content: prompt }],
        {
          type: 'chapter',
          complexity: 'medium',
          priority: 'balanced',
        },
        { maxTokens: 8000 }
      )

      const normalizedContent = response.content?.trim() || content
      const finalCount = countChars(normalizedContent)

      const tokenUsage: TokenUsage = {
        inputTokens: response.usage?.inputTokens || 0,
        outputTokens: response.usage?.outputTokens || 0,
        totalTokens: response.usage?.totalTokens || 0,
      }

      // 检查标准化后是否更差
      const originalDistance = Math.abs(currentCount - lengthSpec.target)
      const newDistance = Math.abs(finalCount - lengthSpec.target)

      if (newDistance > originalDistance) {
        logger.warn(`[Normalizer] 标准化后字数偏离更大（${currentCount}→${finalCount}，目标${lengthSpec.target}），回滚`)
        return {
          normalizedContent: content,
          finalCount: currentCount,
          applied: false,
          mode: 'none',
          warning: '标准化后偏离更大，已回滚',
          tokenUsage,
        }
      }

      logger.info(`[Normalizer] 标准化完成: ${currentCount}→${finalCount}（目标 ${lengthSpec.target}）`)

      return {
        normalizedContent,
        finalCount,
        applied: true,
        mode,
        tokenUsage,
      }
    } catch (error) {
      logger.error('[Normalizer] 标准化调用失败:', error)
      return {
        normalizedContent: content,
        finalCount: currentCount,
        applied: false,
        mode: 'none',
        warning: `标准化失败: ${error instanceof Error ? error.message : String(error)}`,
        tokenUsage: emptyUsage,
      }
    }
  }
}
