/**
 * RevisionVerifier（修订验证器）
 *
 * 两级修订验证系统：
 * - Level 1：确定性验证（零成本，即时）—— 格式、敏感词、AI标记词等
 * - Level 2：LLM 验证（低成本，选择性）—— 仅针对 Level 1 无法验证的问题
 */

import { getLogger } from '@/utils/logger'
import { countChars } from '@/agents/LengthNormalizerAgent'
import type { AuditIssue, LengthSpec } from '@/services/pipeline/types'
import type { ChatResponse } from '@/types/ai'

const logger = getLogger('RevisionVerifier')

// ============================================================================
// 类型定义
// ============================================================================

export interface RevisionVerification {
  issueId: string
  originalIssue: AuditIssue
  status: 'verified_fixed' | 'partially_fixed' | 'not_fixed' | 'worsened'
  evidence: string
}

export interface RevisionVerificationResult {
  verifications: RevisionVerification[]
  fixedIssueIds: string[]
  remainingIssues: AuditIssue[]
}

// ============================================================================
// Level 1: 确定性验证
// ============================================================================

/** AI 标记词列表（与 PostWriteValidator 保持一致） */
const AI_TELL_WORDS = [
  '仿佛', '不禁', '宛如', '竟然', '忽然', '猛地',
  '一下子', '顿时', '刹那间', '犹如', '恍若', '蓦然',
]

/** AI 标记词密度阈值（次/千字） */
const AI_TELL_DENSITY_THRESHOLD = 5

/** 敏感词正则模式（与 PostWriteValidator 保持一致） */
const SENSITIVE_WORDS_PATTERNS = [
  /习近平|毛泽东|六四|天安门|法轮功|台独|藏独|疆独/gi,
  /强奸|轮奸|虐待|自残|自杀方法/gi,
]

/** 重复段落相似度阈值 */
const DUPLICATE_SIMILARITY_THRESHOLD = 0.8

/**
 * 计算段落长度标准差
 */
function calcParagraphStdDev(content: string): number {
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0)
  if (paragraphs.length < 2) return 0
  const lengths = paragraphs.map(p => countChars(p))
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length
  if (avg === 0) return 0
  const variance = lengths.reduce((sum, l) => sum + Math.pow(l - avg, 2), 0) / lengths.length
  return Math.sqrt(variance)
}

/**
 * 3-gram Jaccard 相似度计算
 */
function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 10 || b.length < 10) return 0
  const ngramsA = new Set<string>()
  const ngramsB = new Set<string>()
  for (let i = 0; i <= a.length - 3; i++) ngramsA.add(a.slice(i, i + 3))
  for (let i = 0; i <= b.length - 3; i++) ngramsB.add(b.slice(i, i + 3))
  let intersection = 0
  for (const ng of ngramsA) {
    if (ngramsB.has(ng)) intersection++
  }
  const union = ngramsA.size + ngramsB.size - intersection
  return union === 0 ? 0 : intersection / union
}

/**
 * 检查是否存在重复段落
 */
function hasDuplicateParagraphs(content: string): boolean {
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 20)
  for (let i = 0; i < paragraphs.length - 1; i++) {
    for (let j = i + 1; j < paragraphs.length; j++) {
      if (calculateSimilarity(paragraphs[i], paragraphs[j]) > DUPLICATE_SIMILARITY_THRESHOLD) {
        return true
      }
    }
  }
  return false
}

/**
 * 计算 AI 标记词密度
 */
function calcAITellDensity(content: string): number {
  let totalTells = 0
  for (const word of AI_TELL_WORDS) {
    totalTells += (content.match(new RegExp(word, 'g')) || []).length
  }
  return totalTells / Math.max(1, content.length / 1000)
}

/**
 * 检查敏感词是否仍然存在
 */
function hasSensitiveWords(content: string): boolean {
  for (const pattern of SENSITIVE_WORDS_PATTERNS) {
    pattern.lastIndex = 0
    if (pattern.test(content)) return true
  }
  return false
}

