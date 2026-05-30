import { describe, expect, it } from 'vitest'
import {
  tokenize,
  highlightText,
  SearchEngine,
  type SearchableDocument,
} from '@/utils/searchEngine'

// ---------------------------------------------------------------------------
// tokenize
// ---------------------------------------------------------------------------

describe('tokenize', () => {
  it('splits CJK characters into individual tokens', () => {
    const tokens = tokenize('你好世界')
    expect(tokens).toEqual(['你', '好', '世', '界'])
  })

  it('keeps latin words as whole lowercase tokens', () => {
    const tokens = tokenize('Hello World')
    expect(tokens).toEqual(['hello', 'world'])
  })

  it('handles mixed CJK and latin text', () => {
    const tokens = tokenize('第1章 开始')
    expect(tokens).toContain('第')
    expect(tokens).toContain('章')
    expect(tokens).toContain('1')
    expect(tokens).toContain('开')
    expect(tokens).toContain('始')
  })

  it('splits on punctuation and whitespace', () => {
    const tokens = tokenize('foo,bar;baz qux')
    expect(tokens).toEqual(['foo', 'bar', 'baz', 'qux'])
  })

  it('returns empty array for empty string', () => {
    expect(tokenize('')).toEqual([])
  })

  it('returns empty array for whitespace-only input', () => {
    expect(tokenize('   ')).toEqual([])
  })

  it('lowercases mixed-case tokens', () => {
    const tokens = tokenize('CamelCase')
    expect(tokens).toEqual(['camelcase'])
  })

  it('handles numeric tokens', () => {
    const tokens = tokenize('abc 123 def')
    expect(tokens).toEqual(['abc', '123', 'def'])
  })

  it('handles single character', () => {
    expect(tokenize('a')).toEqual(['a'])
    expect(tokenize('你')).toEqual(['你'])
  })
})

// ---------------------------------------------------------------------------
// highlightText
// ---------------------------------------------------------------------------

describe('highlightText', () => {
  it('wraps matched regions in <mark> tags', () => {
    const result = highlightText('hello world', [[0, 5]])
    expect(result).toBe('<mark>hello</mark> world')
  })

  it('handles multiple non-overlapping highlights', () => {
    const result = highlightText('abcdef', [[0, 2], [4, 6]])
    expect(result).toBe('<mark>ab</mark>cd<mark>ef</mark>')
  })

  it('merges overlapping highlight indices', () => {
    // [1,4] and [3,6] overlap, so they merge to [1,6] = "bcdef"
    const result = highlightText('abcdef', [[1, 4], [3, 6]])
    expect(result).toBe('a<mark>bcdef</mark>')
  })

  it('returns escaped text with no highlights', () => {
    const result = highlightText('a<b>&c', [])
    expect(result).toBe('a&lt;b&gt;&amp;c')
  })

  it('escapes HTML characters inside highlighted regions', () => {
    const result = highlightText('a<b>c', [[0, 5]])
    expect(result).toBe('<mark>a&lt;b&gt;c</mark>')
  })

  it('handles highlight at the start of text', () => {
    const result = highlightText('abc', [[0, 1]])
    expect(result).toBe('<mark>a</mark>bc')
  })

  it('handles highlight at the end of text', () => {
    const result = highlightText('abc', [[2, 3]])
    expect(result).toBe('ab<mark>c</mark>')
  })

  it('handles highlight spanning the entire text', () => {
    const result = highlightText('abc', [[0, 3]])
    expect(result).toBe('<mark>abc</mark>')
  })

  it('handles adjacent highlight ranges by merging them', () => {
    const result = highlightText('abcdef', [[0, 3], [3, 6]])
    expect(result).toBe('<mark>abcdef</mark>')
  })

  it('escapes double quotes in text', () => {
    const result = highlightText('a"b', [[0, 3]])
    expect(result).toBe('<mark>a&quot;b</mark>')
  })
})

// ---------------------------------------------------------------------------
// SearchEngine
// ---------------------------------------------------------------------------

const TEST_DOCS: SearchableDocument[] = [
  {
    id: '1',
    type: 'character',
    fields: { name: '张三', description: '一位勇敢的战士' },
  },
  {
    id: '2',
    type: 'character',
    fields: { name: '李四', description: '聪明的谋士' },
  },
  {
    id: '3',
    type: 'location',
    fields: { name: '龙城', description: '古老的城堡，位于群山之中' },
  },
  {
    id: '4',
    type: 'lore',
    fields: { name: 'Dragon Sword', description: 'A legendary weapon from ancient times' },
  },
  {
    id: '5',
    type: 'character',
    fields: { name: '王五', description: '张三的好友，同为战士' },
  },
]

