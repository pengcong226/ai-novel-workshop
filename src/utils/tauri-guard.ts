/**
 * Tauri 桌面端 IPC 守卫层
 *
 * 统一的运行时检测 + IPC 调用封装，提供：
 * - 平台检测 (isDesktop / isWeb)
 * - IPC 错误类型 (IpcError / IpcTransientError / IpcFatalError)
 * - 瞬态失败自动重试
 * - 开发模式 IPC 调用日志
 *
 * @module utils/tauri-guard
 */

import { getLogger } from '@/utils/logger'
import { ErrorCode, AppError } from '@/utils/errors'

const logger = getLogger('utils:tauri-guard')

// ── 平台检测 ──────────────────────────────────────────────────────────────

let _cachedIsDesktop: boolean | undefined

/**
 * 是否在 Tauri 桌面环境中运行。
 * 结果会被缓存，不会重复检测。
 */
export function isDesktop(): boolean {
  if (_cachedIsDesktop !== undefined) return _cachedIsDesktop

  // 编译时常量：非 Tauri 构建直接返回 false
  if (!__APP_IS_TAURI__) {
    _cachedIsDesktop = false
    return false
  }

  if (typeof window === 'undefined') {
    _cachedIsDesktop = false
    return false
  }

  const tauriInternals = (window as Window & {
    __TAURI_INTERNALS__?: { invoke?: unknown }
  }).__TAURI_INTERNALS__

  _cachedIsDesktop = typeof tauriInternals?.invoke === 'function'
  return _cachedIsDesktop
}

/**
 * 是否在浏览器 Web 环境中运行（非 Tauri 桌面端）。
 */
export function isWeb(): boolean {
  return !isDesktop()
}

/**
 * 向后兼容：同步的 `isTauri` 常量。
 * 新代码应优先使用 `isDesktop()` / `isWeb()`。
 */
export const isTauri: boolean = isDesktop()

// ── IPC 错误类型 ──────────────────────────────────────────────────────────

/**
 * IPC 调用失败的基础错误类。
 * 包含命令名、参数摘要和原始错误。
 */
export class IpcError extends AppError {
  readonly command: string
  readonly args?: Record<string, unknown>

  constructor(
    message: string,
    options: {
      command: string
      args?: Record<string, unknown>
      code?: (typeof ErrorCode)[keyof typeof ErrorCode]
      cause?: Error
      context?: Record<string, unknown>
    }
  ) {
    super({
      code: options.code ?? ErrorCode.IPC_COMMAND_FAILED,
      message,
      context: {
        ...options.context,
        command: options.command,
        args: options.args,
      },
      cause: options.cause,
    })
    this.name = 'IpcError'
    this.command = options.command
    this.args = options.args
  }
}

/**
 * 瞬态 IPC 错误：可安全重试的临时性故障。
 * 例如：数据库锁竞争、IO 暂时不可用。
 */
export class IpcTransientError extends IpcError {
  /** 已尝试的重试次数 */
  readonly attempts: number

  constructor(
    message: string,
    options: {
      command: string
      args?: Record<string, unknown>
      cause?: Error
      attempts?: number
      context?: Record<string, unknown>
    }
  ) {
    super(message, {
      ...options,
      code: ErrorCode.IPC_TRANSIENT,
    })
    this.name = 'IpcTransientError'
    this.attempts = options.attempts ?? 0
  }
}

/**
 * 致命 IPC 错误：重试无意义的永久性故障。
 * 例如：数据库 schema 不兼容、数据损坏。
 */
export class IpcFatalError extends IpcError {
  constructor(
    message: string,
    options: {
      command: string
      args?: Record<string, unknown>
      cause?: Error
      context?: Record<string, unknown>
    }
  ) {
    super(message, {
      ...options,
      code: ErrorCode.IPC_FATAL,
    })
    this.name = 'IpcFatalError'
  }
}

// ── 瞬态错误检测 ──────────────────────────────────────────────────────────

/** 判定是否为"数据库忙"类错误，可安全重试 */
function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  return (
    lower.includes('database is locked') ||
    lower.includes('database schema has changed') ||
    lower.includes('sqlite_busy') ||
    lower.includes('sqlite_locked') ||
    lower.includes('disk i/o error') ||
    lower.includes('retry') ||
    lower.includes('temporarily') ||
    lower.includes('ebusy') ||
    lower.includes('eagain') ||
    lower.includes('eio')
  )
}

/** 判定是否为"致命"错误，重试无意义 */
function isFatalError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  return (
    lower.includes('not found') ||
    lower.includes('invalid') ||
    lower.includes('already exists') ||
    lower.includes('duplicate') ||
    lower.includes('permission') ||
    lower.includes('syntax error') ||
    lower.includes('mismatch') ||
    lower.includes('scope does not match')
  )
}

// ── 重试配置 ──────────────────────────────────────────────────────────────

interface IpcRetryOptions {
  /** 最大重试次数（默认 2，即总共最多 3 次尝试） */
  maxRetries?: number
  /** 首次重试的延迟（毫秒），后续指数递增（默认 100） */
  baseDelayMs?: number
  /** 跳过日志记录（用于内部调用避免循环） */
  silent?: boolean
}

const DEFAULT_RETRY_OPTIONS: Required<IpcRetryOptions> = {
  maxRetries: 2,
  baseDelayMs: 100,
  silent: false,
}

// ── 参数序列化（用于日志）────────────────────────────────────────────────

