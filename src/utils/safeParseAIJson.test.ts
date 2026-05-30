import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock logger so safeParseAIJson doesn't fail on import
vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

import { safeParseAIJson } from '@/utils/safeParseAIJson'

describe('safeParseAIJson', () => {
  it('returns null for empty string', () => {
    expect(safeParseAIJson('')).toBeNull()
  })

  it('returns null for non-string input', () => {
    expect(safeParseAIJson(null as any)).toBeNull()
    expect(safeParseAIJson(undefined as any)).toBeNull()
  })

  it('parses a plain JSON object', () => {
    const result = safeParseAIJson('{"a":1,"b":"hello"}')
    expect(result).toEqual({ a: 1, b: 'hello' })
  })

  it('parses a plain JSON array', () => {
    const result = safeParseAIJson('[1,2,3]')
    expect(result).toEqual([1, 2, 3])
  })

  it('parses JSON wrapped in ```json code block', () => {
    const raw = '```json\n{"key":"value"}\n```'
    expect(safeParseAIJson(raw)).toEqual({ key: 'value' })
  })

  it('parses JSON wrapped in plain ``` code block', () => {
    const raw = '```\n[1, 2]\n```'
    expect(safeParseAIJson(raw)).toEqual([1, 2])
  })

  it('extracts JSON object embedded in surrounding text', () => {
    const raw = 'Here is the result: {"x": 10} end of message'
    expect(safeParseAIJson(raw)).toEqual({ x: 10 })
  })

  it('extracts JSON array embedded in surrounding text', () => {
    const raw = 'Result: ["a","b"] done'
    expect(safeParseAIJson(raw)).toEqual(['a', 'b'])
  })

  it('returns null for completely unparseable input', () => {
    expect(safeParseAIJson('this is not json at all')).toBeNull()
  })

  it('trims whitespace before parsing', () => {
    const raw = '  \n  {"trimmed": true}  \n  '
    expect(safeParseAIJson(raw)).toEqual({ trimmed: true })
  })

  it('handles nested JSON in code block with extra whitespace', () => {
    const raw = '```json  \n  {"nested": {"deep": true}}  \n```'
    expect(safeParseAIJson(raw)).toEqual({ nested: { deep: true } })
  })
})
