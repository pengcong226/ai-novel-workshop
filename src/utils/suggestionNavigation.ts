export interface SuggestionNavInstruction {
  menu: 'chapters' | 'characters'
  chapterNumber?: number
  characterId?: string
}

const CHAPTER_LIST_TARGET = '/chapters'
const CHAPTER_DETAIL_PATTERN = /^\/chapters\/(\d+)$/
const CHARACTER_DETAIL_PATTERN = /^\/characters\/([^/]+)$/

export function resolveSuggestionNavigation(target: string): SuggestionNavInstruction | null {
  if (!target) {
    return null
  }

  if (target === CHAPTER_LIST_TARGET) {
    return { menu: 'chapters' }
  }

  const chapterMatch = target.match(CHAPTER_DETAIL_PATTERN)
  if (chapterMatch) {
    const chapterNumber = Number(chapterMatch[1])
    if (!Number.isInteger(chapterNumber)) {
      return null
    }

    return {
      menu: 'chapters',
      chapterNumber
    }
  }

  const characterMatch = target.match(CHARACTER_DETAIL_PATTERN)
  if (characterMatch) {
    return {
      menu: 'characters',
      characterId: characterMatch[1]
    }
  }

  return null
}
