import { getLogger } from '@/utils/logger'
import { safeParseAIJson } from '@/utils/safeParseAIJson'
import type { TokenUsage } from '@/services/pipeline/types'

const logger = getLogger('agent:style-analyzer')

export interface StyleFingerprint {
  // 句式特征
  sentencePatterns: {
    avgLength: number             // 平均句长（字数）
    shortSentenceRatio: number    // 短句(<15字)比例
    longSentenceRatio: number     // 长句(>40字)比例
    questionRatio: number         // 疑问句比例
    exclamationRatio: number      // 感叹句比例
    dialogueRatio: number         // 对话占比
    descriptionRatio: number      // 描写占比
  }

  // 词汇特征
  vocabulary: {
    uniqueWordCount: number       // 词汇量（去重）
    avgWordFrequency: number      // 平均词频
    topAdjectives: string[]       // 高频形容词 top10
    topVerbs: string[]            // 高频动词 top10
    topAdverbs: string[]          // 高频副词 top10
    literaryWords: string[]       // 文雅用词
    colloquialWords: string[]     // 口语化用词
  }

  // 修辞特征
  rhetoric: {
    metaphorFrequency: number     // 比喻使用频率（次/千字）
    parallelismCount: number      // 排比句数
    contrastCount: number         // 对比句数
    rhetoricalQuestionCount: number // 反问句数
    sensoryDescriptions: { visual: number; auditory: number; olfactory: number; tactile: number; gustatory: number }
  }

  // 节奏特征
  rhythm: {
    paragraphLengthVariation: number  // 段落长度变异系数
    tensionCurve: number[]            // 张力曲线（按段落）
    actionToReflectionRatio: number   // 动作/反思比例
  }

  // AI特征（用于反检测）
  aiCharacteristics: {
    aiTellWordDensity: number     // AI标记词密度
    patternUniformity: number     // 句式规律性
    transitionWordDensity: number // 转折词密度
    modifierDensity: number       // 修饰语密度
  }

  // 综合风格描述
  styleDescription: string        // 一段话风格总结
  styleTags: string[]             // 风格标签（如：热血/轻松/细腻/宏大）
  writingAdvice: string[]         // 基于分析的写作建议
}

export interface StyleAnalyzerInput {
  text: string                    // 参考文本（至少1000字）
  genre?: string                  // 题材
  analysisDepth: 'quick' | 'standard' | 'deep'  // 分析深度
}

export interface StyleAnalyzerOutput {
  fingerprint: StyleFingerprint
  tokenUsage: TokenUsage
}

// AI标记词库（用于反检测特征分析）
const AI_TELL_WORDS = [
  '然而', '此外', '总之', '因此', '所以', '不仅', '而且', '虽然',
  '尽管', '同时', '另外', '值得注意的是', '需要指出', '毫无疑问',
  '事实上', '换句话说', '综上所述', '显而易见', '不言而喻',
  '正因如此', '由此可见', '归根结底', '毋庸置疑'
]

// 转折词库
const TRANSITION_WORDS = [
  '但是', '可是', '不过', '然而', '却', '只是', '倒是', '反而',
  '尽管', '虽然', '即使', '纵然', '哪怕', '当然', '不过',
  '话说回来', '话虽如此', '即便如此'
]

// 修饰语词缀
const MODIFIER_SUFFIXES = [
  '地', '得', '般', '似的', '一样', '一般', '非常', '十分',
  '极其', '格外', '分外', '更加', '越发', '稍微', '略微',
  '几乎', '简直', '尤其', '特别', '相当', '颇为', '甚为'
]

