export interface ReviewParagraph {
  index: number
  text: string
  startOffset: number
  endOffset: number
}

const PARAGRAPH_SEPARATOR = /\r?\n\s*\r?\n/g

export function splitReviewParagraphs(content: string): ReviewParagraph[] {
  if (!content.trim()) return []

  const paragraphs: ReviewParagraph[] = []
  let segmentStart = 0
  let match: RegExpExecArray | null

  PARAGRAPH_SEPARATOR.lastIndex = 0
  while ((match = PARAGRAPH_SEPARATOR.exec(content)) !== null) {
    addParagraph(paragraphs, content, segmentStart, match.index)
    segmentStart = match.index + match[0].length
  }

  addParagraph(paragraphs, content, segmentStart, content.length)
  return paragraphs
}

export function formatNumberedReviewContent(content: string): string {
  const paragraphs = splitReviewParagraphs(content)
  return paragraphs
    .map(paragraph => `[P${paragraph.index}] ${paragraph.text}`)
    .join('\n')
}

function addParagraph(paragraphs: ReviewParagraph[], content: string, start: number, end: number): void {
  const raw = content.slice(start, end)
  const leadingWhitespace = raw.match(/^\s*/)?.[0].length ?? 0
  const trailingWhitespace = raw.match(/\s*$/)?.[0].length ?? 0
  const text = raw.trim()

  if (!text) return

  paragraphs.push({
    index: paragraphs.length,
    text,
    startOffset: start + leadingWhitespace,
    endOffset: end - trailingWhitespace,
  })
}