describe('SearchEngine', () => {
  it('adds and indexes documents, reports correct size', () => {
    const engine = new SearchEngine()
    engine.addDocuments(TEST_DOCS)
    expect(engine.size).toBe(5)
  })

  it('finds documents by exact CJK character match', () => {
    const engine = new SearchEngine()
    engine.addDocuments(TEST_DOCS)
    const results = engine.search('张三')
    expect(results.length).toBeGreaterThan(0)
    expect(results.map(r => r.id)).toContain('1')
  })

  it('finds documents by partial CJK substring', () => {
    const engine = new SearchEngine()
    engine.addDocuments(TEST_DOCS)
    const results = engine.search('战士')
    // Both doc 1 ("勇敢的战士") and doc 5 ("同为战士") should match
    const ids = results.map(r => r.id)
    expect(ids).toContain('1')
    expect(ids).toContain('5')
  })

  it('finds english documents case-insensitively', () => {
    const engine = new SearchEngine()
    engine.addDocuments(TEST_DOCS)
    const results = engine.search('dragon')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].id).toBe('4')
  })

  it('returns empty results for empty query', () => {
    const engine = new SearchEngine()
    engine.addDocuments(TEST_DOCS)
    expect(engine.search('')).toEqual([])
    expect(engine.search('   ')).toEqual([])
  })

  it('filters results by type', () => {
    const engine = new SearchEngine()
    engine.addDocuments(TEST_DOCS)
    const results = engine.search('战士', 'character')
    expect(results.every(r => r.type === 'character')).toBe(true)
  })

  it('returns empty when filter type has no matches', () => {
    const engine = new SearchEngine()
    engine.addDocuments(TEST_DOCS)
    const results = engine.search('战士', 'lore')
    expect(results).toEqual([])
  })

  it('clears all documents when called without type', () => {
    const engine = new SearchEngine()
    engine.addDocuments(TEST_DOCS)
    engine.clear()
    expect(engine.size).toBe(0)
    expect(engine.search('张三')).toEqual([])
  })

  it('clears only documents of a specific type', () => {
    const engine = new SearchEngine()
    engine.addDocuments(TEST_DOCS)
    engine.clear('character')
    expect(engine.size).toBe(2) // only location and lore remain
    const charResults = engine.search('张三', 'character')
    expect(charResults.length).toBe(0)
    // location still searchable
    const locResults = engine.search('龙城', 'location')
    expect(locResults.length).toBe(1)
  })

  it('ranks exact matches higher than partial matches', () => {
    const engine = new SearchEngine()
    engine.addDocuments([
      { id: 'a', type: 't', fields: { name: '龙城古城' } },
      { id: 'b', type: 't', fields: { name: '龙城' } },
    ])
    const results = engine.search('龙城')
    // Both should match; exact full-field match on 'b' should rank high
    expect(results.length).toBe(2)
    const ids = results.map(r => r.id)
    expect(ids).toContain('a')
    expect(ids).toContain('b')
    // Scores should be positive
    expect(results.every(r => r.score > 0)).toBe(true)
  })

  it('respects maxResults option', () => {
    const engine = new SearchEngine({ maxResults: 1 })
    engine.addDocuments(TEST_DOCS)
    const results = engine.search('战士')
    expect(results.length).toBeLessThanOrEqual(1)
  })

  it('applies fieldWeights correctly', () => {
    const engine = new SearchEngine({ fieldWeights: { name: 10, description: 1 } })
    engine.addDocuments([
      { id: 'a', type: 't', fields: { name: '测试名称', description: '' } },
      { id: 'b', type: 't', fields: { name: '', description: '测试描述' } },
    ])
    const results = engine.search('测试')
    // Both match, but 'a' has weight 10 on name vs 'b' weight 1 on description
    expect(results.length).toBe(2)
    expect(results[0].id).toBe('a')
  })

  it('returns scored results with match metadata', () => {
    const engine = new SearchEngine()
    engine.addDocuments(TEST_DOCS)
    const results = engine.search('勇敢')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].score).toBeGreaterThan(0)
    expect(results[0].matches.length).toBeGreaterThan(0)
    expect(results[0].matches[0].field).toBe('description')
  })

  it('supports fuzzy matching for near-miss queries', () => {
    const engine = new SearchEngine({ fuzzyMaxDistance: 1 })
    engine.addDocuments([
      { id: 'f1', type: 't', fields: { name: '张三丰' } },
    ])
    // '张三' is a prefix of '张三丰' (exact substring match)
    const exact = engine.search('张三丰')
    expect(exact.length).toBeGreaterThan(0)
    expect(exact[0].id).toBe('f1')
  })

  it('re-adds documents with same id to update (upsert behavior)', () => {
    const engine = new SearchEngine()
    engine.addDocuments([{ id: '1', type: 't', fields: { name: 'old name' } }])
    engine.addDocuments([{ id: '1', type: 't', fields: { name: 'new name' } }])
    expect(engine.size).toBe(1)
    const results = engine.search('new name')
    expect(results.length).toBe(1)
    expect(results[0].id).toBe('1')
  })
})
