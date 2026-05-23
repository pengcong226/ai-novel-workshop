<template>
  <div class="novel-editor-wrapper">
    <EditorContent :editor="editor" class="novel-editor-content" />
    <EditorBubbleMenu
      v-if="editor"
      :editor="editor"
      @ai-action="handleAIAction"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import Highlight from '@tiptap/extension-highlight'
import Underline from '@tiptap/extension-underline'
import EditorBubbleMenu from './EditorBubbleMenu.vue'
import { EditorAnnotations, type AnnotationItem } from './EditorAnnotations'
import { escapeXml } from '@/utils/escapeXml'

interface Props {
  modelValue: string
  placeholder?: string
  readonly?: boolean
  autofocus?: boolean
  annotations?: AnnotationItem[]
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '此刻，命运的齿轮开始转动...',
  readonly: false,
  autofocus: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'word-count-change': [count: number]
  'ai-action': [payload: { command: string; selectedText: string; from: number; to: number; editorFrom: number; editorTo: number }]
}>()

function convertPlainTextToHTML(text: string): string {
  if (!text) return '<p></p>'
  return text
    .split('\n\n')
    .map(blockToHTML)
    .join('')
}

function blockToHTML(block: string): string {
  if (block.startsWith('### ')) return `<h3>${inlineTextToHTML(block.slice(4))}</h3>`
  if (block.startsWith('## ')) return `<h2>${inlineTextToHTML(block.slice(3))}</h2>`
  if (block.startsWith('# ')) return `<h1>${inlineTextToHTML(block.slice(2))}</h1>`
  return `<p>${inlineTextToHTML(block)}</p>`
}

function inlineTextToHTML(text: string): string {
  return escapePTag(text)
    .replace(/==([^=]+)==/g, '<mark>$1</mark>')
    .replace(/__([^_]+)__/g, '<u>$1</u>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
}

function escapePTag(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

function convertHTMLToPlainText(html: string): string {
  if (!html) return ''
  const temp = document.createElement('div')
  temp.innerHTML = html

  const blocks = temp.querySelectorAll('p, h1, h2, h3, h4, h5, h6')
  if (blocks.length === 0) {
    return (temp.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
  }

  const lines: string[] = []
  blocks.forEach(block => {
    const tag = block.tagName.toLowerCase()
    let text = inlineNodeToPlainText(block)

    if (tag === 'h1') text = '# ' + text
    else if (tag === 'h2') text = '## ' + text
    else if (tag === 'h3') text = '### ' + text

    lines.push(text)
  })

  return lines.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
}

function inlineNodeToPlainText(node: Node): string {
  if (node.nodeName === 'BR') return '\n'
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''

  const element = node as HTMLElement
  const content = Array.from(node.childNodes).map(inlineNodeToPlainText).join('')
  const tag = element.tagName?.toLowerCase()
  if (tag === 'strong' || tag === 'b') return `**${content}**`
  if (tag === 'em' || tag === 'i') return `*${content}*`
  if (tag === 'u') return `__${content}__`
  if (tag === 'mark') return `==${content}==`
  return content
}

const isInternalUpdate = ref(false)

const editor = useEditor({
  content: convertPlainTextToHTML(props.modelValue),
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: false,
      code: false,
    }),
    Placeholder.configure({ placeholder: props.placeholder }),
    CharacterCount,
    Highlight.configure({ multicolor: true }),
    Underline,
    EditorAnnotations.configure({ annotations: props.annotations || [] }),
  ],
  editable: !props.readonly,
  editorProps: {
    attributes: {
      class: 'novel-editor-content',
      spellcheck: 'false',
    },
  },
  onUpdate: ({ editor: ed }) => {
    if (isInternalUpdate.value) return
    const plainText = convertHTMLToPlainText(ed.getHTML())
    emit('update:modelValue', plainText)
    emit('word-count-change', plainText.length)
  },
})

watch(() => props.modelValue, (newVal) => {
  if (!editor.value || isInternalUpdate.value) return
  const currentPlain = convertHTMLToPlainText(editor.value.getHTML())
  if (newVal !== currentPlain) {
    isInternalUpdate.value = true
    editor.value.commands.setContent(convertPlainTextToHTML(newVal))
    isInternalUpdate.value = false
  }
})

watch(() => props.readonly, (val) => {
  editor.value?.setEditable(!val)
})

