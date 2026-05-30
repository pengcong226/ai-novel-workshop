import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useAnalytics } from './useAnalytics'

// Mock the analytics utility module
const mockTrackEvent = vi.fn()
const mockTrackPageView = vi.fn()
const mockTrackPanelAction = vi.fn()
const mockTrackGenerationStart = vi.fn()
const mockTrackGenerationComplete = vi.fn()
const mockTrackGenerationFail = vi.fn()
const mockTrackProjectCreate = vi.fn()
const mockTrackFeatureUse = vi.fn()
const mockTrackError = vi.fn()
const mockTrackExport = vi.fn()
const mockGetAnalyticsSnapshot = vi.fn()
const mockOnAnalyticsEvent = vi.fn()
const mockInitAnalytics = vi.fn()
const mockClearAnalytics = vi.fn()
const mockExportAnalytics = vi.fn()

vi.mock('@/utils/analytics', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
  trackPageView: (...args: unknown[]) => mockTrackPageView(...args),
  trackPanelAction: (...args: unknown[]) => mockTrackPanelAction(...args),
  trackGenerationStart: (...args: unknown[]) => mockTrackGenerationStart(...args),
  trackGenerationComplete: (...args: unknown[]) => mockTrackGenerationComplete(...args),
  trackGenerationFail: (...args: unknown[]) => mockTrackGenerationFail(...args),
  trackProjectCreate: (...args: unknown[]) => mockTrackProjectCreate(...args),
  trackFeatureUse: (...args: unknown[]) => mockTrackFeatureUse(...args),
  trackError: (...args: unknown[]) => mockTrackError(...args),
  trackExport: (...args: unknown[]) => mockTrackExport(...args),
  getAnalyticsSnapshot: (...args: unknown[]) => mockGetAnalyticsSnapshot(...args),
  onAnalyticsEvent: (...args: unknown[]) => mockOnAnalyticsEvent(...args),
  initAnalytics: (...args: unknown[]) => mockInitAnalytics(...args),
  clearAnalytics: (...args: unknown[]) => mockClearAnalytics(...args),
  exportAnalytics: (...args: unknown[]) => mockExportAnalytics(...args),
}))

const defaultSnapshot = {
  session: { id: 'sess-1', startedAt: '', lastEventAt: '', eventCount: 0 },
  events: [],
  countsByCategory: { navigation: 0, ai: 0, editor: 0, sandbox: 0 },
  countsByAction: {},
  totalEvents: 0,
}

function mountAnalytics() {
  let result!: ReturnType<typeof useAnalytics>

  const wrapper = mount(
    defineComponent({
      setup() {
        result = useAnalytics()
        return result
      },
      render: () => h('div'),
    }),
  )

  return { wrapper, ...result }
}

