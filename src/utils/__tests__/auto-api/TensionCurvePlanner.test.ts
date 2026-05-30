/**
 * 接口自动化测试 — 跨章节张力曲线分析器（tensionCurvePlanner）
 * 覆盖用例：TC-6-1-01 ~ TC-6-1-09
 * 优先级：P0 + P1 + P2
 */
import { describe, expect, it } from 'vitest'
import { analyzeTensionCurve, formatTensionCurveReport } from '@/utils/tensionCurvePlanner'
import type { TensionCurveReport } from '@/utils/tensionCurvePlanner'

// ---------------------------------------------------------------------------
// 辅助函数：构造章节数据
// ---------------------------------------------------------------------------
function makeChapter(number: number, title: string, content: string) {
  return { number, title, content }
}

// 生成包含特定关键词的长文本（确保张力分类准确）
function makeHighTensionContent(): string {
  return '战斗爆发了，英雄冲上前去，与敌人厮杀在一起。这一战惊天动地，突破了所有人的想象。' +
    '随着一声怒吼，他终于觉醒了体内的力量，逆转了战局。这一刻，蜕变完成了，爆发的力量席卷一切。'
}

function makeLowTensionContent(): string {
  return '离开旧居后，他来到了一座小镇。出发时天刚亮，抵达时已是黄昏。' +
    '几天后，他再次上路。不久，一座古庙出现在眼前。随后，他决定在此停留。'
}

function makeReflectionContent(): string {
  return '他回忆起往事，陷入沉思。内心深处，他想到曾经的伙伴。' +
    '他明白了许多道理，终于领悟了师父的教诲。感慨万千之际，泪水悄然滑落。'
}

function makeDialogueContent(): string {
  // 使用Unicode curly quotes（\u201c \u201d），这是 dialogueAnalyzer 的 DIALOGUE_CONTENT_PATTERN 匹配的引号类型
  // 避免包含 SCENE_RULES 中的关键词（如"笑""叹"触发confrontation，"想到"触发reflection）
  return '\u201c你来了。\u201d\u201c我当然要来。\u201d\u201c情况如何？\u201d' +
    '\u201c接下来怎么办？\u201d\u201c先等等再说。\u201d\u201c我们走吧。\u201d' +
    '这段对话持续了很久两人你一言我一语地讨论着未来的计划。'
}

// ---------------------------------------------------------------------------
// 测试用例
// ---------------------------------------------------------------------------

