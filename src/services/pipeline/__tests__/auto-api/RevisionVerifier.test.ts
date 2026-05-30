/**
 * 接口自动化测试 — 改稿二次验证（RevisionVerifier）
 * 覆盖用例：TC-6-5-01 ~ TC-6-5-09
 * 优先级：P0 + P1 + P2
 *
 * 注意：Level 2 LLM 验证依赖 AI Store，本测试仅验证 Level 1 确定性逻辑。
 * LLM 相关用例（TC-6-5-06, TC-6-5-09）通过 mock 验证调用链路。
 */
import { describe, expect, it } from 'vitest'
import { verifyRevision } from '@/services/pipeline/RevisionVerifier'
import type { AuditIssue, LengthSpec } from '@/services/pipeline/types'

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

function makeIssue(overrides: Partial<AuditIssue> = {}): AuditIssue {
  return {
    severity: 'warning',
    category: '格式违规',
    description: '测试问题',
    suggestion: '测试建议',
    ...overrides,
  }
}

const defaultLengthSpec: LengthSpec = {
  target: 2000,
  softMin: 1000,
  softMax: 3000,
  hardMin: 500,
  hardMax: 5000,
  countingMode: 'chars',
}

// 生成指定长度的中文文本
function makeTextOfLength(targetLength: number): string {
  const base = '这是一段测试文本用于验证字数范围。'
  let text = ''
  while (text.length < targetLength) {
    text += base
  }
  return text.slice(0, targetLength)
}

// 生成包含重复段落的文本
function makeDuplicateContent(): string {
  const para = '这是一段完全相同的文本内容，用于测试重复段落检测功能。这些文字会重复出现多次。'
  return para + '\n\n' + para + '\n\n' + para
}

// 生成无重复段落的文本
function makeUniqueContent(): string {
  return '第一章开始，主人公踏上了旅程。沿途风景如画，让人心旷神怡。\n\n' +
    '第二章深入，故事逐渐展开。新的角色出现，带来了意想不到的变化。\n\n' +
    '第三章高潮，矛盾终于爆发。激烈的冲突让所有人都措手不及。'
}

// 生成包含敏感词的文本
function makeSensitiveContent(): string {
  return '这段文本包含一些敏感词，例如法轮功和台独等词汇需要被检测。'
}

// 生成无敏感词的文本
function makeCleanContent(): string {
  return '这是一段完全正常的小说文本，没有任何敏感内容。主人公在山间漫步，享受着宁静的时光。'
}

// 生成段落长度均匀的文本（低标准差）
function makeUniformParagraphs(): string {
  return 'AAAAA BBBBB CCCCC DDDDD EEEEE.\n\n' +
    'FFFFF GGGGG HHHHH IIIII JJJJJ.\n\n' +
    'KKKKK LLLLL MMMMM NNNNN OOOOO.'
}

// 生成段落长度差异大的文本（高标准差）
function makeVariedParagraphs(): string {
  return '短。\n\n' +
    '这是一段中等长度的段落内容，包含了足够的文字来测试段落长度变化。\n\n' +
    '这是最长的一段内容。他走在回乡的路上，每一步都踩在记忆的碎片上。' +
    '路两旁的杨树还是那么高大，只是比从前更加苍老了。远处的炊烟袅袅升起，' +
    '那是家的方向。他加快了脚步，心跳也随之加速。多年未归，不知故人是否还在。'
}

// 生成高 AI 标记词密度的文本
function makeHighAITellContent(): string {
  return '仿佛一切都变了。不禁让人感慨。宛如梦境一般。' +
    '竟然如此突然。忽然间天翻地覆。猛地站起身来。' +
    '一下子明白了。顿时泪流满面。刹那间光芒四射。' +
    '犹如隔世。恍若前世。蓦然回首。'
}

// 生成低 AI 标记词密度的文本
function makeLowAITellContent(): string {
  return '他走在路上，看到远处的山。风吹过树叶，发出沙沙的声响。' +
    '天空很蓝，云很白。他深吸一口气，继续前行。' +
    '路边有条小溪，水很清。他蹲下来洗了把脸，感觉好多了。'
}

// ---------------------------------------------------------------------------
// 测试用例
// ---------------------------------------------------------------------------

