import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestPinia } from '@/test/helpers'
import type { Pinia } from 'pinia'

// ---- Stub element-plus components ----

const EP_STUBS = {
  ElCard: {
    name: 'ElCard',
    template: '<div class="el-card-stub"><div class="el-card__header"><slot name="header" /></div><div class="el-card__body"><slot /></div></div>',
  },
  ElTag: {
    name: 'ElTag',
    props: ['effect', 'type', 'round'],
    template: '<span class="el-tag-stub"><slot /></span>',
  },
  ElRow: {
    name: 'ElRow',
    props: ['gutter'],
    template: '<div class="el-row-stub"><slot /></div>',
  },
  ElCol: {
    name: 'ElCol',
    props: ['span'],
    template: '<div class="el-col-stub"><slot /></div>',
  },
  ElSlider: {
    name: 'ElSlider',
    props: ['modelValue', 'min', 'max', 'step', 'marks', 'showStops', 'formatTooltip'],
    emits: ['update:modelValue', 'change'],
    template: '<input type="range" class="el-slider-stub" :min="min" :max="max" :step="step" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" />',
  },
  ElRadioGroup: {
    name: 'ElRadioGroup',
    props: ['modelValue', 'size'],
    emits: ['update:modelValue', 'change'],
    template: '<div class="el-radio-group-stub"><slot /></div>',
  },
  ElRadioButton: {
    name: 'ElRadioButton',
    props: ['value'],
    emits: ['click'],
    template: '<button class="el-radio-button-stub" :data-value="value" @click="$emit(\'click\')"><slot /></button>',
  },
  ElSwitch: {
    name: 'ElSwitch',
    props: ['modelValue', 'inlinePrompt', 'activeText', 'inactiveText'],
    emits: ['update:modelValue', 'change'],
    template: '<input type="checkbox" class="el-switch-stub" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
  },
  ElDivider: {
    name: 'ElDivider',
    props: ['borderStyle'],
    template: '<hr class="el-divider-stub" />',
  },
  ElAlert: {
    name: 'ElAlert',
    props: ['title', 'type', 'showIcon', 'closable'],
    template: '<div class="el-alert-stub"><span class="el-alert__title">{{ title }}</span></div>',
  },
}

// ---- Import SUT after stubs are defined ----
import StorytellerPanel from '@/components/config/StorytellerPanel.vue'

// ---- Helpers ----

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    preset: 'standard',
    planningDepth: 'medium',
    enableQualityCheck: true,
    ...overrides,
  }
}

function makeAdvanced(overrides: Record<string, unknown> = {}) {
  return {
    temperature: 0.8,
    targetWordCount: 2000,
    ...overrides,
  }
}

let pinia: Pinia

function mountPanel(
  configOverrides: Record<string, unknown> = {},
  advancedOverrides: Record<string, unknown> = {},
) {
  pinia = createTestPinia()

  const config = makeConfig(configOverrides)
  const advanced = makeAdvanced(advancedOverrides)

  const wrapper = mount(StorytellerPanel, {
    props: { config, advanced },
    global: {
      plugins: [pinia],
      stubs: EP_STUBS,
    },
  })

  return { wrapper, config, advanced }
}

// ---- Tests ----

