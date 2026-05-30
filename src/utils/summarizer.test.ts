import { describe, it, expect } from 'vitest'
import {
  determineSummaryDetail,
  getTargetLength,
  createContentHash,
  checkSummaryQuality,
  SummaryLevel,
  SummaryDetail,
  SUMMARY_GENERATION_VERSION,
  type ChapterSummaryData,
} from './summarizer'

// ────────────────────────────────────────────────────────────
// SummaryLevel / SummaryDetail enums
// ────────────────────────────────────────────────────────────

describe('SummaryLevel enum', () => {
  it('defines CHAPTER, VOLUME, BOOK', () => {
    expect(SummaryLevel.CHAPTER).toBe('chapter')
    expect(SummaryLevel.VOLUME).toBe('volume')
    expect(SummaryLevel.BOOK).toBe('book')
  })
})

describe('SummaryDetail enum', () => {
  it('defines FULL, DETAILED, BRIEF, MINIMAL', () => {
    expect(SummaryDetail.FULL).toBe('full')
    expect(SummaryDetail.DETAILED).toBe('detailed')
    expect(SummaryDetail.BRIEF).toBe('brief')
    expect(SummaryDetail.MINIMAL).toBe('minimal')
  })
})

// ────────────────────────────────────────────────────────────
// SUMMARY_GENERATION_VERSION
// ────────────────────────────────────────────────────────────

describe('SUMMARY_GENERATION_VERSION', () => {
  it('is a positive number', () => {
    expect(SUMMARY_GENERATION_VERSION).toBeGreaterThan(0)
    expect(typeof SUMMARY_GENERATION_VERSION).toBe('number')
  })
})

// ────────────────────────────────────────────────────────────
// determineSummaryDetail
// ────────────────────────────────────────────────────────────

describe('determineSummaryDetail', () => {
  it('returns FULL when distance <= 3', () => {
    expect(determineSummaryDetail(7, 10)).toBe(SummaryDetail.FULL)
    expect(determineSummaryDetail(10, 10)).toBe(SummaryDetail.FULL)
    expect(determineSummaryDetail(8, 10)).toBe(SummaryDetail.FULL)
    expect(determineSummaryDetail(7, 10)).toBe(SummaryDetail.FULL)
  })

  it('returns DETAILED when distance is 4-10', () => {
    expect(determineSummaryDetail(6, 10)).toBe(SummaryDetail.DETAILED)
    expect(determineSummaryDetail(1, 10)).toBe(SummaryDetail.DETAILED)
    expect(determineSummaryDetail(0, 10)).toBe(SummaryDetail.DETAILED)
  })

  it('returns BRIEF when distance is 11-30', () => {
    expect(determineSummaryDetail(-20, 10)).toBe(SummaryDetail.BRIEF)
    // distance = 10 - (-20) = 30
    // Actually distance = currentChapter - chapterNumber = 10 - (-20) = 30
    // 30 > 10 so it's BRIEF (30 <= 30)
    expect(determineSummaryDetail(0, 21)).toBe(SummaryDetail.BRIEF)
    // distance = 21 - 0 = 21, 11 <= 21 <= 30
  })

  it('returns MINIMAL when distance > 30', () => {
    expect(determineSummaryDetail(1, 50)).toBe(SummaryDetail.MINIMAL)
    // distance = 50 - 1 = 49 > 30
    expect(determineSummaryDetail(0, 100)).toBe(SummaryDetail.MINIMAL)
  })

  it('returns FULL for current chapter (distance 0)', () => {
    expect(determineSummaryDetail(5, 5)).toBe(SummaryDetail.FULL)
  })

  it('returns DETAILED at distance boundary (4)', () => {
    expect(determineSummaryDetail(6, 10)).toBe(SummaryDetail.DETAILED)
  })

  it('returns BRIEF at distance boundary (11)', () => {
    expect(determineSummaryDetail(9, 20)).toBe(SummaryDetail.BRIEF)
    // distance = 20 - 9 = 11
  })

  it('returns MINIMAL at distance boundary (31)', () => {
    expect(determineSummaryDetail(9, 40)).toBe(SummaryDetail.MINIMAL)
    // distance = 40 - 9 = 31
  })
})

