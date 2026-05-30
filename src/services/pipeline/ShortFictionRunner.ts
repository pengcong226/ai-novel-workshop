/**
 * ShortFictionRunner — 短篇Pipeline编排器
 *
 * 基于ShortFictionAgent的完整短篇生成Pipeline
 */

import { ShortFictionAgent } from '@/agents/ShortFictionAgent'
import type { ShortFictionConfig, ShortFictionResult } from '@/agents/ShortFictionAgent'
import { getLogger } from '@/utils/logger'
import { safeParseAIJson } from '@/utils/safeParseAIJson'
import type { TokenUsage } from '@/services/pipeline/types'

const logger = getLogger('pipeline:short-fiction')

// ============================================================================
// 类型定义
// ============================================================================

export interface ShortFictionRunOptions {
  config: ShortFictionConfig
  autoReview?: boolean             // 是否自动审稿（默认true）
  maxRetries?: number              // 每章最大修订次数（默认1）
  onProgress?: (event: ShortFictionProgressEvent) => void
}

export interface ShortFictionProgressEvent {
  stage: 'outline' | 'writing' | 'review' | 'complete'
  chapterNumber?: number
  totalChapters?: number
  message: string
}

// ============================================================================
// 审稿Prompt
// ============================================================================

const REVIEW_SYSTEM_PROMPT = `你是一位网络小说审稿编辑。请对以下章节进行快速审稿。

## 审稿维度
1. 情节连贯性：与前文大纲是否一致
2. 角色一致性：人物行为是否符合设定
3. 文笔质量：是否有明显AI痕迹或不通顺的表达
4. 字数合规：是否在指定字数范围内

## 输出格式
严格返回 JSON：
{
  "passed": true/false,
  "score": 0-100,
  "issues": ["问题1", "问题2"],
  "suggestions": ["建议1", "建议2"]
}`

// ============================================================================
// ShortFictionRunner 主类
// ============================================================================

export class ShortFictionRunner {
  private agent: ShortFictionAgent

  constructor() {
    this.agent = new ShortFictionAgent()
  }

  /**
   * 执行短篇生成Pipeline
   */
  async run(options: ShortFictionRunOptions): Promise<ShortFictionResult> {
    const { config, autoReview = true, maxRetries = 1, onProgress } = options

    logger.info(`[短篇Pipeline] 开始执行，题材: ${config.genre}，章节: ${config.chapterCount}，自动审稿: ${autoReview}`)

    const startTime = performance.now()
    const totalTokenUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

    // ---- 阶段一：生成大纲 ----
    this.emitProgress(onProgress, {
      stage: 'outline',
      totalChapters: config.chapterCount,
      message: '正在生成小说大纲...',
    })

    const { outline, tokenUsage: outlineUsage } = await this.agent.generateOutline(config)
    this.accumulateTokenUsage(totalTokenUsage, outlineUsage)

    logger.info(`[短篇Pipeline] 大纲生成完成: "${outline.title}"`)

    this.emitProgress(onProgress, {
      stage: 'outline',
      totalChapters: config.chapterCount,
      message: `大纲生成完成: "${outline.title}"`,
    })

    // ---- 阶段二：逐章撰写 + 可选审稿 ----
    const chapters: ShortFictionResult['chapters'] = []
    let previousContent: string | undefined

    for (let i = 0; i < config.chapterCount; i++) {
      const chapterOutline = outline.chapters[i]
      logger.info(`[短篇Pipeline] 开始处理第${chapterOutline.number}章: "${chapterOutline.title}"`)

      this.emitProgress(onProgress, {
        stage: 'writing',
        chapterNumber: chapterOutline.number,
        totalChapters: config.chapterCount,
        message: `正在撰写第${chapterOutline.number}章: "${chapterOutline.title}"`,
      })

      let content = ''
      let wordCount = 0
      let attempts = 0

      // 撰写 + 审稿循环
      while (attempts <= maxRetries) {
        attempts++

        // 撰写章节
        const writeResult = await this.agent.writeChapter(config, outline, i, previousContent)
        this.accumulateTokenUsage(totalTokenUsage, writeResult.tokenUsage)
        content = writeResult.content
        wordCount = writeResult.wordCount

        logger.info(`[短篇Pipeline] 第${chapterOutline.number}章第${attempts}次撰写完成，字数: ${wordCount}`)

        // 自动审稿
        if (!autoReview) {
          break
        }

        this.emitProgress(onProgress, {
          stage: 'review',
          chapterNumber: chapterOutline.number,
          totalChapters: config.chapterCount,
          message: `正在审稿第${chapterOutline.number}章（第${attempts}次）...`,
        })

        const reviewResult = await this.reviewChapter(config, outline, i, content)

        if (reviewResult.passed) {
          logger.info(`[短篇Pipeline] 第${chapterOutline.number}章审稿通过，评分: ${reviewResult.score}`)
          break
        }

        if (attempts > maxRetries) {
          logger.warn(`[短篇Pipeline] 第${chapterOutline.number}章达到最大修订次数(${maxRetries})，使用当前版本，评分: ${reviewResult.score}`)
          break
        }

        logger.info(`[短篇Pipeline] 第${chapterOutline.number}章审稿未通过（评分: ${reviewResult.score}），进行第${attempts + 1}次尝试`)
      }

      chapters.push({
        number: chapterOutline.number,
        title: chapterOutline.title,
        content,
        wordCount,
      })

      previousContent = content

      // 章节间冷却
      if (i < config.chapterCount - 1) {
        await this.cooldown(2000)
      }
    }

    // ---- 阶段三：组装最终结果 ----
    const totalWordCount = chapters.reduce((sum, ch) => sum + ch.wordCount, 0)
    const elapsed = Math.round(performance.now() - startTime)

    const result: ShortFictionResult = {
      outline,
      chapters,
      totalWordCount,
      tokenUsage: totalTokenUsage,
    }

    logger.info(`[短篇Pipeline] 生成完成: "${outline.title}"，共${chapters.length}章，总字数: ${totalWordCount}，耗时: ${elapsed}ms`)

    this.emitProgress(onProgress, {
      stage: 'complete',
      totalChapters: config.chapterCount,
      message: `短篇小说 "${outline.title}" 生成完成，共${chapters.length}章，${totalWordCount}字`,
    })

    return result
  }

