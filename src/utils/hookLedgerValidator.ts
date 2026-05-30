/**
 * Hook Ledger Validator（伏笔账本校验器）
 *
 * 在审计阶段验证正文是否实际执行了 memo 中承诺的伏笔操作。
 * 检查 ChapterMemo 中关于伏笔的承诺（埋设/回收/升级/推进）是否在正文中得到体现。
 *
 * 与伏笔健康系统（hookHealthAnalyzer）配合形成完整的质量闭环：
 * hookHealthAnalyzer → 发现压力 → memo 承诺操作 → hookLedgerValidator → 验证执行
 */

import { getLogger } from '@/utils/logger'
import type { AuditIssue, ChapterMemo, HookEntry } from '@/services/pipeline/types'

const logger = getLogger('utils:hook-ledger-validator')

// ============================================================================
// 类型定义
// ============================================================================

/** 伏笔操作承诺 */
export interface HookOperation {
  type: 'plant' | 'advance' | 'resolve' | 'mention'
  hookId?: string
  hookContent?: string
  description: string
  confidence: number // 0-1, 从 memo 中解析出的置信度
}

/** 校验结果 */
export interface HookLedgerValidationResult {
  issues: AuditIssue[]
  operations: HookOperation[]
  executedCount: number
  missedCount: number
}

// ============================================================================
// 关键词映射
// ============================================================================

const OPERATION_KEYWORDS: Array<{ type: HookOperation['type']; keywords: string[] }> = [
  {
    type: 'resolve',
    keywords: ['回收', '揭示真相', '揭晓', '真相大白', '兑现', '解除伏笔', '收束', '回收伏笔', '闭合'],
  },
  {
    type: 'advance',
    keywords: ['推进', '升级', '深化', '揭示线索', '推进伏笔', '伏笔推进', '伏笔升级', '线索推进', '暗示'],
  },
  {
    type: 'plant',
    keywords: ['埋设', '埋下', '新伏笔', '埋伏笔', '布设', '铺设', '播种', '新开伏笔'],
  },
  {
    type: 'mention',
    keywords: ['提及', '呼应', '关联', '提及伏笔', '伏笔呼应', '伏笔关联', '回响'],
  },
]

// ============================================================================
// 核心校验函数
// ============================================================================

/**
 * 校验正文是否执行了 memo 中承诺的伏笔操作
 *
 * @param content 正文内容
 * @param memo 章节备忘
 * @param hookPool 当前伏笔池（可选，用于更精确匹配）
 * @returns 校验结果
 */
