/**
 * ChapterAnalyzer（章节分析器）
 *
 * 从正文和状态变更中生成结构化章节摘要、伏笔追踪、情感弧线更新。
 * Phase 8 of Pipeline: 在 StateSettler 之后执行
 */

import { getLogger } from '@/utils/logger'
import { safeParseAIJson } from '@/utils/safeParseAIJson'
import type { TokenUsage } from '@/services/pipeline/types'

const logger = getLogger('agent:analyzer')

// ============================================================================
// 类型定义
// ============================================================================

export interface ChapterAnalysisInput {
  chapterNumber: number
  chapterContent: string
  chapterTitle: string
  existingSummary?: string
}

export interface ChapterAnalysisOutput {
  chapterSummary: string       // ≤500字结构化摘要
  hookUpdates: HookUpdate[]
  emotionalArcUpdate: string
  subplotUpdate: string
  tokenUsage: TokenUsage
}

export interface HookUpdate {
  id?: string
  content: string
  previousStatus: 'planted' | 'advanced' | 'resolved'
  newStatus: 'planted' | 'advanced' | 'resolved'
  chapterNumber: number
}

// ============================================================================
// Prompt
// ============================================================================

const ANALYSIS_SYSTEM_PROMPT = `你是一位小说章节分析专家。请对以下章节进行结构化分析。

## 输出格式
严格返回 JSON：
{
  "chapterSummary": "200字以内的结构化章节摘要，包含：核心事件、角色发展、情节推进",
  "hookUpdates": [
    { "content": "伏笔内容", "previousStatus": "planted|advanced|resolved", "newStatus": "planted|advanced|resolved" }
  ],
  "emotionalArcUpdate": "50字以内的情感走向描述（本章情绪曲线：起始→高潮→结尾）",
  "subplotUpdate": "50字以内的支线推进状态描述"
}`

// ============================================================================
// ChapterAnalyzer 主类
// ============================================================================

export class ChapterAnalyzer {
  private aiStore: any = null

  private async getAIStore() {
    if (!this.aiStore) {
      const { useAIStore } = await import('@/stores/ai')
      this.aiStore = useAIStore()
    }
    return this.aiStore
  }

  /**
   * 执行章节分析
   */
  async analyze(input: ChapterAnalysisInput): Promise<ChapterAnalysisOutput> {
    const startTime = performance.now()
    logger.info(`[Analyzer] 开始分析第${input.chapterNumber}章`)

    const emptyUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

    try {
      const aiStore = await this.getAIStore()
      if (!aiStore.checkInitialized()) {
        logger.warn('[Analyzer] AI未初始化，使用基础摘要')
        return this.buildFallback(input, emptyUsage)
      }

      const userPrompt = `## 章节标题
${input.chapterTitle}

## 章节正文
${input.chapterContent}

${input.existingSummary ? `## Writer已生成的摘要\n${input.existingSummary}\n\n请在此基础上优化和补充。` : ''}`

      const response = await aiStore.chat(
        [
          { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        {
          type: 'check',
          complexity: 'low',
          priority: 'balanced',
        },
        { maxTokens: 2000 }
      )

      const tokenUsage: TokenUsage = {
        inputTokens: response.usage?.inputTokens || 0,
        outputTokens: response.usage?.outputTokens || 0,
        totalTokens: response.usage?.totalTokens || 0,
      }

      const parsed = safeParseAIJson<{
        chapterSummary: string
        hookUpdates: HookUpdate[]
        emotionalArcUpdate: string
        subplotUpdate: string
      }>(response.content)

      if (parsed) {
        const elapsed = Math.round(performance.now() - startTime)
        logger.info(`[Analyzer] 分析完成，耗时 ${elapsed}ms`)

        return {
          chapterSummary: parsed.chapterSummary || input.existingSummary || `第${input.chapterNumber}章`,
          hookUpdates: Array.isArray(parsed.hookUpdates) ? parsed.hookUpdates : [],
          emotionalArcUpdate: parsed.emotionalArcUpdate || '',
          subplotUpdate: parsed.subplotUpdate || '',
          tokenUsage,
        }
      }
    } catch (error) {
      logger.error('[Analyzer] 章节分析失败:', error)
    }

    return this.buildFallback(input, emptyUsage)
  }

  /**
   * 降级结果
   */
  private buildFallback(input: ChapterAnalysisInput, tokenUsage: TokenUsage): ChapterAnalysisOutput {
    // 从正文中提取前200字作为基础摘要
    const plainText = input.chapterContent.replace(/[#*\-\]()]/g, '').trim()
    const summary = plainText.slice(0, 200) + (plainText.length > 200 ? '...' : '')

    return {
      chapterSummary: input.existingSummary || summary || `第${input.chapterNumber}章`,
      hookUpdates: [],
      emotionalArcUpdate: '',
      subplotUpdate: '',
      tokenUsage,
    }
  }
}
