/**
 * dialogueAnalyzer - 对话质量分析器
 *
 * 对章节正文进行确定性对话质量分析，包括对话/叙述比例、标签频率、
 * 连续对话检测等维度。不依赖 LLM。
 */

import { getLogger } from '@/utils/logger'

const log = getLogger('dialogueAnalyzer')

// ============================================================================
// 类型定义
// ============================================================================

export interface DialogueAnalysisResult {
  /** 对话/叙述比例 (0-1) */
  dialogueRatio: number
  ratioAssessment: 'balanced' | 'dialogue_heavy' | 'narration_heavy'
  /** 对话标签统计 */
  tagFrequency: Array<{ tag: string; count: number }>
  /** 重复标签（单章出现>5次） */
  repeatedTags: Array<{ tag: string; count: number }>
  /** 连续对话轮数（无叙述穿插） */
  maxConsecutiveDialogues: number
  /** 综合评分 (0-100) */
  overallScore: number
  /** 检测到的问题 */
  issues: Array<{
    category: string
    severity: 'warning' | 'info'
    description: string
    suggestion: string
  }>
}

// ============================================================================
// 常量
// ============================================================================

/** 对话标签关键词列表 */
const DIALOGUE_TAGS = [
  '说', '道', '笑', '叹', '吼', '喊', '问', '答',
  '叫', '嚷', '嘟囔', '嘀咕', '冷哼', '嗤笑',
]

/** 匹配引号及其中间内容（"" 和 「」） */
const DIALOGUE_CONTENT_PATTERN = /[\u201c\u300c][\s\S]*?[\u201d\u300d]/g

/** 连续对话行检测：行首为引号开头 */
const LINE_START_DIALOGUE = /^[\s]*[\u201c\u300c]/

/** 对话比例阈值 */
const BALANCED_MIN = 0.2
const BALANCED_MAX = 0.6

/** 重复标签阈值 */
const REPEATED_TAG_THRESHOLD = 5

/** 连续对话警告阈值 */
const CONSECUTIVE_DIALOGUE_THRESHOLD = 6

// ============================================================================
// 内部辅助函数
// ============================================================================

/**
 * 提取对话文本内容并计算长度
 * 匹配 "" 和 「」 中的内容
 */
function extractDialogueLength(content: string): number {
  const matches = content.match(DIALOGUE_CONTENT_PATTERN)
  if (!matches) return 0
  return matches.reduce((sum, m) => sum + m.length, 0)
}

/**
 * 统计对话标签频率
 * 匹配标签前为中文字符或引号，标签后为标点或引号的模式
 */
function countDialogueTags(content: string): Array<{ tag: string; count: number }> {
  const results: Array<{ tag: string; count: number }> = []

  for (const tag of DIALOGUE_TAGS) {
    // 匹配标签出现的总次数
    const pattern = new RegExp(tag, 'g')
    const count = (content.match(pattern) || []).length

    if (count > 0) {
      results.push({ tag, count })
    }
  }

  // 按出现次数降序排列
  results.sort((a, b) => b.count - a.count)
  return results
}

/**
 * 检测重复标签（单章出现 > 5 次）
 */
function detectRepeatedTags(
  tagFrequency: Array<{ tag: string; count: number }>
): Array<{ tag: string; count: number }> {
  return tagFrequency.filter(t => t.count > REPEATED_TAG_THRESHOLD)
}

/**
 * 检测最大连续对话行数
 * 连续对话行定义：行首为引号开头（" 或 「），中间无叙述行穿插
 */
function detectMaxConsecutiveDialogues(content: string): number {
  const lines = content.split('\n').filter(line => line.trim().length > 0)

  let maxConsecutive = 0
  let currentConsecutive = 0

  for (const line of lines) {
    if (LINE_START_DIALOGUE.test(line)) {
      currentConsecutive++
      maxConsecutive = Math.max(maxConsecutive, currentConsecutive)
    } else {
      currentConsecutive = 0
    }
  }

  return maxConsecutive
}

// ============================================================================
// 导出主函数
// ============================================================================

/**
 * 分析章节对话质量
 *
 * 执行以下确定性检查（不依赖 LLM）：
 * 1. 对话/叙述比例分析
 * 2. 对话标签频率统计
 * 3. 重复标签检测（单章 > 5 次）
 * 4. 连续对话行检测
 * 5. 综合评分计算
 *
 * @param content 章节正文内容
 * @returns DialogueAnalysisResult 分析结果
 */
