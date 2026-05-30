import { describe, it, expect, beforeEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { createTestPinia } from '@/test/helpers'
import { defineComponent, h } from 'vue'
import ChapterBatchActions from './ChapterBatchActions.vue'

// ---------------------------------------------------------------------------
// Element Plus stubs – auto-import is disabled during tests, so we provide
// lightweight renderless stubs that preserve slots and pass through attrs.
// ---------------------------------------------------------------------------
const StubPassSlots = defineComponent({
  inheritAttrs: false,
  setup(_, { slots, attrs }) {
    const tag = (attrs as Record<string, unknown>)['data-stub-tag'] || 'div'
    return () =>
      h(
        tag as string,
        { class: attrs.class || '', ...attrs },
        slots.default?.(),
      )
  },
})

/** el-button stub: renders a <button> so click events and classes work */
const ElButtonStub = defineComponent({
  props: {
    type: { type: String, default: '' },
    loading: { type: Boolean, default: false },
  },
  inheritAttrs: false,
  setup(props, { slots, attrs }) {
    return () => {
      const classes: string[] = ['el-button']
      if (props.type) classes.push(`el-button--${props.type}`)
      if (props.loading) classes.push('is-loading')
      return h('button', { class: classes.join(' '), ...attrs }, slots.default?.())
    }
  },
})

/** el-dropdown stub: renders trigger + dropdown content, delegates item clicks as command events */
const ElDropdownStub = defineComponent({
  inheritAttrs: false,
  emits: ['command'],
  setup(_, { slots, emit }) {
    function onClick(e: Event) {
      const target = e.target as HTMLElement | null
      // Walk up to find the closest dropdown-item (li with command attr)
      const item = target?.closest<HTMLElement>('.el-dropdown-menu__item[command]')
      if (item) {
        emit('command', item.getAttribute('command'))
      }
    }
    return () =>
      h('div', { class: 'el-dropdown', onClick }, [
        slots.default?.(),
        slots.dropdown?.(),
      ])
  },
})

/** el-dropdown-menu stub: renders a <ul> for querying menu items */
const ElDropdownMenuStub = defineComponent({
  inheritAttrs: false,
  setup(_, { slots }) {
    return () => h('ul', { class: 'el-dropdown-menu' }, slots.default?.())
  },
})

/** el-dropdown-item stub: renders an <li> with the command attribute */
const ElDropdownItemStub = defineComponent({
  props: {
    command: { type: String, default: '' },
    divided: { type: Boolean, default: false },
  },
  inheritAttrs: false,
  setup(props, { slots }) {
    const classes = ['el-dropdown-menu__item']
    if (props.divided) classes.push('is-divided')
    return () =>
      h('li', { class: classes.join(' '), command: props.command }, slots.default?.())
  },
})

const stubs = {
  ElCard: StubPassSlots,
  ElButton: ElButtonStub,
  ElIcon: StubPassSlots,
  ElDropdown: ElDropdownStub,
  ElDropdownMenu: ElDropdownMenuStub,
  ElDropdownItem: ElDropdownItemStub,
}

// ---------------------------------------------------------------------------
// Mount helper
// ---------------------------------------------------------------------------
function mountActions(propsOverrides: Record<string, unknown> = {}): VueWrapper {
  const defaultProps = {
    validating: false,
  }

  return mount(ChapterBatchActions, {
    props: { ...defaultProps, ...propsOverrides },
    global: {
      plugins: [createTestPinia()],
      stubs,
    },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ChapterBatchActions', () => {
  beforeEach(() => {
    createTestPinia()
  })

  // -- Title rendering --------------------------------------------------------

  it('renders the chapter management heading', () => {
    const wrapper = mountActions()

    const heading = wrapper.find('h2')
    expect(heading.exists()).toBe(true)
    expect(heading.text()).toBe('章节管理')
  })

  // -- Action button rendering ------------------------------------------------

  it('renders all seven action buttons', () => {
    const wrapper = mountActions()

    const buttons = wrapper.findAll('button')
    const labels = buttons.map((b) => b.text())

    expect(labels.some((t) => t.includes('验证章节'))).toBe(true)
    expect(labels.some((t) => t.includes('导出'))).toBe(true)
    expect(labels.some((t) => t.includes('批量生成'))).toBe(true)
    expect(labels.some((t) => t.includes('一键续写'))).toBe(true)
    expect(labels.some((t) => t.trim() === '续写')).toBe(true)
    expect(labels.some((t) => t.includes('改写'))).toBe(true)
    expect(labels.some((t) => t.includes('新建章节'))).toBe(true)
  })

  // -- Event: validate --------------------------------------------------------

  it('emits validate when the validate button is clicked', async () => {
    const wrapper = mountActions()

    const validateBtn = wrapper.findAll('button').find((b) => b.text().includes('验证章节'))
    expect(validateBtn).toBeTruthy()

    await validateBtn!.trigger('click')

    expect(wrapper.emitted('validate')).toBeTruthy()
    expect(wrapper.emitted('validate')!.length).toBe(1)
  })

  // -- Event: batchGenerate ---------------------------------------------------

  it('emits batchGenerate when the batch generate button is clicked', async () => {
    const wrapper = mountActions()

    const batchBtn = wrapper.findAll('button').find((b) => b.text().includes('批量生成'))
    expect(batchBtn).toBeTruthy()

    await batchBtn!.trigger('click')

    expect(wrapper.emitted('batchGenerate')).toBeTruthy()
    expect(wrapper.emitted('batchGenerate')!.length).toBe(1)
  })

  // -- Event: writeNext -------------------------------------------------------

  it('emits writeNext when the one-click continuation button is clicked', async () => {
    const wrapper = mountActions()

    const writeNextBtn = wrapper.findAll('button').find((b) => b.text().includes('一键续写'))
    expect(writeNextBtn).toBeTruthy()

    await writeNextBtn!.trigger('click')

    expect(wrapper.emitted('writeNext')).toBeTruthy()
    expect(wrapper.emitted('writeNext')!.length).toBe(1)
  })

  // -- Event: continuation ----------------------------------------------------

  it('emits continuation when the continuation button is clicked', async () => {
    const wrapper = mountActions()

    const continuationBtn = wrapper.findAll('button').find((b) => b.text().trim() === '续写')
    expect(continuationBtn).toBeTruthy()

    await continuationBtn!.trigger('click')

    expect(wrapper.emitted('continuation')).toBeTruthy()
    expect(wrapper.emitted('continuation')!.length).toBe(1)
  })

  // -- Event: rewrite ---------------------------------------------------------

  it('emits rewrite when the rewrite button is clicked', async () => {
    const wrapper = mountActions()

    const rewriteBtn = wrapper.findAll('button').find((b) => b.text().includes('改写'))
    expect(rewriteBtn).toBeTruthy()

    await rewriteBtn!.trigger('click')

    expect(wrapper.emitted('rewrite')).toBeTruthy()
    expect(wrapper.emitted('rewrite')!.length).toBe(1)
  })

  // -- Event: addChapter ------------------------------------------------------

  it('emits addChapter when the new chapter button is clicked', async () => {
    const wrapper = mountActions()

    const addBtn = wrapper.findAll('button').find((b) => b.text().includes('新建章节'))
    expect(addBtn).toBeTruthy()

    await addBtn!.trigger('click')

    expect(wrapper.emitted('addChapter')).toBeTruthy()
    expect(wrapper.emitted('addChapter')!.length).toBe(1)
  })

  // -- Export dropdown --------------------------------------------------------

  it('renders export dropdown menu items', () => {
    const wrapper = mountActions()

    const dropdownItems = wrapper.findAll('.el-dropdown-menu__item')
    const commands = dropdownItems.map((item) => item.attributes('command'))

    expect(commands).toContain('exportAllMarkdown')
    expect(commands).toContain('exportAllPdf')
    expect(commands).toContain('exportAllDocx')
    expect(commands).toContain('exportAllTxt')
    expect(commands).toContain('exportAllEpub')
    expect(commands).toContain('exportAllJson')
    expect(commands).toContain('exportSettings')
  })

  it('emits exportCommand with the correct format when a dropdown item is clicked', async () => {
    const wrapper = mountActions()

    const dropdownItems = wrapper.findAll('.el-dropdown-menu__item')
    const mdItem = dropdownItems.find(
      (item) => item.attributes('command') === 'exportAllMarkdown',
    )
    expect(mdItem).toBeTruthy()

    await mdItem!.trigger('click')

    expect(wrapper.emitted('exportCommand')).toBeTruthy()
    expect(wrapper.emitted('exportCommand')![0]).toEqual(['exportAllMarkdown'])
  })

  // -- validating prop: loading state -----------------------------------------

  it('applies loading class to validate button when validating is true', () => {
    const wrapper = mountActions({ validating: true })

    const validateBtn = wrapper.findAll('button').find((b) => b.text().includes('验证章节'))
    expect(validateBtn).toBeTruthy()
    expect(validateBtn!.classes()).toContain('is-loading')
  })

  it('does not apply loading class to validate button when validating is false', () => {
    const wrapper = mountActions({ validating: false })

    const validateBtn = wrapper.findAll('button').find((b) => b.text().includes('验证章节'))
    expect(validateBtn).toBeTruthy()
    expect(validateBtn!.classes()).not.toContain('is-loading')
  })

  // -- Export settings divider ------------------------------------------------

  it('renders a divider on the export settings item', () => {
    const wrapper = mountActions()

    const settingsItem = wrapper
      .findAll('.el-dropdown-menu__item')
      .find((item) => item.attributes('command') === 'exportSettings')

    expect(settingsItem).toBeTruthy()
    expect(settingsItem!.classes()).toContain('is-divided')
  })
})
