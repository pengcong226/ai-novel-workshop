import { describe, it, expect, beforeEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { createTestPinia } from '@/test/helpers'
import ChapterBatchActions from './ChapterBatchActions.vue'

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

  it('renders all action buttons', () => {
    const wrapper = mountActions()

    const buttons = wrapper.findAll('button')
    // Verify each expected label appears among the button texts
    const labels = buttons.map((b) => b.text())
    expect(labels.some((t) => t.includes('验证章节'))).toBe(true)
    expect(labels.some((t) => t.includes('导出'))).toBe(true)
    expect(labels.some((t) => t.includes('批量生成'))).toBe(true)
    expect(labels.some((t) => t.includes('一键续写'))).toBe(true)
    expect(labels.some((t) => t.includes('续写'))).toBe(true)
    expect(labels.some((t) => t.includes('改写'))).toBe(true)
    expect(labels.some((t) => t.includes('新建章节'))).toBe(true)
  })

  // -- Event: validate --------------------------------------------------------

  it('emits validate when the validate button is clicked', async () => {
    const wrapper = mountActions()

    const buttons = wrapper.findAll('button')
    const validateBtn = buttons.find((b) => b.text().includes('验证章节'))
    expect(validateBtn).toBeTruthy()

    await validateBtn!.trigger('click')

    expect(wrapper.emitted('validate')).toBeTruthy()
    expect(wrapper.emitted('validate')!.length).toBe(1)
  })

  // -- Event: batchGenerate ---------------------------------------------------

  it('emits batchGenerate when the batch generate button is clicked', async () => {
    const wrapper = mountActions()

    const buttons = wrapper.findAll('button')
    const batchBtn = buttons.find((b) => b.text().includes('批量生成'))
    expect(batchBtn).toBeTruthy()

    await batchBtn!.trigger('click')

    expect(wrapper.emitted('batchGenerate')).toBeTruthy()
    expect(wrapper.emitted('batchGenerate')!.length).toBe(1)
  })

  // -- Event: writeNext -------------------------------------------------------

  it('emits writeNext when the one-click continuation button is clicked', async () => {
    const wrapper = mountActions()

    const buttons = wrapper.findAll('button')
    const writeNextBtn = buttons.find((b) => b.text().includes('一键续写'))
    expect(writeNextBtn).toBeTruthy()

    await writeNextBtn!.trigger('click')

    expect(wrapper.emitted('writeNext')).toBeTruthy()
    expect(wrapper.emitted('writeNext')!.length).toBe(1)
  })

  // -- Event: continuation ----------------------------------------------------

  it('emits continuation when the continuation button is clicked', async () => {
    const wrapper = mountActions()

    const buttons = wrapper.findAll('button')
    const continuationBtn = buttons.find((b) => b.text().trim() === '续写')
    expect(continuationBtn).toBeTruthy()

    await continuationBtn!.trigger('click')

    expect(wrapper.emitted('continuation')).toBeTruthy()
    expect(wrapper.emitted('continuation')!.length).toBe(1)
  })

  // -- Event: rewrite ---------------------------------------------------------

  it('emits rewrite when the rewrite button is clicked', async () => {
    const wrapper = mountActions()

    const buttons = wrapper.findAll('button')
    const rewriteBtn = buttons.find((b) => b.text().includes('改写'))
    expect(rewriteBtn).toBeTruthy()

    await rewriteBtn!.trigger('click')

    expect(wrapper.emitted('rewrite')).toBeTruthy()
    expect(wrapper.emitted('rewrite')!.length).toBe(1)
  })

  // -- Event: addChapter ------------------------------------------------------

  it('emits addChapter when the new chapter button is clicked', async () => {
    const wrapper = mountActions()

    const buttons = wrapper.findAll('button')
    const addBtn = buttons.find((b) => b.text().includes('新建章节'))
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

  it('emits exportCommand with the correct format when dropdown item is clicked', async () => {
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

  // -- validating prop --------------------------------------------------------

  it('passes the validating prop to the validate button loading state', () => {
    const wrapper = mountActions({ validating: true })

    // el-button renders an aria-busy attribute or a loading class when loading is true
    const buttons = wrapper.findAll('button')
    const validateBtn = buttons.find((b) => b.text().includes('验证章节'))
    expect(validateBtn).toBeTruthy()

    // When validating=true the button should have the is-loading class (Element Plus)
    expect(validateBtn!.classes()).toContain('is-loading')
  })

  it('does not apply loading state to validate button when validating is false', () => {
    const wrapper = mountActions({ validating: false })

    const buttons = wrapper.findAll('button')
    const validateBtn = buttons.find((b) => b.text().includes('验证章节'))
    expect(validateBtn).toBeTruthy()

    expect(validateBtn!.classes()).not.toContain('is-loading')
  })

  // -- Export settings divider ------------------------------------------------

  it('renders a divider before the export settings item', () => {
    const wrapper = mountActions()

    const dropdownItems = wrapper.findAll('.el-dropdown-menu__item')
    const settingsItem = dropdownItems.find(
      (item) => item.attributes('command') === 'exportSettings',
    )
    expect(settingsItem).toBeTruthy()

    // The "divided" attribute produces a divider class on the item
    expect(settingsItem!.classes()).toContain('is-divided')
  })
})