/**
 * Level 1 确定性验证：尝试对 issue 进行零成本验证
 * 返回验证结果，若无法确定性验证则返回 null（需交给 Level 2）
 */
function verifyDeterminate(
  originalContent: string,
  revisedContent: string,
  issue: AuditIssue,
  lengthSpec?: LengthSpec
): RevisionVerification | null {
  const issueId = `issue_${issue.category}_${issue.description.slice(0, 20)}`

  // 格式违规 + 字数相关
  if (issue.category === '格式违规' && /字数/.test(issue.description)) {
    if (lengthSpec) {
      const revisedCount = countChars(revisedContent)
      const inRange = revisedCount >= lengthSpec.softMin && revisedCount <= lengthSpec.softMax
      return {
        issueId,
        originalIssue: issue,
        status: inRange ? 'verified_fixed' : 'not_fixed',
        evidence: inRange
          ? `修订后字数 ${revisedCount}，已在范围 [${lengthSpec.softMin}, ${lengthSpec.softMax}] 内`
          : `修订后字数 ${revisedCount}，仍不在范围 [${lengthSpec.softMin}, ${lengthSpec.softMax}] 内`,
      }
    }
  }

  // 格式违规 + 重复段落
  if (issue.category === '格式违规' && /重复/.test(issue.description)) {
    const stillDuplicate = hasDuplicateParagraphs(revisedContent)
    return {
      issueId,
      originalIssue: issue,
      status: stillDuplicate ? 'not_fixed' : 'verified_fixed',
      evidence: stillDuplicate ? '修订后仍存在重复段落' : '重复段落已消除',
    }
  }

  // 敏感词
  if (issue.category === '敏感词') {
    const stillPresent = hasSensitiveWords(revisedContent)
    return {
      issueId,
      originalIssue: issue,
      status: stillPresent ? 'not_fixed' : 'verified_fixed',
      evidence: stillPresent ? '修订后仍存在敏感词' : '敏感词已移除',
    }
  }

  // 段落等长
  if (issue.category === '段落等长') {
    const origStdDev = calcParagraphStdDev(originalContent)
    const revisedStdDev = calcParagraphStdDev(revisedContent)
    const improved = revisedStdDev > origStdDev
    return {
      issueId,
      originalIssue: issue,
      status: improved ? 'verified_fixed' : 'not_fixed',
      evidence: `段落长度标准差: ${origStdDev.toFixed(1)} -> ${revisedStdDev.toFixed(1)}`,
    }
  }

  // 套话密度
  if (issue.category === '套话密度') {
    const origDensity = calcAITellDensity(originalContent)
    const revisedDensity = calcAITellDensity(revisedContent)
    const improved = revisedDensity < origDensity
    return {
      issueId,
      originalIssue: issue,
      status: improved ? 'verified_fixed' : 'not_fixed',
      evidence: `AI标记词密度: ${origDensity.toFixed(1)}/千字 -> ${revisedDensity.toFixed(1)}/千字`,
    }
  }

  // 无法确定性验证
  return null
}

// ============================================================================
// Level 2: LLM 验证
// ============================================================================

const MAX_LLM_VERIFICATIONS = 3

