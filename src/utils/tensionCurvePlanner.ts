/**
 * tensionCurvePlanner — 跨章节张力曲线分析器
 *
 * 纯确定性文本分析（无 LLM），用于检测跨章节的节奏问题：
 * - 高潮集群（3+ 连续高张力章节）
 * - 低谷段落（4+ 连续无冲突章节）
 * - 单调节奏（5+ 连续章节张力方差 < 15）
 * - 突变跳跃（相邻章节张力差 > 50）
 */

import { getLogger } from './logger'

const log = getLogger('utils:tension-curve-planner')

// ============================================================================
// 类型定义
// ============================================================================

export interface TensionCurveReport {
  tensionValues: Array<{ chapter: number; tension: number; sceneType: string }>
  issues: TensionIssue[]
  suggestedNextTension: number
}

export interface TensionIssue {
  type: 'climax_cluster' | 'low_lying' | 'monotone' | 'sudden_jump'
  chapters: number[]
  severity: 'warning' | 'critical'
  message: string
  suggestion: string
}

interface ChapterInput {
  number: number
  title: string
  content: string
}

// ============================================================================
// 场景类型识别
// ============================================================================

interface SceneRule {
  type: string
  keywords: string[]
  tensionRange: [number, number]
}

const SCENE_RULES: SceneRule[] = [
  { type: 'action/climax', keywords: ['战斗', '攻击', '厮杀', '出手', '暴起', '冲', '劈', '砍', '杀', '逃', '追', '高潮', '突破', '觉醒', '顿悟', '逆转', '爆发', '蜕变'], tensionRange: [80, 100] },
  { type: 'confrontation', keywords: ['对峙', '争执', '冲突', '质问', '威胁', '愤怒', '怒'], tensionRange: [60, 80] },
  { type: 'reflection', keywords: ['回忆', '沉思', '内心', '想到', '明白', '领悟', '感慨'], tensionRange: [20, 40] },
  { type: 'transition', keywords: ['离开', '出发', '来到', '抵达', '次日', '几天后', '不久', '随后'], tensionRange: [10, 30] },
]

/**
 * 检测引号比例，辅助判断对话型场景
 */
function quoteRatio(text: string): number {
  if (text.length === 0) return 0
  const quotes = text.match(/[""「」『』『』""'']/g)
  if (!quotes) return 0
  return quotes.length / text.length
}

/**
 * 基于关键词分析确定场景类型和张力值
 */
function classifyScene(title: string, content: string): { sceneType: string; tension: number } {
  const text = title + ' ' + content.slice(0, 2000)

  // 先检查 action/climax 类型（最高张力）
  for (const rule of SCENE_RULES) {
    for (const kw of rule.keywords) {
      if (text.includes(kw)) {
        const [min, max] = rule.tensionRange
        const tension = Math.round(min + (max - min) * 0.5)
        return { sceneType: rule.type, tension }
      }
    }
  }

  // 检查对话型（引号比例 > 30%）
  const dialogueKeywords = ['对话', '说道', '笑道', '叹道', '问', '答']
  const hasDialogueKeyword = dialogueKeywords.some(kw => text.includes(kw))
  if (hasDialogueKeyword || quoteRatio(content.slice(0, 2000)) > 0.3) {
    return { sceneType: 'dialogue', tension: 50 }
  }

  // 默认为 reflection（中等张力）
  return { sceneType: 'reflection', tension: 30 }
}

// ============================================================================
// 跨章节规则检测
// ============================================================================

/**
 * 检测 3+ 连续高张力章节（tension > 70）
 */
function detectClimaxCluster(values: Array<{ chapter: number; tension: number }>): TensionIssue[] {
  const issues: TensionIssue[] = []
  let runStart = -1

  for (let i = 0; i <= values.length; i++) {
    const isHigh = i < values.length && values[i]!.tension > 70
    if (isHigh) {
      if (runStart < 0) runStart = i
    } else {
      if (runStart >= 0) {
        const runLen = i - runStart
        if (runLen >= 3) {
          const chapters = values.slice(runStart, i).map(v => v.chapter)
          issues.push({
            type: 'climax_cluster',
            chapters,
            severity: 'critical',
            message: `第${chapters[0]}-${chapters[chapters.length - 1]}章连续${runLen}章高张力（>70），读者可能产生疲劳`,
            suggestion: '建议在高潮段落后插入过渡或反思章节，让读者有喘息空间',
          })
        }
        runStart = -1
      }
    }
  }

  return issues
}

/**
 * 检测 4+ 连续低张力章节（tension < 30）
 */
function detectLowLying(values: Array<{ chapter: number; tension: number }>): TensionIssue[] {
  const issues: TensionIssue[] = []
  let runStart = -1

  for (let i = 0; i <= values.length; i++) {
    const isLow = i < values.length && values[i]!.tension < 30
    if (isLow) {
      if (runStart < 0) runStart = i
    } else {
      if (runStart >= 0) {
        const runLen = i - runStart
        if (runLen >= 4) {
          const chapters = values.slice(runStart, i).map(v => v.chapter)
          issues.push({
            type: 'low_lying',
            chapters,
            severity: 'warning',
            message: `第${chapters[0]}-${chapters[chapters.length - 1]}章连续${runLen}章低张力（<30），剧情缺乏冲突`,
            suggestion: '建议引入新的冲突或转折点，提升读者兴趣',
          })
        }
        runStart = -1
      }
    }
  }

  return issues
}

/**
 * 检测 5+ 连续章节张力方差 < 15
 */
