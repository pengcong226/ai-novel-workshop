export interface ChapterOrderItem {
  id: string
  number: number
}

function isValidIndex(index: number, length: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < length
}

function hasSameOrderedIds<T extends ChapterOrderItem>(chapters: T[], orderedIds: string[]): boolean {
  return chapters.length === orderedIds.length && chapters.every((chapter, index) => chapter.id === orderedIds[index])
}

function hasCompleteUniqueIdOrder<T extends ChapterOrderItem>(chapters: T[], orderedIds: string[]): boolean {
  if (chapters.length !== orderedIds.length) {
    return false
  }

  const chapterIds = new Set(chapters.map(chapter => chapter.id))
  if (chapterIds.size !== chapters.length) {
    return false
  }

  const orderedIdSet = new Set(orderedIds)
  if (orderedIdSet.size !== orderedIds.length) {
    return false
  }

  return orderedIds.every(id => chapterIds.has(id))
}

function renumberChapters<T extends ChapterOrderItem>(chapters: T[]): T[] {
  return chapters.map((chapter, index) => ({
    ...chapter,
    number: index + 1,
  }))
}

export function reorderChaptersByIndex<T extends ChapterOrderItem>(
  chapters: T[],
  fromIndex: number,
  toIndex: number
): T[] {
  if (!isValidIndex(fromIndex, chapters.length) || !isValidIndex(toIndex, chapters.length)) {
    return chapters
  }

  if (fromIndex === toIndex) {
    return chapters
  }

  const reordered = [...chapters]
  const [moved] = reordered.splice(fromIndex, 1)
  reordered.splice(toIndex, 0, moved)

  return renumberChapters(reordered)
}

export function assertValidChapterOrder<T extends ChapterOrderItem>(chapters: T[], orderedIds: string[]): void {
  if (!hasCompleteUniqueIdOrder(chapters, orderedIds)) {
    throw new Error('章节排序数据不完整')
  }
}

export function reorderChaptersByIds<T extends ChapterOrderItem>(chapters: T[], orderedIds: string[]): T[] {
  assertValidChapterOrder(chapters, orderedIds)

  if (hasSameOrderedIds(chapters, orderedIds) && chapters.every((chapter, index) => chapter.number === index + 1)) {
    return chapters
  }

  const chapterById = new Map(chapters.map(chapter => [chapter.id, chapter]))
  const reordered = orderedIds.map(id => chapterById.get(id)!)

  return renumberChapters(reordered)
}
