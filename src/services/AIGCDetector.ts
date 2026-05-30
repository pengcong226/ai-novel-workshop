/**
 * AIGC检测服务
 * 集成 GPTZero / Originality.ai 等第三方API
 * 检测文本是否由AI生成
 */

import { getLogger } from '@/utils/logger'

const logger = getLogger('service:aigc-detector')

export type AIGCProvider = 'gptzero' | 'originality' | 'local'

export interface AIGCDetectionConfig {
  provider: AIGCProvider
  apiKey?: string
  apiUrl?: string
}

export interface AIGCDetectionResult {
  overallScore: number           // 0-100, 人类写作概率
  aiProbability: number         // 0-1, AI生成概率
  humanProbability: number      // 0-1, 人类写作概率
  provider: AIGCProvider
  originalProvider?: AIGCProvider  // 回退前的原始提供商（当外部API失败回退到local时记录）
  paragraphs: ParagraphDetection[]  // 段落级标注
  tokenUsage?: { inputTokens: number; outputTokens: number }
  latencyMs: number
}

export interface ParagraphDetection {
  paragraphIndex: number
  text: string
  aiProbability: number
  classification: 'human' | 'ai' | 'mixed' | 'uncertain'
}

/** 请求超时时间（毫秒） */
const REQUEST_TIMEOUT_MS = 30000

/** AI特征词列表 */
const AI_TELL_WORDS = [
  '此外', '总之', '综上所述', '值得注意的是', '不可否认',
  '毋庸置疑', '显而易见', '事实上', '从某种意义上说',
  '不言而喻', '至关重要', '不可或缺', '与此同时',
  '需要指出的是', '换句话说', '具体而言', '实际上',
  '进一步来说', '由此可知', '由此可见',
]

export class AIGCDetector {
  private config: AIGCDetectionConfig

  constructor(config: AIGCDetectionConfig) {
    this.config = config
    logger.info(`AIGC检测器初始化，使用${config.provider}作为检测提供商`)
  }

  /**
   * 检测文本的AIGC概率
   */
  async detect(text: string): Promise<AIGCDetectionResult> {
    if (!text || text.trim().length === 0) {
      logger.warn('传入文本为空，返回默认结果')
      return this.createEmptyResult('local')
    }

    logger.info(`开始AIGC检测，文本长度: ${text.length}字，提供商: ${this.config.provider}`)

    try {
      switch (this.config.provider) {
        case 'gptzero':
          return await this.detectWithGPTZero(text)
        case 'originality':
          return await this.detectWithOriginality(text)
        case 'local':
          return this.detectLocal(text)
        default:
          logger.error(`不支持的检测提供商: ${this.config.provider}`)
          throw new Error(`不支持的检测提供商: ${this.config.provider}`)
      }
    } catch (error) {
      logger.error(`AIGC检测失败，回退到本地检测: ${error instanceof Error ? error.message : String(error)}`)
      // 记录原始提供商，回退到 local 时保留来源信息
      const localResult = this.detectLocal(text)
      if (this.config.provider !== 'local') {
        localResult.originalProvider = this.config.provider
        logger.info(`原始提供商 ${this.config.provider} 失败，已回退到 local，originalProvider 已记录`)
      }
      return localResult
    }
  }

  /**
   * 批量检测多段文本
   */
  async detectBatch(texts: string[]): Promise<AIGCDetectionResult[]> {
    logger.info(`开始批量AIGC检测，共${texts.length}段文本`)

    const results: AIGCDetectionResult[] = []

    // 使用Promise.allSettled确保单个失败不影响整体
    const settled = await Promise.allSettled(
      texts.map((text, index) => {
        logger.debug(`检测第${index + 1}/${texts.length}段文本`)
        return this.detect(text)
      })
    )

    for (let i = 0; i < settled.length; i++) {
      const result = settled[i]
      if (result.status === 'fulfilled') {
        results.push(result.value)
      } else {
        logger.error(`第${i + 1}段文本检测失败: ${result.reason}`)
        results.push(this.createEmptyResult(this.config.provider))
      }
    }

    logger.info(`批量检测完成，成功${results.filter(r => r.latencyMs > 0).length}/${texts.length}段`)
    return results
  }

