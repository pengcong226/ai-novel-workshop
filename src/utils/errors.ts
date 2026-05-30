/**
 * Custom error classes for the application.
 *
 * Provides typed errors with error codes, structured context,
 * and JSON serialization for logging and error boundary integration.
 *
 * @module utils/errors
 */

import { getLogger } from '@/utils/logger'

const logger = getLogger('utils:errors')

// ── Error codes ─────────────────────────────────────────────────────────

export const ErrorCode = {
  // Validation
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_INPUT: 'INVALID_INPUT',
  SCHEMA_MISMATCH: 'SCHEMA_MISMATCH',

  // Network
  NETWORK_UNREACHABLE: 'NETWORK_UNREACHABLE',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
  API_ERROR: 'API_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',

  // Storage
  STORAGE_WRITE_FAILED: 'STORAGE_WRITE_FAILED',
  STORAGE_READ_FAILED: 'STORAGE_READ_FAILED',
  STORAGE_QUOTA_EXCEEDED: 'STORAGE_QUOTA_EXCEEDED',
  STORAGE_NOT_FOUND: 'STORAGE_NOT_FOUND',

  // AI
  AI_NOT_INITIALIZED: 'AI_NOT_INITIALIZED',
  AI_GENERATION_FAILED: 'AI_GENERATION_FAILED',
  AI_CONTEXT_TOO_LONG: 'AI_CONTEXT_TOO_LONG',
  AI_RATE_LIMITED: 'AI_RATE_LIMITED',
  AI_QUOTA_EXCEEDED: 'AI_QUOTA_EXCEEDED',
  AI_MODEL_NOT_FOUND: 'AI_MODEL_NOT_FOUND',
  AI_CONTENT_FILTERED: 'AI_CONTENT_FILTERED',
  AI_ALL_MODELS_FAILED: 'AI_ALL_MODELS_FAILED',
  AI_PROVIDER_ERROR: 'AI_PROVIDER_ERROR',

  // Pipeline
  PIPELINE_STAGE_FAILED: 'PIPELINE_STAGE_FAILED',
  PIPELINE_ABORTED: 'PIPELINE_ABORTED',

  // IPC (Tauri desktop bridge)
  IPC_COMMAND_FAILED: 'IPC_COMMAND_FAILED',
  IPC_TRANSIENT: 'IPC_TRANSIENT',
  IPC_FATAL: 'IPC_FATAL',
  IPC_TIMEOUT: 'IPC_TIMEOUT',

  // Application
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  UNKNOWN: 'UNKNOWN',
} as const

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode]

// ── Error detail interface ──────────────────────────────────────────────

export interface ErrorDetail {
  code: ErrorCodeType
  message: string
  context?: Record<string, unknown>
  cause?: Error
}

// ── Base AppError ───────────────────────────────────────────────────────

/**
 * Base application error class.
 *
 * All custom errors extend this class. Carries a machine-readable `code`,
 * structured `context` for logging, and a `toJSON()` method for
 * serialization into logs, notifications, and error boundaries.
 */
export class AppError extends Error {
  /** Machine-readable error code. */
  readonly code: ErrorCodeType
  /** Structured context for logging / debugging. */
  readonly context: Record<string, unknown>
  /** ISO timestamp of when the error was created. */
  readonly timestamp: string

  constructor(detail: ErrorDetail) {
    super(detail.message)
    this.name = 'AppError'
    this.code = detail.code
    this.context = detail.context ?? {}
    this.timestamp = new Date().toISOString()

    if (detail.cause) {
      this.cause = detail.cause
    }

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype)
  }

  /**
   * Serialize to a plain object suitable for logging, IPC, or notification systems.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
      cause: this.cause instanceof Error
        ? { message: this.cause.message, stack: this.cause.stack }
        : this.cause,
    }
  }
}

// ── ValidationError ─────────────────────────────────────────────────────

/**
 * Raised when input data fails validation.
 */
export class ValidationError extends AppError {
  /** The field or path that failed validation (optional). */
  readonly field?: string

  constructor(
    message: string,
    options: {
      field?: string
      context?: Record<string, unknown>
      cause?: Error
    } = {}
  ) {
    super({
      code: ErrorCode.VALIDATION_FAILED,
      message,
      context: { ...options.context, field: options.field },
      cause: options.cause,
    })
    this.name = 'ValidationError'
    this.field = options.field
  }
}

// ── NetworkError ────────────────────────────────────────────────────────

/**
 * Raised on network or HTTP-level failures.
 */
export class NetworkError extends AppError {
  /** HTTP status code, if available. */
  readonly statusCode?: number

  constructor(
    message: string,
    options: {
      statusCode?: number
      code?: ErrorCodeType
      context?: Record<string, unknown>
      cause?: Error
    } = {}
  ) {
    super({
      code: options.code ?? ErrorCode.NETWORK_UNREACHABLE,
      message,
      context: { ...options.context, statusCode: options.statusCode },
      cause: options.cause,
    })
    this.name = 'NetworkError'
    this.statusCode = options.statusCode
  }
}

// ── StorageError ────────────────────────────────────────────────────────

/**
 * Raised on IndexedDB / localStorage / Tauri persistence failures.
 */
