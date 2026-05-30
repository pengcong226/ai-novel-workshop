/**
 * HookPromoter（伏笔升级器）
 *
 * 检查伏笔池中是否有伏笔满足升级条件（如已埋设超过 N 章未回收、
 * 已达到核心伏笔阈值等），更新伏笔状态标记。
 * 纯确定性逻辑，无 LLM 调用。
 *
 * Phase 9 of Pipeline: 在 ChapterAnalyzer 之后执行
 */

import { getLogger } from '@/utils/logger'
import type { HookEntry } from '@/services/pipeline/types'

const logger = getLogger('agent:hook-promoter')

// ============================================================================
// 配置
// ============================================================================

/** 伏笔在 ADVANCED_CHAPTERS 章后未推进则标记为需关注 */
const STALE_CHAPTERS = 10

/** 伏笔在 MAX_PLANTED_CHAPTERS 章后未回收则标记为过期风险 */
const MAX_PLANTED_CHAPTERS = 30

/** 推进次数达到 _PROMOTE_THRESHOLD 则升级为核心伏笔 */
const _PROMOTE_THRESHOLD = 3

// ============================================================================
// 类型
// ============================================================================

export interface HookPromoteInput {
  hooks: HookEntry[]
  currentChapter: number
  chapterHookUpdates: Array<{
    content: string
    previousStatus: 'planted' | 'advanced' | 'resolved'
    newStatus: 'planted' | 'advanced' | 'resolved'
  }>
}

export interface HookPromoteOutput {
  promotedHooks: HookEntry[]
  staleHooks: HookEntry[]
  expiredRiskHooks: HookEntry[]
  resolvedHooks: HookEntry[]
}

// ============================================================================
// HookPromoter 主类
// ============================================================================

export class HookPromoter {
  /**
   * 执行伏笔升级检查
   * 纯确定性逻辑，无 LLM 调用
   */
  promote(input: HookPromoteInput): HookPromoteOutput {
    const startTime = performance.now()
    logger.info(`[HookPromoter] 检查 ${input.hooks.length} 个伏笔`)

    const promotedHooks: HookEntry[] = []
    const staleHooks: HookEntry[] = []
    const expiredRiskHooks: HookEntry[] = []
    const resolvedHooks: HookEntry[] = []

    // 1. 先应用本章的伏笔状态更新
    const hookUpdates = new Map<string, typeof input.chapterHookUpdates[0]>()
    for (const update of input.chapterHookUpdates) {
      hookUpdates.set(update.content, update)
    }

    for (const hook of input.hooks) {
      // 应用本章更新
      const update = hookUpdates.get(hook.content)
      if (update) {
        hook.status = update.newStatus
      }

      const chaptersSincePlanted = input.currentChapter - hook.chapterNumber

      switch (hook.status) {
        case 'planted': {
          // 已埋设但长期未推进
          if (chaptersSincePlanted > STALE_CHAPTERS) {
            staleHooks.push({ ...hook })
            logger.info(`[HookPromoter] 伏笔已${chaptersSincePlanted}章未推进: ${hook.content.slice(0, 50)}`)
          }
          // 已埋设过久有回收风险
          if (chaptersSincePlanted > MAX_PLANTED_CHAPTERS) {
            expiredRiskHooks.push({ ...hook })
          }
          break
        }

        case 'advanced': {
          // 推进次数足够，升级为核心伏笔
          if (!hook.promoted) {
            hook.promoted = true
            promotedHooks.push({ ...hook })
            logger.info(`[HookPromoter] 伏笔升级为核心: ${hook.content.slice(0, 50)}`)
          }

          // 推进后又长期未收束
          if (chaptersSincePlanted > MAX_PLANTED_CHAPTERS) {
            staleHooks.push({ ...hook })
          }
          break
        }

        case 'resolved': {
          resolvedHooks.push({ ...hook })
          break
        }
      }
    }

    const elapsed = Math.round(performance.now() - startTime)
    logger.info(`[HookPromoter] 检查完成: 升级${promotedHooks.length}, 需关注${staleHooks.length}, 风险${expiredRiskHooks.length}, 已回收${resolvedHooks.length}，耗时 ${elapsed}ms`)

    return {
      promotedHooks,
      staleHooks,
      expiredRiskHooks,
      resolvedHooks,
    }
  }
}
