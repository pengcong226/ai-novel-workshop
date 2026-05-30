/**
 * PostWriteValidator（写后校验器）
 *
 * 确定性规则校验，不依赖 LLM。
 * 检查章节的格式、长度、敏感词、AI标记词等。
 *
 * 在 Pipeline 的 audit 阶段之前或之中作为辅助检查执行
 */

import { getLogger } from '@/utils/logger'
import type { AuditIssue, LengthSpec } from '@/services/pipeline/types'
import { countChars } from './LengthNormalizerAgent'

const logger = getLogger('agent:post-write-validator')

// ============================================================================
// 配置
// ============================================================================

/** AI 标记词列表 */
export const AI_TELL_WORDS = [
  '仿佛', '不禁', '宛如', '竟然', '忽然', '猛地',
  '一下子', '顿时', '刹那间', '犹如', '恍若', '蓦然',
]

/** AI 标记词密度阈值（次/千字） */
export const AI_TELL_DENSITY_THRESHOLD = 5

/** 敏感词列表（基础集，可通过配置扩展） */
export const SENSITIVE_WORDS_PATTERNS = [
  // 政治敏感
  /习近平|毛泽东|六四|天安门|法轮功|台独|藏独|疆独/gi,
  // 色情/暴力
  /强奸|轮奸|虐待|自残|自杀方法/gi,
]

/** 段落长度变异系数阈值 */
export const PARAGRAPH_UNIFORMITY_THRESHOLD = 0.7

/** 重复段落检测（连续相似度 > 80%） */
export const DUPLICATE_SIMILARITY_THRESHOLD = 0.8

// ============================================================================
// 校验函数
// ============================================================================

/**
 * 检查字数范围
 */
export function validateLength(content: string, spec: LengthSpec): AuditIssue[] {
  const issues: AuditIssue[] = []
  const wordCount = countChars(content)

  if (wordCount < spec.hardMin) {
    issues.push({
      severity: 'critical',
      category: '格式违规',
      description: `字数严重不足：${wordCount}字（硬下限 ${spec.hardMin}）`,
      suggestion: '请扩展章节内容，补充场景描写或对话',
    })
  } else if (wordCount > spec.hardMax) {
    issues.push({
      severity: 'critical',
      category: '格式违规',
      description: `字数严重超标：${wordCount}字（硬上限 ${spec.hardMax}）`,
      suggestion: '请压缩章节内容，精简冗余描写',
    })
  } else if (wordCount < spec.softMin) {
    issues.push({
      severity: 'warning',
      category: '格式违规',
      description: `字数偏少：${wordCount}字（建议 ${spec.softMin}-${spec.softMax}）`,
      suggestion: '可适当扩展内容',
    })
  } else if (wordCount > spec.softMax) {
    issues.push({
      severity: 'warning',
      category: '格式违规',
      description: `字数偏多：${wordCount}字（建议 ${spec.softMin}-${spec.softMax}）`,
      suggestion: '可适当精简内容',
    })
  }

  return issues
}

/**
 * 检查 AI 标记词密度
 */
export function validateAITells(content: string): AuditIssue[] {
  const issues: AuditIssue[] = []
  const tellCounts: Record<string, number> = {}

  for (const word of AI_TELL_WORDS) {
    const count = (content.match(new RegExp(word, 'g')) || []).length
    if (count > 0) tellCounts[word] = count
  }

  const totalTells = Object.values(tellCounts).reduce((a, b) => a + b, 0)
  const density = totalTells / Math.max(1, content.length / 1000)

  if (density > AI_TELL_DENSITY_THRESHOLD) {
    const topWords = Object.entries(tellCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([word, count]) => `${word}(${count}次)`)
      .join('、')

    issues.push({
      severity: 'info',
      category: '套话密度',
      description: `AI标记词密度偏高：${density.toFixed(1)}次/千字。高频词：${topWords}`,
      suggestion: '替换为更具体的描写，减少模板化表达',
    })
  }

  return issues
}

/**
 * 检查敏感词
 */
export function validateSensitiveWords(content: string): AuditIssue[] {
  const issues: AuditIssue[] = []

  for (const pattern of SENSITIVE_WORDS_PATTERNS) {
    // 重置 regex 状态
    pattern.lastIndex = 0
    const matches = content.match(pattern)
    if (matches && matches.length > 0) {
      issues.push({
        severity: 'critical',
        category: '敏感词',
        description: `检测到敏感词：${matches.slice(0, 3).join('、')}${matches.length > 3 ? `等${matches.length}处` : ''}`,
        suggestion: '请移除或替换敏感内容',
      })
    }
  }

  return issues
}

/**
 * 检查段落长度均匀度
 */