export class StorageError extends AppError {
  constructor(
    message: string,
    options: {
      code?: ErrorCodeType
      context?: Record<string, unknown>
      cause?: Error
    } = {}
  ) {
    super({
      code: options.code ?? ErrorCode.STORAGE_WRITE_FAILED,
      message,
      context: options.context,
      cause: options.cause,
    })
    this.name = 'StorageError'
  }
}

// ── AIError ─────────────────────────────────────────────────────────────

/**
 * Raised when AI model calls fail (provider errors, context overflow,
 * rate limits, content filtering, etc.).
 */
export class AIError extends AppError {
  /** The model identifier that produced the error, if known. */
  readonly model?: string

  constructor(
    message: string,
    options: {
      code?: ErrorCodeType
      model?: string
      context?: Record<string, unknown>
      cause?: Error
    } = {}
  ) {
    super({
      code: options.code ?? ErrorCode.AI_GENERATION_FAILED,
      message,
      context: { ...options.context, model: options.model },
      cause: options.cause,
    })
    this.name = 'AIError'
    this.model = options.model
  }
}

// ── Utility: wrap unknown errors ────────────────────────────────────────

/**
 * Safely wrap an unknown catch variable into an AppError.
 * If the value is already an AppError, returns it as-is.
 * If it is a standard Error, wraps it as an AppError with UNKNOWN code.
 * Otherwise, creates a new AppError from the stringified value.
 */
export function toAppError(
  err: unknown,
  fallbackMessage = '发生未知错误',
  context?: Record<string, unknown>
): AppError {
  if (err instanceof AppError) {
    return context ? new AppError({ ...err, context: { ...err.context, ...context } }) : err
  }

  if (err instanceof Error) {
    return new AppError({
      code: ErrorCode.UNKNOWN,
      message: err.message || fallbackMessage,
      context,
      cause: err,
    })
  }

  return new AppError({
    code: ErrorCode.UNKNOWN,
    message: typeof err === 'string' ? err : fallbackMessage,
    context: { ...context, rawValue: err },
  })
}

/**
 * Extract a human-readable message from an unknown catch variable.
 * Thin wrapper around the existing getErrorMessage utility for consistency.
 */
export function getErrorDetail(err: unknown): { message: string; code: ErrorCodeType } {
  if (err instanceof AppError) {
    return { message: err.message, code: err.code }
  }
  if (err instanceof Error) {
    return { message: err.message, code: ErrorCode.UNKNOWN }
  }
  return { message: String(err), code: ErrorCode.UNKNOWN }
}

// ── Error boundary logging integration ──────────────────────────────────

/**
 * Report an error to the global error handler and notification system.
 * Call this from catch blocks that want to surface errors to the user
 * via the notification store and the global error handler.
 */
export function reportError(
  err: unknown,
  options: {
    /** Notification title (optional). */
    title?: string
    /** Whether to also push to the global errorHandler. */
    logToErrorHandler?: boolean
    /** Additional context for the error record. */
    context?: Record<string, unknown>
  } = {}
): AppError {
  const appError = toAppError(err, undefined, options.context)

  // Log to the structured logger
  logger.error(`[${appError.code}] ${appError.message}`, appError.toJSON())

  // Optionally push to the global error handler (lazy import to avoid circular deps)
  if (options.logToErrorHandler !== false) {
    try {
      // Dynamic import is intentional: errorHandler may not be available in all contexts
      import('@/utils/errorHandler').then(({ errorHandler, ErrorSeverity, ErrorCategory }) => {
        const categoryMap: Record<string, string> = {
          [ErrorCode.NETWORK_UNREACHABLE]: ErrorCategory.NETWORK,
          [ErrorCode.REQUEST_TIMEOUT]: ErrorCategory.NETWORK,
          [ErrorCode.RATE_LIMITED]: ErrorCategory.NETWORK,
          [ErrorCode.STORAGE_WRITE_FAILED]: ErrorCategory.STORAGE,
          [ErrorCode.STORAGE_READ_FAILED]: ErrorCategory.STORAGE,
          [ErrorCode.STORAGE_QUOTA_EXCEEDED]: ErrorCategory.STORAGE,
          [ErrorCode.AI_GENERATION_FAILED]: ErrorCategory.API,
          [ErrorCode.AI_NOT_INITIALIZED]: ErrorCategory.API,
          [ErrorCode.AI_PROVIDER_ERROR]: ErrorCategory.API,
          [ErrorCode.IPC_COMMAND_FAILED]: ErrorCategory.STORAGE,
          [ErrorCode.IPC_TRANSIENT]: ErrorCategory.STORAGE,
          [ErrorCode.IPC_FATAL]: ErrorCategory.STORAGE,
          [ErrorCode.IPC_TIMEOUT]: ErrorCategory.STORAGE,
          [ErrorCode.VALIDATION_FAILED]: ErrorCategory.VALIDATION,
        }
        const category = categoryMap[appError.code] ?? ErrorCategory.UNKNOWN
        errorHandler.handleError(appError, {
          severity: ErrorSeverity.MEDIUM,
          category: category as any,
          context: appError.context,
        })
      }).catch(() => { /* silent */ })
    } catch {
      // Do not let error reporting crash the caller
    }
  }

  return appError
}