// ────────────────────────────────────────────────────────────
// getTargetLength
// ────────────────────────────────────────────────────────────

describe('getTargetLength', () => {
  it('returns 0 for FULL detail', () => {
    expect(getTargetLength(SummaryDetail.FULL)).toBe(0)
  })

  it('returns 500 for DETAILED detail', () => {
    expect(getTargetLength(SummaryDetail.DETAILED)).toBe(500)
  })

  it('returns 200 for BRIEF detail', () => {
    expect(getTargetLength(SummaryDetail.BRIEF)).toBe(200)
  })

  it('returns 100 for MINIMAL detail', () => {
    expect(getTargetLength(SummaryDetail.MINIMAL)).toBe(100)
  })

  it('returns 200 as default for unknown detail', () => {
    // @ts-expect-error testing unknown detail
    expect(getTargetLength('unknown')).toBe(200)
  })
})

// ────────────────────────────────────────────────────────────
// createContentHash
// ────────────────────────────────────────────────────────────

describe('createContentHash', () => {
  it('returns a string starting with "summary-"', () => {
    const hash = createContentHash('test content')
    expect(hash).toMatch(/^summary-/)
  })

  it('produces same hash for same input', () => {
    const content = '相同的内容'
    expect(createContentHash(content)).toBe(createContentHash(content))
  })

  it('produces different hashes for different inputs', () => {
    expect(createContentHash('内容A')).not.toBe(createContentHash('内容B'))
  })

  it('produces consistent hash for empty string', () => {
    const hash = createContentHash('')
    expect(hash).toBe('summary-0')
  })

  it('handles long text', () => {
    const longText = '这是一个很长的测试。'.repeat(1000)
    const hash = createContentHash(longText)
    expect(hash).toMatch(/^summary-/)
    expect(hash.length).toBeGreaterThan(8)
  })
})

// ────────────────────────────────────────────────────────────
// checkSummaryQuality
// ────────────────────────────────────────────────────────────

function makeSummary(overrides: Partial<ChapterSummaryData> = {}): ChapterSummaryData {
  return {
    id: 'summary-ch1',
    chapterNumber: 1,
    title: '第一章',
    summary: '主角进入星门，然后遇到白榆，接着两人决定合作。因此展开了新的冒险。',
    keyEvents: ['进入星门', '遇到白榆', '决定合作'],
    characters: ['林照', '白榆'],
    locations: ['星门'],
    plotProgression: '主角进入星门，遇到白榆后决定合作',
    wordCount: 5000,
    summaryWordCount: 150,
    tokenCount: 200,
    createdAt: new Date(),
    updatedAt: new Date(),
    level: SummaryLevel.CHAPTER,
    detail: SummaryDetail.DETAILED,
    sourceHash: 'summary-12345',
    summaryVersion: 2,
    ...overrides,
  }
}

