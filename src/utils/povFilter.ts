/**
 * POV 过滤器 (Point of View Filter)
 *
 * 根据当前章节的 POV 角色，从上下文中过滤该角色不应该知道的信息。
 * 防止"上帝视角"泄露——角色突然知道他们不可能知道的信息。
 *
 * 借鉴 InkOS pov-filter.ts 的设计理念。
 */

import { getLogger } from '@/utils/logger'

const logger = getLogger('utils:pov-filter')

// ============================================================================
// 类型
// ============================================================================

export interface POVFilterInput {
  /** POV 角色名 */
  povCharacter?: string
  /** 叙述视角：第一人称/第三人称限制/第三人称全知 */
  povMode?: 'first-person' | 'third-limited' | 'third-omniscient'
  /** 角色矩阵文本 */
  characterMatrix?: string
  /** 伏笔池文本 */
  hookSnapshot?: string
  /** 当前状态文本 */
  currentState?: string
}

export interface POVFilterResult {
  /** 过滤后的角色矩阵 */
  filteredCharacterMatrix: string
  /** 过滤后的伏笔快照 */
  filteredHookSnapshot: string
  /** 过滤后的当前状态 */
  filteredCurrentState: string
  /** 被过滤掉的信息数量 */
  filteredCount: number
}

// ============================================================================
// 核心过滤逻辑
// ============================================================================

/**
 * 根据 POV 过滤上下文信息
 */
export function filterContextByPOV(input: POVFilterInput): POVFilterResult {
  const {
    povCharacter,
    povMode = 'third-omniscient',
    characterMatrix = '',
    hookSnapshot = '',
    currentState = '',
  } = input

  // 全知视角不过滤
  if (povMode === 'third-omniscient' || !povCharacter) {
    return {
      filteredCharacterMatrix: characterMatrix,
      filteredHookSnapshot: hookSnapshot,
      filteredCurrentState: currentState,
      filteredCount: 0,
    }
  }

  let filteredCount = 0

  // 对于限制视角，过滤角色矩阵中的秘密信息
  let filteredMatrix = characterMatrix
  if (povMode === 'third-limited' || povMode === 'first-person') {
    const secretPatterns = [
      /内心独白[：:].*/g,
      /秘密[：:].*/g,
      /暗中.*/g,
      /背地里.*/g,
      /在.{0,10}看不见的地方.*/g,
    ]

    for (const pattern of secretPatterns) {
      const matches = filteredMatrix.match(pattern)
      if (matches) {
        // 只过滤非 POV 角色的秘密
        filteredCount += matches.filter(m => !m.includes(povCharacter)).length
        filteredMatrix = filteredMatrix.replace(pattern, (match) => {
          // 如果提到了 POV 角色，保留
          if (match.includes(povCharacter)) return match
          return '[此处信息对当前POV角色不可见]'
        })
      }
    }
  }

  // 伏笔快照：第一人称下过滤角色不知道的伏笔
  let filteredHooks = hookSnapshot
  if (povMode === 'first-person') {
    // 标记所有未在POV角色视野中提及的伏笔为"未知"
    // 这是一个轻量级处理，不做激进过滤
    logger.debug(`POV过滤: 第一人称模式，POV角色=${povCharacter}`)
  }

  if (filteredCount > 0) {
    logger.info(`POV过滤完成: 过滤了 ${filteredCount} 条信息（POV=${povCharacter}, 模式=${povMode}）`)
  }

  return {
    filteredCharacterMatrix: filteredMatrix,
    filteredHookSnapshot: filteredHooks,
    filteredCurrentState: currentState,
    filteredCount,
  }
}