export function validateHookLedger(
  content: string,
  memo: ChapterMemo,
  hookPool?: HookEntry[],
): HookLedgerValidationResult {
  const issues: AuditIssue[] = []
  const startTime = performance.now()

  // 1. 从 memo 中解析伏笔操作承诺
  const operations = extractHookOperations(memo, hookPool)
  logger.info(`[HookLedger] 从 memo 中解析出 ${operations.length} 个伏笔操作承诺`)

  if (operations.length === 0) {
    return { issues, operations, executedCount: 0, missedCount: 0 }
  }

  // 2. 在正文中检测执行情况
  let executedCount = 0
  let missedCount = 0

  for (const op of operations) {
    const executed = checkOperationExecuted(op, content, hookPool)
    if (executed) {
      executedCount++
    } else {
      missedCount++
      issues.push({
        severity: 'warning',
        category: '伏笔执行',
        description: `Memo 承诺的伏笔操作未在正文中找到执行证据：「${op.description}」（类型：${operationTypeLabel(op.type)}）`,
        suggestion: getOperationSuggestion(op),
      })
    }
  }

  // 3. 额外检查：正文中是否有 memo 未提及的伏笔操作（发现新伏笔但未记录）
  const extraPlants = detectUnmentionedHookPlants(content, memo, hookPool)
  if (extraPlants.length > 0) {
    issues.push({
      severity: 'info',
      category: '伏笔执行',
      description: `正文中发现了 memo 未记录的伏笔线索：${extraPlants.slice(0, 3).join('、')}${extraPlants.length > 3 ? ' 等' : ''}`,
      suggestion: '这些伏笔可能是写手自发添加的，请确认是否需要在 memo 中记录',
    })
  }

  const elapsed = Math.round(performance.now() - startTime)
  logger.info(`[HookLedger] 校验完成: ${executedCount}/${operations.length} 已执行, ${missedCount} 未执行, 耗时 ${elapsed}ms`)

  return { issues, operations, executedCount, missedCount }
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 从 ChapterMemo 的各字段中提取伏笔操作承诺
 */
function extractHookOperations(memo: ChapterMemo, hookPool?: HookEntry[]): HookOperation[] {
  const operations: HookOperation[] = []

  // 从 payoffOrHold（兑现/暂不掀）中提取
  if (memo.payoffOrHold) {
    const payoffOps = parseOperationsFromText(memo.payoffOrHold, hookPool)
    operations.push(...payoffOps)
  }

  // 从 currentTasks（当前任务）中提取
  if (memo.currentTasks) {
    const taskOps = parseOperationsFromText(memo.currentTasks, hookPool)
    operations.push(...taskOps)
  }

  // 从 chapterEndChanges（章尾变化）中提取
  if (memo.chapterEndChanges) {
    const changeOps = parseOperationsFromText(memo.chapterEndChanges, hookPool)
    operations.push(...changeOps)
  }

  // 从 bodySkeleton（骨架）中提取
  if (memo.bodySkeleton) {
    const skelOps = parseOperationsFromText(memo.bodySkeleton, hookPool)
    operations.push(...skelOps)
  }

  // 去重
  const seen = new Set<string>()
  return operations.filter(op => {
    const key = `${op.type}:${op.description}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * 从文本中解析伏笔操作
 */
function parseOperationsFromText(text: string, hookPool?: HookEntry[]): HookOperation[] {
  const operations: HookOperation[] = []

  for (const { type, keywords } of OPERATION_KEYWORDS) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        // 尝试从 hookPool 中匹配具体伏笔
        const matchedHook = findMatchingHook(text, hookPool)

        operations.push({
          type,
          hookId: matchedHook?.id,
          hookContent: matchedHook?.content,
          description: extractContext(text, keyword),
          confidence: matchedHook ? 0.9 : 0.6,
        })
        break // 同一类型只取第一个匹配
      }
    }
  }

  return operations
}

/**
 * 在 hookPool 中查找与文本匹配的伏笔
 */
function findMatchingHook(text: string, hookPool?: HookEntry[]): HookEntry | undefined {
  if (!hookPool) return undefined

  // 逐个检查伏笔内容是否在文本中被提及
  for (const hook of hookPool) {
    if (hook.status === 'resolved') continue
    // 用伏笔内容的前20字做模糊匹配
    const snippet = hook.content.slice(0, 20)
    if (snippet.length >= 4 && text.includes(snippet)) {
      return hook
    }
  }

  return undefined
}

/**
 * 提取关键词周围的上下文
 */
function extractContext(text: string, keyword: string): string {
  const idx = text.indexOf(keyword)
  if (idx === -1) return keyword
  const start = Math.max(0, idx - 10)
  const end = Math.min(text.length, idx + keyword.length + 30)
  const ctx = text.slice(start, end).replace(/\n/g, ' ').trim()
  return (start > 0 ? '…' : '') + ctx + (end < text.length ? '…' : '')
}

/**
 * 检查某个伏笔操作是否在正文中得到执行
 */
function checkOperationExecuted(
  op: HookOperation,
  content: string,
  hookPool?: HookEntry[],
): boolean {
  // 如果有具体的伏笔ID，检查该伏笔内容是否在正文中被提及
  if (op.hookContent) {
    const snippet = op.hookContent.slice(0, 15)
    if (snippet.length >= 4 && content.includes(snippet)) {
      return true
    }
  }

  // 检查操作类型的关键词是否在正文中出现
  const typeEntry = OPERATION_KEYWORDS.find(e => e.type === op.type)
  if (typeEntry) {
    // 对于 resolve 类型，检查正文是否包含伏笔相关的揭示性描写
    if (op.type === 'resolve') {
      const resolveIndicators = ['真相', '原来', '终于明白', '恍然大悟', '揭开', '解开了']
      for (const indicator of resolveIndicators) {
        if (content.includes(indicator)) return true
      }
    }

    // 对于 advance 类型，检查正文是否包含伏笔推进性描写
    if (op.type === 'advance') {
      const advanceIndicators = ['线索', '暗示', '迹象', '发觉', '察觉', '注意到']
      for (const indicator of advanceIndicators) {
        if (content.includes(indicator)) return true
      }
    }

    // 对于 plant 类型，检查正文是否有伏笔式的描写
    if (op.type === 'plant') {
      const plantIndicators = ['不寻常', '奇怪', '疑虑', '暗自', '隐秘', '一丝', '不为人知']
      for (const indicator of plantIndicators) {
        if (content.includes(indicator)) return true
      }
    }

    // 对于 mention 类型，只要有相关伏笔内容片段出现即算
    if (op.type === 'mention' && op.hookContent) {
      return content.includes(op.hookContent.slice(0, 10))
    }
  }

  return false
}

/**
 * 检测正文中 memo 未记录的伏笔线索
 */
function detectUnmentionedHookPlants(
  content: string,
  memo: ChapterMemo,
  hookPool?: HookEntry[],
): string[] {
  const plants: string[] = []
  const memoText = `${memo.currentTasks} ${memo.payoffOrHold} ${memo.bodySkeleton}`

  // 检查正文中的伏笔暗示性描写
  const plantPatterns = [
    /隐隐觉得.{2,20}不对/g,
    /似乎.{2,15}隐藏/g,
    /总觉得.{2,15}蹊跷/g,
    /背后.{2,10}另有/g,
  ]

  for (const pattern of plantPatterns) {
    const matches = content.match(pattern)
    if (matches) {
      for (const match of matches.slice(0, 2)) {
        // 检查 memo 中是否已记录
        const keyWords = match.slice(0, 8)
        if (!memoText.includes(keyWords)) {
          plants.push(match.slice(0, 30))
        }
      }
    }
  }

  return plants
}

/**
 * 操作类型标签
 */
function operationTypeLabel(type: HookOperation['type']): string {
  const labels: Record<string, string> = {
    plant: '埋设',
    advance: '推进',
    resolve: '回收',
    mention: '提及',
  }
  return labels[type] || type
}

/**
 * 根据未执行的操作类型提供修复建议
 */
function getOperationSuggestion(op: HookOperation): string {
  switch (op.type) {
    case 'resolve':
      return '在正文中增加伏笔回收的描写，让角色发现真相或揭示悬念'
    case 'advance':
      return '在正文中推进伏笔，通过线索发现、暗示或新信息来推进伏笔发展'
    case 'plant':
      return '在正文中埋设新伏笔，通过疑点、暗示或不寻常的细节为后续章节铺垫'
    case 'mention':
      return '在正文中自然提及伏笔相关的内容，保持伏笔的存在感'
    default:
      return '请在正文中执行 memo 承诺的伏笔操作'
  }
}
