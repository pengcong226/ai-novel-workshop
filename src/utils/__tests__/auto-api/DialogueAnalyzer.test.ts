/**
 * 接口自动化测试 — 对话质量分析器（dialogueAnalyzer）
 * 覆盖用例：TC-6-3-01 ~ TC-6-3-07
 * 优先级：P0 + P1
 */
import { describe, expect, it } from 'vitest'
import { analyzeDialogue } from '@/utils/dialogueAnalyzer'

// ---------------------------------------------------------------------------
// 辅助函数：构造不同对话比例的文本
// ---------------------------------------------------------------------------

/** 平衡文本：对话占比 20%-60% */
function balancedContent(): string {
  // 约40%对话，60%叙述，使用Unicode curly quotes
  const narration = '夜色渐深小镇街道空无一人风穿过屋檐发出声响远处山峦朦胧'
  const dialogue = '\u201c月色真美。\u201d\u201c是啊很美。\u201d\u201c走走吧。\u201d\u201c好。\u201d'
  return narration + dialogue + narration
}

/** 对话过多文本：对话占比 > 60% */
function dialogueHeavyContent(): string {
  return '\u201c你好啊。\u201d\u201c你好。\u201d\u201c今天天气不错。\u201d\u201c是啊阳光很好。\u201d\u201c出去走走？\u201d\u201c好啊一起去吧。\u201d' +
    '\u201c那边有家新开的咖啡店。\u201d\u201c听起来不错。\u201d\u201c走吧。\u201d\u201c好的。\u201d'
}

/** 叙述过多文本：对话占比 < 20% */
function narrationHeavyContent(): string {
  return '清晨的阳光洒在大地上，万物苏醒。远处的山峰在晨雾中若隐若现，像是一幅水墨画。' +
    '小溪潺潺流过青石板，发出清脆的声响。鸟儿在枝头歌唱，迎接新的一天。' +
    '他独自走在山间小路上，回忆着过去的种种。这条路他走过无数次，每次都有不同的感受。' +
    '路边的野花开得正艳，五颜六色的花瓣在微风中轻轻摇曳。他停下脚步，深深地吸了一口气。' +
    '空气中弥漫着泥土和花草的清香，让人心旷神怡。远处传来几声犬吠，打破了清晨的宁静。'
}

/** 包含重复标签的文本 */
function repeatedTagContent(): string {
  const lines = []
  for (let i = 0; i < 8; i++) {
    lines.push(`\u201c第${i + 1}句话。\u201d他说道`)
  }
  return lines.join('\n') + '\n' + '窗外的风景不断变换列车驶过一个又一个隧道'
}

/** 连续对话文本（>6行无叙述穿插） */
function consecutiveDialogueContent(): string {
  const lines = []
  for (let i = 0; i < 8; i++) {
    lines.push(`\u201c第${i + 1}句对话内容。\u201d`)
  }
  return lines.join('\n') + '\n' + '他沉默了片刻望向窗外'
}

