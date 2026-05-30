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

  // ---- Empty / edge-case modelValue ------------------------------------------

  it('converts empty string to a single empty paragraph', async () => {
    const wrapper = mountEditor({ modelValue: '' })
    await waitForEditorReady()

    const editor = (wrapper.vm as any).getEditor()
    const html = editor.getHTML()
    // Empty plain text should produce a minimal paragraph, not raw garbage
    expect(html).toContain('<p')
    wrapper.unmount()
  })

  it('parses h3 headings from ### prefix', async () => {
    const wrapper = mountEditor({ modelValue: '### Level Three' })
    await waitForEditorReady()

    const editor = (wrapper.vm as any).getEditor()
    const html = editor.getHTML()
    expect(html).toContain('<h3')
    expect(html).toContain('Level Three')
    wrapper.unmount()
  })

  // ---- HTML escaping in plain-to-HTML conversion -----------------------------

  it('escapes ampersands and angle brackets when converting plain text to HTML', async () => {
    const wrapper = mountEditor({ modelValue: 'Tom & Jerry <friends>' })
    await waitForEditorReady()

    const editor = (wrapper.vm as any).getEditor()
    // Tiptap will store escaped entities
    const html = editor.getHTML()
    expect(html).toContain('&amp;')
    expect(html).toContain('&lt;')
    expect(html).toContain('&gt;')
    wrapper.unmount()
  })

  it('converts embedded newlines inside a paragraph to <br>', async () => {
    const wrapper = mountEditor({ modelValue: 'line1\nline2' })
    await waitForEditorReady()

    const editor = (wrapper.vm as any).getEditor()
    const html = editor.getHTML()
    // A single paragraph with an embedded newline should produce a <br>
    expect(html).toContain('<br')
    expect(html).toContain('line1')
    expect(html).toContain('line2')
    wrapper.unmount()
  })

  // ---- Round-trip: plain -> HTML -> plain preserves inline marks ---------------

  it('round-trips bold, italic, underline, and highlight marks through HTML', async () => {
    const input = '**bold** *italic* __underline__ ==highlight=='
    const wrapper = mountEditor({ modelValue: input })
    await waitForEditorReady()

    const editor = (wrapper.vm as any).getEditor()
    const html = editor.getHTML()
    // Verify all inline mark tags are present in the generated HTML
    expect(html).toContain('<strong')
    expect(html).toContain('<em')
    expect(html).toContain('<u')
    expect(html).toContain('<mark')
    // Now exercise the same round-trip the component performs internally.
    // Build a temp element, walk childNodes the same way inlineNodeToPlainText does,
    // and verify the markdown markers survive.
    const temp = document.createElement('div')
    temp.innerHTML = html
    const blocks = temp.querySelectorAll('p, h1, h2, h3')
    const lines: string[] = []
    blocks.forEach((block) => {
      const children = Array.from(block.childNodes)
      const parts = children.map((node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
        const el = node as HTMLElement
        const tag = el.tagName.toLowerCase()
        const content = el.textContent || ''
        if (tag === 'strong') return `**${content}**`
        if (tag === 'em') return `*${content}*`
        if (tag === 'u') return `__${content}__`
        if (tag === 'mark') return `==${content}==`
        return content
      })
      lines.push(parts.join(''))
    })
    const plainRoundtrip = lines.join('\n\n')
    expect(plainRoundtrip).toContain('**bold**')
    expect(plainRoundtrip).toContain('*italic*')
    expect(plainRoundtrip).toContain('__underline__')
    expect(plainRoundtrip).toContain('==highlight==')
    wrapper.unmount()
  })

  // ---- applySuggestedFix edge cases ------------------------------------------

  it('applySuggestedFix returns false when snippet is empty string', async () => {
    const wrapper = mountEditor({ modelValue: 'some text' })
    await waitForEditorReady()

    const result = (wrapper.vm as any).applySuggestedFix({
      originalSnippet: '',
      fixContent: 'replacement',
      paragraphIndex: 0,
    })
    expect(result).toBe(false)
    wrapper.unmount()
  })

  it('applySuggestedFix searches all paragraphs when paragraphIndex is omitted', async () => {
    const wrapper = mountEditor({ modelValue: 'first para\n\nsecond para' })
    await waitForEditorReady()

    // "second" only appears in paragraph index 1; omitting paragraphIndex
    // should still find exactly one match and succeed.
    const result = (wrapper.vm as any).applySuggestedFix({
      originalSnippet: 'second',
      fixContent: 'updated',
    })
    expect(result).toBe(true)

    const editor = (wrapper.vm as any).getEditor()
    expect(editor.getText()).toContain('updated')
    expect(editor.getText()).not.toContain('second')
    wrapper.unmount()
  })

  it('applySuggestedFix escapes XML special characters in fixContent', async () => {
    const wrapper = mountEditor({ modelValue: 'replace me' })
    await waitForEditorReady()

    const result = (wrapper.vm as any).applySuggestedFix({
      originalSnippet: 'replace',
      fixContent: '<script>alert("xss")</script>',
      paragraphIndex: 0,
    })
    expect(result).toBe(true)

    const editor = (wrapper.vm as any).getEditor()
    const html = editor.getHTML()
    // The dangerous HTML should be escaped, not rendered as raw tags
    expect(html).not.toContain('<script>')
    // The escaped entities should appear in the output (possibly double-encoded by Tiptap)
    expect(html).toContain('script')
    expect(html).toContain('alert')
    wrapper.unmount()
  })

  // ---- scrollToParagraph multi-paragraph scenarios ---------------------------

  it('scrollToParagraph returns false for negative index', async () => {
    const wrapper = mountEditor({ modelValue: 'aaa\n\nbbb\n\nccc' })
    await waitForEditorReady()

    expect((wrapper.vm as any).scrollToParagraph(-1)).toBe(false)
    wrapper.unmount()
  })

  it('scrollToParagraph returns true for a middle paragraph', async () => {
    const wrapper = mountEditor({ modelValue: 'first\n\nsecond\n\nthird' })
    await waitForEditorReady()

    // Index 1 = "second"
    expect((wrapper.vm as any).scrollToParagraph(1)).toBe(true)
    wrapper.unmount()
  })

  // ---- Bubble menu / ai-action forwarding ------------------------------------

  it('forwards ai-action event from EditorBubbleMenu', async () => {
    const wrapper = mountEditor({ modelValue: 'text to edit' })
    await waitForEditorReady()

    const bubbleMenu = wrapper.findComponent({ name: 'EditorBubbleMenu' })
    expect(bubbleMenu.exists()).toBe(true)

    const payload = {
      command: 'rewrite',
      selectedText: 'text',
      from: 0,
      to: 4,
      editorFrom: 1,
      editorTo: 5,
    }
    await bubbleMenu.vm.$emit('ai-action', payload)
    await nextTick()

    const emitted = wrapper.emitted('ai-action')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toEqual(payload)
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
