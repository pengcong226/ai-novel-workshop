import { describe, expect, it, vi } from 'vitest'
import {
  AppError,
  ValidationError,
  NetworkError,
  StorageError,
  AIError,
  ErrorCode,
  toAppError,
  getErrorDetail,
  reportError,
} from '@/utils/errors'

// Mock logger so reportError does not produce console output or import errors
vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}))

// Mock errorHandler to prevent dynamic import side effects
vi.mock('@/utils/errorHandler', () => ({
  errorHandler: { handleError: vi.fn() },
  ErrorSeverity: { MEDIUM: 'MEDIUM' },
  ErrorCategory: { NETWORK: 'NETWORK', STORAGE: 'STORAGE', API: 'API', VALIDATION: 'VALIDATION', UNKNOWN: 'UNKNOWN' },
}))

describe('AppError', () => {
  it('carries code, message, context, and timestamp', () => {
    const err = new AppError({
      code: ErrorCode.UNKNOWN,
      message: 'something broke',
      context: { detail: 42 },
    })

    expect(err.name).toBe('AppError')
    expect(err.code).toBe(ErrorCode.UNKNOWN)
    expect(err.message).toBe('something broke')
    expect(err.context).toEqual({ detail: 42 })
    expect(err.timestamp).toBeDefined()
    expect(new Date(err.timestamp).getTime()).not.toBeNaN()
  })

  it('defaults context to empty object when omitted', () => {
    const err = new AppError({ code: ErrorCode.UNKNOWN, message: 'x' })
    expect(err.context).toEqual({})
  })

  it('stores the cause error', () => {
    const cause = new Error('root')
    const err = new AppError({
      code: ErrorCode.UNKNOWN,
      message: 'wrapped',
      cause,
    })

    expect((err as any).cause).toBe(cause)
  })

  it('toJSON produces a serialisable snapshot', () => {
    const err = new AppError({
      code: ErrorCode.API_ERROR,
      message: 'api fail',
      context: { status: 500 },
    })

    const json = err.toJSON()
    expect(json.name).toBe('AppError')
    expect(json.code).toBe(ErrorCode.API_ERROR)
    expect(json.message).toBe('api fail')
    expect(json.context).toEqual({ status: 500 })
    expect(json).toHaveProperty('timestamp')
    expect(json).toHaveProperty('stack')
  })

  it('toJSON includes cause details when the cause is an Error', () => {
    const cause = new Error('root cause')
    const err = new AppError({ code: ErrorCode.UNKNOWN, message: 'x', cause })
    const json = err.toJSON()

    expect(json.cause).toBeDefined()
    expect((json.cause as any).message).toBe('root cause')
  })

  it('maintains instanceof behaviour via prototype chain', () => {
    const err = new AppError({ code: ErrorCode.UNKNOWN, message: 'x' })
    expect(err).toBeInstanceOf(AppError)
    expect(err).toBeInstanceOf(Error)
  })
})

describe('ValidationError', () => {
  it('uses VALIDATION_FAILED code and stores the field', () => {
    const err = new ValidationError('field is required', { field: 'title' })

    expect(err.name).toBe('ValidationError')
    expect(err.code).toBe(ErrorCode.VALIDATION_FAILED)
    expect(err.field).toBe('title')
    expect(err.context.field).toBe('title')
  })

  it('is an instance of AppError', () => {
    const err = new ValidationError('bad input')
    expect(err).toBeInstanceOf(AppError)
    expect(err).toBeInstanceOf(ValidationError)
  })
})

describe('NetworkError', () => {
  it('defaults to NETWORK_UNREACHABLE code and stores statusCode', () => {
    const err = new NetworkError('timeout', { statusCode: 504 })

    expect(err.name).toBe('NetworkError')
    expect(err.code).toBe(ErrorCode.NETWORK_UNREACHABLE)
    expect(err.statusCode).toBe(504)
  })

  it('accepts a custom code override', () => {
    const err = new NetworkError('rate limited', {
      code: ErrorCode.RATE_LIMITED,
      statusCode: 429,
    })
    expect(err.code).toBe(ErrorCode.RATE_LIMITED)
  })
})

