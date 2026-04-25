import { describe, expect, it } from 'vitest'
import { buildEntityTextUpdates, replaceAppearanceText, replaceChapterText } from '@/utils/global-mutator'

describe('global-mutator', () => {
  it('builds updates only for changed text fields', () => {
    const updates = buildEntityTextUpdates(
      {
        name: '林枫',
        systemPrompt: '林枫是一名修士',
        aliases: ['林枫', '枫哥']
      },
      /林枫/g,
      '亚瑟'
    )

    expect(updates).toEqual({
      name: '亚瑟',
      systemPrompt: '亚瑟是一名修士',
      aliases: ['亚瑟', '枫哥']
    })
  })

  it('returns empty updates when no text changes', () => {
    const updates = buildEntityTextUpdates(
      {
        name: '林枫',
        systemPrompt: '修士',
        aliases: ['枫哥']
      },
      /不存在/g,
      '亚瑟'
    )

    expect(updates).toEqual({})
  })

  it('replaces chapter text across all supported fields', () => {
    const chapter = {
      title: '林枫登场',
      content: '林枫身着青衫。林枫拔剑。',
      summary: '林枫赢下首战',
      summaryData: {
        summary: '林枫初入江湖'
      },
      untouched: '保持不变'
    }

    replaceChapterText(chapter, /林枫/g, '亚瑟')

    expect(chapter).toEqual({
      title: '亚瑟登场',
      content: '亚瑟身着青衫。亚瑟拔剑。',
      summary: '亚瑟赢下首战',
      summaryData: {
        summary: '亚瑟初入江湖'
      },
      untouched: '保持不变'
    })
  })

  it('treats replacement text literally', () => {
    const chapter = {
      title: '林枫登场',
      content: '林枫身着青衫'
    }

    replaceChapterText(chapter, /林枫/g, '$&-亚瑟')

    expect(chapter).toEqual({
      title: '$&-亚瑟登场',
      content: '$&-亚瑟身着青衫'
    })
  })

  it('replaces appearance only when it changes', () => {
    expect(replaceAppearanceText('林枫身着青衫', /林枫/g, '亚瑟')).toBe('亚瑟身着青衫')
    expect(replaceAppearanceText('青衫修士', /林枫/g, '亚瑟')).toBeNull()
    expect(replaceAppearanceText(undefined, /林枫/g, '亚瑟')).toBeNull()
  })
})
