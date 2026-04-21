import { describe, expect, it } from 'vitest'
import { detectChapterPattern, getChapterPatterns, parseChapters } from '@/utils/chapterParser'

const sampleText = `第1章 初见\n云层低垂，山门初开。\n\n第二回 夜雨\n雨打青石，灯火阑珊。\n\n第三节 残局\n棋盘已乱，旧事重提。\n\n1. 破局\n少年提剑，众人侧目。`

describe('chapterParser manual pattern selection', () => {
  it('uses auto detection by default', () => {
    const pattern = detectChapterPattern(sampleText)
    expect(pattern?.name).toBeTruthy()

    const chapters = parseChapters(sampleText, pattern)
    expect(chapters.length).toBeGreaterThan(0)
  })

  it('re-parses chapters when pattern switches', () => {
    const allPatterns = getChapterPatterns()
    const chapterPattern = allPatterns.find(pattern => pattern.name === '第X章')
    const sectionPattern = allPatterns.find(pattern => pattern.name === '第X节')
    const numericPattern = allPatterns.find(pattern => pattern.name === '数字编号')

    expect(chapterPattern).toBeTruthy()
    expect(sectionPattern).toBeTruthy()
    expect(numericPattern).toBeTruthy()

    const chapterOnly = parseChapters(sampleText, chapterPattern)
    const sectionOnly = parseChapters(sampleText, sectionPattern)
    const numericOnly = parseChapters(sampleText, numericPattern)

    expect(chapterOnly.length).toBe(1)
    expect(chapterOnly[0].title).toContain('第1章')

    expect(sectionOnly.length).toBe(1)
    expect(sectionOnly[0].title).toContain('第三节')

    expect(numericOnly.length).toBe(1)
    expect(numericOnly[0].title).toContain('1.')
  })
})