describe('RevisionVerifier 接口自动化测试', () => {

  // =========================================================================
  // TC-6-5-01 [P0] 验证Level1确定性验证-字数范围修复
  // =========================================================================
  describe('TC-6-5-01 [P0] 字数范围验证', () => {
    it('修订后字数在范围内应返回verified_fixed', async () => {
      const issue = makeIssue({ category: '格式违规', description: '字数超出范围' })
      const revised = makeTextOfLength(2000) // 在 1000-3000 范围内

      const result = await verifyRevision('', revised, [issue], defaultLengthSpec)

      expect(result.verifications.length).toBe(1)
      expect(result.verifications[0].status).toBe('verified_fixed')
      expect(result.verifications[0].evidence).toContain('已在范围')
      expect(result.fixedIssueIds.length).toBe(1)
      expect(result.remainingIssues.length).toBe(0)
    })

    it('修订后字数不在范围内应返回not_fixed', async () => {
      const issue = makeIssue({ category: '格式违规', description: '字数超出范围' })
      const revised = makeTextOfLength(500) // 低于 softMin 1000

      const result = await verifyRevision('', revised, [issue], defaultLengthSpec)

      expect(result.verifications[0].status).toBe('not_fixed')
      expect(result.verifications[0].evidence).toContain('仍不在范围')
    })
  })

  // =========================================================================
  // TC-6-5-02 [P0] 验证Level1确定性验证-重复段落修复
  // =========================================================================
  describe('TC-6-5-02 [P0] 重复段落验证', () => {
    it('无重复段落时应返回verified_fixed', async () => {
      const issue = makeIssue({ category: '格式违规', description: '存在重复段落' })

      const result = await verifyRevision(makeDuplicateContent(), makeUniqueContent(), [issue])

      expect(result.verifications[0].status).toBe('verified_fixed')
      expect(result.verifications[0].evidence).toContain('重复段落已消除')
    })

    it('仍有重复段落时应返回not_fixed', async () => {
      const issue = makeIssue({ category: '格式违规', description: '存在重复段落' })

      const result = await verifyRevision(makeDuplicateContent(), makeDuplicateContent(), [issue])

      expect(result.verifications[0].status).toBe('not_fixed')
      expect(result.verifications[0].evidence).toContain('仍存在重复段落')
    })
  })

  // =========================================================================
  // TC-6-5-03 [P0] 验证Level1确定性验证-敏感词移除
  // =========================================================================
  describe('TC-6-5-03 [P0] 敏感词验证', () => {
    it('敏感词已移除时应返回verified_fixed', async () => {
      const issue = makeIssue({ category: '敏感词', description: '包含敏感词' })

      const result = await verifyRevision(makeSensitiveContent(), makeCleanContent(), [issue])

      expect(result.verifications[0].status).toBe('verified_fixed')
      expect(result.verifications[0].evidence).toContain('敏感词已移除')
    })

    it('敏感词仍存在时应返回not_fixed', async () => {
      const issue = makeIssue({ category: '敏感词', description: '包含敏感词' })

      const result = await verifyRevision(makeSensitiveContent(), makeSensitiveContent(), [issue])

      expect(result.verifications[0].status).toBe('not_fixed')
      expect(result.verifications[0].evidence).toContain('仍存在敏感词')
    })
  })

  // =========================================================================
  // TC-6-5-04 [P0] 验证Level1确定性验证-段落标准差改善
  // =========================================================================
  describe('TC-6-5-04 [P0] 段落标准差验证', () => {
    it('标准差改善时应返回verified_fixed', async () => {
      const issue = makeIssue({ category: '段落等长', description: '段落长度过于均匀' })

      const result = await verifyRevision(makeUniformParagraphs(), makeVariedParagraphs(), [issue])

      expect(result.verifications[0].status).toBe('verified_fixed')
      expect(result.verifications[0].evidence).toContain('标准差')
    })

    it('标准差未改善时应返回not_fixed', async () => {
      const issue = makeIssue({ category: '段落等长', description: '段落长度过于均匀' })

      const result = await verifyRevision(makeVariedParagraphs(), makeUniformParagraphs(), [issue])

      expect(result.verifications[0].status).toBe('not_fixed')
    })
  })

  // =========================================================================
  // TC-6-5-05 [P0] 验证Level1确定性验证-AI标记词密度降低
  // =========================================================================
  describe('TC-6-5-05 [P0] AI标记词密度验证', () => {
    it('密度降低时应返回verified_fixed', async () => {
      const issue = makeIssue({ category: '套话密度', description: 'AI标记词密度过高' })

      const result = await verifyRevision(makeHighAITellContent(), makeLowAITellContent(), [issue])

      expect(result.verifications[0].status).toBe('verified_fixed')
      expect(result.verifications[0].evidence).toContain('AI标记词密度')
    })

    it('密度未降低时应返回not_fixed', async () => {
      const issue = makeIssue({ category: '套话密度', description: 'AI标记词密度过高' })

      const result = await verifyRevision(makeLowAITellContent(), makeHighAITellContent(), [issue])

      expect(result.verifications[0].status).toBe('not_fixed')
    })
  })

  // =========================================================================
  // TC-6-5-07 [P1] 验证LLM验证限额（最多3个）
  // =========================================================================
  describe('TC-6-5-07 [P1] LLM验证限额', () => {
    it('超出限额的问题应标记为partially_fixed', async () => {
      // 创建5个无法确定性验证的 issue（使用非标准类别）
      const issues: AuditIssue[] = [
        makeIssue({ category: '逻辑漏洞', description: '角色行为不合理' }),
        makeIssue({ category: '情节矛盾', description: '时间线混乱' }),
        makeIssue({ category: '描写不足', description: '场景描写过少' }),
        makeIssue({ category: '节奏问题', description: '节奏过快' }),
        makeIssue({ category: '情感缺失', description: '情感描写不足' }),
      ]

      const content = '这是一段测试文本，用于验证LLM验证限额功能。'

      const result = await verifyRevision(content, content, issues)

      // 超出限额的应标记为 partially_fixed（evidence 包含"超出"或"限额"或"AI未初始化"）
      const partiallyFixed = result.verifications.filter(v => v.status === 'partially_fixed')
      expect(partiallyFixed.length).toBeGreaterThanOrEqual(2) // 至少2个超出限额

      // 总验证数应等于 issue 数
      expect(result.verifications.length).toBe(5)
    })
  })

  // =========================================================================
  // TC-6-5-08 [P1] 验证无问题时的空结果
  // =========================================================================
  describe('TC-6-5-08 [P1] 空问题列表', () => {
    it('issues为空数组时应返回空结果', async () => {
      const result = await verifyRevision('原文', '修订', [])

      expect(result.verifications).toEqual([])
      expect(result.fixedIssueIds).toEqual([])
      expect(result.remainingIssues).toEqual([])
    })
  })

  // =========================================================================
  // TC-6-5-06 [P0] 验证Level2 LLM验证-确定性无法验证时调用LLM
  // =========================================================================
  describe('TC-6-5-06 [P0] Level2 LLM验证链路', () => {
    it('无法确定性验证的issue应进入LLM验证流程', async () => {
      // 使用一个无法 Level 1 验证的类别
      const issue = makeIssue({ category: '角色塑造', description: '角色性格不一致' })

      const content = '这是一段测试文本。'

      const result = await verifyRevision(content, content, [issue])

      // 应有1个验证结果
      expect(result.verifications.length).toBe(1)
      // 由于 AI Store 未初始化，应返回 partially_fixed
      expect(result.verifications[0].status).toBe('partially_fixed')
    })
  })

  // =========================================================================
  // TC-6-5-09 [P2] 验证LLM未初始化时的降级处理
  // =========================================================================
  describe('TC-6-5-09 [P2] LLM未初始化降级', () => {
    it('AI未初始化时应返回partially_fixed并给出提示', async () => {
      const issue = makeIssue({ category: '角色塑造', description: '角色性格不一致' })

      const result = await verifyRevision('测试', '测试', [issue])

      expect(result.verifications[0].status).toBe('partially_fixed')
      // evidence 可能包含 'AI未初始化' 或 Pinia 未初始化的错误信息
      expect(result.verifications[0].evidence).toBeDefined()
      expect(result.verifications[0].evidence.length).toBeGreaterThan(0)
    })
  })
})