describe('StorytellerPanel.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  // 1. Root container renders
  it('renders the storyteller-dashboard root container', () => {
    const { wrapper } = mountPanel()
    expect(wrapper.find('.storyteller-dashboard').exists()).toBe(true)
  })

  // 2. Header title and beginner-mode tag
  it('displays the header title and beginner-mode tag', () => {
    const { wrapper } = mountPanel()
    const header = wrapper.find('.card-header')
    expect(header.exists()).toBe(true)
    expect(header.find('.header-title').text()).toContain('创作偏好指南针')
    expect(header.find('.el-tag-stub').text()).toContain('无需懂模型，专注创作')
  })

  // 3. Temperature slider rendered with marks
  it('renders the temperature slider with correct min/max', () => {
    const { wrapper } = mountPanel()
    const sliders = wrapper.findAll('.el-slider-stub')
    expect(sliders.length).toBeGreaterThanOrEqual(2)

    // First slider is temperature (min=0, max=100)
    const tempSlider = sliders[0]
    expect(tempSlider.attributes('min')).toBe('0')
    expect(tempSlider.attributes('max')).toBe('100')
  })

  // 4. Planning depth radio group with three options
  it('renders planning depth radio buttons for light, medium, and deep', () => {
    const { wrapper } = mountPanel()
    const radioButtons = wrapper.findAll('.el-radio-button-stub')
    expect(radioButtons.length).toBe(3)

    const values = radioButtons.map((b) => b.attributes('data-value'))
    expect(values).toContain('light')
    expect(values).toContain('medium')
    expect(values).toContain('deep')

    // Check Chinese labels
    const texts = radioButtons.map((b) => b.text())
    expect(texts).toContain('轻快直白')
    expect(texts).toContain('均衡标准')
    expect(texts).toContain('深渊网状')
  })

  // 5. Target words slider rendered with correct range
  it('renders the target words slider with min=500, max=5000, step=500', () => {
    const { wrapper } = mountPanel()
    const sliders = wrapper.findAll('.el-slider-stub')
    // Second slider is target words
    const wordsSlider = sliders[1]
    expect(wordsSlider.attributes('min')).toBe('500')
    expect(wordsSlider.attributes('max')).toBe('5000')
    expect(wordsSlider.attributes('step')).toBe('500')
  })

  // 6. Quality check toggle rendered
  it('renders the quality check switch', () => {
    const { wrapper } = mountPanel()
    const switches = wrapper.findAll('.el-switch-stub')
    expect(switches.length).toBe(1)
  })

  // 7. Info alert is displayed
  it('displays the geek tip alert with auto-managed message', () => {
    const { wrapper } = mountPanel()
    const alert = wrapper.find('.el-alert-stub')
    expect(alert.exists()).toBe(true)
    expect(alert.find('.el-alert__title').text()).toContain('极客提示')
    expect(alert.find('.el-alert__title').text()).toContain('系统自动接管')
  })

  // 8. Temperature proxy get - maps temperature to 0-100 slider value
  it('maps advanced.temperature 0.8 to slider value 40', () => {
    const { wrapper } = mountPanel({}, { temperature: 0.8 })
    const vm = wrapper.vm as any
    expect(vm.temperatureProxy).toBe(40)
  })

  // 9. Temperature proxy get - falsy temperature falls back to 0.8 default
  it('falls back to 0.8 (slider 40) when temperature is 0 (falsy)', () => {
    const { wrapper } = mountPanel({}, { temperature: 0 })
    const vm = wrapper.vm as any
    // Component uses `|| 0.8`, so 0 is falsy and defaults to 0.8 -> 40
    expect(vm.temperatureProxy).toBe(40)
  })

  // 9b. Temperature proxy get - minimum positive temperature
  it('maps advanced.temperature 0.02 to slider value 1', () => {
    const { wrapper } = mountPanel({}, { temperature: 0.02 })
    const vm = wrapper.vm as any
    expect(vm.temperatureProxy).toBe(1)
  })

  // 10. Temperature proxy get - max value
  it('maps advanced.temperature 2.0 to slider value 100', () => {
    const { wrapper } = mountPanel({}, { temperature: 2.0 })
    const vm = wrapper.vm as any
    expect(vm.temperatureProxy).toBe(100)
  })

  // 11. Temperature proxy set - emits update:advanced with mapped temperature
  it('emits update:advanced with correct temperature when slider changes', async () => {
    const { wrapper } = mountPanel({}, { temperature: 0.8 })
    const vm = wrapper.vm as any

    // Setting proxy to 60 should emit temperature = 60 / 50 = 1.2
    vm.temperatureProxy = 60

    const emitted = wrapper.emitted('update:advanced')
    expect(emitted).toBeTruthy()
    expect(emitted!.length).toBe(1)
    expect(emitted![0][0]).toMatchObject({ temperature: 1.2 })
  })

  // 12. Planning proxy defaults to 'medium' when config has no planningDepth
  it('defaults planningProxy to medium when planningDepth is undefined', () => {
    const { wrapper } = mountPanel({ planningDepth: undefined })
    const vm = wrapper.vm as any
    expect(vm.planningProxy).toBe('medium')
  })

  // 13. Planning proxy set - emits update:config with planningDepth
  it('emits update:config with planningDepth when radio changes', async () => {
    const { wrapper } = mountPanel({ planningDepth: 'medium' })
    const vm = wrapper.vm as any

    vm.planningProxy = 'deep'

    const emitted = wrapper.emitted('update:config')
    expect(emitted).toBeTruthy()
    expect(emitted!.length).toBe(1)
    expect(emitted![0][0]).toMatchObject({ planningDepth: 'deep' })
  })

  // 14. Target words proxy defaults to 2000
  it('defaults targetWordsProxy to 2000 when targetWordCount is undefined', () => {
    const { wrapper } = mountPanel({}, { targetWordCount: undefined })
    const vm = wrapper.vm as any
    expect(vm.targetWordsProxy).toBe(2000)
  })

  // 15. Target words proxy set - emits update:advanced
  it('emits update:advanced with targetWordCount when slider changes', async () => {
    const { wrapper } = mountPanel({}, { targetWordCount: 2000 })
    const vm = wrapper.vm as any

    vm.targetWordsProxy = 3500

    const emitted = wrapper.emitted('update:advanced')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toMatchObject({ targetWordCount: 3500 })
  })

  // 16. Quality proxy defaults to true when enableQualityCheck is undefined
  it('defaults qualityProxy to true when enableQualityCheck is undefined', () => {
    const { wrapper } = mountPanel({ enableQualityCheck: undefined })
    const vm = wrapper.vm as any
    expect(vm.qualityProxy).toBe(true)
  })

  // 17. Quality proxy defaults to true when enableQualityCheck is explicitly true
  it('qualityProxy is true when enableQualityCheck is true', () => {
    const { wrapper } = mountPanel({ enableQualityCheck: true })
    const vm = wrapper.vm as any
    expect(vm.qualityProxy).toBe(true)
  })

  // 18. Quality proxy defaults to false when enableQualityCheck is false
  it('qualityProxy is false when enableQualityCheck is false', () => {
    const { wrapper } = mountPanel({ enableQualityCheck: false })
    const vm = wrapper.vm as any
    expect(vm.qualityProxy).toBe(false)
  })

  // 19. Quality proxy set - emits update:config with enableQualityCheck
  it('emits update:config with enableQualityCheck when toggle changes', async () => {
    const { wrapper } = mountPanel({ enableQualityCheck: true })
    const vm = wrapper.vm as any

    vm.qualityProxy = false

    const emitted = wrapper.emitted('update:config')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toMatchObject({ enableQualityCheck: false })
  })

  // 20. Setting block labels are present
  it('displays all four setting block labels', () => {
    const { wrapper } = mountPanel()
    const text = wrapper.text()
    expect(text).toContain('文笔与想象力释放')
    expect(text).toContain('大纲推演深度')
    expect(text).toContain('单章字数预期')
    expect(text).toContain('逻辑严谨度保护')
  })

  // 21. Setting block descriptions are present
  it('displays setting block descriptions', () => {
    const { wrapper } = mountPanel()
    const text = wrapper.text()
    expect(text).toContain('Temperature')
    expect(text).toContain('发散层级')
    expect(text).toContain('目标引导')
    expect(text).toContain('严格程度')
  })

  // 22. Config prop preserves existing fields on emit
  it('preserves existing config fields when emitting update:config', async () => {
    const extraConfig = { plannerModel: 'custom-model', writerModel: 'writer-v2' }
    const { wrapper } = mountPanel(extraConfig)
    const vm = wrapper.vm as any

    vm.planningProxy = 'deep'

    const emitted = wrapper.emitted('update:config')
    expect(emitted![0][0]).toMatchObject({
      ...extraConfig,
      planningDepth: 'deep',
    })
  })

  // 23. Advanced prop preserves existing fields on emit
  it('preserves existing advanced fields when emitting update:advanced', async () => {
    const extraAdvanced = { writingDepth: 'detailed', maxTokens: 8192 }
    const { wrapper } = mountPanel({}, extraAdvanced)
    const vm = wrapper.vm as any

    vm.temperatureProxy = 50

    const emitted = wrapper.emitted('update:advanced')
    expect(emitted![0][0]).toMatchObject({
      ...extraAdvanced,
      temperature: 1.0,
    })
  })
})
