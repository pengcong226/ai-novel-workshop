/**
 * ReviserAgent（修订师）
 *
 * 根据审计结果，对章节正文进行定点修复或全面修订。
 * 支持 5 种修订模式：auto / polish / rewrite / spot-fix / anti-detect
 */

import { getLogger } from '@/utils/logger'
import { safeParseAIJson } from '@/utils/safeParseAIJson'
import { withRetry, REVISER_RETRY_CONFIG } from '@/utils/llmRetry'
import { verifyRevision } from '@/services/pipeline/RevisionVerifier'
import type { ChatResponse } from '@/types/ai'
import type {
  ReviseChapterInput,
  ReviseOutput,
  AuditIssue,
  ReviseMode,
  TokenUsage,
} from '@/services/pipeline/types'

const logger = getLogger('agent:reviser')

// ============================================================================
// 修订 Prompt 构建
// ============================================================================

const SYSTEM_PROMPT_AUTO = `你是一位专业的网络小说修订师。根据审计发现的问题，对章节正文进行修订。

## 修订规则
1. 必须修复所有 Critical 级问题
2. 尝试改善 Warning 级问题
3. 参考 Info 级建议
4. 保留原有的事实、人名、地名、关键钩子
5. 不引入新的支线或未计划的揭示
6. 保持原有章节的整体结构和叙事节奏
7. 修订后的正文应完整，不能有省略

## 输出格式
直接输出修订后的完整正文，不要添加任何解释或标记。`

const SYSTEM_PROMPT_POLISH = `你是一位文风润色师。请对以下章节进行文风润色，只改善表达方式，不改动事实和情节。

## 润色规则
1. 替换AI标记词（仿佛、不禁、宛如、忽然、猛地等）为更自然的表达
2. 丰富句式变化，打破规律性
3. 口语化对话，增加个性
4. 保留所有事实和情节
5. 保持原有长度（±5%）

直接输出润色后的完整正文。`

const SYSTEM_PROMPT_SPOT_FIX = `你是一位精准修订师。请仅修改标记出的问题句段，其他内容原封不动。

## 修订规则
1. 仅修改被标记的问题段落及其前后衔接
2. 不改动其他任何段落
3. 确保修改后的段落与上下文自然衔接
4. 保留所有事实和角色设定

直接输出完整正文（包含未修改和已修改的部分）。`

const SYSTEM_PROMPT_ANTI_DETECT = `你是一位反AI检测改写师。在保持剧情完全不变的前提下，降低文本的AI检测率。

## 改写策略
1. 打破句式规律：混合使用长短句、不同句式
2. 口语化替代：用口语表达替换书面化模板
3. 减少"了"字密度：适当替换或省略
4. 转折词降频：减少"然而"、"但是"、"不过"的重复
5. 情绪外化：用动作、细节代替直接陈述情绪
6. 消灭叙述者结论：用场景展现代替作者点评
7. 群像反应具体化：每个角色的反应应不同
8. 段落长度差异化：刻意制造长短落差
9. 消灭AI标记词：仿佛、不禁、宛如、竟然等
10. 增加个人化细节：加入只有这个角色才会注意到的细节

直接输出改写后的完整正文。`

const SYSTEM_PROMPT_REWRITE = `你是一位章节改写师。请对以下章节进行重组改写，重点修复逻辑和节奏问题。

## 改写规则
1. 重组问题段落的结构和顺序
2. 修复逻辑漏洞和节奏问题
3. 保留所有已有事实和角色设定
4. 不引入新的支线
5. 保持与上下文的连贯性

直接输出改写后的完整正文。`

function getSystemPrompt(mode: ReviseMode): string {
  switch (mode) {
    case 'polish': return SYSTEM_PROMPT_POLISH
    case 'spot-fix': return SYSTEM_PROMPT_SPOT_FIX
    case 'anti-detect': return SYSTEM_PROMPT_ANTI_DETECT
    case 'rewrite': return SYSTEM_PROMPT_REWRITE
    case 'auto':
    default: return SYSTEM_PROMPT_AUTO
  }
}

/**
 * 将 issues 按 severity 分级后构建修订提示
 */
function buildIssueSummary(issues: AuditIssue[]): string {
  const critical = issues.filter(i => i.severity === 'critical')
  const warning = issues.filter(i => i.severity === 'warning')
  const info = issues.filter(i => i.severity === 'info')

  const parts: string[] = []

  if (critical.length > 0) {
    parts.push('### 必须修复（Critical）')
    for (const issue of critical.slice(0, 5)) {
      parts.push(`- [${issue.category}] ${issue.description}\n  建议：${issue.suggestion}`)
    }
  }

  if (warning.length > 0) {
    parts.push('### 应当改善（Warning）')
    for (const issue of warning.slice(0, 5)) {
      parts.push(`- [${issue.category}] ${issue.description}\n  建议：${issue.suggestion}`)
    }
  }

  if (info.length > 0) {
    parts.push('### 参考建议（Info）')
    for (const issue of info.slice(0, 3)) {
      parts.push(`- [${issue.category}] ${issue.description}`)
    }
  }

  return parts.join('\n\n')
}