describe('TensionCurvePlanner 接口自动化测试', () => {

  // =========================================================================
  // TC-6-1-01 [P0] 验证高潮集群检测（3+连续高张力章节）
  // =========================================================================
  describe('TC-6-1-01 [P0] 高潮集群检测', () => {
    it('应检测到3+连续高张力章节的climax_cluster问题', () => {
      const chapters = [
        makeChapter(1, '开篇', makeLowTensionContent()),
        makeChapter(2, '决战前夕', makeHighTensionContent()),
        makeChapter(3, '激战', makeHighTensionContent()),
        makeChapter(4, '最终突破', makeHighTensionContent()),
        makeChapter(5, '尾声', makeLowTensionContent()),
      ]

      const report = analyzeTensionCurve(chapters)

      // 应检测到 climax_cluster
      const clusterIssues = report.issues.filter(i => i.type === 'climax_cluster')
      expect(clusterIssues.length).toBeGreaterThanOrEqual(1)

      const issue = clusterIssues[0]
      expect(issue.severity).toBe('critical')
      expect(issue.chapters).toEqual(expect.arrayContaining([2, 3, 4]))
      expect(issue.message).toContain('连续')
      expect(issue.message).toContain('高张力')
    })
  })

  // =========================================================================
  // TC-6-1-02 [P0] 验证低谷段落检测（4+连续低张力章节）
  // =========================================================================
  describe('TC-6-1-02 [P0] 低谷段落检测', () => {
    it('应检测到4+连续低张力章节的low_lying问题', () => {
      const chapters = [
        makeChapter(1, '离开', makeLowTensionContent()),
        makeChapter(2, '出发', makeLowTensionContent()),
        makeChapter(3, '抵达', makeLowTensionContent()),
        makeChapter(4, '次日', makeLowTensionContent()),
        makeChapter(5, '转机', makeHighTensionContent()),
      ]

      const report = analyzeTensionCurve(chapters)

      const lowIssues = report.issues.filter(i => i.type === 'low_lying')
      expect(lowIssues.length).toBeGreaterThanOrEqual(1)

      const issue = lowIssues[0]
      expect(issue.severity).toBe('warning')
      expect(issue.chapters.length).toBeGreaterThanOrEqual(4)
      expect(issue.message).toContain('低张力')
    })
  })

  // =========================================================================
  // TC-6-1-03 [P0] 验证单调节奏检测（5+连续章节张力方差<15）
  // =========================================================================
  describe('TC-6-1-03 [P0] 单调节奏检测', () => {
    it('应检测到5+连续章节张力变化极小的monotone问题', () => {
      // 使用 reflection 内容，张力在 20-40 范围，方差应 < 15
      const chapters = [
        makeChapter(1, '沉思', makeReflectionContent()),
        makeChapter(2, '回忆', makeReflectionContent()),
        makeChapter(3, '内省', makeReflectionContent()),
        makeChapter(4, '感悟', makeReflectionContent()),
        makeChapter(5, '领悟', makeReflectionContent()),
        makeChapter(6, '觉醒', makeHighTensionContent()),
      ]

      const report = analyzeTensionCurve(chapters)

      const monotoneIssues = report.issues.filter(i => i.type === 'monotone')
      expect(monotoneIssues.length).toBeGreaterThanOrEqual(1)

      const issue = monotoneIssues[0]
      expect(issue.severity).toBe('warning')
      expect(issue.chapters.length).toBe(5)
      expect(issue.message).toContain('节奏单调')
    })
  })

  // =========================================================================
  // TC-6-1-04 [P0] 验证突变跳跃检测（相邻章节张力差>50）
  // =========================================================================
  describe('TC-6-1-04 [P0] 突变跳跃检测', () => {
    it('应检测到相邻章节张力差>50的sudden_jump问题', () => {
      const chapters = [
        makeChapter(1, '沉思', makeReflectionContent()),   // tension ~30
        makeChapter(2, '爆发', makeHighTensionContent()),  // tension ~90
      ]

      const report = analyzeTensionCurve(chapters)

      const jumpIssues = report.issues.filter(i => i.type === 'sudden_jump')
      expect(jumpIssues.length).toBeGreaterThanOrEqual(1)

      const issue = jumpIssues[0]
      expect(issue.chapters).toEqual([1, 2])
      expect(issue.message).toContain('突变')
    })
  })

  // =========================================================================
  // TC-6-1-05 [P1] 验证场景类型识别-对话型场景
  // =========================================================================
  describe('TC-6-1-05 [P1] 对话型场景识别', () => {
    it('引号比例>30%的章节应识别为dialogue类型，tension为50', () => {
      const chapters = [
        makeChapter(1, '对话', makeDialogueContent()),
      ]

      const report = analyzeTensionCurve(chapters)

      expect(report.tensionValues.length).toBe(1)
      expect(report.tensionValues[0].sceneType).toBe('dialogue')
      expect(report.tensionValues[0].tension).toBe(50)
    })
  })

  // =========================================================================
  // TC-6-1-06 [P1] 验证空章节输入
  // =========================================================================
  describe('TC-6-1-06 [P1] 空章节输入', () => {
    it('空数组应返回空报告', () => {
      const report = analyzeTensionCurve([])

      expect(report.tensionValues).toEqual([])
      expect(report.issues).toEqual([])
      expect(report.suggestedNextTension).toBe(50)
    })
  })

  // =========================================================================
  // TC-6-1-07 [P1] 验证建议下一章张力值-高张力后建议降低
  // =========================================================================
  describe('TC-6-1-07 [P1] 高张力后建议降低', () => {
    it('最近3章平均张力>70时，建议张力应为45', () => {
      const chapters = [
        makeChapter(1, '战斗1', makeHighTensionContent()),
        makeChapter(2, '战斗2', makeHighTensionContent()),
        makeChapter(3, '战斗3', makeHighTensionContent()),
      ]

      const report = analyzeTensionCurve(chapters)

      expect(report.suggestedNextTension).toBe(45)
    })
  })

  // =========================================================================
  // TC-6-1-08 [P1] 验证建议下一章张力值-低张力后建议升高
  // =========================================================================
  describe('TC-6-1-08 [P1] 低张力后建议升高', () => {
    it('最近3章平均张力<30时，建议张力应为65', () => {
      // transition 内容，张力在 10-30 范围
      const chapters = [
        makeChapter(1, '离开', makeLowTensionContent()),
        makeChapter(2, '出发', makeLowTensionContent()),
        makeChapter(3, '抵达', makeLowTensionContent()),
      ]

      const report = analyzeTensionCurve(chapters)

      expect(report.suggestedNextTension).toBe(65)
    })
  })

  // =========================================================================
  // TC-6-1-09 [P2] 验证formatTensionCurveReport格式化输出
  // =========================================================================
  describe('TC-6-1-09 [P2] 报告格式化输出', () => {
    it('应生成包含标题、张力条形图、问题列表和建议的报告文本', () => {
      const chapters = [
        makeChapter(1, '战斗', makeHighTensionContent()),
        makeChapter(2, '沉思', makeReflectionContent()),
      ]

      const report = analyzeTensionCurve(chapters)
      const text = formatTensionCurveReport(report)

      expect(text).toContain('跨章节张力曲线')
      expect(text).toContain('第1章')
      expect(text).toContain('第2章')
      expect(text).toContain('建议下一章目标张力')
    })

    it('空报告应返回暂无数据提示', () => {
      const emptyReport: TensionCurveReport = {
        tensionValues: [],
        issues: [],
        suggestedNextTension: 50,
      }
      const text = formatTensionCurveReport(emptyReport)
      expect(text).toContain('暂无张力数据')
    })
  })
})
