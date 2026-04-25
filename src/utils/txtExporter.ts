import { saveAs } from 'file-saver'
import type { Chapter } from '@/types'

export interface TxtExportOptions {
  includeTitle: boolean
  includeChapterNumbers: boolean
  lineSpacing: 'single' | 'double'
}

export const DEFAULT_TXT_OPTIONS: TxtExportOptions = {
  includeTitle: true,
  includeChapterNumbers: true,
  lineSpacing: 'single'
}

export function exportChapterToTxt(chapter: Chapter, projectTitle: string, options: TxtExportOptions): void {
  const parts: string[] = []
  if (options.includeTitle) {
    parts.push(projectTitle)
    parts.push('')
  }
  const heading = options.includeChapterNumbers ? `第${chapter.number}章 ${chapter.title || ''}` : (chapter.title || '')
  parts.push(heading)
  parts.push('')
  parts.push(chapter.content || '')

  const sep = options.lineSpacing === 'double' ? '\n\n' : '\n'
  const blob = new Blob([parts.join(sep)], { type: 'text/plain;charset=utf-8' })
  saveAs(blob, `${projectTitle}_第${chapter.number}章.txt`)
}

export function exportAllChaptersToTxt(
  chapters: Chapter[],
  projectTitle: string,
  options: TxtExportOptions,
  onProgress?: (current: number, total: number) => void
): void {
  const parts: string[] = []
  if (options.includeTitle) {
    parts.push(projectTitle)
    parts.push('')
    parts.push('=' .repeat(40))
    parts.push('')
  }

  const sep = options.lineSpacing === 'double' ? '\n\n' : '\n'

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i]
    const heading = options.includeChapterNumbers ? `第${ch.number}章 ${ch.title || ''}` : (ch.title || '')
    parts.push(heading)
    parts.push('')
    parts.push(ch.content || '')
    parts.push('')
    parts.push('-'.repeat(20))
    parts.push('')
    onProgress?.(i + 1, chapters.length)
  }

  const blob = new Blob([parts.join(sep)], { type: 'text/plain;charset=utf-8' })
  saveAs(blob, `${projectTitle}_全文.txt`)
}