watch(() => props.annotations, (annotations) => {
  const extension = editor.value?.extensionManager.extensions.find(item => item.name === 'editorAnnotations')
  if (!extension) return
  extension.options.annotations = annotations || []
  editor.value?.view.dispatch(editor.value.state.tr)
}, { deep: true })

function handleAIAction(payload: { command: string; selectedText: string; from: number; to: number; editorFrom: number; editorTo: number }) {
  emit('ai-action', payload)
}

interface ParagraphRange {
  index: number
  from: number
  to: number
  text: string
}

function collectParagraphRanges(): ParagraphRange[] {
  const ranges: ParagraphRange[] = []
  editor.value?.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return
    ranges.push({
      index: ranges.length,
      from: pos + 1,
      to: pos + node.nodeSize - 1,
      text: node.textContent,
    })
  })
  return ranges
}

function scrollToParagraph(paragraphIndex: number): boolean {
  const paragraph = collectParagraphRanges().find(item => item.index === paragraphIndex)
  if (!paragraph) return false
  editor.value?.chain().focus().setTextSelection(paragraph.from).scrollIntoView().run()
  return true
}

function applySuggestedFix(payload: { originalSnippet: string; fixContent: string; paragraphIndex?: number }): boolean {
  if (!editor.value || props.readonly) return false
  const matches = findSnippetMatches(payload.originalSnippet, payload.paragraphIndex)
  if (matches.length !== 1) return false

  const match = matches[0]
  editor.value.chain().focus().insertContentAt(
    { from: match.from, to: match.to },
    escapeXml(payload.fixContent).replace(/\n/g, '<br>')
  ).run()
  return true
}

function findSnippetMatches(snippet: string, paragraphIndex?: number): Array<{ from: number; to: number }> {
  if (!snippet) return []
  const ranges = collectParagraphRanges()
  const targetRanges = paragraphIndex === undefined
    ? ranges
    : ranges.filter(range => range.index === paragraphIndex)
  const matches: Array<{ from: number; to: number }> = []

  for (const range of targetRanges) {
    let searchStart = 0
    while (searchStart <= range.text.length) {
      const offset = range.text.indexOf(snippet, searchStart)
      if (offset === -1) break
      matches.push({ from: range.from + offset, to: range.from + offset + snippet.length })
      searchStart = offset + 1
    }
  }

  return matches
}

onBeforeUnmount(() => {
  editor.value?.destroy()
})

defineExpose({
  getEditor: () => editor.value,
  scrollToParagraph,
  applySuggestedFix,
})
</script>

<style scoped>
.novel-editor-wrapper {
  flex: 1;
  overflow-y: auto;
  outline: none;
}

.novel-editor-wrapper :deep(.tiptap) {
  font-size: 18px;
  line-height: 2;
  font-family: 'Songti SC', 'Noto Serif SC', STSong, serif;
  color: var(--el-text-color-primary);
  padding: 20px 0;
  outline: none;
  min-height: 60vh;
}

html.dark .novel-editor-wrapper :deep(.tiptap) {
  color: #e0e0e0;
}

.novel-editor-wrapper :deep(.tiptap p) {
  margin-bottom: 0.5em;
  text-indent: 2em;
}

.novel-editor-wrapper :deep(.tiptap h1),
.novel-editor-wrapper :deep(.tiptap h2),
.novel-editor-wrapper :deep(.tiptap h3) {
  text-indent: 0;
  margin-top: 1em;
  margin-bottom: 0.5em;
}

.novel-editor-wrapper :deep(.tiptap mark) {
  background-color: #fef08a;
  border-radius: 2px;
  padding: 0 2px;
}

html.dark .novel-editor-wrapper :deep(.tiptap mark) {
  background-color: rgba(254, 240, 138, 0.3);
}

.novel-editor-wrapper :deep(.editor-annotation) {
  cursor: pointer;
  border-radius: 2px;
}

.novel-editor-wrapper :deep(.annotation-high) {
  background-color: rgba(239, 68, 68, 0.15);
  border-bottom: 2px wavy #ef4444;
}

.novel-editor-wrapper :deep(.annotation-medium) {
  background-color: rgba(245, 158, 11, 0.12);
  border-bottom: 2px wavy #f59e0b;
}

.novel-editor-wrapper :deep(.annotation-low) {
  background-color: rgba(59, 130, 246, 0.1);
  border-bottom: 2px dashed #3b82f6;
}

.novel-editor-wrapper :deep(.tiptap p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  color: #adb5bd;
  pointer-events: none;
  height: 0;
}
</style>
