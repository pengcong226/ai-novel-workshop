import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createTestPinia } from '@/test/helpers'
import type { PipelineProgressEvent } from '@/components/PipelineProgressPanel.vue'

// --- Mock dependencies before importing SUT ---

vi.mock('@/utils/errorHandler', () => ({
  getFriendlyMessage: (msg: string) => `friendly:${msg}`,
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Replace Element Plus icons with simple stubs
vi.mock('@element-plus/icons-vue', () => ({
  VideoPlay: { name: 'VideoPlay', template: '<span />' },
  VideoPause: { name: 'VideoPause', template: '<span />' },
  Check: { name: 'Check', template: '<span />' },
  Warning: { name: 'Warning', template: '<span />' },
  Loading: { name: 'Loading', template: '<span />' },
  CloseBold: { name: 'CloseBold', template: '<span />' },
}))

// Stub all el-* components from Element Plus so we do not need the real library
const elStub = (name: string) => ({
  name,
  props: Object.fromEntries(
    // accept any attribute without warnings
    Array.from({ length: 20 }, (_, i) => [`prop${i}`, { type: [String, Number, Boolean], default: undefined }]),
  ),
  template: '<div><slot /><slot name="header" /></div>',
})

vi.mock('element-plus', () => ({}))

import PipelineProgressPanel from '@/components/PipelineProgressPanel.vue'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<PipelineProgressEvent> = {}): PipelineProgressEvent {
  return {
    type: 'stage-start',
    chapterNumber: 1,
    progress: 10,
    ...overrides,
  }
}

function mountPanel(propsOverride: Partial<InstanceType<typeof PipelineProgressPanel>['$props']> = {}) {
  return mount(PipelineProgressPanel, {
    props: {
      visible: true,
      events: [],
      currentEvent: null,
      isPaused: false,
      isRunning: true,
      ...propsOverride,
    },
    global: {
      stubs: {
        'el-card': {
          template: '<div class="el-card"><slot name="header" /><slot /></div>',
        },
        'el-tag': {
          props: ['type', 'size'],
          template: '<span class="el-tag"><slot /></span>',
        },
        'el-button': {
          props: ['type', 'size', 'icon', 'disabled'],
          emits: ['click'],
          template: '<button class="el-button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
        },
        'el-button-group': { template: '<span><slot /></span>' },
        'el-progress': {
          props: ['percentage', 'strokeWidth', 'textInside'],
          template: '<div class="el-progress" :data-pct="percentage"></div>',
        },
        'el-alert': {
          props: ['title', 'type', 'closable', 'showIcon'],
          template: '<div class="el-alert el-alert--error" role="alert">{{ title }}</div>',
        },
        'el-icon': { template: '<span class="el-icon"><slot /></span>' },
      },
    },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PipelineProgressPanel', () => {
  beforeEach(() => {
    createTestPinia()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // --- 1. Visibility ---

  it('renders nothing when visible is false', () => {
    const wrapper = mountPanel({ visible: false })
    expect(wrapper.find('.pipeline-progress-panel').exists()).toBe(false)
  })

  it('renders the panel when visible is true', () => {
    const wrapper = mountPanel({ visible: true })
    expect(wrapper.find('.pipeline-progress-panel').exists()).toBe(true)
  })

  // --- 2. Progress step display ---

  it('renders all 10 pipeline stages with correct labels', () => {
    const wrapper = mountPanel()
    const stages = wrapper.findAll('.stage-item')

    expect(stages).toHaveLength(10)

    const expectedLabels = [
      '输入准备', '规划', '上下文组装', '写作', '字数标准化',
      '质量审计', '修订', '状态沉淀', '章节分析', '伏笔升级',
    ]
    const actualLabels = stages.map((s) => s.find('.stage-label').text())
    expect(actualLabels).toEqual(expectedLabels)
  })

  it('shows stage numbers for pending stages', () => {
    const wrapper = mountPanel({
      currentEvent: null,
      isRunning: false,
    })

    const numbers = wrapper.findAll('.stage-number')
    // All 10 stages should be pending when no events and not running
    expect(numbers).toHaveLength(10)
    expect(numbers[0].text()).toBe('1')
    expect(numbers[9].text()).toBe('10')
  })

  // --- 3. Stage status indicators ---

  it('marks a stage as completed when stage-complete event exists', () => {
    const events: PipelineProgressEvent[] = [
      makeEvent({ type: 'stage-complete', stage: 'prepare' }),
      makeEvent({ type: 'stage-complete', stage: 'plan' }),
    ]
    const wrapper = mountPanel({ events })

    const stages = wrapper.findAll('.stage-item')
    expect(stages[0].classes()).toContain('stage-completed')
    expect(stages[1].classes()).toContain('stage-completed')
    // Third stage should still be pending
    expect(stages[2].classes()).toContain('stage-pending')
  })

  it('marks a stage as running when currentEvent matches and isRunning is true', () => {
    const wrapper = mountPanel({
      currentEvent: makeEvent({ stage: 'write', type: 'stage-start' }),
      isRunning: true,
    })

    const stages = wrapper.findAll('.stage-item')
    // 'write' is index 3
    expect(stages[3].classes()).toContain('stage-running')
    // Other stages should be pending
    expect(stages[0].classes()).toContain('stage-pending')
  })

  it('marks a stage as failed when error event exists for that stage', () => {
    const events: PipelineProgressEvent[] = [
      makeEvent({ type: 'error', stage: 'audit', error: 'quality check failed' }),
    ]
    const wrapper = mountPanel({ events })

    const stages = wrapper.findAll('.stage-item')
    // 'audit' is index 5
    expect(stages[5].classes()).toContain('stage-failed')
  })

  // --- 4. Status tag ---

  it('displays running status tag when isRunning is true', () => {
    const wrapper = mountPanel({ isRunning: true, isPaused: false })
    const tag = wrapper.find('.el-tag')
    expect(tag.text()).toBe('运行中')
  })

  it('displays paused status tag when isPaused is true', () => {
    const wrapper = mountPanel({ isRunning: false, isPaused: true })
    const tag = wrapper.find('.el-tag')
    expect(tag.text()).toBe('已暂停')
  })

  it('displays completed status tag when neither running nor paused', () => {
    const wrapper = mountPanel({ isRunning: false, isPaused: false })
    const tag = wrapper.find('.el-tag')
    expect(tag.text()).toBe('完成')
  })

  // --- 5. Cancel action ---

  it('emits cancel when cancel button is clicked', async () => {
    const wrapper = mountPanel({ isRunning: true })
    const buttons = wrapper.findAll('.el-button')
    // Cancel button is the second one (after pause/resume)
    const cancelButton = buttons[1]
    await cancelButton.trigger('click')

    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('disables cancel button when not running', () => {
    const wrapper = mountPanel({ isRunning: false })
    const buttons = wrapper.findAll('.el-button')
    const cancelButton = buttons[1]
    expect(cancelButton.attributes('disabled')).toBeDefined()
  })

  // --- 6. Pause / Resume toggle ---

  it('emits pause when pause button is clicked and not paused', async () => {
    const wrapper = mountPanel({ isRunning: true, isPaused: false })
    const buttons = wrapper.findAll('.el-button')
    const pauseButton = buttons[0]
    await pauseButton.trigger('click')

    expect(wrapper.emitted('pause')).toHaveLength(1)
    expect(wrapper.emitted('resume')).toBeUndefined()
  })

  it('emits resume when resume button is clicked and paused', async () => {
    const wrapper = mountPanel({ isRunning: true, isPaused: true })
    const buttons = wrapper.findAll('.el-button')
    const resumeButton = buttons[0]
    await resumeButton.trigger('click')

    expect(wrapper.emitted('resume')).toHaveLength(1)
    expect(wrapper.emitted('pause')).toBeUndefined()
  })

  // --- 7. Error state rendering ---

  it('renders error alert when currentEvent type is error', () => {
    const wrapper = mountPanel({
      currentEvent: makeEvent({ type: 'error', error: 'disk full' }),
      isRunning: false,
    })

    const alert = wrapper.find('.el-alert')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('friendly:disk full')
  })

  it('does not render error alert when currentEvent is not an error', () => {
    const wrapper = mountPanel({
      currentEvent: makeEvent({ type: 'stage-start', stage: 'plan' }),
    })

    expect(wrapper.find('.el-alert').exists()).toBe(false)
  })

  // --- 8. Completed chapters list ---

  it('renders completed chapters with word count and audit score', () => {
    const events: PipelineProgressEvent[] = [
      makeEvent({ type: 'chapter-complete', chapterNumber: 1, wordCount: 3200, auditScore: 92 }),
      makeEvent({ type: 'chapter-complete', chapterNumber: 2, wordCount: 2800, auditScore: 60 }),
    ]
    const wrapper = mountPanel({ events, isRunning: false })

    const items = wrapper.findAll('.chapter-item')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('第1章')
    expect(items[0].text()).toContain('3200字')
    expect(items[0].text()).toContain('评分92')
    // High score should get status-good icon
    expect(items[0].find('.status-good').exists()).toBe(true)
    // Low score should get status-warn icon
    expect(items[1].find('.status-warn').exists()).toBe(true)
  })

  it('does not render completed chapters section when no chapter-complete events', () => {
    const wrapper = mountPanel({ events: [] })
    expect(wrapper.find('.completed-chapters').exists()).toBe(false)
  })

  // --- 9. Overall progress bar ---

  it('shows overall progress percentage from currentEvent', () => {
    const wrapper = mountPanel({
      currentEvent: makeEvent({ progress: 45 }),
    })

    const progress = wrapper.find('.el-progress')
    expect(progress.attributes('data-pct')).toBe('45')
  })

  // --- 10. Token usage display ---

  it('displays formatted token count for large values', () => {
    const wrapper = mountPanel({
      currentEvent: makeEvent({ totalTokenUsage: 1_500_000 }),
    })

    expect(wrapper.find('.token-row').text()).toContain('1.5M')
  })

  it('displays formatted token count for thousands', () => {
    const wrapper = mountPanel({
      currentEvent: makeEvent({ totalTokenUsage: 4_500 }),
    })

    expect(wrapper.find('.token-row').text()).toContain('4.5K')
  })

  // --- 11. In-progress indicator ---

  it('shows in-progress indicator during stage-start events', () => {
    const wrapper = mountPanel({
      currentEvent: makeEvent({ type: 'stage-start', chapterNumber: 3, stage: 'write', progress: 30 }),
      isRunning: true,
    })

    const inProgress = wrapper.find('.in-progress')
    expect(inProgress.exists()).toBe(true)
    expect(inProgress.text()).toContain('第3章')
  })

  it('shows in-progress indicator during chapter-start events', () => {
    const wrapper = mountPanel({
      currentEvent: makeEvent({ type: 'chapter-start', chapterNumber: 5, stage: 'compose', progress: 15 }),
      isRunning: true,
    })

    const inProgress = wrapper.find('.in-progress')
    expect(inProgress.exists()).toBe(true)
    expect(inProgress.text()).toContain('第5章')
  })

  // --- 12. Elapsed timer ---

  it('tracks elapsed time while running', async () => {
    const wrapper = mountPanel({ isRunning: true })

    // Initial display should be 00:00
    expect(wrapper.find('.status-row').text()).toContain('00:00')

    // Advance 65 seconds
    vi.advanceTimersByTime(65_000)
    await nextTick()

    expect(wrapper.find('.status-row').text()).toContain('01:05')
  })
})