function summarizeArgs(
  args: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!args) return undefined
  const summary: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      // 截断长字符串（如 JSON 数据）
      summary[key] = value.length > 200 ? `${value.slice(0, 200)}...(${value.length} chars)` : value
    } else if (Array.isArray(value)) {
      summary[key] = `Array(${value.length})`
    } else {
      summary[key] = value
    }
  }
  return summary
}

// ── IPC 日志工具 ──────────────────────────────────────────────────────────

let _ipcLogSeq = 0

function logIpcStart(command: string, args: Record<string, unknown> | undefined): number {
  if (!import.meta.env.DEV) return -1
  const seq = ++_ipcLogSeq
  const argSummary = summarizeArgs(args)
  logger.debug(`[IPC #${seq}] >>> ${command}`, argSummary ?? {})
  return seq
}

function logIpcEnd(
  seq: number,
  command: string,
  elapsedMs: number,
  success: boolean,
  retryAttempt?: number
): void {
  if (!import.meta.env.DEV || seq < 0) return
  const retryTag = retryAttempt !== undefined ? ` (attempt ${retryAttempt + 1})` : ''
  if (success) {
    logger.debug(`[IPC #${seq}] <<< ${command} OK (${elapsedMs.toFixed(1)}ms)${retryTag}`)
  } else {
    logger.warn(`[IPC #${seq}] <<< ${command} FAILED (${elapsedMs.toFixed(1)}ms)${retryTag}`)
  }
}

function logIpcRetry(
  seq: number,
  command: string,
  attempt: number,
  delayMs: number,
  reason: unknown
): void {
  if (seq < 0) return
  const msg = reason instanceof Error ? reason.message : String(reason)
  logger.warn(
    `[IPC #${seq}] retry ${attempt + 1} for ${command} in ${delayMs}ms: ${msg}`
  )
}

// ── 核心 IPC 调用 ─────────────────────────────────────────────────────────

let _tauriInvoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null

async function getTauriInvoke(): Promise<
  (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
> {
  if (_tauriInvoke) return _tauriInvoke

  if (!isDesktop()) {
    throw new IpcFatalError('当前环境非 Tauri 桌面端，无法调用 IPC', {
      command: '__init__',
    })
  }

  const { invoke } = await import('@tauri-apps/api/core')
  _tauriInvoke = invoke as (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
  return _tauriInvoke
}

/**
 * 调用 Tauri IPC 命令，内置自动重试、错误分类和日志记录。
 *
 * @param command - Tauri 命令名
 * @param args - 命令参数
 * @param options - 重试选项
 * @returns 命令返回值
 * @throws {IpcTransientError} 瞬态错误且重试耗尽时抛出
 * @throws {IpcFatalError} 致命错误时直接抛出
 * @throws {IpcError} 其他 IPC 错误
 */
export async function invoke<T = unknown>(
  command: string,
  args?: Record<string, unknown>,
  options?: IpcRetryOptions
): Promise<T> {
  const { maxRetries, baseDelayMs } = { ...DEFAULT_RETRY_OPTIONS, ...options }
  const invokeFn = await getTauriInvoke()
  const seq = logIpcStart(command, args)
  const overallStart = performance.now()

  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const attemptStart = performance.now()

    try {
      const result = await invokeFn(command, args)
      const elapsed = performance.now() - attemptStart
      logIpcEnd(seq, command, elapsed, true, attempt > 0 ? attempt : undefined)
      return result as T
    } catch (err) {
      lastError = err
      const elapsed = performance.now() - attemptStart

      // 致命错误不重试
      if (isFatalError(err)) {
        logIpcEnd(seq, command, elapsed, false)
        throw new IpcFatalError(err instanceof Error ? err.message : String(err), {
          command,
          args,
          cause: err instanceof Error ? err : undefined,
        })
      }

      // 瞬态错误 + 还有重试次数
      if (isTransientError(err) && attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt)
        logIpcRetry(seq, command, attempt, delay, err)
        await sleep(delay)
        continue
      }

      // 非瞬态错误 或 重试耗尽
      logIpcEnd(seq, command, elapsed, false, attempt > 0 ? attempt : undefined)
      break
    }
  }

  // 所有重试都失败了
  const _overallElapsed = performance.now() - overallStart
  const errMsg = lastError instanceof Error ? lastError.message : String(lastError)

  if (isTransientError(lastError)) {
    throw new IpcTransientError(
      `IPC 命令 "${command}" 重试 ${maxRetries} 次后仍然失败: ${errMsg}`,
      {
        command,
        args,
        cause: lastError instanceof Error ? lastError : undefined,
        attempts: maxRetries + 1,
      }
    )
  }

  throw new IpcError(`IPC 命令 "${command}" 失败: ${errMsg}`, {
    command,
    args,
    cause: lastError instanceof Error ? lastError : undefined,
  })
}

/**
 * fire-and-forget IPC 调用，失败只记录日志不抛出。
 * 适用于非关键路径操作（如预取、后台清理）。
 */
export function invokeFireAndForget(
  command: string,
  args?: Record<string, unknown>,
  options?: IpcRetryOptions
): void {
  invoke(command, args, { ...options, silent: true }).catch((err: unknown) => {
    logger.warn(`[IPC fire-and-forget] ${command} failed silently:`, err)
  })
}

// ── 重置缓存（测试用）────────────────────────────────────────────────────

export function __resetTauriGuardForTest(): void {
  _cachedIsDesktop = undefined
  _tauriInvoke = null
  _ipcLogSeq = 0
}

// ── 工具函数 ──────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