describe('StorageError', () => {
  it('defaults to STORAGE_WRITE_FAILED code', () => {
    const err = new StorageError('disk full')
    expect(err.name).toBe('StorageError')
    expect(err.code).toBe(ErrorCode.STORAGE_WRITE_FAILED)
  })

  it('accepts a custom storage code', () => {
    const err = new StorageError('not found', { code: ErrorCode.STORAGE_NOT_FOUND })
    expect(err.code).toBe(ErrorCode.STORAGE_NOT_FOUND)
  })
})

describe('AIError', () => {
  it('defaults to AI_GENERATION_FAILED code and stores model', () => {
    const err = new AIError('generation failed', { model: 'claude-sonnet-4-5' })

    expect(err.name).toBe('AIError')
    expect(err.code).toBe(ErrorCode.AI_GENERATION_FAILED)
    expect(err.model).toBe('claude-sonnet-4-5')
    expect(err.context.model).toBe('claude-sonnet-4-5')
  })

  it('accepts a custom AI error code', () => {
    const err = new AIError('context too long', { code: ErrorCode.AI_CONTEXT_TOO_LONG })
    expect(err.code).toBe(ErrorCode.AI_CONTEXT_TOO_LONG)
  })
})

describe('toAppError', () => {
  it('returns AppError as-is when no extra context', () => {
    const original = new AppError({ code: ErrorCode.UNKNOWN, message: 'x' })
    expect(toAppError(original)).toBe(original)
  })

  it('merges extra context into an existing AppError', () => {
    const original = new AppError({ code: ErrorCode.UNKNOWN, message: 'x', context: { a: 1 } })
    const result = toAppError(original, undefined, { b: 2 })

    expect(result).not.toBe(original)
    expect(result.context).toEqual({ a: 1, b: 2 })
  })

  it('wraps a standard Error with UNKNOWN code', () => {
    const err = new Error('standard error')
    const result = toAppError(err)

    expect(result).toBeInstanceOf(AppError)
    expect(result.code).toBe(ErrorCode.UNKNOWN)
    expect(result.message).toBe('standard error')
  })

  it('wraps a string value into an AppError', () => {
    const result = toAppError('string error')

    expect(result).toBeInstanceOf(AppError)
    expect(result.code).toBe(ErrorCode.UNKNOWN)
    expect(result.message).toBe('string error')
  })

  it('uses fallback message for non-string, non-Error values', () => {
    const result = toAppError(12345, 'fallback msg')

    expect(result.message).toBe('fallback msg')
    expect(result.context.rawValue).toBe(12345)
  })
})

describe('getErrorDetail', () => {
  it('extracts message and code from an AppError', () => {
    const err = new AIError('model not found', { code: ErrorCode.AI_MODEL_NOT_FOUND })
    const detail = getErrorDetail(err)

    expect(detail.message).toBe('model not found')
    expect(detail.code).toBe(ErrorCode.AI_MODEL_NOT_FOUND)
  })

  it('extracts message from a standard Error with UNKNOWN code', () => {
    const detail = getErrorDetail(new Error('oops'))
    expect(detail.message).toBe('oops')
    expect(detail.code).toBe(ErrorCode.UNKNOWN)
  })

  it('stringifies non-Error values', () => {
    const detail = getErrorDetail(42)
    expect(detail.message).toBe('42')
    expect(detail.code).toBe(ErrorCode.UNKNOWN)
  })
})

describe('reportError', () => {
  it('returns an AppError from any input', () => {
    const result = reportError(new Error('test'), { logToErrorHandler: false })
    expect(result).toBeInstanceOf(AppError)
    expect(result.message).toBe('test')
  })

  it('passes title and context through to the returned error', () => {
    const result = reportError('something', {
      title: 'Custom Title',
      context: { extra: true },
      logToErrorHandler: false,
    })

    expect(result).toBeInstanceOf(AppError)
    expect(result.context).toHaveProperty('extra', true)
  })
})
