import { describe, expect, it } from 'vitest'
import { formatNumberedReviewContent, splitReviewParagraphs } from '../reviewParagraphs'

describe('reviewParagraphs', () => {
  it('splits canonical plain text blocks and preserves offsets', () => {
    const content = '第一段内容\n\n  第二段内容  \n\n# 第三段标题'

    const paragraphs = splitReviewParagraphs(content)

    expect(paragraphs).toEqual([
      { index: 0, text: '第一段内容', startOffset: 0, endOffset: 5 },
      { index: 1, text: '第二段内容', startOffset: 9, endOffset: 14 },
      { index: 2, text: '# 第三段标题', startOffset: 18, endOffset: 25 },
    ])
  })

  it('formats numbered review content', () => {
    expect(formatNumberedReviewContent('第一段\n\n第二段')).toBe('[P0] 第一段\n[P1] 第二段')
  })

  it('returns empty output for blank content', () => {
    expect(splitReviewParagraphs(' \n\n ')).toEqual([])
    expect(formatNumberedReviewContent(' \n\n ')).toBe('')
  })
})