async function verifyWithLLM(
  revisedContent: string,
  issue: AuditIssue
): Promise<RevisionVerification> {
  const issueId = `issue_${issue.category}_${issue.description.slice(0, 20)}`

  try {
    const { useAIStore } = await import('@/stores/ai')
    const aiStore = useAIStore()

    if (!aiStore.checkInitialized()) {
      logger.warn('[RevisionVerifier] AI未初始化，保守标记为 partially_fixed')
      return {
        issueId,
        originalIssue: issue,
        status: 'partially_fixed',
        evidence: 'AI未初始化，无法验证',
      }
    }

    // 截取修订后文本的关键片段（避免过长）
    const textSnippet = revisedContent.length > 3000
      ? revisedContent.slice(0, 1500) + '\n...\n' + revisedContent.slice(-1500)
      : revisedContent

    const prompt = `请检查以下修订后的文本是否修复了给定的问题。

问题：[${issue.severity}] ${issue.category}: ${issue.description}
建议：${issue.suggestion}

修订后文本片段：
${textSnippet}

请仅回复JSON格式：{"fixed": true/false, "reason": "简要说明判断依据"}`

    const response: ChatResponse = await aiStore.chat(
      [{ role: 'user', content: prompt }],
      { type: 'check', complexity: 'low', priority: 'balanced' },
      { maxTokens: 200 }
    )

    const content = response.content?.trim() || ''
    // 尝试解析 JSON 响应
    const jsonMatch = content.match(/\{[\s\S]*"fixed"[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        issueId,
        originalIssue: issue,
        status: parsed.fixed ? 'verified_fixed' : 'not_fixed',
        evidence: parsed.reason || (parsed.fixed ? 'LLM确认已修复' : 'LLM确认未修复'),
      }
    }

    // JSON 解析失败，保守处理
    return {
      issueId,
      originalIssue: issue,
      status: 'partially_fixed',
      evidence: `LLM响应无法解析: ${content.slice(0, 100)}`,
    }
  } catch (error) {
    logger.error('[RevisionVerifier] LLM验证失败:', error)
    return {
      issueId,
      originalIssue: issue,
      status: 'partially_fixed',
      evidence: `LLM验证异常: ${error instanceof Error ? error.message : '未知错误'}`,
    }
  }
}

// ============================================================================
// 主验证函数
// ============================================================================

export async function verifyRevision(
  originalContent: string,
  revisedContent: string,
  issues: AuditIssue[],
  lengthSpec?: LengthSpec
): Promise<RevisionVerificationResult> {
  if (issues.length === 0) {
    return { verifications: [], fixedIssueIds: [], remainingIssues: [] }
  }

  logger.info(`[RevisionVerifier] 开始验证 ${issues.length} 个问题的修复情况`)

  const verifications: RevisionVerification[] = []
  const llmNeededIssues: AuditIssue[] = []

  // Level 1: 确定性验证
  for (const issue of issues) {
    const result = verifyDeterminate(originalContent, revisedContent, issue, lengthSpec)
    if (result) {
      verifications.push(result)
    } else {
      llmNeededIssues.push(issue)
    }
  }

  logger.info(`[RevisionVerifier] Level 1 完成: ${verifications.length} 个确定性验证, ${llmNeededIssues.length} 个需要 LLM 验证`)

  // Level 2: LLM 验证（限制最多 MAX_LLM_VERIFICATIONS 个）
  if (llmNeededIssues.length > 0) {
    const toVerify = llmNeededIssues.slice(0, MAX_LLM_VERIFICATIONS)
    const skipped = llmNeededIssues.slice(MAX_LLM_VERIFICATIONS)

    logger.info(`[RevisionVerifier] Level 2: LLM 验证 ${toVerify.length} 个问题，跳过 ${skipped.length} 个`)

    // 逐个验证（避免并发调用过多 LLM）
    for (const issue of toVerify) {
      const result = await verifyWithLLM(revisedContent, issue)
      verifications.push(result)
    }

    // 超出限制的问题保守标记为 partially_fixed
    for (const issue of skipped) {
      verifications.push({
        issueId: `issue_${issue.category}_${issue.description.slice(0, 20)}`,
        originalIssue: issue,
        status: 'partially_fixed',
        evidence: '超出 LLM 验证限额，保守标记',
      })
    }
  }

  // 汇总结果
  const fixedIssueIds = verifications
    .filter(v => v.status === 'verified_fixed')
    .map(v => v.issueId)

  const remainingIssues = verifications
    .filter(v => v.status !== 'verified_fixed')
    .map(v => v.originalIssue)

  logger.info(`[RevisionVerifier] 验证完成: ${fixedIssueIds.length} 个已修复, ${remainingIssues.length} 个未完全修复`)

  return { verifications, fixedIssueIds, remainingIssues }
}
