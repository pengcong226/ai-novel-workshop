/**
 * 伏笔健康分析器 (Hook Health Analyzer)
 *
 * 借鉴 InkOS 的伏笔健康系统，为 Pipeline 增加伏笔追踪能力：
 * - 过期检测（stale）：伏笔埋设超过半衰期未推进
 * - 阻塞检测（blocked）：上游依赖伏笔未解决
 * - 生命周期追踪：planted → advanced → stale/blocked → resolved
 * - 健康评分：活跃伏笔上限、新开伏笔速率控制
 */

import { getLogger } from '@/utils/logger'

const logger = getLogger('utils:hook-health')

// ============================================================================
// 配置常量
// ============================================================================

/** 活跃伏笔建议上限 */
const MAX_ACTIVE_HOOKS = 15

/** 伏笔超过此章数未推进则标记为 stale */
const _STALE_AFTER_CHAPTERS = 10

/** 连续 N 章无真实推进则告警 */
const NO_ADVANCE_WINDOW = 5

/** 单章新开伏笔爆发阈值 */
const NEW_HOOK_BURST_THRESHOLD = 3

/** 不同生命周期阶段对应的半衰期（章数） */
const HALF_LIFE_BY_TIMING: Record<string, number> = {
  immediate: 3,
  'near-term': 8,
  'mid-arc': 15,
  'slow-burn': 25,
  endgame: 40,
  default: 12,
}

// ============================================================================
// 类型定义
// ============================================================================

export interface HookHealthInput {
  hookId: string
  content: string
  status: string
  startChapter: number
  lastAdvancedChapter: number
  advanceCount: number
  payoffTiming?: string
  dependsOn?: string[]
  coreHook?: boolean
}

export interface HookDiagnostics {
  hookId: string
  stale: boolean
  blocked: boolean
  missingUpstream: string[]
  distance: number
  halfLife: number
  blockedDistance: number
  phase: 'opening' | 'middle' | 'late'
  age: number
  dormancy: number
  readyToResolve: boolean
  overdue: boolean
  advancePressure: number
  resolvePressure: number
}

export interface HookHealthResult {
  diagnostics: Map<string, HookDiagnostics>
  issues: HookHealthIssue[]
  stats: {
    activeCount: number
    staleCount: number
    blockedCount: number
    readyToResolveCount: number
    overdueCount: number
    healthScore: number  // 0-100
  }
}

export interface HookHealthIssue {
  severity: 'critical' | 'warning' | 'info'
  category: string
  description: string
  suggestion: string
}

// ============================================================================
// 核心分析函数
// ============================================================================

/**
 * 分析伏笔健康状态
 */
export function analyzeHookHealth(params: {
  hooks: HookHealthInput[]
  currentChapter: number
  targetChapters?: number
  newHooksThisChapter?: number
  resolvedHooksThisChapter?: number
}): HookHealthResult {
  const {
    hooks,
    currentChapter,
    targetChapters,
    newHooksThisChapter = 0,
    resolvedHooksThisChapter = 0,
  } = params

  const issues: HookHealthIssue[] = []
  const diagnostics = new Map<string, HookDiagnostics>()

  // 建立 hookId 索引
  const byId = new Map<string, HookHealthInput>()
  for (const hook of hooks) {
    byId.set(hook.hookId, hook)
  }

  // 计算每个伏笔的诊断信息
  for (const hook of hooks) {
    const diag = computeSingleDiagnostics(hook, currentChapter, targetChapters, byId)
    diagnostics.set(hook.hookId, diag)
  }

  // 统计
  const activeHooks = hooks.filter(h => !isResolved(h.status))
  const activeCount = activeHooks.length
  let staleCount = 0
  let blockedCount = 0
  let readyToResolveCount = 0
  let overdueCount = 0

  for (const diag of diagnostics.values()) {
    if (diag.stale) staleCount++
    if (diag.blocked) blockedCount++
    if (diag.readyToResolve) readyToResolveCount++
    if (diag.overdue) overdueCount++
  }

  // ---- 检查 1：活跃伏笔超限 ----
  if (activeCount > MAX_ACTIVE_HOOKS) {
    issues.push({
      severity: 'warning',
      category: '伏笔债务',
      description: `当前有 ${activeCount} 个活跃伏笔，超过建议上限 ${MAX_ACTIVE_HOOKS} 个。`,
      suggestion: '优先推进、回收或延后已有伏笔，再继续开新伏笔。',
    })
  }

  // ---- 检查 2：过期伏笔压力 ----
  const staleHooks = activeHooks.filter(h => {
    const diag = diagnostics.get(h.hookId)
    return diag?.stale || diag?.overdue || diag?.readyToResolve
  })
  if (staleHooks.length > 0) {
    const summaries = staleHooks.slice(0, 3).map(h => {
      const diag = diagnostics.get(h.hookId)!
      const label = diag.overdue ? '已逾期' : diag.readyToResolve ? '可回收' : '陈旧'
      return `${h.content.slice(0, 20)}…（距=${diag.distance}/半衰=${diag.halfLife}，${label}）`
    })
    const suffix = staleHooks.length > 3 ? `，另有 ${staleHooks.length - 3} 条` : ''
    issues.push({
      severity: 'warning',
      category: '伏笔债务',
      description: `这些伏笔已进入回收/推进压力：${summaries.join('、')}${suffix}。`,
      suggestion: '先让一个已进入压力区的伏笔发生真实推进、回收或明确延后。',
    })
  }

  // ---- 检查 3：连续无推进 ----
  if (activeHooks.length > 0) {
    const latestAdvance = activeHooks.reduce(
      (max, h) => Math.max(max, h.lastAdvancedChapter),
      0,
    )
    const noAdvanceGap = currentChapter - latestAdvance
    if (noAdvanceGap >= NO_ADVANCE_WINDOW) {
      issues.push({
        severity: 'warning',
        category: '伏笔债务',
        description: `已经连续 ${noAdvanceGap} 章没有真实伏笔推进。`,
        suggestion: '下一章优先让一个旧伏笔发生真实推进。',
      })
    }
  }

  // ---- 检查 4：新开伏笔爆发 ----
  if (newHooksThisChapter >= NEW_HOOK_BURST_THRESHOLD && resolvedHooksThisChapter === 0) {
    issues.push({
      severity: 'info',
      category: '伏笔债务',
      description: `本章新开了 ${newHooksThisChapter} 个伏笔，但没有回收任何旧债。`,
      suggestion: '控制伏笔膨胀，新开伏笔时尽量配套回收旧伏笔。',
    })
  }

  // ---- 检查 5：阻塞伏笔 ----
  const blockedHooks = activeHooks.filter(h => diagnostics.get(h.hookId)?.blocked)
  if (blockedHooks.length > 0) {
    for (const h of blockedHooks.slice(0, 2)) {
      const diag = diagnostics.get(h.hookId)!
      if (diag.blockedDistance >= 5) {
        issues.push({
          severity: 'warning',
          category: '伏笔阻塞',
          description: `伏笔「${h.content.slice(0, 30)}」受阻于上游 [${diag.missingUpstream.join(', ')}]，已阻塞 ${diag.blockedDistance} 章。`,
          suggestion: '优先解决上游伏笔，或标记下游伏笔为延后。',
        })
      }
    }
  }

  // ---- 健康评分 ----
  let healthScore = 100
  if (activeCount > MAX_ACTIVE_HOOKS) healthScore -= (activeCount - MAX_ACTIVE_HOOKS) * 3
  healthScore -= staleCount * 5
  healthScore -= blockedCount * 3
  healthScore -= overdueCount * 8
  healthScore = Math.max(0, Math.min(100, healthScore))

  logger.info(`伏笔健康分析完成: 活跃${activeCount}, 过期${staleCount}, 阻塞${blockedCount}, 待回收${readyToResolveCount}, 健康评分${healthScore}`)

  return {
    diagnostics,
    issues,
    stats: {
      activeCount,
      staleCount,
      blockedCount,
      readyToResolveCount,
      overdueCount,
      healthScore,
    },
  }
}

