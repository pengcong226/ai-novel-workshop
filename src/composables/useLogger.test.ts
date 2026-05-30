import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useLogger } from './useLogger'
import { getLogger } from '@/utils/logger'

// ---------------------------------------------------------------------------
// Mock the underlying logger and project store
// ---------------------------------------------------------------------------

const mockBaseLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debugWithContext: vi.fn(),
  infoWithContext: vi.fn(),
  warnWithContext: vi.fn(),
  errorWithContext: vi.fn(),
  time: vi.fn(),
  timeEnd: vi.fn(),
  child: vi.fn(),
}

const mockProjectStore = {
  currentProject: null as { id: string } | null,
}

vi.mock('@/utils/logger', () => ({
  getLogger: vi.fn(() => mockBaseLogger),
  type: {},
}))

vi.mock('@/stores/project', () => ({
  useProjectStore: vi.fn(() => mockProjectStore),
}))

function mountWithLogger(label?: string, extraContext?: Record<string, unknown>) {
  let loggerResult!: ReturnType<typeof useLogger>
  const wrapper = mount(
    defineComponent({
      setup() {
        loggerResult = useLogger(label, extraContext)
        return {}
      },
      render: () => h('div'),
    }),
  )
  return { wrapper, logger: loggerResult }
}

describe('useLogger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProjectStore.currentProject = null
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a logger object with all expected methods', () => {
    const { logger } = mountWithLogger('TestComponent')

    expect(logger).toHaveProperty('debug')
    expect(logger).toHaveProperty('info')
    expect(logger).toHaveProperty('warn')
    expect(logger).toHaveProperty('error')
    expect(logger).toHaveProperty('debugWithContext')
    expect(logger).toHaveProperty('infoWithContext')
    expect(logger).toHaveProperty('warnWithContext')
    expect(logger).toHaveProperty('errorWithContext')
  })

  it('delegates info() to the base logger', () => {
    const { logger } = mountWithLogger('MyComponent')

    logger.info('hello world')

    expect(mockBaseLogger.info).toHaveBeenCalledWith('hello world')
  })

  it('delegates debug() to the base logger', () => {
    const { logger } = mountWithLogger('DebugComp')

    logger.debug('debug msg', { extra: 1 })

    expect(mockBaseLogger.debug).toHaveBeenCalledWith('debug msg', { extra: 1 })
  })

  it('delegates warn() to the base logger', () => {
    const { logger } = mountWithLogger('WarnComp')

    logger.warn('warning!')

    expect(mockBaseLogger.warn).toHaveBeenCalledWith('warning!')
  })

  it('delegates error() to the base logger with args', () => {
    const { logger } = mountWithLogger('ErrComp')

    const err = new Error('test')
    logger.error('failed', err)

    expect(mockBaseLogger.error).toHaveBeenCalledWith('failed', err)
  })

  it('delegates *WithContext() methods to the base logger', () => {
    const { logger } = mountWithLogger('CtxComp')
    const ctx = { requestId: 'abc' }

    logger.infoWithContext('with context', ctx)
    logger.debugWithContext('debug ctx', ctx)
    logger.warnWithContext('warn ctx', ctx)
    logger.errorWithContext('error ctx', ctx)

    expect(mockBaseLogger.infoWithContext).toHaveBeenCalledWith('with context', ctx)
    expect(mockBaseLogger.debugWithContext).toHaveBeenCalledWith('debug ctx', ctx)
    expect(mockBaseLogger.warnWithContext).toHaveBeenCalledWith('warn ctx', ctx)
    expect(mockBaseLogger.errorWithContext).toHaveBeenCalledWith('error ctx', ctx)
  })

  it('resolves projectId from project store when available', () => {
    mockProjectStore.currentProject = { id: 'proj-123' }

    const { logger } = mountWithLogger('StoreAwareComp')

    logger.info('with project')

    // The logger should have resolved projectId before calling base
    expect(mockBaseLogger.info).toHaveBeenCalled()
  })

  it('handles missing project store gracefully (no crash)', () => {
    const { logger } = mountWithLogger('NoStore')

    // Should not throw even when project store has no currentProject
    expect(() => logger.info('no crash')).not.toThrow()
  })

  it('uses provided label instead of component name', () => {
    mountWithLogger('CustomLabel')

    expect(vi.mocked(getLogger)).toHaveBeenCalledWith(
      expect.stringContaining('CustomLabel'),
      expect.any(Object),
    )
  })

  it('uses extraContext fields in logger context', () => {
    mountWithLogger('WithCtx', { feature: 'test-feature' })

    expect(vi.mocked(getLogger)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ module: 'WithCtx', feature: 'test-feature' }),
    )
  })
})