function detectMonotone(values: Array<{ chapter: number; tension: number }>): TensionIssue[] {
  const issues: TensionIssue[] = []
  const windowSize = 5

  for (let i = 0; i <= values.length - windowSize; i++) {
    const window = values.slice(i, i + windowSize)
    const tensions = window.map(v => v.tension)
    const min = Math.min(...tensions)
    const max = Math.max(...tensions)
    const range = max - min

    if (range < 15) {
      const chapters = window.map(v => v.chapter)
      issues.push({
        type: 'monotone',
        chapters,
        severity: 'warning',
        message: `第${chapters[0]}-${chapters[chapters.length - 1]}章连续${windowSize}章张力变化极小（幅度${range}），节奏单调`,
        suggestion: '建议调整章节间的张力起伏，增加节奏变化',
      })
    }
  }

  return issues
}

/**
 * 检测相邻章节张力突变（差值 > 50）
 */
function detectSuddenJump(values: Array<{ chapter: number; tension: number }>): TensionIssue[] {
  const issues: TensionIssue[] = []

  for (let i = 1; i < values.length; i++) {
    const diff = Math.abs(values[i]!.tension - values[i - 1]!.tension)
    if (diff > 50) {
      issues.push({
        type: 'sudden_jump',
        chapters: [values[i - 1]!.chapter, values[i]!.chapter],
        severity: 'warning',
        message: `第${values[i - 1]!.chapter}→${values[i]!.chapter}章张力突变${diff}点（${values[i - 1]!.tension}→${values[i]!.tension}）`,
        suggestion: '建议在两章之间增加过渡段落，使张力变化更平滑',
      })
    }
  }

  return issues
}

// ============================================================================
// 主分析函数
// ============================================================================

/**
 * 分析跨章节张力曲线，返回报告
 *
 * @param chapters - 章节数据数组，需包含 number、title、content 字段
 * @returns TensionCurveReport 包含张力值、问题列表和建议的下一章张力
 */
export function analyzeTensionCurve(chapters: ChapterInput[]): TensionCurveReport {
  log.info('开始跨章节张力曲线分析', { chapterCount: chapters.length })

  if (chapters.length === 0) {
    log.info('无章节数据，返回空报告')
    return { tensionValues: [], issues: [], suggestedNextTension: 50 }
  }

  // 1. 计算每章张力值
  const tensionValues = chapters.map(ch => {
    const { sceneType, tension } = classifyScene(ch.title, ch.content)
    return { chapter: ch.number, tension, sceneType }
  })

  log.info('张力值计算完成', {
    count: tensionValues.length,
    range: `${Math.min(...tensionValues.map(v => v.tension))}-${Math.max(...tensionValues.map(v => v.tension))}`,
  })

  // 2. 执行跨章节规则检测
  const issues: TensionIssue[] = [
    ...detectClimaxCluster(tensionValues),
    ...detectLowLying(tensionValues),
    ...detectMonotone(tensionValues),
    ...detectSuddenJump(tensionValues),
  ]

  log.info('跨章节张力分析完成', {
    issueCount: issues.length,
    criticalCount: issues.filter(i => i.severity === 'critical').length,
  })

  // 3. 计算建议的下一章张力值
  const suggestedNextTension = calculateSuggestedTension(tensionValues)

  return { tensionValues, issues, suggestedNextTension }
}

/**
 * 根据最近章节的张力曲线，建议下一章的目标张力值
 * 原则：避免连续高/低张力，保持节奏起伏（确定性计算，无随机性）
 */
function calculateSuggestedTension(values: Array<{ chapter: number; tension: number }>): number {
  if (values.length === 0) return 50

  const last3 = values.slice(-3).map(v => v.tension)
  const avg = last3.reduce((a, b) => a + b, 0) / last3.length

  // 如果最近3章平均张力偏高，建议降低到中等偏下
  if (avg > 70) return 45
  // 如果最近3章平均张力偏低，建议升高到中等偏上
  if (avg < 30) return 65
  // 正常情况下，根据最近一章进行适度调整
  const last = values[values.length - 1]!.tension
  if (last > 70) return Math.max(40, last - 25)
  if (last < 30) return Math.min(60, last + 25)
  // 在中等范围内，建议适度波动
  return Math.round(avg)
}

/**
 * 将张力曲线报告格式化为可读字符串
 */
export function formatTensionCurveReport(report: TensionCurveReport): string {
  if (report.tensionValues.length === 0) return '(暂无张力数据)'

  const lines: string[] = []
  lines.push('## 跨章节张力曲线')
  lines.push('')

  // 张力值概览
  lines.push('### 张力值概览')
  for (const tv of report.tensionValues) {
    const bar = '█'.repeat(Math.round(tv.tension / 5))
    lines.push(`第${tv.chapter}章 [${tv.sceneType}] ${tv.tension} ${bar}`)
  }
  lines.push('')

  // 问题列表
  if (report.issues.length > 0) {
    lines.push(`### 发现${report.issues.length}个节奏问题`)
    for (const issue of report.issues) {
      const severityTag = issue.severity === 'critical' ? '[严重]' : '[警告]'
      lines.push(`${severityTag} ${issue.message}`)
      lines.push(`  建议: ${issue.suggestion}`)
    }
    lines.push('')
  } else {
    lines.push('### 节奏检查通过，未发现问题')
    lines.push('')
  }

  lines.push(`### 建议下一章目标张力: ${report.suggestedNextTension}`)

  return lines.join('\n')
}