// ============================================================================
// 辅助函数
// ============================================================================

function isResolved(status: string): boolean {
  return /^(resolved|closed|done|已回收|已解决)$/i.test(status.trim())
}

function resolveHalfLife(hook: HookHealthInput): number {
  const timing = hook.payoffTiming?.trim().toLowerCase() || 'default'
  return HALF_LIFE_BY_TIMING[timing] ?? HALF_LIFE_BY_TIMING.default ?? 10
}

function computeSingleDiagnostics(
  hook: HookHealthInput,
  currentChapter: number,
  targetChapters: number | undefined,
  byId: Map<string, HookHealthInput>,
): HookDiagnostics {
  const halfLife = resolveHalfLife(hook)
  const startChapter = Math.max(1, hook.startChapter)
  const age = Math.max(0, currentChapter - startChapter)
  const lastTouchChapter = Math.max(startChapter, hook.lastAdvancedChapter)
  const dormancy = Math.max(0, currentChapter - lastTouchChapter)

  // Stale: 超过半衰期且未解决
  const stale = !isResolved(hook.status) && hook.startChapter > 0 && age > halfLife

  // Phase 判定
  const phase = resolvePhase(currentChapter, targetChapters)

  // Overdue / readyToResolve
  const overdue = age >= halfLife * 1.5 && !isResolved(hook.status)
  const readyToResolve = hook.advanceCount >= 2 && age >= halfLife * 0.8 && !isResolved(hook.status)

  // Blocked: 上游依赖未解决
  const missingUpstream: string[] = []
  const upstreamReferenceChapters: number[] = []
  for (const upstreamId of hook.dependsOn || []) {
    const upstream = byId.get(upstreamId)
    if (!upstream) {
      missingUpstream.push(upstreamId)
      upstreamReferenceChapters.push(startChapter)
      continue
    }
    if (!isResolved(upstream.status)) {
      missingUpstream.push(upstreamId)
      const refChapter = upstream.startChapter > 0 ? upstream.startChapter : startChapter
      upstreamReferenceChapters.push(refChapter)
    }
  }
  const blocked = missingUpstream.length > 0 && !isResolved(hook.status)
  const blockedDistance = blocked && upstreamReferenceChapters.length > 0
    ? currentChapter - Math.min(...upstreamReferenceChapters)
    : 0

  // 压力分
  const advancePressure = age + dormancy + (stale ? 5 : 0) + (overdue ? 10 : 0)
  const resolvePressure = readyToResolve
    ? (hook.coreHook ? 15 : 8) + Math.min(10, dormancy * 2) + (overdue ? 10 : 0)
    : 0

  return {
    hookId: hook.hookId,
    stale,
    blocked,
    missingUpstream,
    distance: age,
    halfLife,
    blockedDistance,
    phase,
    age,
    dormancy,
    readyToResolve,
    overdue,
    advancePressure,
    resolvePressure,
  }
}

function resolvePhase(chapterNumber: number, targetChapters?: number): 'opening' | 'middle' | 'late' {
  if (targetChapters && targetChapters > 0) {
    const progress = chapterNumber / targetChapters
    if (progress >= 0.7) return 'late'
    if (progress >= 0.3) return 'middle'
    return 'opening'
  }
  if (chapterNumber >= 40) return 'late'
  if (chapterNumber >= 15) return 'middle'
  return 'opening'
}