describe('checkSummaryQuality', () => {
  it('returns a valid report for a good summary', () => {
    const summary = makeSummary()
    const result = checkSummaryQuality(summary)

    expect(result.isValid).toBe(true)
    expect(result.score).toBeGreaterThanOrEqual(6)
    expect(result.completeness).toBeGreaterThan(0)
    expect(result.coherence).toBeGreaterThan(0)
    expect(result.conciseness).toBeGreaterThan(0)
  })

  it('flags summary that is too short', () => {
    // DETAILED target is 500, summary is only 200 words (< 70% of 500)
    const summary = makeSummary({
      detail: SummaryDetail.DETAILED,
      summaryWordCount: 200,
      summary: '太短了。',
    })
    const result = checkSummaryQuality(summary)

    expect(result.issues).toEqual(
      expect.arrayContaining([expect.stringContaining('摘要过短')])
    )
    expect(result.suggestions).toEqual(
      expect.arrayContaining([expect.stringContaining('补充更多')])
    )
  })

  it('flags summary that is too long', () => {
    // BRIEF target is 200, summary is 500 words (> 150% of 200)
    const summary = makeSummary({
      detail: SummaryDetail.BRIEF,
      summaryWordCount: 500,
      summary: 'a'.repeat(500),
    })
    const result = checkSummaryQuality(summary)

    expect(result.issues).toEqual(
      expect.arrayContaining([expect.stringContaining('摘要过长')])
    )
    expect(result.suggestions).toEqual(
      expect.arrayContaining([expect.stringContaining('精简')])
    )
  })

  it('flags missing key events', () => {
    const summary = makeSummary({ keyEvents: [] })
    const result = checkSummaryQuality(summary)

    expect(result.issues).toEqual(
      expect.arrayContaining([expect.stringContaining('缺少关键事件')])
    )
    expect(result.completeness).toBeLessThan(1.0)
  })

  it('flags missing characters', () => {
    const summary = makeSummary({ characters: [] })
    const result = checkSummaryQuality(summary)

    expect(result.issues).toEqual(
      expect.arrayContaining([expect.stringContaining('缺少出场人物')])
    )
  })

  it('flags missing locations', () => {
    const summary = makeSummary({ locations: [] })
    const result = checkSummaryQuality(summary)

    expect(result.issues).toEqual(
      expect.arrayContaining([expect.stringContaining('缺少场景地点')])
    )
  })

  it('flags missing plot progression', () => {
    const summary = makeSummary({ plotProgression: '' })
    const result = checkSummaryQuality(summary)

    expect(result.issues).toEqual(
      expect.arrayContaining([expect.stringContaining('缺少剧情推进')])
    )
  })

  it('flags summary with high word repetition', () => {
    // Create a summary with heavy repetition
    const repeatedSummary = '重复 这个 这个 这个 这个 这个 这个 东西 东西 东西 东西 东西 东西 事情 事情 事情 事情 事情 事情'
    const summary = makeSummary({
      summary: repeatedSummary,
      summaryWordCount: repeatedSummary.length,
      detail: SummaryDetail.BRIEF, // target 200, so this won't be flagged for length
    })
    const result = checkSummaryQuality(summary)

    // High repetition should trigger the repetition issue
    expect(result.suggestions).toEqual(
      expect.arrayContaining([expect.stringContaining('重复')])
    )
  })

  it('deduplicates suggestions', () => {
    // Multiple issues can produce overlapping suggestions
    const summary = makeSummary({
      keyEvents: [],
      characters: [],
      locations: [],
      plotProgression: '',
    })
    const result = checkSummaryQuality(summary)
    const uniqueSuggestions = [...new Set(result.suggestions)]
    expect(result.suggestions).toEqual(uniqueSuggestions)
  })

  it('gives full completeness when all fields are populated', () => {
    const summary = makeSummary()
    const result = checkSummaryQuality(summary)
    expect(result.completeness).toBe(1.0)
  })

  it('clamps score at 0 minimum', () => {
    const summary = makeSummary({
      keyEvents: [],
      characters: [],
      locations: [],
      plotProgression: '',
      summaryWordCount: 10,
      detail: SummaryDetail.DETAILED, // target 500, very short
      summary: '极短',
    })
    const result = checkSummaryQuality(summary)
    expect(result.score).toBeGreaterThanOrEqual(0)
  })

  it('returns empty issues for optimal summary', () => {
    // Use BRIEF detail with target=200, summary has ~150 words (within 70%-150% range)
    const summary = makeSummary({
      detail: SummaryDetail.BRIEF,
      summaryWordCount: 180,
      summary: '主角进入星门后，然后遇到白榆。接着两人展开对话，但是气氛紧张。因此他们决定暂时合作，所以一起出发。然而前方路途未知。',
    })
    const result = checkSummaryQuality(summary)
    // Should not have length-related issues
    const lengthIssues = result.issues.filter(i => i.includes('过短') || i.includes('过长'))
    expect(lengthIssues).toHaveLength(0)
  })
})
