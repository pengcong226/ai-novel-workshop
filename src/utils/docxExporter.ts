import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'
import { saveAs } from 'file-saver'
import type { Chapter } from '@/types'

export interface DocxExportOptions {
  author: string
  includeChapterNumbers: boolean
  fontSize: number
}

export const DEFAULT_DOCX_OPTIONS: DocxExportOptions = {
  author: '',
  includeChapterNumbers: true,
  fontSize: 12
}

function chapterToParagraphs(chapter: Chapter, options: DocxExportOptions): Paragraph[] {
  const paragraphs: Paragraph[] = []
  const heading = options.includeChapterNumbers
    ? `第${chapter.number}章 ${chapter.title || ''}`
    : (chapter.title || '')

  paragraphs.push(new Paragraph({
    text: heading,
    heading: HeadingLevel.HEADING_2,
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 }
  }))

  const content = chapter.content || ''
  for (const line of content.split('\n')) {
    if (!line.trim()) {
      paragraphs.push(new Paragraph({ spacing: { after: 100 } }))
      continue
    }
    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: line, size: options.fontSize * 2 })],
      spacing: { after: 100 },
      indent: { firstLine: 480 }
    }))
  }

  return paragraphs
}

export async function exportAllChaptersToDocx(
  chapters: Chapter[],
  projectTitle: string,
  options: DocxExportOptions,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const allParagraphs: Paragraph[] = []

  // Title page
  allParagraphs.push(new Paragraph({
    text: projectTitle,
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 }
  }))

  if (options.author) {
    allParagraphs.push(new Paragraph({
      children: [new TextRun({ text: options.author, italics: true, size: 24 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 800 }
    }))
  }

  for (let i = 0; i < chapters.length; i++) {
    allParagraphs.push(...chapterToParagraphs(chapters[i], options))
    onProgress?.(i + 1, chapters.length)
  }

  const doc = new Document({
    creator: options.author || 'AI小说工坊',
    title: projectTitle,
    sections: [{ children: allParagraphs }]
  })

  const blob = await Packer.toBlob(doc)
  saveAs(blob, `${projectTitle}.docx`)
}
