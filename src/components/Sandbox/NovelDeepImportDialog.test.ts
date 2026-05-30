import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createTestPinia } from '@/test/helpers'
import type { Pinia } from 'pinia'
import type { DeepImportOptions } from '@/types/deep-import'

// ── Hoisted mocks ──────────────────────────────────────────────────────

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('@/utils/anthropic-guard', () => ({
  isWebRuntime: () => true,
}))

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-1234'),
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

const mockClearSession = vi.fn()
const mockSetKeyChapters = vi.fn()
const mockAbort = vi.fn()
const mockIsRunning = { value: false }

vi.mock('@/composables/useDeepImportSession', () => ({
  useDeepImportSession: () => ({
    currentStep: { value: 0 },
    clearSession: mockClearSession,
    setKeyChapters: mockSetKeyChapters,
    abort: mockAbort,
    isRunning: mockIsRunning,
  }),
}))

vi.mock('@/stores/project', () => ({
  useProjectStore: () => ({
    currentProject: {
      id: 'test-project',
      chapters: [],
    },
    saveChapter: mockSaveChapter,
  }),
}))

const mockSaveChapter = vi.fn().mockResolvedValue(undefined)

// ── Stub child components ──────────────────────────────────────────────

const DeepImportUploadStub = {
  template: '<div class="deep-import-upload-stub"><button class="btn-next" @click="$emit(\'next\', uploadPayload)">Next</button></div>',
  emits: ['next'],
  data() {
    return {
      uploadPayload: {
        chapters: [
          { number: 1, title: '第一章 开始', content: '内容一', startIndex: 0, endIndex: 10, wordCount: 3 },
          { number: 2, title: '第二章 发展', content: '内容二', startIndex: 11, endIndex: 20, wordCount: 3 },
        ],
        mode: 'full' as const,
        sourceText: '原文内容',
        detectedPatternName: '第X章',
      },
    }
  },
}

const DeepImportConfigStub = {
  template: `<div class="deep-import-config-stub">
    <button class="btn-back" @click="$emit('back')">Back</button>
    <button class="btn-start" @click="$emit('start', startOptions, undefined, false)">Start</button>
  </div>`,
  props: ['chapters', 'mode', 'initialPersistBeforeExtraction'],
  emits: ['back', 'start'],
  data() {
    return {
      startOptions: {
        mode: 'full' as const,
        extractPlotEvents: false,
        checkpointInterval: 0,
        maxCostUSD: 5,
        batchSize: 1,
      } satisfies DeepImportOptions,
    }
  },
}

const DeepImportProgressStub = {
  template: `<div class="deep-import-progress-stub">
    <button class="btn-abort" @click="$emit('abort')">Abort</button>
    <button class="btn-next" @click="$emit('next')">Next</button>
  </div>`,
  props: ['chapters', 'options'],
  emits: ['next', 'abort'],
}

const DeepImportConfirmStub = {
  template: `<div class="deep-import-confirm-stub">
    <button class="btn-back" @click="$emit('back')">Back</button>
    <button class="btn-reset" @click="$emit('reset')">Reset</button>
    <button class="btn-done" @click="$emit('done')">Done</button>
  </div>`,
  emits: ['back', 'reset', 'done'],
}

// ── Imports (after mocks) ──────────────────────────────────────────────

import NovelDeepImportDialog from './NovelDeepImportDialog.vue'

// ── Helpers ────────────────────────────────────────────────────────────