export function validateParagraphUniformity(content: string): AuditIssue[] {
  const issues: AuditIssue[] = []
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0)

  if (paragraphs.length < 5) return issues

  const lengths = paragraphs.map(p => countChars(p))
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length

  if (avg === 0) return issues

  // 计算标准差
  const variance = lengths.reduce((sum, l) => sum + Math.pow(l - avg, 2), 0) / lengths.length
  const stddev = Math.sqrt(variance)
  const cv = stddev / avg  // 变异系数

  if (cv < 0.15) {
    // 变异系数过低意味着段落长度过于均匀
    const uniformCount = lengths.filter(l => Math.abs(l - avg) < avg * 0.15).length
    if (uniformCount > lengths.length * PARAGRAPH_UNIFORMITY_THRESHOLD) {
      issues.push({
        severity: 'info',
        category: '段落等长',
        description: `${uniformCount}/${paragraphs.length} 个段落长度接近（平均${Math.round(avg)}字），缺乏节奏变化`,
        suggestion: '交替使用长短段落，营造阅读节奏感',
      })
    }
  }

  return issues
}

/**
 * 检查重复段落
 */
export function validateDuplicateParagraphs(content: string): AuditIssue[] {
  const issues: AuditIssue[] = []
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 20)

  for (let i = 0; i < paragraphs.length - 1; i++) {
    for (let j = i + 1; j < paragraphs.length; j++) {
      const similarity = calculateSimilarity(paragraphs[i], paragraphs[j])
      if (similarity > DUPLICATE_SIMILARITY_THRESHOLD) {
        issues.push({
          severity: 'warning',
          category: '格式违规',
          description: `第${i + 1}段和第${j + 1}段内容高度重复（相似度${Math.round(similarity * 100)}%）`,
          suggestion: '删除重复段落或改写其中一段',
          affectedParagraphs: [i, j],
        })
        // 只报告一对
        return issues
      }
    }
  }

  return issues
}

/**
 * 检查标题
 */
export function validateTitle(content: string, existingTitles: string[]): AuditIssue[] {
  const issues: AuditIssue[] = []

  // 提取章节标题（以 # 开头的第一行）
  const titleMatch = content.match(/^#\s+(.+)$/m)
  if (titleMatch) {
    const title = titleMatch[1].trim()
    if (existingTitles.includes(title)) {
      issues.push({
        severity: 'warning',
        category: '格式违规',
        description: `章节标题"${title}"与已有章节重复`,
        suggestion: '请修改为唯一的章节标题',
      })
    }
  }

  return issues
}

// ============================================================================
// 综合校验
// ============================================================================

export interface PostWriteValidationInput {
  content: string
  lengthSpec?: LengthSpec
  existingTitles?: string[]
  /** 章节号（可选，用于日志） */
  chapterNumber?: number
  /** 规则栈（可选，预留） */
  ruleStack?: any
  /** 类型（可选，预留） */
  genre?: string
  /** 是否启用敏感词检测（默认 true） */
  enableSensitiveWordCheck?: boolean
}

export interface PostWriteValidationOutput {
  issues: AuditIssue[]
  hasCritical: boolean
}

/**
 * 执行所有写后校验
 */
export function runPostWriteValidation(input: PostWriteValidationInput): PostWriteValidationOutput {
  const startTime = performance.now()
  const issues: AuditIssue[] = []

  // 长度检查
  if (input.lengthSpec) {
    issues.push(...validateLength(input.content, input.lengthSpec))
  }

  // AI标记词检查
  issues.push(...validateAITells(input.content))

  // 敏感词检查（根据开关决定是否执行）
  const enableSensitiveWordCheck = input.enableSensitiveWordCheck !== false // 默认开启
  if (enableSensitiveWordCheck) {
    issues.push(...validateSensitiveWords(input.content))
  } else {
    logger.info('[PostWriteValidator] 敏感词检测已关闭，跳过')
  }

  // 段落均匀度检查
  issues.push(...validateParagraphUniformity(input.content))

  // 重复段落检查
  issues.push(...validateDuplicateParagraphs(input.content))

  // 标题重复检查
  if (input.existingTitles) {
    issues.push(...validateTitle(input.content, input.existingTitles))
  }

  const hasCritical = issues.some(i => i.severity === 'critical')
  const elapsed = Math.round(performance.now() - startTime)

  logger.info(`[PostWriteValidator] 校验完成: ${issues.length}个问题（${issues.filter(i => i.severity === 'critical').length}个critical），耗时 ${elapsed}ms`)

  return { issues, hasCritical }
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 简单的文本相似度计算（基于字符级别的 Jaccard 系数）
 */
export function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 10 || b.length < 10) return 0

  // 使用 3-gram
  const ngramsA = new Set<string>()
  const ngramsB = new Set<string>()

  for (let i = 0; i <= a.length - 3; i++) {
    ngramsA.add(a.slice(i, i + 3))
  }
  for (let i = 0; i <= b.length - 3; i++) {
    ngramsB.add(b.slice(i, i + 3))
  }

  let intersection = 0
  for (const ng of ngramsA) {
    if (ngramsB.has(ng)) intersection++
  }

  const union = ngramsA.size + ngramsB.size - intersection
  return union === 0 ? 0 : intersection / union
}