  /**
   * 审稿单章
   */
  private async reviewChapter(
    config: ShortFictionConfig,
    outline: ShortFictionResult['outline'],
    chapterIndex: number,
    content: string
  ): Promise<{ passed: boolean; score: number; issues: string[]; suggestions: string[] }> {
    const chapter = outline.chapters[chapterIndex]
    const emptyResult = { passed: true, score: 80, issues: [], suggestions: [] }

    try {
      const { useAIStore } = await import('@/stores/ai')
      const aiStore = useAIStore()

      if (!aiStore.checkInitialized()) {
        logger.warn('[短篇Pipeline] AI未初始化，跳过审稿')
        return emptyResult
      }

      const userPrompt = `## 章节信息
小说标题：${outline.title}
题材：${config.genre}
章节：第${chapter.number}章 - ${chapter.title}
大纲摘要：${chapter.summary}
关键事件：${chapter.keyEvents.join('、')}
字数要求：${config.wordsPerChapter - 100}-${config.wordsPerChapter + 100}字
实际字数：${content.length}字

## 章节正文
${content}`

      const response = await aiStore.chat(
        [
          { role: 'system', content: REVIEW_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        {
          type: 'check',
          complexity: 'low',
          priority: 'speed',
        },
        { maxTokens: 1000 }
      )

      const parsed = safeParseAIJson<{
        passed: boolean
        score: number
        issues: string[]
        suggestions: string[]
      }>(response.content)

      if (parsed) {
        return {
          passed: Boolean(parsed.passed),
          score: typeof parsed.score === 'number' ? parsed.score : 80,
          issues: Array.isArray(parsed.issues) ? parsed.issues : [],
          suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
        }
      }

      return emptyResult
    } catch (error) {
      logger.error(`[短篇Pipeline] 第${chapter.number}章审稿异常:`, error)
      return emptyResult
    }
  }

  /**
   * 发送进度事件
   */
  private emitProgress(
    onProgress: ShortFictionRunOptions['onProgress'],
    event: ShortFictionProgressEvent
  ): void {
    if (onProgress) {
      try {
        onProgress(event)
      } catch (error) {
        logger.warn('[短篇Pipeline] 进度回调异常:', error)
      }
    }
  }

  /**
   * 累计Token用量
   */
  private accumulateTokenUsage(target: TokenUsage, source: TokenUsage): void {
    target.inputTokens += source.inputTokens
    target.outputTokens += source.outputTokens
    target.totalTokens += source.totalTokens
  }

  /**
   * 冷却等待
   */
  private cooldown(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