// 感官描述词库
const _SENSORY_WORDS = {
  visual: ['看见', '望着', '注视', '凝视', '目光', '眼眸', '闪烁', '光芒', '色彩', '景象', '灿烂', '耀眼', '暗淡', '明亮', '昏暗', '通红', '苍白', '碧绿', '金黄', '雪白'],
  auditory: ['听见', '声响', '声音', '嗡嗡', '沙沙', '叮咚', '轰鸣', '寂静', '喧嚣', '回响', '低语', '呼唤', '哭泣', '欢笑', '咆哮', '呢喃', '叮咛', '悠扬', '悦耳', '刺耳'],
  olfactory: ['闻到', '气味', '芳香', '清香', '臭味', '刺鼻', '芬芳', '馥郁', '腥味', '酸味', '幽香', '暗香', '扑鼻', '弥漫'],
  tactile: ['触摸', '温暖', '冰凉', '柔软', '粗糙', '光滑', '刺痛', '麻木', '潮湿', '干燥', '坚硬', '轻柔', '沉重', '炽热', '冰冷', '温热', '凉爽'],
  gustatory: ['品尝', '味道', '苦涩', '甘甜', '酸涩', '辛辣', '咸味', '鲜美', '清甜', '醇厚', '淡而无味', '回味', '余味', '香醇']
}

// 情绪张力词库
const TENSION_HIGH_WORDS = ['杀', '死', '血', '怒', '恨', '战', '斗', '暴', '狂', '绝', '险', '危', '急', '痛', '伤', '惊', '恐', '惧']
const TENSION_LOW_WORDS = ['静', '安', '宁', '平', '和', '闲', '悠', '淡', '轻', '柔', '温', '暖', '舒', '美', '乐', '笑']

// 动作词库与反思词库
const ACTION_WORDS = ['跑', '跳', '冲', '走', '飞', '打', '砍', '挥', '踢', '推', '拉', '抓', '扔', '拔', '刺', '射', '斩', '劈', '闪', '躲', '追', '逃']
const REFLECTION_WORDS = ['想', '思考', '回忆', '想起', '明白', '领悟', '理解', '意识到', '感觉', '觉得', '认为', '知道', '相信', '怀疑', '希望', '期待', '回忆', '沉思', '默想']

export class StyleAnalyzerAgent {
  private aiStore: any = null

  private async getAIStore() {
    if (!this.aiStore) {
      const { useAIStore } = await import('@/stores/ai')
      this.aiStore = useAIStore()
    }
    return this.aiStore
  }

  /**
   * 执行文风分析
   */
  async analyze(input: StyleAnalyzerInput): Promise<StyleAnalyzerOutput> {
    const startTime = Date.now()
    logger.info(`开始文风分析，文本长度: ${input.text.length}字，分析深度: ${input.analysisDepth}`)

    // 验证输入
    if (input.text.length < 100) {
      logger.warn('文本过短，建议提供至少1000字的参考文本以获得更准确的分析')
    }

    // 1. 确定性分析（不依赖LLM）
    logger.info('执行确定性文本分析...')
    const deterministicResult = this.deterministicAnalysis(input.text)
    logger.info(`确定性分析完成，耗时: ${Date.now() - startTime}ms`)

    // 2. LLM深度分析
    let llmResult: Partial<StyleFingerprint> = {}
    const tokenUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

    if (input.analysisDepth !== 'quick') {
      logger.info('执行LLM深度分析...')
      const llmStartTime = Date.now()
      const llmOutput = await this.llmAnalysis(input.text, input.genre)
      llmResult = llmOutput
      logger.info(`LLM分析完成，耗时: ${Date.now() - llmStartTime}ms`)
    } else {
      logger.info('快速模式，跳过LLM深度分析')
    }

    // 3. AI特征分析
    logger.info('计算AI特征指标...')
    const aiCharacteristics = this.analyzeAICharacteristics(input.text)

    // 4. 合并结果
    const fingerprint = this.mergeResults(deterministicResult, llmResult, aiCharacteristics)

    const totalTime = Date.now() - startTime
    logger.info(`文风分析完成，总耗时: ${totalTime}ms`)

    return {
      fingerprint,
      tokenUsage
    }
  }