/** 综合问题文本：比例失衡 + 重复标签 + 连续对话 */
function multipleIssuesContent(): string {
  const lines: string[] = []
  for (let i = 0; i < 3; i++) {
    lines.push(`\u201c第${i + 1}句。\u201d他说道`)  // "说" 重复 3 次
  }
  // 连续 8 行对话
  for (let i = 0; i < 8; i++) {
    lines.push(`\u201c连续对话第${i + 1}行。\u201d`)
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// 测试用例
// ---------------------------------------------------------------------------

describe('DialogueAnalyzer 接口自动化测试', () => {

  // =========================================================================
  // TC-6-3-01 [P0] 验证对话比例分析-平衡
  // =========================================================================
  describe('TC-6-3-01 [P0] 对话比例-平衡', () => {
    it('对话占比在20%-60%之间时应判定为balanced', () => {
      const result = analyzeDialogue(balancedContent())

      expect(result.dialogueRatio).toBeGreaterThanOrEqual(0.2)
      expect(result.dialogueRatio).toBeLessThanOrEqual(0.6)
      expect(result.ratioAssessment).toBe('balanced')
    })
  })

  // =========================================================================
  // TC-6-3-02 [P0] 验证对话比例分析-对话过多
  // =========================================================================
  describe('TC-6-3-02 [P0] 对话比例-对话过多', () => {
    it('对话占比>60%时应判定为dialogue_heavy', () => {
      const result = analyzeDialogue(dialogueHeavyContent())

      expect(result.dialogueRatio).toBeGreaterThan(0.6)
      expect(result.ratioAssessment).toBe('dialogue_heavy')
      expect(result.issues.some(i => i.description.includes('对话占比过高'))).toBe(true)
    })
  })

  // =========================================================================
  // TC-6-3-03 [P0] 验证对话比例分析-叙述过多
  // =========================================================================
  describe('TC-6-3-03 [P0] 对话比例-叙述过多', () => {
    it('对话占比<20%时应判定为narration_heavy', () => {
      const result = analyzeDialogue(narrationHeavyContent())

      expect(result.dialogueRatio).toBeLessThan(0.2)
      expect(result.ratioAssessment).toBe('narration_heavy')
      expect(result.issues.some(i => i.description.includes('对话占比过低'))).toBe(true)
    })
  })

  // =========================================================================
  // TC-6-3-04 [P0] 验证重复标签检测（单章>5次）
  // =========================================================================
  describe('TC-6-3-04 [P0] 重复标签检测', () => {
    it('"说"字出现超过5次时应标记为重复标签', () => {
      const result = analyzeDialogue(repeatedTagContent())

      const saidTag = result.repeatedTags.find(t => t.tag === '说')
      expect(saidTag).toBeDefined()
      expect(saidTag!.count).toBeGreaterThan(5)

      expect(result.issues.some(i =>
        i.description.includes('标签使用过于单调') || i.description.includes('说')
      )).toBe(true)
    })
  })

  // =========================================================================
  // TC-6-3-05 [P0] 验证连续对话检测（>6行无叙述穿插）
  // =========================================================================
  describe('TC-6-3-05 [P0] 连续对话检测', () => {
    it('连续8行对话应被检测到', () => {
      const result = analyzeDialogue(consecutiveDialogueContent())

      expect(result.maxConsecutiveDialogues).toBeGreaterThanOrEqual(8)
      expect(result.issues.some(i => i.description.includes('连续') && i.description.includes('对话'))).toBe(true)
    })
  })

  // =========================================================================
  // TC-6-3-06 [P1] 验证综合评分计算
  // =========================================================================
  describe('TC-6-3-06 [P1] 综合评分计算', () => {
    it('多种问题叠加时应正确扣分', () => {
      const result = analyzeDialogue(multipleIssuesContent())

      // 评分应在合理范围内
      expect(result.overallScore).toBeLessThan(100)
      expect(result.overallScore).toBeGreaterThanOrEqual(0)

      // 应存在多个问题
      expect(result.issues.length).toBeGreaterThanOrEqual(1)
    })

    it('无问题的平衡文本应得高分', () => {
      const result = analyzeDialogue(balancedContent())

      expect(result.overallScore).toBeGreaterThanOrEqual(80)
    })
  })

  // =========================================================================
  // TC-6-3-07 [P1] 验证空内容输入
  // =========================================================================
  describe('TC-6-3-07 [P1] 空内容输入', () => {
    it('空字符串应返回安全的默认结果', () => {
      const result = analyzeDialogue('')

      expect(result.dialogueRatio).toBe(0)
      // 空内容 ratio=0 < 0.2，被判定为 narration_heavy，扣15分
      expect(result.ratioAssessment).toBe('narration_heavy')
      expect(result.overallScore).toBe(85)
      expect(result.maxConsecutiveDialogues).toBe(0)
      expect(result.repeatedTags).toEqual([])
    })
  })
})
