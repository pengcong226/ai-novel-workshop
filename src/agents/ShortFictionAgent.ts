/**
 * ShortFictionAgent — 短篇小说Agent
 *
 * 12-18章，每章900-1200字
 * 三步流程：大纲生成 → 批量写作 → 打包
 */

import { getLogger } from '@/utils/logger'
import { safeParseAIJson } from '@/utils/safeParseAIJson'
import type { TokenUsage } from '@/services/pipeline/types'

const logger = getLogger('agent:short-fiction')

// ============================================================================
// 类型定义
// ============================================================================

export interface ShortFictionConfig {
  title?: string
  genre: string
  theme: string                    // 主题/设定
  chapterCount: number             // 12-18
  wordsPerChapter: number          // 900-1200
  language: 'zh' | 'en'
  style?: string                   // 文风要求
}

export interface ShortFictionOutline {
  title: string
  synopsis: string                 // 简介（200字以内）
  sellingPoints: string[]          // 卖点
  coverPrompt: string              // 封面提示词
  chapters: Array<{
    number: number
    title: string
    summary: string                // 章节摘要
    keyEvents: string[]            // 关键事件
  }>
}

export interface ShortFictionResult {
  outline: ShortFictionOutline
  chapters: Array<{
    number: number
    title: string
    content: string
    wordCount: number
  }>
  totalWordCount: number
  tokenUsage: TokenUsage
}

// ============================================================================
// Prompt 模板
// ============================================================================

const OUTLINE_SYSTEM_PROMPT = `你是一位资深网络小说策划编辑。请根据用户提供的题材和主题，生成一份完整的短篇小说大纲。

## 要求
1. 标题要吸引眼球，符合网文风格
2. 简介控制在200字以内，突出核心卖点
3. 卖点3-5条，每条一句话
4. 每章大纲包含：章节标题、章节摘要（50-100字）、关键事件（2-4个）
5. 章节之间要有明确的情节推进和转折
6. 整体结构要符合起承转合的叙事节奏

## 输出格式
严格返回如下 JSON：
{
  "title": "小说标题",
  "synopsis": "200字以内的简介",
  "sellingPoints": ["卖点1", "卖点2", "卖点3"],
  "coverPrompt": "封面插图的英文描述提示词，50字以内",
  "chapters": [
    {
      "number": 1,
      "title": "章节标题",
      "summary": "章节摘要",
      "keyEvents": ["事件1", "事件2"]
    }
  ]
}`

const CHAPTER_SYSTEM_PROMPT = `你是一位专业的网络小说作家。请根据大纲信息撰写一个完整的章节。

## 写作要求
1. 严格遵循大纲中的情节安排和关键事件
2. 文笔流畅，节奏明快，适合网文阅读
3. 对话自然生动，符合角色性格
4. 场景描写简洁有力，不过分堆砌辞藻
5. 章节结尾要有悬念或情感钩子
6. 不要使用"仿佛"、"不禁"、"宛如"等AI常用词
7. 字数控制在指定范围内
8. 直接输出正文内容，不要添加章节标题或任何标记`

// ============================================================================
// ShortFictionAgent 主类
// ============================================================================

export class ShortFictionAgent {
  private aiStore: any = null

  private async getAIStore() {
    if (!this.aiStore) {
      const { useAIStore } = await import('@/stores/ai')
      this.aiStore = useAIStore()
    }
    return this.aiStore
  }

