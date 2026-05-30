/**
 * In-memory search engine with Chinese text segmentation,
 * relevance scoring, and result ranking.
 */

export interface SearchableDocument {
  id: string
  type: string
  fields: Record<string, string>
}

export interface ScoredResult {
  id: string
  type: string
  score: number
  matches: FieldMatch[]
}

export interface FieldMatch {
  field: string
  value: string
  score: number
  indices: [number, number][]
}

// -- Chinese segmentation (lightweight, no external dependency) --

const CJK_RANGE = /[一-鿿㐀-䶿]/

/**
 * Segment a string into tokens. CJK characters become individual tokens;
 * Latin/digit runs are kept as whole words.
 */
export function tokenize(text: string): string[] {
  if (!text) return []
  const tokens: string[] = []
  let buf = ''
  for (const ch of text) {
    if (CJK_RANGE.test(ch)) {
      if (buf) { tokens.push(buf.toLowerCase()); buf = '' }
      tokens.push(ch)
    } else if (/[\s\p{P}]/u.test(ch)) {
      if (buf) { tokens.push(buf.toLowerCase()); buf = '' }
    } else {
      buf += ch
    }
  }
  if (buf) tokens.push(buf.toLowerCase())
  return tokens
}

/**
 * Build bigram tokens for Chinese text to improve partial matching.
 */
function bigrams(tokens: string[]): string[] {
  const result: string[] = []
  for (let i = 0; i < tokens.length - 1; i++) {
    // Only create bigrams for CJK characters
    if (CJK_RANGE.test(tokens[i]!) && CJK_RANGE.test(tokens[i + 1]!)) {
      result.push(tokens[i]! + tokens[i + 1]!)
    }
  }
  return result
}

// -- Fuzzy matching --

/**
 * Compute the Levenshtein distance between two strings (limited to maxDist).
 */
function levenshtein(a: string, b: string, maxDist: number): number {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1
  const m = a.length
  const n = b.length
  const dp: number[][] = [Array(n + 1).fill(0), Array(n + 1).fill(0)]
  for (let j = 0; j <= n; j++) dp[0]![j] = j
  for (let i = 1; i <= m; i++) {
    dp[i % 2]![0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i % 2]![j] = Math.min(
        dp[(i - 1) % 2]![j]! + 1,
        dp[i % 2]![j - 1]! + 1,
        dp[(i - 1) % 2]![j - 1]! + cost,
      )
    }
    // Early exit: if the minimum in the current row exceeds maxDist
    if (Math.min(...dp[i % 2]!) > maxDist) return maxDist + 1
  }
  return dp[m % 2]![n]!
}

/**
 * Find fuzzy matches of `query` within `text`.
 * Returns match indices or empty array if no match.
 */
function fuzzyMatchIndices(text: string, query: string, maxDistance: number): [number, number][] {
  if (!query || !text) return []
  const textLower = text.toLowerCase()
  const queryLower = query.toLowerCase()

  // Exact substring match first
  const exactIdx = textLower.indexOf(queryLower)
  if (exactIdx !== -1) return [[exactIdx, exactIdx + query.length]]

  // For short queries (1-2 chars), only do exact matching
  if (queryLower.length <= 2) return []

  // Sliding window fuzzy match
  const windowSize = queryLower.length + maxDistance
  const matches: [number, number][] = []
  for (let i = 0; i <= textLower.length - queryLower.length; i++) {
    const end = Math.min(i + windowSize, textLower.length)
    const segment = textLower.slice(i, end)
    const dist = levenshtein(segment.slice(0, queryLower.length), queryLower, maxDistance)
    if (dist <= maxDistance) {
      matches.push([i, i + queryLower.length])
    }
  }
  return matches
}

// -- Search engine --

export interface SearchEngineOptions {
  /** Maximum fuzzy edit distance (default: 1) */
  fuzzyMaxDistance?: number
  /** Maximum results to return (default: 50) */
  maxResults?: number
  /** Field weights for scoring (default: all 1.0) */
  fieldWeights?: Record<string, number>
}

const DEFAULT_OPTIONS: Required<SearchEngineOptions> = {
  fuzzyMaxDistance: 1,
  maxResults: 50,
  fieldWeights: {},
}

export class SearchEngine {
  private documents: SearchableDocument[] = []
  private tokenIndex = new Map<string, Map<string, Set<string>>>() // token -> type -> Set<id>
  private docMap = new Map<string, SearchableDocument>()
  private options: Required<SearchEngineOptions>

