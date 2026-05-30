/**
 * LLM 统一重试策略
 *
 * 为 Pipeline 中所有 Agent 的 LLM 调用提供统一的重试包装器：
 * - 指数退避（Exponential Backoff）
 * - 最大重试次数
 * - 可配置的退避参数
 * - 错误分类（区分可重试 vs 不可重试错误）
 */

import { getLogger } from '@/utils/logger'

const logger = getLogger('utils:llm-retry')

// ============================================================================
// 配置
// ============================================================================

export interface RetryConfig {
  /** 最大重试次数（默认 3） */
  maxRetries: number
  /** 基础延迟（毫秒，默认 1000） */
  baseDelayMs: number
  /** 最大延迟（毫秒，默认 30000） */
  maxDelayMs: number
  /** 退避因子（默认 2） */
  backoffFactor: number
  /** 是否添加随机抖动（默认 true） */
  jitter: boolean
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffFactor: 2,
  jitter: true,
}

// ============================================================================
// 不可重试错误类型
// ============================================================================

/** 这些错误不应重试，直接抛出 */
const NON_RETRYABLE_PATTERNS = [
  /invalid.*api.*key/i,
  /api.*key.*invalid/i,
  /unauthorized/i,
  /quota.*exceeded/i,
  /insufficient.*quota/i,
  /content.*filter/i,
  /safety.*filter/i,
  /model.*not.*found/i,
  /context.*length.*exceeded/i,
  /max.*tokens.*exceeded/i,
  /billing/i,
  /account.*suspended/i,
]

// ============================================================================
// 可重试错误类型
// ============================================================================

/** 这些错误应当重试 */
const RETRYABLE_PATTERNS = [
  /timeout/i,
  /timed?\s*out/i,
  /rate.*limit/i,
  /too.*many.*requests/i,
  /429/,
  /500/,
  /502/,
  /503/,
  /504/,
  /network/i,
  /fetch.*failed/i,
  /connection.*reset/i,
  /overloaded/i,
  /server.*error/i,
  /temporarily.*unavailable/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /socket.*hang.*up/i,
]

// ============================================================================
// 核心重试函数
// ============================================================================

/**
 * 判断错误是否可重试
 */
function isRetryableError(error: Error): boolean {
  const message = error.message || ''

  // 先检查不可重试模式
  for (const pattern of NON_RETRYABLE_PATTERNS) {
    if (pattern.test(message)) {
      return false
    }
  }

  // 检查可重试模式
  for (const pattern of RETRYABLE_PATTERNS) {
    if (pattern.test(message)) {
      return true
    }
  }

  // 默认可重试（网络不稳定时保守重试）
  return true
}

/**
 * 计算退避延迟（毫秒）
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(config.backoffFactor, attempt)
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs)

  // 添加随机抖动（±25%）以避免雷群效应
  if (config.jitter) {
    const jitterRange = cappedDelay * 0.25
    const jitter = (Math.random() * 2 - 1) * jitterRange
    return Math.max(0, Math.round(cappedDelay + jitter))
  }

  return cappedDelay
}

/**
 * 带指数退避的统一重试包装器
 *
 * @param fn 要执行的异步函数
 * @param agentName Agent 名称（用于日志）
 * @param config 重试配置（可选）
 * @returns fn 的执行结果
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  agentName: string,
  config?: Partial<RetryConfig>,
): Promise<T> {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config }
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      const result = await fn()
      if (attempt > 0) {
        logger.info(`[${agentName}] 第 ${attempt} 次重试成功`)
      }
      return result
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // 检查是否可重试
      if (!isRetryableError(lastError)) {
        logger.warn(`[${agentName}] 不可重试错误，直接抛出: ${lastError.message}`)
        throw lastError
      }

      // 如果还有重试机会
      if (attempt < retryConfig.maxRetries) {
        const delay = calculateDelay(attempt, retryConfig)
        logger.warn(
          `[${agentName}] 第 ${attempt + 1}/${retryConfig.maxRetries} 次重试，` +
          `等待 ${delay}ms。错误: ${lastError.message}`
        )
        await sleep(delay)
      } else {
        logger.error(
          `[${agentName}] 已用尽 ${retryConfig.maxRetries} 次重试机会，最终失败: ${lastError.message}`
        )
      }
    }
  }

  throw lastError!
}

/**
 * 为特定 Agent 创建预配置的重试包装器
 */
export function createAgentRetryWrapper(agentName: string, config?: Partial<RetryConfig>) {
  return <T>(fn: () => Promise<T>): Promise<T> => {
    return withRetry(fn, agentName, config)
  }
}

// ============================================================================
// Agent 专用重试配置
// ============================================================================

/** Writer Agent：高复杂度任务，更多重试次数 */
export const WRITER_RETRY_CONFIG: Partial<RetryConfig> = {
  maxRetries: 3,
  baseDelayMs: 2000,
  maxDelayMs: 30000,
}

/** Auditor Agent：中等复杂度，标准重试 */
export const AUDITOR_RETRY_CONFIG: Partial<RetryConfig> = {
  maxRetries: 2,
  baseDelayMs: 1000,
  maxDelayMs: 15000,
}

/** Reviser Agent：中等复杂度，标准重试 */
export const REVISER_RETRY_CONFIG: Partial<RetryConfig> = {
  maxRetries: 2,
  baseDelayMs: 1000,
  maxDelayMs: 15000,
}

/** Planner Agent：轻量任务，快速重试 */
export const PLANNER_RETRY_CONFIG: Partial<RetryConfig> = {
  maxRetries: 2,
  baseDelayMs: 500,
  maxDelayMs: 10000,
}

// ============================================================================
// 工具函数
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