export function analyzeDialogue(content: string): DialogueAnalysisResult {
  log.info('开始对话质量分析', { contentLength: content.length })

  const issues: DialogueAnalysisResult['issues'] = []

  // ---- 1. 对话/叙述比例 ----
  const dialogueLength = extractDialogueLength(content)
  const totalLength = content.replace(/\s+/g, '').length
  const dialogueRatio = totalLength > 0 ? dialogueLength / totalLength : 0

  let ratioAssessment: DialogueAnalysisResult['ratioAssessment'] = 'balanced'
  if (dialogueRatio > BALANCED_MAX) {
    ratioAssessment = 'dialogue_heavy'
  } else if (dialogueRatio < BALANCED_MIN) {
    ratioAssessment = 'narration_heavy'
  }

  log.info('对话比例分析', {
    dialogueLength,
    totalLength,
    ratio: dialogueRatio.toFixed(3),
    assessment: ratioAssessment,
  })

  // ---- 2. 对话标签频率统计 ----
  const tagFrequency = countDialogueTags(content)

  // ---- 3. 重复标签检测 ----
  const repeatedTags = detectRepeatedTags(tagFrequency)

  // ---- 4. 连续对话检测 ----
  const maxConsecutiveDialogues = detectMaxConsecutiveDialogues(content)

  log.info('对话检测结果', {
    tagCount: tagFrequency.length,
    repeatedTagCount: repeatedTags.length,
    maxConsecutiveDialogues,
  })

  // ---- 5. 生成问题报告 ----

  // 对话比例问题
  if (ratioAssessment === 'dialogue_heavy') {
    issues.push({
      category: '对话质量',
      severity: 'warning',
      description: `对话占比过高（${(dialogueRatio * 100).toFixed(1)}%），超过 60% 阈值，文本以对话为主`,
      suggestion: '增加环境描写、心理活动或动作描写，平衡对话与叙述比例',
    })
  } else if (ratioAssessment === 'narration_heavy') {
    issues.push({
      category: '对话质量',
      severity: 'warning',
      description: `对话占比过低（${(dialogueRatio * 100).toFixed(1)}%），低于 20% 阈值，文本以叙述为主`,
      suggestion: '适当增加角色对话，提升文本节奏感和角色互动',
    })
  }

  // 重复标签问题
  for (const rt of repeatedTags) {
    issues.push({
      category: '对话质量',
      severity: 'warning',
      description: `对话标签「${rt.tag}」在本章出现 ${rt.count} 次，超过 ${REPEATED_TAG_THRESHOLD} 次阈值，标签使用过于单调`,
      suggestion: `替换部分「${rt.tag}」为其他表达方式，或省略标签用动作/神态描写替代`,
    })
  }

  // 连续对话问题
  if (maxConsecutiveDialogues > CONSECUTIVE_DIALOGUE_THRESHOLD) {
    issues.push({
      category: '对话质量',
      severity: 'warning',
      description: `检测到连续 ${maxConsecutiveDialogues} 行对话无叙述穿插，超过 ${CONSECUTIVE_DIALOGUE_THRESHOLD} 行阈值`,
      suggestion: '在对话间穿插动作描写、环境描写或心理活动，避免纯对话堆砌',
    })
  }

  // ---- 6. 综合评分计算 ----
  let overallScore = 100

  // 对话比例失衡扣分
  if (ratioAssessment === 'dialogue_heavy' || ratioAssessment === 'narration_heavy') {
    overallScore -= 15
  }

  // 重复标签扣分（每个重复标签 -5）
  overallScore -= repeatedTags.length * 5

  // 连续对话过多扣分
  if (maxConsecutiveDialogues > CONSECUTIVE_DIALOGUE_THRESHOLD) {
    overallScore -= 10
  }

  // 确保分数在 0-100 范围内
  overallScore = Math.max(0, Math.min(100, overallScore))

  log.info('对话质量分析完成', {
    overallScore,
    issueCount: issues.length,
    ratioAssessment,
    repeatedTagCount: repeatedTags.length,
    maxConsecutiveDialogues,
  })

  return {
    dialogueRatio,
    ratioAssessment,
    tagFrequency,
    repeatedTags,
    maxConsecutiveDialogues,
    overallScore,
    issues,
  }
}
