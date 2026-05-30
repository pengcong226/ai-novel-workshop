import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createTestPinia } from '@/test/helpers'
import NovelEditor from '@/components/editor/NovelEditor.vue'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Stub EditorBubbleMenu (BubbleMenu requires portal / tippy which jsdom lacks)
vi.mock('@/components/editor/EditorBubbleMenu.vue', () => ({
  default: {
    name: 'EditorBubbleMenu',
    props: ['editor'],
    emits: ['ai-action'],
    template: '<div class="stub-bubble-menu" />',
  },
}))

// EditorAnnotations is a real tiptap Extension – no mock needed, it works in jsdom.

vi.mock('@/utils/escapeXml', () => ({
  escapeXml: (text: string) =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;'),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mountEditor(props: Record<string, unknown> = {}) {
  return mount(NovelEditor, {
    props: {
      modelValue: '',
      ...props,
    },
    global: {
      stubs: {
        EditorContent: {
          template: '<div class="stub-editor-content"><slot /></div>',
        },
      },
    },
  })
}

/** Wait for tiptap's useEditor async initialization to settle. */
async function waitForEditorReady() {
  await flushPromises()
  await nextTick()
  await flushPromises()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NovelEditor', () => {
  beforeEach(() => {
    createTestPinia()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ---- Editor initialization ------------------------------------------------

  it('mounts and creates an editor instance', async () => {
    const wrapper = mountEditor()
    await waitForEditorReady()

    const exposed = wrapper.vm as unknown as { getEditor: () => unknown }
    expect(exposed.getEditor()).toBeTruthy()
    wrapper.unmount()
  })

  it('renders the editor content area', async () => {
    const wrapper = mountEditor()
    await waitForEditorReady()

    expect(wrapper.find('.novel-editor-wrapper').exists()).toBe(true)
    expect(wrapper.find('.stub-editor-content').exists()).toBe(true)
    wrapper.unmount()
  })

  // ---- Content binding ------------------------------------------------------

  it('initializes with the given modelValue as plain text', async () => {
    const wrapper = mountEditor({ modelValue: 'Hello world' })
    await waitForEditorReady()

    const editor = (wrapper.vm as any).getEditor()
    // The editor converts plain text -> HTML internally.
    // Reading it back via the editor should give the original text.
    const html = editor.getHTML()
    expect(html).toContain('Hello world')
    wrapper.unmount()
  })

  it('parses headings from markdown-style plain text', async () => {
    const wrapper = mountEditor({ modelValue: '# Title\n\n## Subtitle\n\nBody text' })
    await waitForEditorReady()

    const editor = (wrapper.vm as any).getEditor()
    const html = editor.getHTML()
    expect(html).toContain('<h1')
    expect(html).toContain('Title')
    expect(html).toContain('<h2')
    expect(html).toContain('Subtitle')
    expect(html).toContain('<p')
    expect(html).toContain('Body text')
    wrapper.unmount()
  })

  it('parses inline formatting marks from plain text', async () => {
    const wrapper = mountEditor({ modelValue: '**bold** and *italic* and __underline__ and ==highlight==' })
    await waitForEditorReady()

    const editor = (wrapper.vm as any).getEditor()
    const html = editor.getHTML()
    expect(html).toContain('<strong')
    expect(html).toContain('<em')
    expect(html).toContain('<u')
    expect(html).toContain('<mark')
    wrapper.unmount()
  })

  it('updates editor content when modelValue prop changes', async () => {
    const wrapper = mountEditor({ modelValue: 'initial' })
    await waitForEditorReady()

    const editor = (wrapper.vm as any).getEditor()
    expect(editor.getText()).toContain('initial')

    await wrapper.setProps({ modelValue: 'updated content' })
    await waitForEditorReady()

    expect(editor.getText()).toContain('updated content')
    wrapper.unmount()
  })

  // ---- Character count / word-count-change ----------------------------------

  it('emits word-count-change on editor update with the plain text length', async () => {
    const wrapper = mountEditor({ modelValue: '' })
    await waitForEditorReady()

    const editor = (wrapper.vm as any).getEditor()
    // Programmatically insert content to trigger onUpdate
    editor.commands.setContent('<p>test content</p>')
    await waitForEditorReady()

    const emitted = wrapper.emitted('word-count-change')
    // The last emission should correspond to 'test content' (no newlines).
    expect(emitted).toBeTruthy()
    const lastCount = emitted![emitted!.length - 1][0]
    expect(typeof lastCount).toBe('number')
    // 'test content' = 12 chars (after convertHTMLToPlainText)
    expect(lastCount).toBeGreaterThan(0)
    wrapper.unmount()
  })

  it('emits update:modelValue with plain text on editor change', async () => {
    const wrapper = mountEditor({ modelValue: '' })
    await waitForEditorReady()

    const editor = (wrapper.vm as any).getEditor()
    editor.commands.setContent('<p>new paragraph</p>')
    await waitForEditorReady()

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    const lastValue = emitted![emitted!.length - 1][0]
    expect(typeof lastValue).toBe('string')
    expect(lastValue).toContain('new paragraph')
    wrapper.unmount()
  })

  // ---- Readonly mode --------------------------------------------------------

  it('starts as editable when readonly is false', async () => {
    const wrapper = mountEditor({ modelValue: 'text', readonly: false })
    await waitForEditorReady()

    const editor = (wrapper.vm as any).getEditor()
    expect(editor.isEditable).toBe(true)
    wrapper.unmount()
  })

  it('starts as non-editable when readonly is true', async () => {
    const wrapper = mountEditor({ modelValue: 'text', readonly: true })
    await waitForEditorReady()

    const editor = (wrapper.vm as any).getEditor()
    expect(editor.isEditable).toBe(false)
    wrapper.unmount()
  })

  it('toggles editability when readonly prop changes', async () => {
    const wrapper = mountEditor({ modelValue: 'text', readonly: false })
    await waitForEditorReady()

    const editor = (wrapper.vm as any).getEditor()
    expect(editor.isEditable).toBe(true)

    await wrapper.setProps({ readonly: true })
    await waitForEditorReady()
    expect(editor.isEditable).toBe(false)

    await wrapper.setProps({ readonly: false })
    await waitForEditorReady()
    expect(editor.isEditable).toBe(true)
    wrapper.unmount()
  })

  // ---- Exposed methods: scrollToParagraph -----------------------------------

  it('scrollToParagraph returns false for out-of-range index', async () => {
    const wrapper = mountEditor({ modelValue: 'only one paragraph' })
    await waitForEditorReady()

    const result = (wrapper.vm as any).scrollToParagraph(999)
    expect(result).toBe(false)
    wrapper.unmount()
  })

  it('scrollToParagraph returns true for a valid paragraph index', async () => {
    const wrapper = mountEditor({ modelValue: 'first paragraph\n\nsecond paragraph' })
    await waitForEditorReady()

    const result = (wrapper.vm as any).scrollToParagraph(0)
    expect(result).toBe(true)
    wrapper.unmount()
  })

  // ---- Exposed methods: applySuggestedFix -----------------------------------

  it('applySuggestedFix returns false when readonly', async () => {
    const wrapper = mountEditor({ modelValue: 'some text here', readonly: true })
    await waitForEditorReady()

    const result = (wrapper.vm as any).applySuggestedFix({
      originalSnippet: 'some',
      fixContent: 'any',
      paragraphIndex: 0,
    })
    expect(result).toBe(false)
    wrapper.unmount()
  })

  it('applySuggestedFix returns true when snippet matches exactly once', async () => {
    const wrapper = mountEditor({ modelValue: 'the quick brown fox' })
    await waitForEditorReady()

    const result = (wrapper.vm as any).applySuggestedFix({
      originalSnippet: 'quick',
      fixContent: 'slow',
      paragraphIndex: 0,
    })
    expect(result).toBe(true)

    // Verify the fix was applied
    const editor = (wrapper.vm as any).getEditor()
    const text = editor.getText()
    expect(text).toContain('slow')
    expect(text).not.toContain('quick')
    wrapper.unmount()
  })

  it('applySuggestedFix returns false when snippet matches multiple times', async () => {
    const wrapper = mountEditor({ modelValue: 'ha ha ha' })
    await waitForEditorReady()

    // 'ha' appears 3 times -> matches.length !== 1 -> should fail
    const result = (wrapper.vm as any).applySuggestedFix({
      originalSnippet: 'ha',
      fixContent: 'ho',
      paragraphIndex: 0,
    })
    expect(result).toBe(false)
    wrapper.unmount()
  })

  // ---- Cleanup on unmount ---------------------------------------------------

  it('destroys the editor on unmount', async () => {
    const wrapper = mountEditor({ modelValue: 'content' })
    await waitForEditorReady()

    const editor = (wrapper.vm as any).getEditor()
    const destroySpy = vi.spyOn(editor, 'destroy')

    wrapper.unmount()
    expect(destroySpy).toHaveBeenCalled()
  })
})
