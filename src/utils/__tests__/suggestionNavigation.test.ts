import { describe, expect, it } from 'vitest'
import { resolveSuggestionNavigation } from '../suggestionNavigation'

describe('resolveSuggestionNavigation', () => {
  it('resolves chapter list target', () => {
    expect(resolveSuggestionNavigation('/chapters')).toEqual({ menu: 'chapters' })
  })

  it('resolves chapter detail target', () => {
    expect(resolveSuggestionNavigation('/chapters/12')).toEqual({
      menu: 'chapters',
      chapterNumber: 12
    })
  })

  it('resolves character detail target', () => {
    expect(resolveSuggestionNavigation('/characters/char_01')).toEqual({
      menu: 'characters',
      characterId: 'char_01'
    })
  })

  it('returns null for unknown target', () => {
    expect(resolveSuggestionNavigation('/unknown')).toBeNull()
  })
})
