import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface AnnotationItem {
  id: string
  paragraphIndex: number
  textSnippet: string
  severity: 'high' | 'medium' | 'low'
  message: string
}

export interface EditorAnnotationsOptions {
  annotations: AnnotationItem[]
}

export const editorAnnotationsKey = new PluginKey('editorAnnotations')

export const EditorAnnotations = Extension.create<EditorAnnotationsOptions>({
  name: 'editorAnnotations',

  addOptions() {
    return {
      annotations: [],
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: editorAnnotationsKey,
        props: {
          decorations: (state) => {
            const annotations = this.options.annotations
            if (annotations.length === 0) return DecorationSet.empty

            const decorations: Decoration[] = []
            const paragraphRanges = collectParagraphRanges(state.doc)

            for (const annotation of annotations) {
              const paragraph = paragraphRanges[annotation.paragraphIndex]
              if (!paragraph) continue

              const offset = paragraph.text.indexOf(annotation.textSnippet)
              if (offset === -1) continue

              decorations.push(Decoration.inline(
                paragraph.from + offset,
                paragraph.from + offset + annotation.textSnippet.length,
                {
                  class: `editor-annotation annotation-${annotation.severity}`,
                  'data-annotation-id': annotation.id,
                  title: annotation.message,
                }
              ))
            }

            return DecorationSet.create(state.doc, decorations)
          }
        }
      })
    ]
  },
})

interface ParagraphRange {
  from: number
  text: string
}

function collectParagraphRanges(doc: Parameters<NonNullable<Plugin['props']['decorations']>>[0]['doc']): ParagraphRange[] {
  const ranges: ParagraphRange[] = []

  doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return
    ranges.push({
      from: pos + 1,
      text: node.textContent,
    })
  })

  return ranges
}