  /**
   * 生成短篇小说大纲
   */
  async generateOutline(config: ShortFictionConfig): Promise<{ outline: ShortFictionOutline; tokenUsage: TokenUsage }> {
    logger.info(`[短篇Agent] 开始生成大纲，题材: ${config.genre}，主题: ${config.theme}`)

    const emptyUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

    try {
      const aiStore = await this.getAIStore()
      if (!aiStore.checkInitialized()) {
        logger.error('[短篇Agent] AI未初始化，无法生成大纲')
        throw new Error('AI未初始化')
      }

      const userPrompt = `## 题材
${config.genre}

## 主题/设定
${config.theme}

## 章节数量
${config.chapterCount}章

## 每章字数
约${config.wordsPerChapter}字

${config.title ? `## 指定标题\n${config.title}\n` : ''}
${config.style ? `## 文风要求\n${config.style}\n` : ''}

请生成完整的小说大纲。`

      const response = await aiStore.chat(
        [
          { role: 'system', content: OUTLINE_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        {
          type: 'generate',
          complexity: 'medium',
          priority: 'balanced',
        },
        { maxTokens: 4000 }
      )

      const tokenUsage: TokenUsage = {
        inputTokens: response.usage?.inputTokens || 0,
        outputTokens: response.usage?.outputTokens || 0,
        totalTokens: response.usage?.totalTokens || 0,
      }

      const parsed = safeParseAIJson<ShortFictionOutline>(response.content)

      if (!parsed) {
        logger.error('[短篇Agent] 大纲JSON解析失败')
        throw new Error('大纲JSON解析失败')
      }

      // 验证和修正字段
      const outline: ShortFictionOutline = {
        title: config.title || parsed.title || '未命名短篇',
        synopsis: (parsed.synopsis || '').slice(0, 200),
        sellingPoints: Array.isArray(parsed.sellingPoints) ? parsed.sellingPoints.slice(0, 5) : [],
        coverPrompt: parsed.coverPrompt || '',
        chapters: Array.isArray(parsed.chapters)
          ? parsed.chapters.slice(0, config.chapterCount).map((ch, idx) => ({
              number: idx + 1,
              title: ch.title || `第${idx + 1}章`,
              summary: ch.summary || '',
              keyEvents: Array.isArray(ch.keyEvents) ? ch.keyEvents : [],
            }))
          : [],
      }

      // 确保章节数量匹配
      while (outline.chapters.length < config.chapterCount) {
        const idx = outline.chapters.length
        outline.chapters.push({
          number: idx + 1,
          title: `第${idx + 1}章`,
          summary: '',
          keyEvents: [],
        })
      }

      logger.info(`[短篇Agent] 大纲生成完成: "${outline.title}"，共${outline.chapters.length}章`)

      return { outline, tokenUsage }
    } catch (error) {
      logger.error('[短篇Agent] 大纲生成失败:', error)
      throw error
    }
  }

  /**
   * 撰写单章
   */
  async writeChapter(
    config: ShortFictionConfig,
    outline: ShortFictionOutline,
    chapterIndex: number,
    previousContent?: string
  ): Promise<{ content: string; wordCount: number; tokenUsage: TokenUsage }> {
    const chapter = outline.chapters[chapterIndex]
    if (!chapter) {
      throw new Error(`章节索引 ${chapterIndex} 超出大纲范围`)
    }

    logger.info(`[短篇Agent] 开始撰写第${chapter.number}章: "${chapter.title}"`)

    const emptyUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

    try {
      const aiStore = await this.getAIStore()
      if (!aiStore.checkInitialized()) {
        logger.error('[短篇Agent] AI未初始化，无法撰写章节')
        throw new Error('AI未初始化')
      }

      // 构建上下文
      const contextParts: string[] = []

      // 小说基本信息
      contextParts.push(`## 小说信息
标题：${outline.title}
题材：${config.genre}
主题：${config.theme}
${config.style ? `文风：${config.style}` : ''}`)

      // 当前章节大纲
      contextParts.push(`## 当前章节大纲
章节编号：第${chapter.number}章
章节标题：${chapter.title}
章节摘要：${chapter.summary}
关键事件：
${chapter.keyEvents.map(e => `- ${e}`).join('\n')}`)

      // 前文衔接
      if (previousContent) {
        const ending = previousContent.slice(-500)
        contextParts.push(`## 前一章结尾（用于衔接）
...${ending}`)
      }

      // 后续章节预览（提供方向感）
      if (chapterIndex < outline.chapters.length - 1) {
        const nextChapter = outline.chapters[chapterIndex + 1]
        contextParts.push(`## 下一章预告
第${nextChapter.number}章: ${nextChapter.title}
${nextChapter.summary}`)
      }

      const userPrompt = `${contextParts.join('\n\n')}

## 字数要求
${config.wordsPerChapter - 100}-${config.wordsPerChapter + 100}字

请撰写完整的章节正文。`

      const response = await aiStore.chat(
        [
          { role: 'system', content: CHAPTER_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        {
          type: 'generate',
          complexity: 'high',
          priority: 'quality',
        },
        { maxTokens: 3000 }
      )

      const tokenUsage: TokenUsage = {
        inputTokens: response.usage?.inputTokens || 0,
        outputTokens: response.usage?.outputTokens || 0,
        totalTokens: response.usage?.totalTokens || 0,
      }

      let content = response.content || ''

      // 清理可能的标记
      content = content
        .replace(/^第[一二三四五六七八九十\d]+章.*$/gm, '')
        .replace(/^#{1,3}\s+.*$/gm, '')
        .trim()

      const wordCount = content.length

      logger.info(`[短篇Agent] 第${chapter.number}章撰写完成，字数: ${wordCount}`)

      return { content, wordCount, tokenUsage }
    } catch (error) {
      logger.error(`[短篇Agent] 第${chapter.number}章撰写失败:`, error)
      throw error
    }
  }

  /**
   * 一键生成完整短篇（大纲+所有章节+打包）
   */
  async generateFull(
    config: ShortFictionConfig,
    onProgress?: (stage: string, chapter: number, total: number) => void
  ): Promise<ShortFictionResult> {
    logger.info(`[短篇Agent] 开始一键生成短篇小说，题材: ${config.genre}，章节: ${config.chapterCount}`)

    const totalTokenUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

    // 第一步：生成大纲
    onProgress?.('outline', 0, config.chapterCount)
    const { outline, tokenUsage: outlineUsage } = await this.generateOutline(config)
    totalTokenUsage.inputTokens += outlineUsage.inputTokens
    totalTokenUsage.outputTokens += outlineUsage.outputTokens
    totalTokenUsage.totalTokens += outlineUsage.totalTokens

    // 第二步：逐章撰写
    const chapters: ShortFictionResult['chapters'] = []
    let previousContent: string | undefined

    for (let i = 0; i < config.chapterCount; i++) {
      onProgress?.('writing', i + 1, config.chapterCount)

      const { content, wordCount, tokenUsage: chapterUsage } = await this.writeChapter(
        config,
        outline,
        i,
        previousContent
      )

      totalTokenUsage.inputTokens += chapterUsage.inputTokens
      totalTokenUsage.outputTokens += chapterUsage.outputTokens
      totalTokenUsage.totalTokens += chapterUsage.totalTokens

      chapters.push({
        number: outline.chapters[i].number,
        title: outline.chapters[i].title,
        content,
        wordCount,
      })

      previousContent = content

      // 章节间冷却，避免API限流
      if (i < config.chapterCount - 1) {
        await this.cooldown(2000)
      }
    }

    const totalWordCount = chapters.reduce((sum, ch) => sum + ch.wordCount, 0)

    logger.info(`[短篇Agent] 短篇生成完成: "${outline.title}"，共${chapters.length}章，总字数: ${totalWordCount}`)

    return {
      outline,
      chapters,
      totalWordCount,
      tokenUsage: totalTokenUsage,
    }
  }

  /**
   * 冷却等待
   */
  private cooldown(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
