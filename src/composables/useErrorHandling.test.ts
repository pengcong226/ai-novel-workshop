import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { ErrorSeverity, ErrorCategory } from '@/utils/errorHandler'

// vi.hoisted: declare mocks before vi.mock is hoisted
const { mockErrorHandlerHandle, mockElMessage, mockElNotification } = vi.hoisted(() => ({
  mockErrorHandlerHandle: vi.fn((_error: Error, opts: any) => ({
    id: 'test-error-id',
    message: _error.message,
    severity: opts.severity || ErrorSeverity.MEDIUM,
    category: opts.category || ErrorCategory.UNKNOWN,
    timestamp: new Date(),
    context: opts.context,
    stack: _error.stack,
    userAction: opts.userAction,
    recoverable: true,
  })),
  mockElMessage: vi.fn(),
  mockElNotification: vi.fn(),
}))

vi.mock('element-plus', () => ({
  ElMessage: (...args: unknown[]) => mockElMessage(...args),
  ElNotification: (...args: unknown[]) => mockElNotification(...args),
}))

vi.mock('@/utils/errorHandler', async () => {
  const actual = await vi.importActual<any>('@/utils/errorHandler')
  return {
    ...actual,
    errorHandler: {
      handleError: mockErrorHandlerHandle,
    },
  }
})

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Must import AFTER mocks are set up
import { useErrorHandling, setErrorReportCallback } from './useErrorHandling'

function mountErrorHandling() {
  let result!: ReturnType<typeof useErrorHandling>

  const wrapper = mount(
    defineComponent({
      setup() {
        result = useErrorHandling()
        return result
      },
      render: () => h('div'),
    }),
  )

  return { wrapper, ...result }
}

describe('useErrorHandling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('initializes isRetrying as false', () => {
    const { isRetrying } = mountErrorHandling()
    expect(isRetrying.value).toBe(false)
  })

  it('initializes retryCount as 0', () => {
    const { retryCount } = mountErrorHandling()
    expect(retryCount.value).toBe(0)
  })

  it('initializes lastError as null', () => {
    const { lastError } = mountErrorHandling()
    expect(lastError.value).toBeNull()
  })

  it('withRetry returns result on first success', async () => {
    const { withRetry } = mountErrorHandling()
    const fn = vi.fn().mockResolvedValue('ok')

    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('withRetry retries on transient error and eventually succeeds', async () => {
    const { withRetry } = mountErrorHandling()
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue('recovered')

    const promise = withRetry(fn, { maxRetries: 3, baseDelayMs: 100 })
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('withRetry throws after maxRetries exhausted', async () => {
    const { withRetry } = mountErrorHandling()
    const fn = vi.fn().mockRejectedValue(new Error('timeout'))

    // Attach rejection handler BEFORE advancing timers to avoid unhandled rejection
    const promise = withRetry(fn, { maxRetries: 2, baseDelayMs: 50 })
    const assertion = expect(promise).rejects.toThrow('timeout')
    await vi.runAllTimersAsync()
    await assertion

    expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries
  })

  it('withRetry skips retry for non-retryable errors', async () => {
    const { withRetry } = mountErrorHandling()
    const fn = vi.fn().mockRejectedValue(new Error('validation failed'))

    // Attach rejection handler before the promise settles
    const promise = withRetry(fn, { maxRetries: 3, baseDelayMs: 10 })
    const assertion = expect(promise).rejects.toThrow('validation failed')
    await assertion

    expect(fn).toHaveBeenCalledTimes(1) // no retry for non-transient
  })

  it('withRetry calls onRetry callback', async () => {
    const { withRetry } = mountErrorHandling()
    const onRetry = vi.fn()
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValue('ok')

    const promise = withRetry(fn, { maxRetries: 3, baseDelayMs: 100, onRetry })
    await vi.runAllTimersAsync()
    await promise

    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Error))
  })

  it('withRetry respects custom isRetryable', async () => {
    const { withRetry } = mountErrorHandling()
    const fn = vi.fn().mockRejectedValue(new Error('always retry'))
    const isRetryable = vi.fn().mockReturnValue(true)

    // Attach rejection handler BEFORE advancing timers to avoid unhandled rejection
    const promise = withRetry(fn, { maxRetries: 1, baseDelayMs: 10, isRetryable })
    const assertion = expect(promise).rejects.toThrow('always retry')
    await vi.runAllTimersAsync()
    await assertion

    expect(isRetryable).toHaveBeenCalled()
  })

  it('handleError returns structured AppError', () => {
    const { handleError } = mountErrorHandling()
    const result = handleError(new Error('test error'), {
      severity: ErrorSeverity.HIGH,
      category: ErrorCategory.API,
    })

    expect(result).toHaveProperty('id')
    expect(result).toHaveProperty('message', 'test error')
    expect(result).toHaveProperty('severity', ErrorSeverity.HIGH)
    expect(result).toHaveProperty('category', ErrorCategory.API)
  })

  it('handleNetworkError sets NETWORK category', () => {
    const { handleNetworkError } = mountErrorHandling()
    const result = handleNetworkError(new Error('fetch failed'))

    expect(result.category).toBe(ErrorCategory.NETWORK)
    expect(result.severity).toBe(ErrorSeverity.MEDIUM)
  })

  it('handleAIError sets API category', () => {
    const { handleAIError } = mountErrorHandling()
    const result = handleAIError(new Error('model overload'))

    expect(result.category).toBe(ErrorCategory.API)
    expect(result.severity).toBe(ErrorSeverity.MEDIUM)
  })

  it('handleStorageError sets HIGH severity', () => {
    const { handleStorageError } = mountErrorHandling()
    const result = handleStorageError(new Error('disk full'))

    expect(result.category).toBe(ErrorCategory.STORAGE)
    expect(result.severity).toBe(ErrorSeverity.HIGH)
  })

  it('resetRetryState resets all state values', () => {
    const { resetRetryState, isRetrying, retryCount, lastError } = mountErrorHandling()

    resetRetryState()

    expect(isRetrying.value).toBe(false)
    expect(retryCount.value).toBe(0)
    expect(lastError.value).toBeNull()
  })

  it('setErrorReportCallback injects callback that receives payloads', () => {
    const reportCb = vi.fn()
    setErrorReportCallback(reportCb)

    const { handleError } = mountErrorHandling()
    handleError(new Error('reported'), { showToast: false })

    expect(reportCb).toHaveBeenCalledTimes(1)
    const payload = reportCb.mock.calls[0][0]
    expect(payload).toHaveProperty('message', 'reported')
    expect(payload).toHaveProperty('timestamp')
  })
})