  /**
   * GPTZero API集成
   * POST https://api.gptzero.me/v2/predict/text
   */
  private async detectWithGPTZero(text: string): Promise<AIGCDetectionResult> {
    const startTime = Date.now()

    if (!this.config.apiKey) {
      throw new Error('GPTZero API密钥未配置')
    }

    const apiUrl = this.config.apiUrl || 'https://api.gptzero.me/v2/predict/text'

    logger.info(`调用GPTZero API: ${apiUrl}`)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
        },
        body: JSON.stringify({
          document: text,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text().catch(() => '未知错误')
        throw new Error(`GPTZero API返回错误 (${response.status}): ${errorText}`)
      }

      const data = await response.json() as {
        documents?: Array<{
          average_generated_prob?: number
          completely_generated_prob?: number
          paragraphs?: Array<{
            start_sentence_index?: number
            end_sentence_index?: number
            classification?: string
            perplexity?: number
          }>
        }>
      }

      const latencyMs = Date.now() - startTime
      const doc = data.documents?.[0]

      if (!doc) {
        throw new Error('GPTZero API返回数据格式异常')
      }

      const aiProb = doc.completely_generated_prob ?? doc.average_generated_prob ?? 0.5
      const humanProb = 1 - aiProb

      // 构建段落级检测结果
      const paragraphs = this.splitIntoParagraphs(text).map((para, index) => {
        const paraAiProb = doc.paragraphs?.[index]
          ? (doc.paragraphs[index].classification === 'ai' ? 0.8 : 0.2)
          : aiProb

        return {
          paragraphIndex: index,
          text: para,
          aiProbability: paraAiProb,
          classification: this.classifyParagraph(paraAiProb),
        }
      })

      const result: AIGCDetectionResult = {
        overallScore: Math.round(humanProb * 100),
        aiProbability: aiProb,
        humanProbability: humanProb,
        provider: 'gptzero',
        paragraphs,
        tokenUsage: {
          inputTokens: Math.ceil(text.length / 4),
          outputTokens: 0,
        },
        latencyMs,
      }

      logger.info(`GPTZero检测完成: AI概率=${(aiProb * 100).toFixed(1)}%, 耗时=${latencyMs}ms`)
      return result
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('GPTZero API请求超时')
      }
      throw error
    }
  }

  /**
   * Originality.ai API集成
   * POST https://api.originality.ai/api/v1/scan/ai
   */
  private async detectWithOriginality(text: string): Promise<AIGCDetectionResult> {
    const startTime = Date.now()

    if (!this.config.apiKey) {
      throw new Error('Originality.ai API密钥未配置')
    }

    const apiUrl = this.config.apiUrl || 'https://api.originality.ai/api/v1/scan/ai'

    logger.info(`调用Originality.ai API: ${apiUrl}`)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OAI-API-KEY': this.config.apiKey,
        },
        body: JSON.stringify({
          content: text,
          scan_title: 'AIGC Detection',
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text().catch(() => '未知错误')
        throw new Error(`Originality.ai API返回错误 (${response.status}): ${errorText}`)
      }

      const data = await response.json() as {
        score?: { ai?: number; original?: number }
        paragraphs?: Array<{
          text?: string
          ai?: number
        }>
      }

      const latencyMs = Date.now() - startTime

      const aiProb = data.score?.ai ?? 0.5
      const humanProb = data.score?.original ?? (1 - aiProb)

      // 构建段落级检测结果
      const rawParagraphs = data.paragraphs
      let paragraphs: ParagraphDetection[]

      if (rawParagraphs && rawParagraphs.length > 0) {
        paragraphs = rawParagraphs.map((para, index) => {
          const paraAiProb = para.ai ?? aiProb
          return {
            paragraphIndex: index,
            text: para.text || '',
            aiProbability: paraAiProb,
            classification: this.classifyParagraph(paraAiProb),
          }
        })
      } else {
        paragraphs = this.splitIntoParagraphs(text).map((para, index) => ({
          paragraphIndex: index,
          text: para,
          aiProbability: aiProb,
          classification: this.classifyParagraph(aiProb),
        }))
      }

      const result: AIGCDetectionResult = {
        overallScore: Math.round(humanProb * 100),
        aiProbability: aiProb,
        humanProbability: humanProb,
        provider: 'originality',
        paragraphs,
        tokenUsage: {
          inputTokens: Math.ceil(text.length / 4),
          outputTokens: 0,
        },
        latencyMs,
      }

      logger.info(`Originality.ai检测完成: AI概率=${(aiProb * 100).toFixed(1)}%, 耗时=${latencyMs}ms`)
      return result
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Originality.ai API请求超时')
      }
      throw error
    }
  }

  /**
   * 本地启发式检测（无API调用）
   * 基于AI特征词密度、句子模式一致性、句子长度变异等指标估算AI概率
   */
  private detectLocal(text: string): AIGCDetectionResult {
    const startTime = Date.now()

    logger.info(`执行本地启发式AIGC检测，文本长度: ${text.length}字`)

    const paragraphs = this.splitIntoParagraphs(text)
    const sentences = text.split(/[。！？；\n]+/).filter(s => s.trim().length > 0)

    // 指标1: AI特征词密度
    const tellWordCount = AI_TELL_WORDS.reduce((count, word) => {
      const regex = new RegExp(word, 'g')
      const matches = text.match(regex)
      return count + (matches ? matches.length : 0)
    }, 0)
    const tellWordDensity = sentences.length > 0 ? tellWordCount / sentences.length : 0

    // 指标2: 句子长度变异系数（AI生成的文本句子长度通常更均匀）
    const sentenceLengths = sentences.map(s => s.trim().length).filter(l => l > 0)
    const sentenceLengthMean = sentenceLengths.length > 0
      ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length
      : 0
    const sentenceLengthVariance = sentenceLengths.length > 0
      ? sentenceLengths.reduce((sum, len) => sum + Math.pow(len - sentenceLengthMean, 2), 0) / sentenceLengths.length
      : 0
    const sentenceLengthStdDev = Math.sqrt(sentenceLengthVariance)
    const cv = sentenceLengthMean > 0 ? sentenceLengthStdDev / sentenceLengthMean : 0
    // CV越低，越像AI（句子长度越均匀）
    const cvScore = Math.max(0, Math.min(1, 1 - cv))

    // 指标3: 段落长度一致性
    const paraLengths = paragraphs.map(p => p.trim().length).filter(l => l > 0)
    const paraLengthMean = paraLengths.length > 0
      ? paraLengths.reduce((a, b) => a + b, 0) / paraLengths.length
      : 0
    const paraLengthVariance = paraLengths.length > 0
      ? paraLengths.reduce((sum, len) => sum + Math.pow(len - paraLengthMean, 2), 0) / paraLengths.length
      : 0
    const paraCv = paraLengthMean > 0 ? Math.sqrt(paraLengthVariance) / paraLengthMean : 0
    const paraCvScore = Math.max(0, Math.min(1, 1 - paraCv))

    // 指标4: 词汇重复率（AI倾向于使用更重复的词汇模式）
    const allWords = text.match(/[\u4e00-\u9fa5]+/g) || []
    const uniqueWords = new Set(allWords)
    const lexicalDiversity = allWords.length > 0 ? uniqueWords.size / allWords.length : 1
    // 词汇多样性越低，越像AI
    const lexicalScore = Math.max(0, Math.min(1, 1 - lexicalDiversity))

    // 指标5: 标点符号使用模式（AI通常更规范）
    const commaCount = (text.match(/，/g) || []).length
    const periodCount = (text.match(/。/g) || []).length
    const punctuationRatio = sentences.length > 0 ? (commaCount + periodCount) / sentences.length : 0
    // 标点使用过于规律可能是AI
    const punctuationScore = punctuationRatio > 2 && punctuationRatio < 6 ? 0.6 : 0.3

    // 综合加权得分
    const aiProbability = Math.min(1, Math.max(0,
      tellWordDensity * 0.3 +
      cvScore * 0.2 +
      paraCvScore * 0.15 +
      lexicalScore * 0.25 +
      punctuationScore * 0.1
    ))

    const humanProbability = 1 - aiProbability

    // 段落级标注
    const paragraphDetections: ParagraphDetection[] = paragraphs.map((para, index) => {
      // 对每个段落单独计算AI特征词密度
      const paraSentences = para.split(/[。！？；]+/).filter(s => s.trim().length > 0)
      const paraTellCount = AI_TELL_WORDS.reduce((count, word) => {
        return count + (para.includes(word) ? 1 : 0)
      }, 0)
      const paraTellDensity = paraSentences.length > 0 ? paraTellCount / paraSentences.length : 0
      const paraAiProb = Math.min(1, Math.max(0, aiProbability * 0.6 + paraTellDensity * 0.4))

      return {
        paragraphIndex: index,
        text: para.trim(),
        aiProbability: paraAiProb,
        classification: this.classifyParagraph(paraAiProb),
      }
    })

    const latencyMs = Date.now() - startTime

    logger.info(
      `本地检测完成: AI概率=${(aiProbability * 100).toFixed(1)}%, ` +
      `特征词密度=${tellWordDensity.toFixed(3)}, CV=${cv.toFixed(3)}, ` +
      `词汇多样性=${lexicalDiversity.toFixed(3)}, 耗时=${latencyMs}ms`
    )

    return {
      overallScore: Math.round(humanProbability * 100),
      aiProbability,
      humanProbability,
      provider: 'local',
      paragraphs: paragraphDetections,
      latencyMs,
    }
  }

  /**
   * 将文本按双换行分割为段落
   */
  private splitIntoParagraphs(text: string): string[] {
    return text
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0)
  }

  /**
   * 根据AI概率对段落进行分类
   */
  private classifyParagraph(aiProbability: number): 'human' | 'ai' | 'mixed' | 'uncertain' {
    if (aiProbability >= 0.75) return 'ai'
    if (aiProbability <= 0.25) return 'human'
    if (aiProbability >= 0.4 && aiProbability <= 0.6) return 'uncertain'
    return 'mixed'
  }

  /**
   * 创建空的检测结果（用于错误恢复）
   */
  private createEmptyResult(provider: AIGCProvider): AIGCDetectionResult {
    return {
      overallScore: 50,
      aiProbability: 0.5,
      humanProbability: 0.5,
      provider,
      paragraphs: [],
      latencyMs: 0,
    }
  }
}