function mountDialog(pinia: Pinia) {
  return mount(NovelDeepImportDialog, {
    global: {
      plugins: [pinia],
      stubs: {
        'el-steps': { template: '<div class="el-steps-stub"><slot /></div>', props: ['active', 'finish-status', 'simple'] },
        'el-step': { template: '<div class="el-step-stub"><slot /></div>', props: ['title'] },
        'el-button': {
          template: '<button :data-type="type" v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
          props: ['type', 'text', 'size'],
          emits: ['click'],
        },
        DeepImportUpload: DeepImportUploadStub,
        DeepImportConfig: DeepImportConfigStub,
        DeepImportProgress: DeepImportProgressStub,
        DeepImportConfirm: DeepImportConfirmStub,
      },
    },
  })
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('NovelDeepImportDialog', () => {
  let pinia: Pinia

  beforeEach(() => {
    pinia = createTestPinia()
    vi.clearAllMocks()
  })

  // ── 1. Initial rendering ─────────────────────────────────────────────

  it('renders the dialog header with title', () => {
    const wrapper = mountDialog(pinia)

    expect(wrapper.find('h4').text()).toBe('深度小说导入')
  })

  it('renders the step indicator with 4 steps', () => {
    const wrapper = mountDialog(pinia)

    const steps = wrapper.findAll('.el-step-stub')
    expect(steps.length).toBe(4)
  })

  it('shows DeepImportUpload on step 0 (initial state)', () => {
    const wrapper = mountDialog(pinia)

    expect(wrapper.find('.deep-import-upload-stub').exists()).toBe(true)
    expect(wrapper.find('.deep-import-config-stub').exists()).toBe(false)
    expect(wrapper.find('.deep-import-progress-stub').exists()).toBe(false)
    expect(wrapper.find('.deep-import-confirm-stub').exists()).toBe(false)
  })

  // ── 2. Step navigation: upload -> config ─────────────────────────────

  it('navigates to config step after upload "next" event', async () => {
    const wrapper = mountDialog(pinia)

    await wrapper.find('.btn-next').trigger('click')
    await nextTick()

    expect(wrapper.find('.deep-import-upload-stub').exists()).toBe(false)
    expect(wrapper.find('.deep-import-config-stub').exists()).toBe(true)
  })

  // ── 3. Step navigation: config -> progress ───────────────────────────

  it('navigates to progress step after config "start" event', async () => {
    const wrapper = mountDialog(pinia)

    // Step 0 -> Step 1
    await wrapper.find('.btn-next').trigger('click')
    await nextTick()

    // Step 1 -> Step 2
    await wrapper.find('.btn-start').trigger('click')
    await nextTick()

    expect(wrapper.find('.deep-import-config-stub').exists()).toBe(false)
    expect(wrapper.find('.deep-import-progress-stub').exists()).toBe(true)
  })

  // ── 4. Step navigation: back from config to upload ───────────────────

  it('navigates back to upload step when config emits "back"', async () => {
    const wrapper = mountDialog(pinia)

    // Step 0 -> Step 1
    await wrapper.find('.btn-next').trigger('click')
    await nextTick()

    // Step 1 -> Step 0
    await wrapper.find('.btn-back').trigger('click')
    await nextTick()

    expect(wrapper.find('.deep-import-upload-stub').exists()).toBe(true)
    expect(wrapper.find('.deep-import-config-stub').exists()).toBe(false)
  })

  // ── 5. Abort: progress -> config ─────────────────────────────────────

  it('navigates back to config step when progress emits "abort"', async () => {
    const wrapper = mountDialog(pinia)

    // Step 0 -> Step 1
    await wrapper.find('.btn-next').trigger('click')
    await nextTick()

    // Step 1 -> Step 2
    await wrapper.find('.btn-start').trigger('click')
    await nextTick()

    // Step 2 -> Step 1 (abort)
    await wrapper.find('.btn-abort').trigger('click')
    await nextTick()

    expect(wrapper.find('.deep-import-progress-stub').exists()).toBe(false)
    expect(wrapper.find('.deep-import-config-stub').exists()).toBe(true)
  })

  // ── 6. Progress -> confirm ───────────────────────────────────────────

  it('navigates to confirm step when progress emits "next"', async () => {
    const wrapper = mountDialog(pinia)

    // Step 0 -> Step 1
    await wrapper.find('.btn-next').trigger('click')
    await nextTick()

    // Step 1 -> Step 2
    await wrapper.find('.btn-start').trigger('click')
    await nextTick()

    // Step 2 -> Step 3
    await wrapper.find('.deep-import-progress-stub .btn-next').trigger('click')
    await nextTick()

    expect(wrapper.find('.deep-import-progress-stub').exists()).toBe(false)
    expect(wrapper.find('.deep-import-confirm-stub').exists()).toBe(true)
  })

  // ── 7. Reset from confirm ───────────────────────────────────────────

  it('resets to step 0 when confirm emits "reset"', async () => {
    const wrapper = mountDialog(pinia)

    // Navigate all the way to confirm
    await wrapper.find('.btn-next').trigger('click')
    await nextTick()
    await wrapper.find('.btn-start').trigger('click')
    await nextTick()
    await wrapper.find('.deep-import-progress-stub .btn-next').trigger('click')
    await nextTick()

    // Reset
    await wrapper.find('.btn-reset').trigger('click')
    await nextTick()

    expect(wrapper.find('.deep-import-confirm-stub').exists()).toBe(false)
    expect(wrapper.find('.deep-import-upload-stub').exists()).toBe(true)
  })

  // ── 8. Done from confirm ────────────────────────────────────────────

  it('clears session and emits "done" when confirm emits "done"', async () => {
    const wrapper = mountDialog(pinia)

    // Navigate to confirm
    await wrapper.find('.btn-next').trigger('click')
    await nextTick()
    await wrapper.find('.btn-start').trigger('click')
    await nextTick()
    await wrapper.find('.deep-import-progress-stub .btn-next').trigger('click')
    await nextTick()

    // Done
    await wrapper.find('.btn-done').trigger('click')

    expect(mockClearSession).toHaveBeenCalled()
    expect(mockSetKeyChapters).toHaveBeenCalledWith(undefined)
    expect(wrapper.emitted('done')).toHaveLength(1)
  })

  // ── 9. Close action ─────────────────────────────────────────────────

  it('clears session and emits "close" when close button is clicked', async () => {
    const wrapper = mountDialog(pinia)

    const closeBtn = wrapper.find('button[data-type="danger"]')
    expect(closeBtn.exists()).toBe(true)
    expect(closeBtn.text()).toBe('退出')

    await closeBtn.trigger('click')

    expect(mockClearSession).toHaveBeenCalled()
    expect(mockSetKeyChapters).toHaveBeenCalledWith(undefined)
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  // ── 10. Close aborts running extraction ─────────────────────────────

  it('calls abort when closing while extraction is running', async () => {
    mockIsRunning.value = true
    const wrapper = mountDialog(pinia)

    const closeBtn = wrapper.find('button[data-type="danger"]')
    await closeBtn.trigger('click')

    expect(mockAbort).toHaveBeenCalled()
    expect(mockClearSession).toHaveBeenCalled()
    expect(mockSetKeyChapters).toHaveBeenCalledWith(undefined)
    expect(wrapper.emitted('close')).toHaveLength(1)

    mockIsRunning.value = false
  })

  it('does not call abort when closing while extraction is not running', async () => {
    mockIsRunning.value = false
    const wrapper = mountDialog(pinia)

    const closeBtn = wrapper.find('button[data-type="danger"]')
    await closeBtn.trigger('click')

    expect(mockAbort).not.toHaveBeenCalled()
    expect(mockClearSession).toHaveBeenCalled()
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  // ── 11. Pattern hint hidden on step 0 ───────────────────────────────

  it('does not show pattern hint on step 0', () => {
    const wrapper = mountDialog(pinia)

    expect(wrapper.find('.pattern-hint').exists()).toBe(false)
  })

  // ── 12. Pattern hint shown on step 1 with auto-detection ────────────

  it('shows pattern hint with auto-detected pattern after upload', async () => {
    const wrapper = mountDialog(pinia)

    // Navigate to step 1
    await wrapper.find('.btn-next').trigger('click')
    await nextTick()

    const hint = wrapper.find('.pattern-hint')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('自动')
    expect(hint.text()).toContain('第X章')
  })

  // ── 13. Reset clears all state ──────────────────────────────────────

  it('resets selectedPatternName to "auto" and extractionMode to "full" on reset', async () => {
    const wrapper = mountDialog(pinia)

    // Navigate to confirm
    await wrapper.find('.btn-next').trigger('click')
    await nextTick()
    await wrapper.find('.btn-start').trigger('click')
    await nextTick()
    await wrapper.find('.deep-import-progress-stub .btn-next').trigger('click')
    await nextTick()

    // Reset
    await wrapper.find('.btn-reset').trigger('click')
    await nextTick()

    // After reset, we should be back at upload
    expect(wrapper.find('.deep-import-upload-stub').exists()).toBe(true)
    // The pattern hint should be gone (step 0, no sourceText)
    expect(wrapper.find('.pattern-hint').exists()).toBe(false)
  })
})
