export const READING_PREVIEW_PLACEHOLDER = '由于防爆栈机制已启动，正文以惰性加载，请点击预览或编辑查看。'

export interface ReadingPreviewInput {
  content?: string
  summary?: string
  summaryData?: {
    summary?: string
  }
}

export function truncateReadingPreviewText(
  content: string | null | undefined,
  maxLength = 500,
  fallback = READING_PREVIEW_PLACEHOLDER
): string {
  const text = content?.trim() ?? ''
  if (!text) return fallback
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...`
}

export function buildReadingPreview(chapter: ReadingPreviewInput | null | undefined, maxLength = 500): string {
  const text = [
    chapter?.summaryData?.summary,
    chapter?.summary,
    chapter?.content,
  ].find(value => (value?.trim() ?? '').length > 0)

  return truncateReadingPreviewText(text, maxLength)
}

export function splitReadingParagraphs(content: string | null | undefined): string[] {
  return (content ?? '')
    .split(/\n\s*\n/g)
    .map(paragraph => paragraph.trim())
    .filter(Boolean)
}
