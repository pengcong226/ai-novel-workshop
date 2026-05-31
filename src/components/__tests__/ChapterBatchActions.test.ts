import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestPinia } from '@/test/helpers'
import ChapterBatchActions from '@/components/ChapterBatchActions.vue'

// ---------------------------------------------------------------------------
// Element Plus stubs
// ---------------------------------------------------------------------------

const ElCardStub = {
  name: 'ElCard',
  template: '<div class="stub-card"><slot /></div>',
}
const ElButtonStub = {
  name: 'ElButton',
  props: ['type', 'loading'],
  emits: ['click'],
  template: '<button class="stub-button" :data-loading="loading" @click="$emit(\'click\')"><slot /></button>',
}
const ElDropdownStub = {
  name: 'ElDropdown',
  emits: ['command'],
  methods: {
    /** Triggered by test code to simulate a dropdown-item click. */
    triggerCommand(this: any, cmd: string) {
      this.$emit('command', cmd)
    },
  },
  template: `<div class="stub-dropdown"
    @click.capture="(e) => {
      const target = e.target;
      const cmd = target && (target.getAttribute && target.getAttribute('data-command') || (target.closest && target.closest('[data-command]') && target.closest('[data-command]').getAttribute('data-command')));
      if (cmd) $emit('command', cmd);
    }"
  ><slot /><slot name="dropdown" /></div>`,
}
const ElDropdownMenuStub = {
  name: 'ElDropdownMenu',
  template: '<div class="stub-dropdown-menu"><slot /></div>',
}
const ElDropdownItemStub = {
  name: 'ElDropdownItem',
  props: ['command', 'divided'],
  template: '<div class="stub-dropdown-item" :data-command="command" :data-divided="divided"><slot /></div>',
}
const ElIconStub = {
  name: 'ElIcon',
  template: '<span class="stub-icon"><slot /></span>',
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function mountBatchActions(validating = false) {
  return mount(ChapterBatchActions, {
    props: { validating },
    global: {
      stubs: {
        ElCard: ElCardStub,
        ElButton: ElButtonStub,
        ElDropdown: ElDropdownStub,
        ElDropdownMenu: ElDropdownMenuStub,
        ElDropdownItem: ElDropdownItemStub,
        ElIcon: ElIconStub,
      },
    },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChapterBatchActions', () => {
  beforeEach(() => {
    createTestPinia()
    vi.clearAllMocks()
  })

  // ---- Rendering ----

  it('renders the header card with title "章节管理"', () => {
    const wrapper = mountBatchActions()

    expect(wrapper.find('.stub-card').exists()).toBe(true)
    expect(wrapper.text()).toContain('章节管理')
  })

  it('renders an h2 heading with correct text', () => {
    const wrapper = mountBatchActions()

    const h2 = wrapper.find('h2')
    expect(h2.exists()).toBe(true)
    expect(h2.text()).toBe('章节管理')
  })

  it('renders all action buttons', () => {
    const wrapper = mountBatchActions()

    const buttons = wrapper.findAll('.stub-button')
    const buttonTexts = buttons.map((b) => b.text().trim())

    // Validate, export, batch generate, one-click write, continuation, rewrite, add chapter
    expect(buttonTexts.some((t) => t.includes('验证章节'))).toBe(true)
    expect(buttonTexts.some((t) => t.includes('导出'))).toBe(true)
    expect(buttonTexts.some((t) => t.includes('批量生成'))).toBe(true)
    expect(buttonTexts.some((t) => t.includes('一键续写'))).toBe(true)
    expect(buttonTexts.some((t) => t.includes('续写'))).toBe(true)
    expect(buttonTexts.some((t) => t.includes('改写'))).toBe(true)
    expect(buttonTexts.some((t) => t.includes('新建章节'))).toBe(true)
  })

  // ---- Button event emissions ----

  it('emits validate event when validate button is clicked', async () => {
    const wrapper = mountBatchActions()

    const buttons = wrapper.findAll('.stub-button')
    const validateBtn = buttons.find((b) => b.text().includes('验证章节'))
    expect(validateBtn).toBeDefined()

    await validateBtn!.trigger('click')
    expect(wrapper.emitted('validate')).toHaveLength(1)
  })

  it('emits batchGenerate event when batch generate button is clicked', async () => {
    const wrapper = mountBatchActions()

    const buttons = wrapper.findAll('.stub-button')
    const batchBtn = buttons.find((b) => b.text().includes('批量生成'))
    expect(batchBtn).toBeDefined()

    await batchBtn!.trigger('click')
    expect(wrapper.emitted('batchGenerate')).toHaveLength(1)
  })

  it('emits writeNext event when one-click write button is clicked', async () => {
    const wrapper = mountBatchActions()

    const buttons = wrapper.findAll('.stub-button')
    const writeBtn = buttons.find((b) => b.text().includes('一键续写'))
    expect(writeBtn).toBeDefined()

    await writeBtn!.trigger('click')
    expect(wrapper.emitted('writeNext')).toHaveLength(1)
  })

  it('emits continuation event when continuation button is clicked', async () => {
    const wrapper = mountBatchActions()

    const buttons = wrapper.findAll('.stub-button')
    const contBtn = buttons.find((b) => b.text().trim() === '续写')
    expect(contBtn).toBeDefined()

    await contBtn!.trigger('click')
    expect(wrapper.emitted('continuation')).toHaveLength(1)
  })

  it('emits rewrite event when rewrite button is clicked', async () => {
    const wrapper = mountBatchActions()

    const buttons = wrapper.findAll('.stub-button')
    const rewriteBtn = buttons.find((b) => b.text().includes('改写'))
    expect(rewriteBtn).toBeDefined()

    await rewriteBtn!.trigger('click')
    expect(wrapper.emitted('rewrite')).toHaveLength(1)
  })

  it('emits addChapter event when add chapter button is clicked', async () => {
    const wrapper = mountBatchActions()

    const buttons = wrapper.findAll('.stub-button')
    const addBtn = buttons.find((b) => b.text().includes('新建章节'))
    expect(addBtn).toBeDefined()

    await addBtn!.trigger('click')
    expect(wrapper.emitted('addChapter')).toHaveLength(1)
  })

  // ---- Export dropdown ----

  it('renders export dropdown menu with all format options', () => {
    const wrapper = mountBatchActions()

    const items = wrapper.findAll('.stub-dropdown-item')
    const commands = items.map((i) => i.attributes('data-command'))

    expect(commands).toContain('exportAllMarkdown')
    expect(commands).toContain('exportAllPdf')
    expect(commands).toContain('exportAllDocx')
    expect(commands).toContain('exportAllTxt')
    expect(commands).toContain('exportAllEpub')
    expect(commands).toContain('exportAllJson')
  })

  it('renders export settings option in dropdown', () => {
    const wrapper = mountBatchActions()

    const items = wrapper.findAll('.stub-dropdown-item')
    const settingsItem = items.find((i) => i.attributes('data-command') === 'exportSettings')
    expect(settingsItem).toBeDefined()
  })

  it('displays correct export format labels', () => {
    const wrapper = mountBatchActions()

    const items = wrapper.findAll('.stub-dropdown-item')
    const itemTexts = items.map((i) => i.text())

    expect(itemTexts.some((t) => t.includes('Markdown'))).toBe(true)
    expect(itemTexts.some((t) => t.includes('PDF'))).toBe(true)
    expect(itemTexts.some((t) => t.includes('DOCX'))).toBe(true)
    expect(itemTexts.some((t) => t.includes('TXT'))).toBe(true)
    expect(itemTexts.some((t) => t.includes('EPUB'))).toBe(true)
    expect(itemTexts.some((t) => t.includes('JSON'))).toBe(true)
  })

  // ---- Validating prop ----

  it('passes validating prop to the validate button', () => {
    const wrapper = mountBatchActions(true)

    const buttons = wrapper.findAll('.stub-button')
    const validateBtn = buttons.find((b) => b.text().includes('验证章节'))
    expect(validateBtn).toBeDefined()
    // The stub exposes loading via data-loading attribute
    expect(validateBtn!.attributes('data-loading')).toBe('true')
  })

  it('validate button has loading=false when not validating', () => {
    const wrapper = mountBatchActions(false)

    const buttons = wrapper.findAll('.stub-button')
    const validateBtn = buttons.find((b) => b.text().includes('验证章节'))
    expect(validateBtn).toBeDefined()
    expect(validateBtn!.attributes('data-loading')).toBe('false')
  })

  // ---- Export command emission ----

  it('export dropdown emits exportCommand with the selected command', async () => {
    const wrapper = mountBatchActions()

    const dropdown = wrapper.find('.stub-dropdown')
    expect(dropdown.exists()).toBe(true)

    // No command emitted yet
    expect(wrapper.emitted('exportCommand')).toBeUndefined()

    // Simulate command emission from dropdown
    dropdown.element.dispatchEvent(new CustomEvent('click', { bubbles: true }))
    // The stub emits on click-capture when a [data-command] element is the target.
    // We can also call the method directly as a safety net.
    const mdItem = wrapper.find('[data-command="exportAllMarkdown"]')
    await mdItem.trigger('click')

    expect(wrapper.emitted('exportCommand')).toHaveLength(1)
    expect(wrapper.emitted('exportCommand')![0]).toEqual(['exportAllMarkdown'])
  })

  it('each export format emits exportCommand with its own command value', async () => {
    const wrapper = mountBatchActions()

    const expected: Array<{ command: string; label: string }> = [
      { command: 'exportAllMarkdown', label: 'Markdown' },
      { command: 'exportAllPdf', label: 'PDF' },
      { command: 'exportAllDocx', label: 'DOCX' },
      { command: 'exportAllTxt', label: 'TXT' },
      { command: 'exportAllEpub', label: 'EPUB' },
      { command: 'exportAllJson', label: 'JSON' },
    ]

    for (const { command, label: _label } of expected) {
      const item = wrapper.find(`[data-command="${command}"]`)
      expect(item.exists()).toBe(true)
      await item.trigger('click')
    }

    const emitted = wrapper.emitted('exportCommand')!
    expect(emitted).toHaveLength(expected.length)
    for (let i = 0; i < expected.length; i++) {
      expect(emitted[i]).toEqual([expected[i].command])
    }
  })

  it('exportSettings item emits exportCommand with "exportSettings"', async () => {
    const wrapper = mountBatchActions()

    const item = wrapper.find('[data-command="exportSettings"]')
    expect(item.exists()).toBe(true)
    expect(item.text()).toContain('导出设置')

    await item.trigger('click')
    expect(wrapper.emitted('exportCommand')).toHaveLength(1)
    expect(wrapper.emitted('exportCommand')![0]).toEqual(['exportSettings'])
  })

  // ---- Layout structure ----

  it('has a header flex layout container', () => {
    const wrapper = mountBatchActions()

    const header = wrapper.find('.header')
    expect(header.exists()).toBe(true)
  })

  it('has an actions container for buttons', () => {
    const wrapper = mountBatchActions()

    const actions = wrapper.find('.actions')
    expect(actions.exists()).toBe(true)
  })

  // ---- Additional coverage: multiple emits, dropdown item count, export while validating ----

  it('emits batchGenerate multiple times on repeated clicks', async () => {
    const wrapper = mountBatchActions()

    const buttons = wrapper.findAll('.stub-button')
    const batchBtn = buttons.find((b) => b.text().includes('批量生成'))!

    await batchBtn.trigger('click')
    await batchBtn.trigger('click')
    await batchBtn.trigger('click')

    expect(wrapper.emitted('batchGenerate')).toHaveLength(3)
  })

  it('renders exactly 7 export dropdown items (6 formats + 1 settings)', () => {
    const wrapper = mountBatchActions()

    const items = wrapper.findAll('.stub-dropdown-item')
    expect(items).toHaveLength(7)
  })

  it('dropdown items with divided attribute mark the settings separator', () => {
    const wrapper = mountBatchActions()

    const settingsItem = wrapper.find('[data-command="exportSettings"]')
    // Vue renders boolean true as a present (empty-string) HTML attribute
    expect(settingsItem.attributes('data-divided')).toBeDefined()
    expect(settingsItem.attributes('data-divided')).not.toBe('false')
  })

  it('export dropdown remains functional when validating=true', async () => {
    const wrapper = mountBatchActions(true)

    const item = wrapper.find('[data-command="exportAllPdf"]')
    expect(item.exists()).toBe(true)

    await item.trigger('click')
    expect(wrapper.emitted('exportCommand')).toHaveLength(1)
    expect(wrapper.emitted('exportCommand')![0]).toEqual(['exportAllPdf'])
  })

  it('does not emit any event without user interaction', () => {
    const wrapper = mountBatchActions()

    expect(wrapper.emitted('validate')).toBeUndefined()
    expect(wrapper.emitted('exportCommand')).toBeUndefined()
    expect(wrapper.emitted('batchGenerate')).toBeUndefined()
    expect(wrapper.emitted('writeNext')).toBeUndefined()
    expect(wrapper.emitted('continuation')).toBeUndefined()
    expect(wrapper.emitted('rewrite')).toBeUndefined()
    expect(wrapper.emitted('addChapter')).toBeUndefined()
  })

  it('all events are independent and can be emitted in the same render', async () => {
    const wrapper = mountBatchActions()

    const buttons = wrapper.findAll('.stub-button')
    const findBtn = (text: string) => buttons.find((b) => b.text().includes(text))!

    await findBtn('验证章节').trigger('click')
    await findBtn('批量生成').trigger('click')
    await findBtn('一键续写').trigger('click')
    await findBtn('改写').trigger('click')
    await findBtn('新建章节').trigger('click')

    expect(wrapper.emitted('validate')).toHaveLength(1)
    expect(wrapper.emitted('batchGenerate')).toHaveLength(1)
    expect(wrapper.emitted('writeNext')).toHaveLength(1)
    expect(wrapper.emitted('rewrite')).toHaveLength(1)
    expect(wrapper.emitted('addChapter')).toHaveLength(1)
  })
})