/**
 * 自动选择修订模式
 */
function autoSelectMode(issues: AuditIssue[]): ReviseMode {
  const critical = issues.filter(i => i.severity === 'critical')
  const categories = new Set(issues.map(i => i.category))

  // 如果主要是文风/套话问题，用润色
  if (critical.length === 0 && (categories.has('套话密度') || categories.has('文风检查'))) {
    return 'polish'
  }

  // 如果有节奏或逻辑问题，用改写
  if (categories.has('节奏检查') || categories.has('设定冲突') || categories.has('时间线检查')) {
    return 'rewrite'
  }

  // 如果只有少量问题，用定点修复
  if (issues.length <= 3 && critical.length <= 1) {
    return 'spot-fix'
  }

  // 默认全面修订
  return 'auto'
}

// ============================================================================
// ReviserAgent 主类
// ============================================================================

export class ReviserAgent {
  private aiStore: any = null

  private async getAIStore() {
    if (!this.aiStore) {
      const { useAIStore } = await import('@/stores/ai')
      this.aiStore = useAIStore()
    }
    return this.aiStore
  }

  /**
   * 执行修订
   */
  async revise(input: ReviseChapterInput): Promise<ReviseOutput> {
    const startTime = performance.now()
    logger.info(`[Reviser] 开始修订第${input.chapterNumber}章，问题数: ${input.issues.length}`)

    const emptyUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

    // 确定修订模式
    const mode = input.mode === 'auto' ? autoSelectMode(input.issues) : input.mode
    logger.info(`[Reviser] 修订模式: ${mode}`)

    // 如果没有问题，直接返回原文
    if (input.issues.length === 0) {
      return {
        revisedContent: input.content,
        wordCount: input.content.length,
        fixedIssues: [],
        tokenUsage: emptyUsage,
      }
    }

    try {
      const aiStore = await this.getAIStore()
      if (!aiStore.checkInitialized()) {
        logger.warn('[Reviser] AI未初始化，返回原文')
        return {
          revisedContent: input.content,
          wordCount: input.content.length,
          fixedIssues: [],
          tokenUsage: emptyUsage,
        }
      }

      const systemPrompt = getSystemPrompt(mode)
      const issueSummary = buildIssueSummary(input.issues)

      const userParts: string[] = []

      if (input.memo) {
        userParts.push(`## 章节备忘
- 目标：${input.memo.goal}
- 绝对不要：${input.memo.hardDonts}`)
      }

      userParts.push(`## 待修复问题\n${issueSummary}`)
      userParts.push(`## 待修订正文\n${input.content}`)

      const response: ChatResponse = await withRetry(
        () => aiStore.chat(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userParts.join('\n\n') },
          ],
          {
            type: 'check',
            complexity: 'medium',
            priority: 'quality',
          },
          { maxTokens: 8000 }
        ),
        'Reviser',
        REVISER_RETRY_CONFIG,
      )

      const revisedContent = response.content?.trim() || input.content

      // 执行两级修订验证
      logger.info('[Reviser] 开始执行修订验证')
      const verificationResult = await verifyRevision(
        input.content,
        revisedContent,
        input.issues,
        input.lengthSpec
      )

      // 使用验证结果构建已修复问题列表
      const fixedIssues = verificationResult.verifications
        .filter(v => v.status === 'verified_fixed')
        .map(v => `[${v.originalIssue.severity}] ${v.originalIssue.category}: ${v.originalIssue.description}`)

      const tokenUsage: TokenUsage = {
        inputTokens: response.usage?.inputTokens || 0,
        outputTokens: response.usage?.outputTokens || 0,
        totalTokens: response.usage?.totalTokens || 0,
      }

      const elapsed = Math.round(performance.now() - startTime)
      logger.info(`[Reviser] 修订完成，模式: ${mode}，修订后字数: ${revisedContent.length}，已修复: ${fixedIssues.length}/${input.issues.length}，耗时 ${elapsed}ms`)

      return {
        revisedContent,
        wordCount: revisedContent.length,
        fixedIssues,
        tokenUsage,
        verificationResult,
      }
    } catch (error) {
      logger.error('[Reviser] 修订调用失败:', error)
      return {
        revisedContent: input.content,
        wordCount: input.content.length,
        fixedIssues: [],
        tokenUsage: emptyUsage,
      }
    }
  }
}
