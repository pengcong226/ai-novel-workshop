import { describe, expect, it } from 'vitest'
import type { Chapter } from '@/types'
import { reorderChaptersByIds, reorderChaptersByIndex } from '@/utils/chapterReorder'

function makeChapter(id: string, number: number, title = id): Chapter {
  return {
    id,
    number,
    title,
    content: `content-${id}`,
    wordCount: 10,
    outline: {
      chapterId: id,
      title,
      scenes: [],
      characters: [],
      location: '',
      goals: [],
      conflicts: [],
      resolutions: [],
      foreshadowingToPlant: [],
      foreshadowingToResolve: [],
      status: 'planned',
    },
    status: 'draft',
    generatedBy: 'manual',
    generationTime: new Date('2026-01-01T00:00:00.000Z'),
    checkpoints: [],
    aiSuggestions: [],
  }
}

describe('reorderChaptersByIndex', () => {
  it('moves a chapter and renumbers chapters continuously', () => {
    const chapters = [makeChapter('a', 1), makeChapter('b', 2), makeChapter('c', 3)]

    const reordered = reorderChaptersByIndex(chapters, 2, 0)

    expect(reordered.map(chapter => chapter.id)).toEqual(['c', 'a', 'b'])
    expect(reordered.map(chapter => chapter.number)).toEqual([1, 2, 3])
  })

  it('preserves chapter metadata while changing only the order number', () => {
    const chapters = [makeChapter('a', 1), makeChapter('b', 2), makeChapter('c', 3)]

    const reordered = reorderChaptersByIndex(chapters, 2, 0)

    expect(reordered[0]).toMatchObject({
      id: 'c',
      title: 'c',
      content: 'content-c',
      wordCount: 10,
      status: 'draft',
      generatedBy: 'manual',
    })
    expect(reordered[0].number).toBe(1)
    expect(chapters.map(chapter => chapter.number)).toEqual([1, 2, 3])
    expect(chapters.map(chapter => chapter.id)).toEqual(['a', 'b', 'c'])
  })

  it('returns the original array for a same-index no-op', () => {
    const chapters = [makeChapter('a', 1), makeChapter('b', 2)]

    expect(reorderChaptersByIndex(chapters, 1, 1)).toBe(chapters)
  })

  it('returns the original array for invalid indexes', () => {
    const chapters = [makeChapter('a', 1), makeChapter('b', 2)]

    expect(reorderChaptersByIndex(chapters, -1, 0)).toBe(chapters)
    expect(reorderChaptersByIndex(chapters, 0, -1)).toBe(chapters)
    expect(reorderChaptersByIndex(chapters, 2, 0)).toBe(chapters)
    expect(reorderChaptersByIndex(chapters, 0, 2)).toBe(chapters)
    expect(reorderChaptersByIndex([], 0, 0)).toEqual([])
  })

  it('handles a single chapter safely', () => {
    const chapters = [makeChapter('a', 7)]

    expect(reorderChaptersByIndex(chapters, 0, 0)).toBe(chapters)
  })

  it('handles large chapter lists without mutating input', () => {
    const chapters = Array.from({ length: 10_000 }, (_, index) => makeChapter(`chapter-${index}`, index + 1))

    const reordered = reorderChaptersByIndex(chapters, 9_999, 0)

    expect(reordered).toHaveLength(10_000)
    expect(reordered[0].id).toBe('chapter-9999')
    expect(reordered[0].number).toBe(1)
    expect(reordered[9_999].id).toBe('chapter-9998')
    expect(reordered[9_999].number).toBe(10_000)
    expect(chapters[9_999].number).toBe(10_000)
  })
})

describe('reorderChaptersByIds', () => {
  it('orders chapters by id and renumbers them', () => {
    const chapters = [makeChapter('a', 1), makeChapter('b', 2), makeChapter('c', 3)]

    const reordered = reorderChaptersByIds(chapters, ['b', 'c', 'a'])

    expect(reordered.map(chapter => chapter.id)).toEqual(['b', 'c', 'a'])
    expect(reordered.map(chapter => chapter.number)).toEqual([1, 2, 3])
  })

  it('throws for missing, duplicate, or extra ids', () => {
    const chapters = [makeChapter('a', 1), makeChapter('b', 2), makeChapter('c', 3)]

    expect(() => reorderChaptersByIds(chapters, ['a', 'b'])).toThrow('章节排序数据不完整')
    expect(() => reorderChaptersByIds(chapters, ['a', 'b', 'b'])).toThrow('章节排序数据不完整')
    expect(() => reorderChaptersByIds(chapters, ['a', 'b', 'missing'])).toThrow('章节排序数据不完整')
    expect(() => reorderChaptersByIds(chapters, ['a', 'b', 'c', 'd'])).toThrow('章节排序数据不完整')
  })

  it('renumbers same order when existing numbers are not continuous', () => {
    const chapters = [makeChapter('a', 10), makeChapter('b', 20), makeChapter('c', 30)]

    const reordered = reorderChaptersByIds(chapters, ['a', 'b', 'c'])

    expect(reordered.map(chapter => chapter.number)).toEqual([1, 2, 3])
    expect(chapters.map(chapter => chapter.number)).toEqual([10, 20, 30])
  })
})