  /**
   * 确定性文本分析（不依赖LLM）
   * 分析句式、词汇、段落节奏等可量化指标
   */
  private deterministicAnalysis(text: string): Partial<StyleFingerprint> {
    logger.info('开始确定性文本分析...')

    // 分割句子（按句号、叹号、问号）
    const sentences = text.split(/[。！？]/).filter(s => s.trim().length > 0)
    const sentenceLengths = sentences.map(s => s.replace(/\s/g, '').length)

    // 计算句式特征
    const sentencePatterns = this.analyzeSentencePatterns(text, sentences, sentenceLengths)

    // 分割段落
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0)
    const paragraphLengths = paragraphs.map(p => p.replace(/\s/g, '').length)

    // 计算段落节奏
    const rhythm = this.analyzeRhythm(paragraphs, paragraphLengths, sentences)

    // 词汇分析
    const vocabulary = this.analyzeVocabulary(text)

    logger.info(`确定性分析完成，句子数: ${sentences.length}，段落数: ${paragraphs.length}`)

    return {
      sentencePatterns,
      vocabulary,
      rhythm
    }
  }

  /**
   * 分析句式特征
   */
  private analyzeSentencePatterns(
    text: string,
    sentences: string[],
    sentenceLengths: number[]
  ): StyleFingerprint['sentencePatterns'] {
    // 平均句长
    const avgLength = sentenceLengths.length > 0
      ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length
      : 0

    // 短句比例 (<15字)
    const shortSentenceCount = sentenceLengths.filter(l => l < 15).length
    const shortSentenceRatio = sentenceLengths.length > 0
      ? shortSentenceCount / sentenceLengths.length
      : 0

    // 长句比例 (>40字)
    const longSentenceCount = sentenceLengths.filter(l => l > 40).length
    const longSentenceRatio = sentenceLengths.length > 0
      ? longSentenceCount / sentenceLengths.length
      : 0

    // 疑问句比例
    const questionCount = text.match(/[？?]/g)?.length || 0
    const questionRatio = sentences.length > 0 ? questionCount / sentences.length : 0

    // 感叹句比例
    const exclamationCount = text.match(/[！!]/g)?.length || 0
    const exclamationRatio = sentences.length > 0 ? exclamationCount / sentences.length : 0

    // 对话占比（包含引号或冒号的行）
    const lines = text.split('\n')
    const dialogueLines = lines.filter(line =>
      /^[「""']/.test(line.trim()) ||
      /[:：]/.test(line) ||
      /[「」""']/.test(line)
    )
    const dialogueRatio = lines.length > 0 ? dialogueLines.length / lines.length : 0

    // 描写占比（非对话的叙述段落）
    const descriptionLines = lines.filter(line =>
      !/^[「""']/.test(line.trim()) &&
      line.trim().length > 0
    )
    const descriptionRatio = lines.length > 0 ? descriptionLines.length / lines.length : 0

    return {
      avgLength: Math.round(avgLength * 100) / 100,
      shortSentenceRatio: Math.round(shortSentenceRatio * 100) / 100,
      longSentenceRatio: Math.round(longSentenceRatio * 100) / 100,
      questionRatio: Math.round(questionRatio * 100) / 100,
      exclamationRatio: Math.round(exclamationRatio * 100) / 100,
      dialogueRatio: Math.round(dialogueRatio * 100) / 100,
      descriptionRatio: Math.round(descriptionRatio * 100) / 100
    }
  }

  /**
   * 分析词汇特征
   */
  private analyzeVocabulary(text: string): StyleFingerprint['vocabulary'] {
    // 提取所有中文词汇（简单分词）
    const words = text.match(/[\u4e00-\u9fa5]{2,}/g) || []
    const wordFreq: Record<string, number> = {}

    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1
    })

    const uniqueWords = Object.keys(wordFreq)
    const totalWords = words.length

    // 平均词频
    const avgWordFrequency = uniqueWords.length > 0
      ? totalWords / uniqueWords.length
      : 0

    // 高频词分类（基于常见后缀和词库）
    const topAdjectives = this.findTopWordsByCategory(wordFreq, 'adjective')
    const topVerbs = this.findTopWordsByCategory(wordFreq, 'verb')
    const topAdverbs = this.findTopWordsByCategory(wordFreq, 'adverb')

    // 文雅用词（4字及以上词汇）
    const literaryWords = uniqueWords
      .filter(w => w.length >= 4)
      .sort((a, b) => wordFreq[b] - wordFreq[a])
      .slice(0, 10)

    // 口语化用词（常见口语词）
    const colloquialPatterns = ['嘛', '呢', '吧', '啊', '呀', '哦', '哈', '嗯', '喂', '嘿']
    const colloquialWords = uniqueWords
      .filter(w => colloquialPatterns.some(p => w.includes(p)))
      .sort((a, b) => wordFreq[b] - wordFreq[a])
      .slice(0, 10)

    return {
      uniqueWordCount: uniqueWords.length,
      avgWordFrequency: Math.round(avgWordFrequency * 100) / 100,
      topAdjectives,
      topVerbs,
      topAdverbs,
      literaryWords,
      colloquialWords
    }
  }

  /**
   * 按词性查找高频词
   */
  private findTopWordsByCategory(wordFreq: Record<string, number>, category: string): string[] {
    // 形容词常见后缀
    const adjSuffixes = ['的', '性', '化', '式', '型', '般', '样', '然', '丽', '美', '好', '坏', '大', '小', '高', '低', '快', '慢', '强', '弱']
    // 动词常见后缀
    const verbSuffixes = ['了', '着', '过', '到', '得', '在', '去', '来', '上', '下', '出', '入', '开', '关', '走', '跑', '飞', '打']
    // 副词常见前缀
    const advPrefixes = ['很', '非常', '十分', '特别', '极其', '更', '最', '太', '真', '好', '挺', '颇', '甚', '稍', '略', '微', '渐', '忽', '乍']

    let patterns: string[] = []
    let isPrefix = false

    switch (category) {
      case 'adjective':
        patterns = adjSuffixes
        break
      case 'verb':
        patterns = verbSuffixes
        break
      case 'adverb':
        patterns = advPrefixes
        isPrefix = true
        break
      default:
        return []
    }

    const filtered = Object.entries(wordFreq)
      .filter(([word]) => {
        if (isPrefix) {
          return patterns.some(p => word.startsWith(p))
        }
        return patterns.some(p => word.endsWith(p))
      })
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word)

    return filtered
  }

  /**
   * 分析段落节奏
   */
  private analyzeRhythm(
    paragraphs: string[],
    paragraphLengths: number[],
    sentences: string[]
  ): StyleFingerprint['rhythm'] {
    // 段落长度变异系数
    const paragraphLengthVariation = this.calculateCoefficientOfVariation(paragraphLengths)

    // 张力曲线（按段落）
    const tensionCurve = paragraphs.map(p => this.calculateTension(p))

    // 动作/反思比例
    const actionCount = sentences.filter(s =>
      ACTION_WORDS.some(w => s.includes(w))
    ).length
    const reflectionCount = sentences.filter(s =>
      REFLECTION_WORDS.some(w => s.includes(w))
    ).length
    const actionToReflectionRatio = reflectionCount > 0
      ? actionCount / reflectionCount
      : actionCount > 0 ? Infinity : 0

    return {
      paragraphLengthVariation: Math.round(paragraphLengthVariation * 100) / 100,
      tensionCurve,
      actionToReflectionRatio: Math.round(actionToReflectionRatio * 100) / 100
    }
  }

  /**
   * 计算变异系数
   */
  private calculateCoefficientOfVariation(values: number[]): number {
    if (values.length === 0) return 0

    const mean = values.reduce((a, b) => a + b, 0) / values.length
    if (mean === 0) return 0

    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
    const stdDev = Math.sqrt(variance)

    return stdDev / mean
  }

  /**
   * 计算文本张力值
   */
  private calculateTension(text: string): number {
    const highCount = TENSION_HIGH_WORDS.filter(w => text.includes(w)).length
    const lowCount = TENSION_LOW_WORDS.filter(w => text.includes(w)).length
    const total = highCount + lowCount

    if (total === 0) return 0.5
    return highCount / total
  }

  /**
   * LLM深度分析
   * 分析修辞、情感、风格特征等需要理解能力的指标
   */
  private async llmAnalysis(text: string, genre?: string): Promise<Partial<StyleFingerprint>> {
    logger.info('开始LLM深度分析...')

    try {
      const store = await this.getAIStore()

      // 截取文本（避免token过多）
      const truncatedText = text.slice(0, 5000)

      const prompt = `请深入分析以下${genre ? genre + '题材的' : ''}文学文本的写作风格，返回JSON格式的分析结果。

文本内容：
${truncatedText}

请从以下维度进行分析：

1. 修辞特征：
   - 比喻使用频率（每千字出现次数）
   - 排比句数量
   - 对比句数量
   - 反问句数量
   - 感官描写统计（视觉、听觉、嗅觉、触觉、味觉各多少处）

2. 风格总结：
   - styleDescription: 用一段话（100-200字）总结这段文字的写作风格特点
   - styleTags: 3-5个风格标签（如：细腻、热血、幽默、沉重、轻松、宏大、日常、诗意等）
   - writingAdvice: 3-5条基于此风格的写作建议

请严格按照以下JSON格式返回：
{
  "rhetoric": {
    "metaphorFrequency": 数字,
    "parallelismCount": 数字,
    "contrastCount": 数字,
    "rhetoricalQuestionCount": 数字,
    "sensoryDescriptions": {
      "visual": 数字,
      "auditory": 数字,
      "olfactory": 数字,
      "tactile": 数字,
      "gustatory": 数字
    }
  },
  "styleDescription": "风格描述文本",
  "styleTags": ["标签1", "标签2"],
  "writingAdvice": ["建议1", "建议2"]
}`

      const response = await store.chat({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        maxTokens: 2000
      })

      const parsed = safeParseAIJson(response.content)

      if (parsed) {
        logger.info('LLM分析结果解析成功')
        return {
          rhetoric: parsed.rhetoric,
          styleDescription: parsed.styleDescription,
          styleTags: parsed.styleTags,
          writingAdvice: parsed.writingAdvice
        }
      } else {
        logger.warn('LLM分析结果解析失败，使用默认值')
        return this.getDefaultLLMResult()
      }
    } catch (error) {
      logger.error('LLM分析失败:', error)
      return this.getDefaultLLMResult()
    }
  }

  /**
   * 获取默认LLM分析结果
   */
  private getDefaultLLMResult(): Partial<StyleFingerprint> {
    return {
      rhetoric: {
        metaphorFrequency: 0,
        parallelismCount: 0,
        contrastCount: 0,
        rhetoricalQuestionCount: 0,
        sensoryDescriptions: { visual: 0, auditory: 0, olfactory: 0, tactile: 0, gustatory: 0 }
      },
      styleDescription: '无法完成深度风格分析',
      styleTags: ['待分析'],
      writingAdvice: ['建议提供更多文本以进行深度分析']
    }
  }

  /**
   * 计算AI特征指标
   */
  private analyzeAICharacteristics(text: string): StyleFingerprint['aiCharacteristics'] {
    logger.info('计算AI特征指标...')

    const textLength = text.length
    if (textLength === 0) {
      return {
        aiTellWordDensity: 0,
        patternUniformity: 0,
        transitionWordDensity: 0,
        modifierDensity: 0
      }
    }

    // AI标记词密度
    const aiTellCount = AI_TELL_WORDS.reduce((count, word) => {
      const matches = text.match(new RegExp(word, 'g'))
      return count + (matches ? matches.length : 0)
    }, 0)
    const aiTellWordDensity = (aiTellCount / textLength) * 1000

    // 转折词密度
    const transitionCount = TRANSITION_WORDS.reduce((count, word) => {
      const matches = text.match(new RegExp(word, 'g'))
      return count + (matches ? matches.length : 0)
    }, 0)
    const transitionWordDensity = (transitionCount / textLength) * 1000

    // 修饰语密度
    const modifierCount = MODIFIER_SUFFIXES.reduce((count, suffix) => {
      const matches = text.match(new RegExp(suffix, 'g'))
      return count + (matches ? matches.length : 0)
    }, 0)
    const modifierDensity = (modifierCount / textLength) * 1000

    // 句式规律性（基于句长变异系数）
    const sentences = text.split(/[。！？]/).filter(s => s.trim().length > 0)
    const sentenceLengths = sentences.map(s => s.replace(/\s/g, '').length)
    const cv = this.calculateCoefficientOfVariation(sentenceLengths)
    // 变异系数越低，规律性越高（AI文本通常更规律）
    const patternUniformity = Math.max(0, 1 - cv)

    return {
      aiTellWordDensity: Math.round(aiTellWordDensity * 100) / 100,
      patternUniformity: Math.round(patternUniformity * 100) / 100,
      transitionWordDensity: Math.round(transitionWordDensity * 100) / 100,
      modifierDensity: Math.round(modifierDensity * 100) / 100
    }
  }

  /**
   * 合并确定性分析和LLM分析结果
   */
  private mergeResults(
    deterministic: Partial<StyleFingerprint>,
    llm: Partial<StyleFingerprint>,
    aiCharacteristics: StyleFingerprint['aiCharacteristics']
  ): StyleFingerprint {
    logger.info('合并分析结果...')

    // 默认句式特征
    const defaultSentencePatterns: StyleFingerprint['sentencePatterns'] = {
      avgLength: 0,
      shortSentenceRatio: 0,
      longSentenceRatio: 0,
      questionRatio: 0,
      exclamationRatio: 0,
      dialogueRatio: 0,
      descriptionRatio: 0
    }

    // 默认词汇特征
    const defaultVocabulary: StyleFingerprint['vocabulary'] = {
      uniqueWordCount: 0,
      avgWordFrequency: 0,
      topAdjectives: [],
      topVerbs: [],
      topAdverbs: [],
      literaryWords: [],
      colloquialWords: []
    }

    // 默认修辞特征
    const defaultRhetoric: StyleFingerprint['rhetoric'] = {
      metaphorFrequency: 0,
      parallelismCount: 0,
      contrastCount: 0,
      rhetoricalQuestionCount: 0,
      sensoryDescriptions: { visual: 0, auditory: 0, olfactory: 0, tactile: 0, gustatory: 0 }
    }

    // 默认节奏特征
    const defaultRhythm: StyleFingerprint['rhythm'] = {
      paragraphLengthVariation: 0,
      tensionCurve: [],
      actionToReflectionRatio: 0
    }

    return {
      sentencePatterns: {
        ...defaultSentencePatterns,
        ...deterministic.sentencePatterns
      },
      vocabulary: {
        ...defaultVocabulary,
        ...deterministic.vocabulary
      },
      rhetoric: {
        ...defaultRhetoric,
        ...llm.rhetoric
      },
      rhythm: {
        ...defaultRhythm,
        ...deterministic.rhythm
      },
      aiCharacteristics,
      styleDescription: llm.styleDescription || '风格分析进行中',
      styleTags: llm.styleTags || ['待分析'],
      writingAdvice: llm.writingAdvice || []
    }
  }
}
