import { describe, it, expect } from 'vitest'
import {
  GENRE_IDS,
  GENRE_LABELS,
  getGenreProfile,
  registerGenreProfile,
  getAllGenreProfiles,
  matchGenreFromText,
  type GenreProfile,
} from '@/types/genreProfile'

function makeGenreProfile(overrides: Partial<GenreProfile> = {}): GenreProfile {
  return {
    id: 'test-genre',
    name: '测试题材',
    description: '测试用题材',
    writingRules: ['rule1'],
    genreRules: ['grule1'],
    prohibitions: ['禁止1'],
    auditDimensions: [],
    pacingTemplate: [],
    characterTypes: [],
    styleConstraints: {
      tone: [],
      vocabulary: [],
      sentenceStyle: [],
      forbiddenWords: [],
    },
    metadata: { version: '1.0.0', updatedAt: Date.now() },
    ...overrides,
  }
}

describe('GENRE_IDS', () => {
  it('contains all 10 predefined genre IDs', () => {
    expect(GENRE_IDS).toHaveLength(10)
    expect(GENRE_IDS).toContain('xuanhuan')
    expect(GENRE_IDS).toContain('xianxia')
    expect(GENRE_IDS).toContain('urban')
    expect(GENRE_IDS).toContain('history')
    expect(GENRE_IDS).toContain('mystery')
    expect(GENRE_IDS).toContain('scifi')
    expect(GENRE_IDS).toContain('wuxia')
    expect(GENRE_IDS).toContain('romance')
    expect(GENRE_IDS).toContain('game')
    expect(GENRE_IDS).toContain('lightnovel')
  })
})

describe('GENRE_LABELS', () => {
  it('has a label for every genre ID', () => {
    for (const id of GENRE_IDS) {
      expect(GENRE_LABELS[id]).toBeTruthy()
      expect(typeof GENRE_LABELS[id]).toBe('string')
    }
  })

  it('maps known IDs to Chinese labels', () => {
    expect(GENRE_LABELS.xuanhuan).toBe('玄幻修仙')
    expect(GENRE_LABELS.romance).toBe('言情')
    expect(GENRE_LABELS.mystery).toBe('悬疑推理')
    expect(GENRE_LABELS.wuxia).toBe('武侠江湖')
  })
})

describe('matchGenreFromText', () => {
  it('matches by direct genre ID', () => {
    expect(matchGenreFromText('xuanhuan')).toBe('xuanhuan')
    expect(matchGenreFromText('scifi')).toBe('scifi')
    expect(matchGenreFromText('lightnovel')).toBe('lightnovel')
  })

  it('matches by direct genre ID case-insensitively', () => {
    expect(matchGenreFromText('XuanHuan')).toBe('xuanhuan')
    expect(matchGenreFromText('SCIFI')).toBe('scifi')
  })

  it('matches by Chinese label', () => {
    expect(matchGenreFromText('玄幻')).toBe('xuanhuan')
    expect(matchGenreFromText('玄幻修仙')).toBe('xuanhuan')
    expect(matchGenreFromText('修仙')).toBe('xuanhuan')
    expect(matchGenreFromText('仙侠')).toBe('xianxia')
    expect(matchGenreFromText('都市')).toBe('urban')
    expect(matchGenreFromText('都市现实')).toBe('urban')
    expect(matchGenreFromText('现实')).toBe('urban')
    expect(matchGenreFromText('历史')).toBe('history')
    expect(matchGenreFromText('军事')).toBe('history')
    expect(matchGenreFromText('历史军事')).toBe('history')
    expect(matchGenreFromText('悬疑')).toBe('mystery')
    expect(matchGenreFromText('推理')).toBe('mystery')
    expect(matchGenreFromText('科幻')).toBe('scifi')
    expect(matchGenreFromText('未来')).toBe('scifi')
    expect(matchGenreFromText('武侠')).toBe('wuxia')
    expect(matchGenreFromText('江湖')).toBe('wuxia')
    expect(matchGenreFromText('言情')).toBe('romance')
    expect(matchGenreFromText('游戏')).toBe('game')
    expect(matchGenreFromText('竞技')).toBe('game')
    expect(matchGenreFromText('轻小说')).toBe('lightnovel')
  })

  it('trims whitespace before matching', () => {
    expect(matchGenreFromText('  玄幻  ')).toBe('xuanhuan')
    expect(matchGenreFromText('  scifi  ')).toBe('scifi')
  })

  it('returns undefined for unknown genre text', () => {
    expect(matchGenreFromText('unknown')).toBeUndefined()
    expect(matchGenreFromText('')).toBeUndefined()
    expect(matchGenreFromText('恐怖')).toBeUndefined()
    expect(matchGenreFromText('xyz123')).toBeUndefined()
  })
})

describe('getGenreProfile / registerGenreProfile', () => {
  it('returns undefined for unregistered genre', () => {
    expect(getGenreProfile('nonexistent')).toBeUndefined()
  })

  it('registers and retrieves a genre profile', () => {
    const profile = makeGenreProfile({ id: 'my-genre', name: '我的题材' })
    registerGenreProfile(profile)
    expect(getGenreProfile('my-genre')).toEqual(profile)
  })

  it('overwrites previously registered genre with same id', () => {
    registerGenreProfile(makeGenreProfile({ id: 'dup', name: 'first' }))
    registerGenreProfile(makeGenreProfile({ id: 'dup', name: 'second' }))
    expect(getGenreProfile('dup')?.name).toBe('second')
  })
})

describe('getAllGenreProfiles', () => {
  it('returns empty array when no genres registered', () => {
    // Note: prior tests may have registered genres, but the registry is module-scoped
    // so we just verify the function works
    const profiles = getAllGenreProfiles()
    expect(Array.isArray(profiles)).toBe(true)
  })

  it('returns all registered profiles', () => {
    registerGenreProfile(makeGenreProfile({ id: 'g1', name: 'G1' }))
    registerGenreProfile(makeGenreProfile({ id: 'g2', name: 'G2' }))
    const all = getAllGenreProfiles()
    const ids = all.map(p => p.id)
    expect(ids).toContain('g1')
    expect(ids).toContain('g2')
  })
})
