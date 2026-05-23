import { describe, expect, it } from 'vitest'
import { parseReviewResponse } from '../reviewParser'
import { splitReviewParagraphs } from '../reviewParagraphs'

const paragraphs = splitReviewParagraphs('第一段有一个问题片段。\n\n第二段保持正常。')

describe('reviewParser', () => {
  it('parses fenced JSON and builds local actions from validated fields', () => {
    const result = parseReviewResponse(`\`\`\`json
[
  {
    "title": "节奏问题",
    "message": "这里节奏偏慢",
    "category": "quality",
    "priority": "high",
    "paragraphIndex": 0,
    "textSnippet": "问题片段",
    "suggestedFix": "修复片段",
    "actions": [{ "type": "auto_fix", "autoFixCommand": "do dangerous thing" }]
  }
]
\`\`\``, { paragraphs })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      title: '节奏问题',
      message: '这里节奏偏慢',
      category: 'quality',
      priority: 'high',
      paragraphIndex: 0,
      textSnippet: '问题片段',
      suggestedFix: '修复片段',
    })
    expect(result[0].actions).toEqual([
      { type: 'navigate', label: '跳转到此处', navigateTarget: 'paragraph:0' },
      { type: 'apply_fix', label: '采纳修复', originalSnippet: '问题片段', fixContent: '修复片段' },
    ])
  })

  it('parses raw JSON and defaults invalid category and priority', () => {
    const result = parseReviewResponse(JSON.stringify([
      {
        title: '提示',
        message: '说明',
        category: 'unknown',
        priority: 'urgent',
      },
    ]), { paragraphs })

    expect(result[0].category).toBe('optimization')
    expect(result[0].priority).toBe('medium')
  })

  it('drops invalid top-level and malformed items', () => {
    expect(parseReviewResponse('{"title":"not array"}', { paragraphs })).toEqual([])
    expect(parseReviewResponse('[{"title":"missing message"}, null, []]', { paragraphs })).toEqual([])
  })

  it('rejects out-of-range paragraph indexes and invalid snippets', () => {
    const result = parseReviewResponse(JSON.stringify([
      {
        title: '越界',
        message: '段落不存在',
        paragraphIndex: 9,
        textSnippet: '问题片段',
        suggestedFix: '修复片段',
      },
      {
        title: '片段不匹配',
        message: '片段不在段落里',
        paragraphIndex: 1,
        textSnippet: '问题片段',
        suggestedFix: '修复片段',
      },
    ]), { paragraphs })

    expect(result[0].paragraphIndex).toBeUndefined()
    expect(result[0].actions).toBeUndefined()
    expect(result[1].paragraphIndex).toBe(1)
    expect(result[1].textSnippet).toBeUndefined()
    expect(result[1].suggestedFix).toBeUndefined()
    expect(result[1].actions).toEqual([
      { type: 'navigate', label: '跳转到此处', navigateTarget: 'paragraph:1' },
    ])
  })

  it('caps long text fields', () => {
    const longText = '很'.repeat(2000)
    const result = parseReviewResponse(JSON.stringify([
      {
        title: longText,
        message: longText,
        paragraphIndex: 0,
        textSnippet: '问题片段',
        suggestedFix: longText,
      },
    ]), { paragraphs })

    expect(result[0].title.length).toBe(120)
    expect(result[0].message.length).toBe(1200)
    expect(result[0].suggestedFix?.length).toBe(1600)
  })
})
