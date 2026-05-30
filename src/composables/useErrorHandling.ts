/**
 * 统一错误处理 Composable
 * 提供 toast 通知、指数退避重试、错误上报集成点
 */

import { ref, onUnmounted } from 'vue'
import { ElMessage, ElNotification } from 'element-plus'
import { errorHandler, ErrorSeverity, ErrorCategory, type AppError } from '@/utils/errorHandler'
import { getLogger } from '@/utils/logger'

const logger = getLogger('composable:errorHandling')

// ── Types ───────────────────────────────────────────────────────────────

export interface RetryOptions {
  /** 最大重试次数 (默认 3) */
  maxRetries?: number
  /** 初始延迟毫秒 (默认 1000) */
  baseDelayMs?: number
  /** 指数退避倍数 (默认 2) */
  backoffFactor?: number
  /** 最大延迟毫秒 (默认 30000) */
  maxDelayMs?: number
  /** 自定义判断是否为可重试错误 */
  isRetryable?: (error: unknown) => boolean
  /** 每次重试回调 */
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void
}

export interface ErrorReportPayload {
  message: string
  severity: ErrorSeverity
  category: ErrorCategory
  context?: Record<string, any>
  stack?: string
  timestamp: number
  userAgent: string
  url: string
}

// ── Error reporting integration point ───────────────────────────────────

/**
 * 错误上报回调，外部可注入（如 Sentry、自建服务等）
 * 默认仅记录日志
 */
let _reportCallback: ((payload: ErrorReportPayload) => void) | null = null

export function setErrorReportCallback(cb: (payload: ErrorReportPayload) => void) {
  _reportCallback = cb
}

