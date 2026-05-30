import { describe, it, expect } from 'vitest'
import { countTokens, estimateTokens, countChunksTokens, estimateCost } from './tokenizer'

describe('tokenizer', () => {
  // -------------------------------------------------------------------
  // estimateTokens
  // -------------------------------------------------------------------
  describe('estimateTokens', () => {
    it('returns 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0)
    })

    it('estimates pure Chinese text tokens (approx 1.5 per char)', () => {
      const text = '你好世界' // 4 Chinese chars → 4 * 1.5 = 6
      expect(estimateTokens(text)).toBe(6)
    })

    it('estimates pure English text tokens (approx 1 per 4 chars)', () => {
      const text = 'hello' // 5 English chars → 5 / 4 = 1.25 → ceil = 2
      expect(estimateTokens(text)).toBe(2)
    })

    it('estimates mixed Chinese and English text', () => {
      const text = '你好hello' // 2 Chinese + 5 English
      // Chinese: 2 * 1.5 = 3, English: 5/4 = 1.25, Other: 0
      // ceil(3 + 1.25) = 5
      expect(estimateTokens(text)).toBe(5)
    })

    it('treats punctuation and spaces as other characters (1 per 3 chars)', () => {
      const text = '...   ' // 6 other chars → 6/3 = 2
      expect(estimateTokens(text)).toBe(2)
    })

    it('handles text with numbers (counted as other chars)', () => {
      const text = '123456' // 6 digits (other) → 6/3 = 2
      expect(estimateTokens(text)).toBe(2)
    })

    it('returns 0 for null/undefined-like empty edge case', () => {
      // The function checks !text, so empty string is 0
      expect(estimateTokens('')).toBe(0)
    })

    it('handles long mixed-content text proportionally', () => {
      const chinese = '你'.repeat(100) // 100 * 1.5 = 150
      const english = 'a'.repeat(40) // 40/4 = 10
      const other = ' '.repeat(30) // 30/3 = 10
      // total = ceil(150 + 10 + 10) = 170
      expect(estimateTokens(chinese + english + other)).toBe(170)
    })

    it('handles Chinese punctuation (counted as other)', () => {
      // Chinese punctuation like '，'、'。' are not in the 一-龥 range
      const text = '你好。' // 2 Chinese chars + 1 Chinese punctuation (other)
      // Chinese: 2 * 1.5 = 3, English: 0, Other: 1 (the 。) → 1/3 = 0.333
      // ceil(3 + 0 + 0.333) = 4
      expect(estimateTokens(text)).toBe(4)
    })
  })

  // -------------------------------------------------------------------
  // countTokens
  // -------------------------------------------------------------------
  describe('countTokens', () => {
    it('uses gpt-tokenizer for openai provider', () => {
      const result = countTokens('Hello world', 'openai')
      // gpt-tokenizer returns a real token count, should be > 0
      expect(result).toBeGreaterThan(0)
      expect(typeof result).toBe('number')
    })

    it('uses estimateTokens for anthropic provider', () => {
      const text = '你好世界'
      const result = countTokens(text, 'anthropic')
      expect(result).toBe(estimateTokens(text))
    })

    it('uses ceil(length/3) for local provider', () => {
      const text = 'hello' // 5 chars → ceil(5/3) = 2
      expect(countTokens(text, 'local')).toBe(2)
    })

    it('uses ceil(length/3) for custom provider', () => {
      const text = 'hello' // 5 chars → ceil(5/3) = 2
      expect(countTokens(text, 'custom')).toBe(2)
    })

    it('uses ceil(length/3) for unknown/default provider', () => {
      const text = 'abcdef' // 6 chars → ceil(6/3) = 2
      // @ts-expect-error testing unknown provider
      expect(countTokens(text, 'unknown')).toBe(2)
    })

    it('returns correct count for long Chinese text with openai', () => {
      const text = '这是一段很长的中文测试文本，用于测试token计算功能。'
      const result = countTokens(text, 'openai')
      // gpt-tokenizer should produce a reasonable count
      expect(result).toBeGreaterThan(5)
      expect(result).toBeLessThan(100)
    })
  })

  // -------------------------------------------------------------------
  // countChunksTokens
  // -------------------------------------------------------------------
  describe('countChunksTokens', () => {
    it('returns 0 for empty array', () => {
      expect(countChunksTokens([], 'openai')).toBe(0)
    })

    it('sums token counts across multiple chunks', () => {
      const chunks = [{ text: 'hello' }, { text: 'world' }]
      const expected = countTokens('hello', 'anthropic') + countTokens('world', 'anthropic')
      expect(countChunksTokens(chunks, 'anthropic')).toBe(expected)
    })

    it('handles single chunk', () => {
      const chunks = [{ text: 'test text' }]
      expect(countChunksTokens(chunks, 'local')).toBe(countTokens('test text', 'local'))
    })

    it('handles chunks with empty text', () => {
      const chunks = [{ text: '' }, { text: 'hello' }]
      expect(countChunksTokens(chunks, 'anthropic')).toBe(countTokens('hello', 'anthropic'))
    })
  })

  // -------------------------------------------------------------------
  // estimateCost
  // -------------------------------------------------------------------
  describe('estimateCost', () => {
    it('returns 0 when both token counts are 0', () => {
      expect(estimateCost(0, 0, 10, 30)).toBe(0)
    })

    it('calculates cost correctly with known values', () => {
      // 1000 input tokens at $10/M + 500 output tokens at $30/M
      const cost = estimateCost(1000, 500, 10, 30)
      // (1000 * 10 + 500 * 30) / 1_000_000 = (10000 + 15000) / 1_000_000 = 0.025
      expect(cost).toBeCloseTo(0.025, 6)
    })

    it('handles zero input price', () => {
      const cost = estimateCost(1000, 500, 0, 30)
      // (0 + 500 * 30) / 1_000_000 = 0.015
      expect(cost).toBeCloseTo(0.015, 6)
    })

    it('handles zero output price', () => {
      const cost = estimateCost(1000, 500, 10, 0)
      // (1000 * 10 + 0) / 1_000_000 = 0.01
      expect(cost).toBeCloseTo(0.01, 6)
    })

    it('scales linearly with token count', () => {
      const cost1 = estimateCost(1000, 0, 10, 0)
      const cost2 = estimateCost(2000, 0, 10, 0)
      expect(cost2).toBeCloseTo(cost1 * 2, 6)
    })

    it('handles very large token counts', () => {
      const cost = estimateCost(1_000_000, 1_000_000, 3, 15)
      // (1M * 3 + 1M * 15) / 1M = 18
      expect(cost).toBeCloseTo(18, 4)
    })
  })
})
