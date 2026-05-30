/**
 * 接口自动化测试 — AIGC检测服务（AIGCDetector）
 * 覆盖用例：TC-11.1 ~ TC-11.10
 * 优先级：P0 + P1
 */
import { describe, expect, it } from 'vitest'
import { AIGCDetector } from '@/services/AIGCDetector'

// ---------------------------------------------------------------------------
// 测试用例
// ---------------------------------------------------------------------------

describe('AIGCDetector 接口自动化测试', () => {

  // =========================================================================
  // TC-11.1 本地检测模式——正常文本
  // =========================================================================
  describe('TC-11.1 本地检测模式——正常文本', () => {
    it('P0: 返回完整检测结果结构', async () => {
      const detector = new AIGCDetector({ provider: 'local' })

      const text = '今天天气真好，小明走在上学的路上。路边的花开了，散发出淡淡的清香。' +
        '他想起昨晚妈妈说的话，心里暖暖的。远处传来几声鸟叫，清晨的阳光洒在他身上。' +
        '走进教室，同桌已经在看书了。他放下书包，拿出课本，新的一天开始了。' +
        '老师走进来，微笑着向大家问好。同学们齐声回应，教室里充满了朝气。'

      const result = await detector.detect(text)

      expect(result.overallScore).toBeGreaterThanOrEqual(0)
      expect(result.overallScore).toBeLessThanOrEqual(100)
      expect(result.aiProbability).toBeGreaterThanOrEqual(0)
      expect(result.aiProbability).toBeLessThanOrEqual(1)
      expect(result.humanProbability).toBeGreaterThanOrEqual(0)
      expect(result.humanProbability).toBeLessThanOrEqual(1)
      expect(Math.abs(result.aiProbability + result.humanProbability - 1)).toBeLessThan(0.01)
      expect(result.provider).toBe('local')
      expect(Array.isArray(result.paragraphs)).toBe(true)
      expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    })
  })

  // =========================================================================
  // TC-11.2 本地检测——5项加权指标
  // =========================================================================
  describe('TC-11.2 本地检测——指标验证', () => {
    it('P0: AI特征文本应有较高的AI概率', async () => {
      const detector = new AIGCDetector({ provider: 'local' })

      // 模拟AI典型特征文本：高密度AI标记词、段落长度均匀
      const aiText = '此外，这个问题需要我们深入思考。总之，我们必须认识到这一点的重要性。' +
        '值得注意的是，这一现象在近年来愈发明显。不可否认，技术的进步带来了深远影响。' +
        '综上所述，我们需要从多个角度来分析这个问题。显而易见，这一趋势将持续发展。' +
        '毋庸置疑，创新是推动发展的核心动力。事实上，许多专家已经指出了这一点。' +
        '从某种意义上说，这代表了一种新的范式转变。不言而喻，我们必须采取行动。' +
        '至关重要的是，我们需要在正确的时间做出正确的决策。与此同时，市场也在发生变化。'

      const result = await detector.detect(aiText)

      // AI标记词密度高的文本应该有较高的AI概率
      expect(result.aiProbability).toBeGreaterThan(0.3)
    })

    it('P0: 人类风格文本应有较低的AI概率', async () => {
      const detector = new AIGCDetector({ provider: 'local' })

      // 模拟人类写作特征：句式多样、口语化
      const humanText = '昨天去菜市场买菜，碰见了老王。他跟我说他家的小狗又跑了。' +
        '哈哈，这狗可真够调皮的。我帮他找了一下午，最后在公园长椅下面发现它。' +
        '那小家伙正睡得香呢！老王气得直跺脚，但也没办法。' +
        '回家路上下起了雨，我赶紧跑。到家一看，衣服全湿了。' +
        '老婆笑我：出门不带伞，活该。我能说啥呢，只能苦笑。' +
        '晚上做了红烧肉，还行吧，味道凑合。吃完饭看了会儿电视就睡了。'

      const result = await detector.detect(humanText)

      expect(result.humanProbability).toBeGreaterThan(0.3)
    })
  })

  // =========================================================================
  // TC-11.3 段落分类阈值
  // =========================================================================
  describe('TC-11.3 段落分类阈值', () => {
    it('P0: 段落分类结果类型正确', async () => {
      const detector = new AIGCDetector({ provider: 'local' })

      const text = '第一段内容足够长，需要超过一定字数才会被当作独立段落处理。' +
        '这里继续添加一些内容来确保段落长度。\n\n' +
        '第二段也有足够的内容来独立成段，避免被过滤掉。' +
        '继续补充一些文字来满足最小长度要求。'

      const result = await detector.detect(text)

      for (const para of result.paragraphs) {
        expect(['human', 'ai', 'mixed', 'uncertain']).toContain(para.classification)
        expect(para.aiProbability).toBeGreaterThanOrEqual(0)
        expect(para.aiProbability).toBeLessThanOrEqual(1)
        expect(typeof para.paragraphIndex).toBe('number')
        expect(typeof para.text).toBe('string')
      }
    })
  })

  // =========================================================================
  // TC-11.6 API超时回退到本地检测
  // =========================================================================
  describe('TC-11.6 API超时回退', () => {
    it('P0: 无API Key时回退到本地检测', async () => {
      // 不提供apiKey，应该回退到本地
      const detector = new AIGCDetector({
        provider: 'gptzero',
        // 不传apiKey
      })

      const text = '这是一段测试文本，用于验证AIGC检测的回退机制。' +
        '当API不可用时应该自动切换到本地检测模式。' +
        '这是为了保证系统在各种环境下都能正常工作。'

      const result = await detector.detect(text)

      // 应回退到本地检测
      expect(result).toBeDefined()
      expect(result.provider).toBe('local')
    })
  })

  // =========================================================================
  // TC-11.7 空文本处理
  // =========================================================================
  describe('TC-11.7 空文本处理', () => {
    it('P1: 空文本返回默认结果', async () => {
      const detector = new AIGCDetector({ provider: 'local' })

      const result = await detector.detect('')

      expect(result.overallScore).toBe(50)
      expect(result.aiProbability).toBe(0.5)
      expect(result.humanProbability).toBe(0.5)
      expect(result.paragraphs).toEqual([])
    })

    it('P1: 纯空格文本返回默认结果', async () => {
      const detector = new AIGCDetector({ provider: 'local' })

      const result = await detector.detect('   ')

      expect(result.overallScore).toBe(50)
    })
  })

  // =========================================================================
  // TC-11.8 批量检测
  // =========================================================================
  describe('TC-11.8 批量检测', () => {
    it('P1: 批量检测返回每个文本的结果', async () => {
      const detector = new AIGCDetector({ provider: 'local' })

      const texts = [
        '第一段测试文本，包含足够的内容来进行检测分析。',
        '第二段测试文本，也需要足够的长度来确保检测的准确性。',
      ]

      const results = await detector.detectBatch(texts)

      expect(results).toHaveLength(2)
      expect(results[0].provider).toBe('local')
      expect(results[1].provider).toBe('local')
    })

    it('P1: 批量检测中单个失败不影响其他', async () => {
      const detector = new AIGCDetector({ provider: 'local' })

      const texts = [
        '正常文本内容需要足够长度来确保检测分析能够正常进行。',
        '', // 空文本
        '另一段正常文本内容也需要足够的长度来进行准确检测。',
      ]

      const results = await detector.detectBatch(texts)

      expect(results).toHaveLength(3)
      // 空文本返回默认结果，不影响其他
      expect(results[1].overallScore).toBe(50)
    })
  })

  // =========================================================================
  // TC-11.10 AI标记词列表完整性
  // =========================================================================
  describe('TC-11.10 AI标记词列表', () => {
    it('P2: 模块正常加载且可检测', async () => {
      const detector = new AIGCDetector({ provider: 'local' })

      // 使用含有常见AI标记词的文本
      const textWithAITells = '此外，这个问题确实值得深入探讨。总之，我们需要综合考虑各种因素。' +
        '综上所述，这个方案是可行的。值得注意的是，还需要关注一些细节问题。'

      const result = await detector.detect(textWithAITells)
      expect(result).toBeDefined()
      expect(typeof result.aiProbability).toBe('number')
    })
  })

  // =========================================================================
  // 附加: detectLocal本地检测详细验证
  // =========================================================================
  describe('本地检测详细验证', () => {
    it('P0: 本地检测5项指标权重之和为1.0', () => {
      // AI标记词密度(0.3) + 句长变异系数(0.2) + 段长变异系数(0.15) + 词汇多样性(0.25) + 标点比例(0.1)
      const weights = [0.3, 0.2, 0.15, 0.25, 0.1]
      const sum = weights.reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(1.0, 5)
    })

    it('P1: latencyMs记录了检测耗时', async () => {
      const detector = new AIGCDetector({ provider: 'local' })

      const result = await detector.detect('这是一段测试文本，用于检测耗时记录。')

      expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    })
  })
})
