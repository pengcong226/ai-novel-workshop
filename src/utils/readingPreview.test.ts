import { describe, expect, it } from 'vitest'
import { buildReadingPreview, splitReadingParagraphs, truncateReadingPreviewText } from '@/utils/readingPreview'

describe('buildReadingPreview', () => {
  it('returns summaryData summary before summary and content', () => {
    const preview = buildReadingPreview({
      summaryData: { summary: '结构化摘要' },
      summary: '普通摘要',
      content: '正文内容',
    })

    expect(preview).toBe('结构化摘要')
  })

  it('falls back to summary when structured summary is empty', () => {
    const preview = buildReadingPreview({
      summaryData: { summary: '   ' },
      summary: '普通摘要',
      content: '正文内容',
    })

    expect(preview).toBe('普通摘要')
  })

  it('falls back to trimmed content preview when summaries are absent', () => {
    expect(buildReadingPreview({ content: '  第一段正文  ' })).toBe('第一段正文')
  })

  it('returns lazy-load placeholder when content is empty or missing', () => {
    expect(buildReadingPreview(undefined)).toBe('由于防爆栈机制已启动，正文以惰性加载，请点击预览或编辑查看。')
    expect(buildReadingPreview({ content: '   ' })).toBe('由于防爆栈机制已启动，正文以惰性加载，请点击预览或编辑查看。')
  })

  it('truncates long content at a deterministic limit', () => {
    const preview = buildReadingPreview({ content: '玄'.repeat(520) })

    expect(preview).toHaveLength(503)
    expect(preview.endsWith('...')).toBe(true)
  })

  it('preserves Chinese punctuation unicode and emoji', () => {
    expect(buildReadingPreview({ content: '少年回头：“走吧。”✨' })).toBe('少年回头：“走吧。”✨')
  })
})

describe('truncateReadingPreviewText', () => {
  it('trims and truncates reusable preview text', () => {
    expect(truncateReadingPreviewText('  旧版本正文  ', 10, '暂无内容')).toBe('旧版本正文')
    expect(truncateReadingPreviewText('玄'.repeat(12), 10, '暂无内容')).toBe(`${'玄'.repeat(10)}...`)
    expect(truncateReadingPreviewText('   ', 10, '暂无内容')).toBe('暂无内容')
  })
})

describe('splitReadingParagraphs', () => {
  it('splits plain text into readable non-empty paragraphs', () => {
    expect(splitReadingParagraphs('第一段\n\n第二段\n第三行')).toEqual(['第一段', '第二段\n第三行'])
  })

  it('returns an empty array for blank content', () => {
    expect(splitReadingParagraphs(' \n\n ')).toEqual([])
  })
})