function reportError(appError: AppError) {
  const payload: ErrorReportPayload = {
    message: appError.message,
    severity: appError.severity,
    category: appError.category,
    context: appError.context,
    stack: appError.stack,
    timestamp: appError.timestamp.getTime(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    url: typeof window !== 'undefined' ? window.location.href : '',
  }

  if (_reportCallback) {
    try {
      _reportCallback(payload)
    } catch (e) {
      logger.error('错误上报回调执行失败', e)
    }
  } else {
    logger.debug('[ErrorReport] 未配置上报回调，仅本地记录', payload)
  }
}

// ── Default retryable check ────────────────────────────────────────────

const TRANSIENT_KEYWORDS = [
  'timeout', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED',
  'network', 'Failed to fetch', 'ERR_NETWORK',
  '429', '500', '502', '503', '504',
  'overloaded', 'rate_limit', 'abort',
]

function defaultIsRetryable(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : String(error)

  return TRANSIENT_KEYWORDS.some(kw => message.includes(kw))
}

// ── Composable ──────────────────────────────────────────────────────────

export function useErrorHandling() {
  const isRetrying = ref(false)
  const retryCount = ref(0)
  const lastError = ref<AppError | null>(null)

  // Track active timers for cleanup
  const activeTimers: ReturnType<typeof setTimeout>[] = []

  onUnmounted(() => {
    for (const timer of activeTimers) {
      clearTimeout(timer)
    }
    activeTimers.length = 0
  })

  /**
   * 带指数退避的重试执行器
   * 返回函数执行结果，所有重试均失败后抛出最后一个错误
   */
  async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      baseDelayMs = 1000,
      backoffFactor = 2,
      maxDelayMs = 30_000,
      isRetryable = defaultIsRetryable,
      onRetry,
    } = options

    let lastErr: unknown

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          isRetrying.value = true
        }
        const result = await fn()
        // 成功后重置
        if (attempt > 0) {
          isRetrying.value = false
          logger.info(`重试成功，第 ${attempt} 次尝试`)
        }
        return result
      } catch (err) {
        lastErr = err
        retryCount.value = attempt + 1

        // 最后一次尝试或不可重试 → 抛出
        if (attempt >= maxRetries || !isRetryable(err)) {
          isRetrying.value = false
          throw err
        }

        // 计算退避延迟（带 jitter）
        const delay = Math.min(
          baseDelayMs * Math.pow(backoffFactor, attempt) + Math.random() * 500,
          maxDelayMs
        )

        logger.warn(`操作失败，${delay.toFixed(0)}ms 后进行第 ${attempt + 1} 次重试`, err)
        onRetry?.(attempt + 1, delay, err)

        await new Promise<void>(resolve => {
          const timer = setTimeout(resolve, delay)
          activeTimers.push(timer)
        })
      }
    }

    // 不应到达此处，TypeScript 安全
    isRetrying.value = false
    throw lastErr
  }

  /**
   * 处理错误并通过 toast 通知用户
   * 返回结构化的 AppError
   */
  function handleError(
    error: unknown,
    options: {
      severity?: ErrorSeverity
      category?: ErrorCategory
      context?: Record<string, any>
      userAction?: string
      showToast?: boolean
      toastMessage?: string
    } = {}
  ): AppError {
    const {
      severity = ErrorSeverity.MEDIUM,
      category = ErrorCategory.UNKNOWN,
      context,
      userAction,
      showToast = true,
      toastMessage,
    } = options

    const errObj = error instanceof Error ? error : new Error(String(error))

    const appError = errorHandler.handleError(errObj, {
      severity,
      category,
      context,
      userAction,
    })

    lastError.value = appError
    reportError(appError)

    if (showToast) {
      showErrorMessage(appError, toastMessage)
    }

    return appError
  }

  /**
   * 显示 Element Plus 错误通知
   */
  function showErrorMessage(appError: AppError, customMessage?: string) {
    const severityConfig = {
      [ErrorSeverity.LOW]: { type: 'info' as const, duration: 3000 },
      [ErrorSeverity.MEDIUM]: { type: 'warning' as const, duration: 5000 },
      [ErrorSeverity.HIGH]: { type: 'error' as const, duration: 8000 },
      [ErrorSeverity.CRITICAL]: { type: 'error' as const, duration: 0 },
    }

    const config = severityConfig[appError.severity]
    const message = customMessage || appError.message

    if (appError.severity === ErrorSeverity.CRITICAL || appError.severity === ErrorSeverity.HIGH) {
      ElNotification({
        title: appError.severity === ErrorSeverity.CRITICAL ? '致命错误' : '严重错误',
        message,
        type: config.type,
        duration: config.duration,
        position: 'top-right',
      })
    } else {
      ElMessage({
        message,
        type: config.type,
        duration: config.duration,
        showClose: true,
      })
    }
  }

  /**
   * 快捷方法：处理网络错误（自动设置 category + 可重试）
   */
  function handleNetworkError(error: unknown, showToast = true): AppError {
    return handleError(error, {
      severity: ErrorSeverity.MEDIUM,
      category: ErrorCategory.NETWORK,
      showToast,
      userAction: '网络请求',
    })
  }

  /**
   * 快捷方法：处理 AI 相关错误
   */
  function handleAIError(error: unknown, showToast = true): AppError {
    return handleError(error, {
      severity: ErrorSeverity.MEDIUM,
      category: ErrorCategory.API,
      showToast,
      userAction: 'AI生成',
    })
  }

  /**
   * 快捷方法：处理存储错误
   */
  function handleStorageError(error: unknown, showToast = true): AppError {
    return handleError(error, {
      severity: ErrorSeverity.HIGH,
      category: ErrorCategory.STORAGE,
      showToast,
      userAction: '数据存储',
    })
  }

  /**
   * 重置重试状态
   */
  function resetRetryState() {
    isRetrying.value = false
    retryCount.value = 0
    lastError.value = null
  }

  return {
    // 状态
    isRetrying,
    retryCount,
    lastError,

    // 核心方法
    withRetry,
    handleError,
    showErrorMessage,

    // 快捷方法
    handleNetworkError,
    handleAIError,
    handleStorageError,

    // 工具方法
    resetRetryState,
    reportError,
  }
}