describe('useAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAnalyticsSnapshot.mockReturnValue({ ...defaultSnapshot })
    mockOnAnalyticsEvent.mockReturnValue(vi.fn()) // returns unsubscribe
    mockExportAnalytics.mockReturnValue('{}')
  })

  it('initializes analytics on first use', () => {
    mountAnalytics()
    expect(mockInitAnalytics).toHaveBeenCalledTimes(1)
  })

  it('calls getAnalyticsSnapshot on mount to hydrate state', () => {
    mountAnalytics()
    expect(mockGetAnalyticsSnapshot).toHaveBeenCalled()
  })

  it('subscribes to analytics events via onAnalyticsEvent on mount', () => {
    mountAnalytics()
    expect(mockOnAnalyticsEvent).toHaveBeenCalledTimes(1)
    expect(typeof mockOnAnalyticsEvent.mock.calls[0][0]).toBe('function')
  })

  it('exposes reactive snapshot from hydrated data', () => {
    const snapshotWithData = {
      ...defaultSnapshot,
      totalEvents: 5,
      events: [
        { id: '1', category: 'ai', action: 'ai_request', timestamp: '', sessionId: '', properties: {} },
      ],
      countsByCategory: { navigation: 1, ai: 3, editor: 1, sandbox: 0 },
    }
    mockGetAnalyticsSnapshot.mockReturnValue(snapshotWithData)

    const { snapshot, eventCount } = mountAnalytics()

    expect(snapshot.value).toEqual(snapshotWithData)
    expect(eventCount.value).toBe(5)
  })

  it('exposes countsByCategory with zeros when snapshot has no events', () => {
    const emptySnapshot = {
      ...defaultSnapshot,
      countsByCategory: { navigation: 0, ai: 0, editor: 0, sandbox: 0 },
    }
    mockGetAnalyticsSnapshot.mockReturnValue(emptySnapshot)

    const { countsByCategory } = mountAnalytics()

    expect(countsByCategory.value).toEqual({
      navigation: 0,
      ai: 0,
      editor: 0,
      sandbox: 0,
    })
  })

  it('track delegates to trackEvent and increments eventCount', () => {
    const { track, eventCount } = mountAnalytics()
    const initialCount = eventCount.value

    track('ai', 'ai_request', { model: 'claude' })

    expect(mockTrackEvent).toHaveBeenCalledWith('ai', 'ai_request', { model: 'claude' })
    expect(eventCount.value).toBe(initialCount + 1)
  })

  it('trackPage delegates to trackPageView and increments eventCount', () => {
    const { trackPage, eventCount } = mountAnalytics()
    const initialCount = eventCount.value

    trackPage('/projects')

    expect(mockTrackPageView).toHaveBeenCalledWith('/projects')
    expect(eventCount.value).toBe(initialCount + 1)
  })

  it('trackPanelOpen and trackPanelClose delegate correctly', () => {
    const { trackPanelOpen, trackPanelClose } = mountAnalytics()

    trackPanelOpen('sandbox')
    expect(mockTrackPanelAction).toHaveBeenCalledWith('sandbox', 'panel_open')

    trackPanelClose('sandbox')
    expect(mockTrackPanelAction).toHaveBeenCalledWith('sandbox', 'panel_close')
  })

  it('trackGenStart delegates to trackGenerationStart', () => {
    const { trackGenStart } = mountAnalytics()

    trackGenStart(3)

    expect(mockTrackGenerationStart).toHaveBeenCalledWith(3)
  })

  it('trackGenComplete delegates to trackGenerationComplete with full data', () => {
    const { trackGenComplete } = mountAnalytics()
    const data = {
      chapterNumber: 5,
      durationMs: 12000,
      wordCount: 3000,
      totalTokens: 4500,
      revised: false,
      auditScore: 85,
    }

    trackGenComplete(data)

    expect(mockTrackGenerationComplete).toHaveBeenCalledWith(data)
  })

  it('trackGenFail delegates to trackGenerationFail', () => {
    const { trackGenFail } = mountAnalytics()
    const data = { chapterNumber: 2, durationMs: 5000, errorCategory: 'timeout' }

    trackGenFail(data)

    expect(mockTrackGenerationFail).toHaveBeenCalledWith(data)
  })

  it('trackProject delegates to trackProjectCreate', () => {
    const { trackProject } = mountAnalytics()

    trackProject({ genre: 'fantasy', targetWords: 50000 })

    expect(mockTrackProjectCreate).toHaveBeenCalledWith({ genre: 'fantasy', targetWords: 50000 })
  })

  it('trackFeature delegates to trackFeatureUse', () => {
    const { trackFeature } = mountAnalytics()

    trackFeature('deep-import', 'batch-mode')

    expect(mockTrackFeatureUse).toHaveBeenCalledWith('deep-import', 'batch-mode')
  })

  it('trackErr delegates to trackError', () => {
    const { trackErr } = mountAnalytics()

    trackErr('ai', 'rate_limit', true)

    expect(mockTrackError).toHaveBeenCalledWith('ai', 'rate_limit', true)
  })

  it('trackExportAction delegates to trackExport', () => {
    const { trackExportAction } = mountAnalytics()

    trackExportAction('pdf')

    expect(mockTrackExport).toHaveBeenCalledWith('pdf')
  })

  it('clearAll calls clearAnalytics and resets state', () => {
    const freshSnapshot = { ...defaultSnapshot, totalEvents: 0 }
    mockGetAnalyticsSnapshot.mockReturnValue(freshSnapshot)

    const { track, clearAll, eventCount } = mountAnalytics()

    track('editor', 'feature_use')
    expect(eventCount.value).toBeGreaterThan(0)

    clearAll()

    expect(mockClearAnalytics).toHaveBeenCalled()
    expect(eventCount.value).toBe(0)
  })

  it('exportAll returns the value from exportAnalytics', () => {
    mockExportAnalytics.mockReturnValue('{"events":[]}')

    const { exportAll } = mountAnalytics()

    expect(exportAll()).toBe('{"events":[]}')
    expect(mockExportAnalytics).toHaveBeenCalled()
  })

  it('refreshSnapshot re-hydrates snapshot from analytics module', () => {
    const updatedSnapshot = { ...defaultSnapshot, totalEvents: 42 }
    mockGetAnalyticsSnapshot.mockReturnValueOnce(defaultSnapshot)
    mockGetAnalyticsSnapshot.mockReturnValueOnce(updatedSnapshot)

    const { refreshSnapshot, snapshot, eventCount } = mountAnalytics()

    refreshSnapshot()

    expect(snapshot.value).toEqual(updatedSnapshot)
    expect(eventCount.value).toBe(42)
  })
})