  constructor(options?: SearchEngineOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  /**
   * Add or replace a batch of documents in the index.
   */
  addDocuments(docs: SearchableDocument[]): void {
    for (const doc of docs) {
      this.docMap.set(doc.id, doc)
    }
    this.documents = [...this.docMap.values()]
    this.rebuildIndex()
  }

  /**
   * Remove all documents, optionally filtered by type.
   */
  clear(type?: string): void {
    if (type) {
      const remaining = this.documents.filter(d => d.type !== type)
      this.documents = remaining
      this.docMap.clear()
      for (const d of remaining) this.docMap.set(d.id, d)
    } else {
      this.documents = []
      this.docMap.clear()
    }
    this.rebuildIndex()
  }

  /**
   * Get the total number of indexed documents.
   */
  get size(): number {
    return this.documents.length
  }

  /**
   * Search for a query string and return scored, ranked results.
   */
  search(query: string, filterType?: string): ScoredResult[] {
    if (!query.trim()) return []

    const queryTokens = tokenize(query)
    if (queryTokens.length === 0) return []

    const candidates = this.getCandidates(queryTokens, filterType)
    const scored: ScoredResult[] = []

    for (const doc of candidates) {
      const result = this.scoreDocument(doc, query, queryTokens)
      if (result.score > 0) {
        scored.push(result)
      }
    }

    // Sort by score descending, then by type for stable ordering
    scored.sort((a, b) => b.score - a.score || a.type.localeCompare(b.type))

    return scored.slice(0, this.options.maxResults)
  }

  // -- Private helpers --

  private rebuildIndex(): void {
    this.tokenIndex.clear()
    for (const doc of this.documents) {
      for (const [_field, value] of Object.entries(doc.fields)) {
        if (!value) continue
        const tokens = tokenize(value)
        const allTokens = [...tokens, ...bigrams(tokens)]
        for (const token of allTokens) {
          if (!this.tokenIndex.has(token)) {
            this.tokenIndex.set(token, new Map())
          }
          const typeMap = this.tokenIndex.get(token)!
          if (!typeMap.has(doc.type)) {
            typeMap.set(doc.type, new Set())
          }
          typeMap.get(doc.type)!.add(doc.id)
        }
      }
    }
  }

  private getCandidates(queryTokens: string[], filterType?: string): SearchableDocument[] {
    const idScores = new Map<string, number>()

    for (const token of queryTokens) {
      // Exact token match
      const exactMatch = this.tokenIndex.get(token)
      if (exactMatch) {
        for (const [type, ids] of exactMatch) {
          if (filterType && type !== filterType) continue
          for (const id of ids) {
            idScores.set(id, (idScores.get(id) || 0) + 1)
          }
        }
      }

      // Substring match on index keys (for Chinese partial matching)
      for (const [indexToken, typeMap] of this.tokenIndex) {
        if (indexToken === token) continue
        if (indexToken.includes(token) || token.includes(indexToken)) {
          for (const [type, ids] of typeMap) {
            if (filterType && type !== filterType) continue
            for (const id of ids) {
              idScores.set(id, (idScores.get(id) || 0) + 0.5)
            }
          }
        }
      }
    }

    // Sort candidates by initial score for early cutoff
    const sortedIds = [...idScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.options.maxResults * 3)
      .map(([id]) => id)

    return sortedIds
      .map(id => this.docMap.get(id))
      .filter((d): d is SearchableDocument => d !== undefined)
  }

  private scoreDocument(doc: SearchableDocument, rawQuery: string, queryTokens: string[]): ScoredResult {
    let totalScore = 0
    const matches: FieldMatch[] = []

    for (const [field, value] of Object.entries(doc.fields)) {
      if (!value) continue
      const weight = this.options.fieldWeights[field] ?? 1.0
      const valueLower = value.toLowerCase()
      const queryLower = rawQuery.toLowerCase().trim()

      let fieldScore = 0
      const indices: [number, number][] = []

      // Exact match (highest score)
      const exactIdx = valueLower.indexOf(queryLower)
      if (exactIdx !== -1) {
        fieldScore += 10
        indices.push([exactIdx, exactIdx + rawQuery.length])

        // Bonus for match at the start
        if (exactIdx === 0) fieldScore += 3
      }

      // Token-level matches
      const valueTokens = tokenize(value)
      const valueBigrams = bigrams(valueTokens)
      const allValueTokens = new Set([...valueTokens, ...valueBigrams])

      let tokenMatchCount = 0
      for (const qt of queryTokens) {
        if (allValueTokens.has(qt)) {
          tokenMatchCount++
        } else {
          // Check substring containment for CJK
          for (const vt of allValueTokens) {
            if (vt.includes(qt) || qt.includes(vt)) {
              tokenMatchCount += 0.5
              break
            }
          }
        }
      }

      if (tokenMatchCount > 0) {
        fieldScore += (tokenMatchCount / queryTokens.length) * 5
      }

      // Fuzzy match (lowest score, only if no exact match found for the field)
      if (fieldScore === 0 && this.options.fuzzyMaxDistance > 0) {
        const fuzzyIndices = fuzzyMatchIndices(value, rawQuery.trim(), this.options.fuzzyMaxDistance)
        if (fuzzyIndices.length > 0) {
          fieldScore += 2
          indices.push(...fuzzyIndices)
        }
      }

      // Record matches with highlights
      if (fieldScore > 0) {
        // Generate highlight indices if not already set
        if (indices.length === 0) {
          const substrIdx = valueLower.indexOf(queryLower)
          if (substrIdx !== -1) {
            indices.push([substrIdx, substrIdx + rawQuery.length])
          }
        }

        totalScore += fieldScore * weight
        matches.push({ field, value, score: fieldScore * weight, indices })
      }
    }

    return { id: doc.id, type: doc.type, score: totalScore, matches }
  }
}

/**
 * Highlight matched portions of text by wrapping them in <mark> tags.
 * Returns HTML string with highlighted matches.
 */
export function highlightText(text: string, indices: [number, number][]): string {
  if (!indices.length) return escapeHtml(text)

  // Merge overlapping indices
  const sorted = [...indices].sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const [start, end] of sorted) {
    if (merged.length > 0 && start <= merged[merged.length - 1]![1]!) {
      merged[merged.length - 1]![1] = Math.max(merged[merged.length - 1]![1]!, end)
    } else {
      merged.push([start, end])
    }
  }

  let result = ''
  let lastEnd = 0
  for (const [start, end] of merged) {
    result += escapeHtml(text.slice(lastEnd, start))
    result += '<mark>' + escapeHtml(text.slice(start, end)) + '</mark>'
    lastEnd = end
  }
  result += escapeHtml(text.slice(lastEnd))
  return result
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
