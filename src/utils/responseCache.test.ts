import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest'

// Mock localStorage on globalThis BEFORE the module is dynamically imported.
// The module-level `responseCache = new ResponseCache()` singleton runs during
// import and calls `loadFromStorage()` which needs `localStorage`.
const store: Record<string, string> = {}
const localStorageMock: Storage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { Object.keys(store).forEach(k => delete store[k]) },
  get length() { return Object.keys(store).length },
  key: (index: number) => Object.keys(store)[index] ?? null,
}
// @ts-expect-error -- injecting mock into globalThis for Node test env
globalThis.localStorage = localStorageMock

// Use dynamic import so the module is loaded AFTER the localStorage mock is in place.
let ResponseCache: typeof import('@/utils/responseCache').ResponseCache
let hashRequest: typeof import('@/utils/responseCache').hashRequest

beforeAll(async () => {
  const mod = await import('@/utils/responseCache')
  ResponseCache = mod.ResponseCache
  hashRequest = mod.hashRequest
})

// ---------------------------------------------------------------------------
// hashRequest
// ---------------------------------------------------------------------------

describe('hashRequest', () => {
  it('returns the same hash for identical inputs', () => {
    const a = hashRequest({ prompt: 'hello', model: 'gpt-4', chapterNumber: 1 })
    const b = hashRequest({ prompt: 'hello', model: 'gpt-4', chapterNumber: 1 })
    expect(a).toBe(b)
  })

  it('returns different hashes when prompt differs', () => {
    const a = hashRequest({ prompt: 'aaa' })
    const b = hashRequest({ prompt: 'bbb' })
    expect(a).not.toBe(b)
  })

  it('returns different hashes when model differs', () => {
    const a = hashRequest({ prompt: 'same', model: 'gpt-4' })
    const b = hashRequest({ prompt: 'same', model: 'claude-3' })
    expect(a).not.toBe(b)
  })

  it('returns different hashes when systemPrompt differs', () => {
    const a = hashRequest({ prompt: 'same', systemPrompt: 'sys-a' })
    const b = hashRequest({ prompt: 'same', systemPrompt: 'sys-b' })
    expect(a).not.toBe(b)
  })

  it('returns different hashes when chapterNumber differs', () => {
    const a = hashRequest({ prompt: 'same', chapterNumber: 1 })
    const b = hashRequest({ prompt: 'same', chapterNumber: 2 })
    expect(a).not.toBe(b)
  })

  it('handles missing optional fields', () => {
    const h1 = hashRequest({ prompt: 'test' })
    const h2 = hashRequest({ prompt: 'test', model: undefined, systemPrompt: undefined, chapterNumber: undefined })
    expect(h1).toBe(h2)
  })

  it('returns a non-empty base-36 string', () => {
    const h = hashRequest({ prompt: 'test' })
    expect(h).toMatch(/^[0-9a-z]+$/)
    expect(h.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// ResponseCache
// ---------------------------------------------------------------------------

describe('ResponseCache', () => {
  // Clear the store before each test to isolate persistence tests
  beforeEach(() => {
    Object.keys(store).forEach(k => delete store[k])
  })

  it('stores and retrieves an entry', () => {
    const cache = new ResponseCache()
    cache.set('k1', 'hello world')
    const entry = cache.get('k1')
    expect(entry?.response).toBe('hello world')
  })

  it('returns undefined for missing keys', () => {
    const cache = new ResponseCache()
    expect(cache.get('missing')).toBeUndefined()
  })

  it('has() returns true for existing keys and false otherwise', () => {
    const cache = new ResponseCache()
    cache.set('k', 'v')
    expect(cache.has('k')).toBe(true)
    expect(cache.has('nope')).toBe(false)
  })

  it('delete() removes an entry and returns true/false correctly', () => {
    const cache = new ResponseCache()
    cache.set('k', 'v')
    expect(cache.delete('k')).toBe(true)
    expect(cache.delete('k')).toBe(false)
    expect(cache.has('k')).toBe(false)
  })

  it('clear() removes all entries', () => {
    const cache = new ResponseCache()
    cache.set('a', '1')
    cache.set('b', '2')
    cache.clear()
    expect(cache.size).toBe(0)
  })

  it('tracks size correctly', () => {
    const cache = new ResponseCache()
    expect(cache.size).toBe(0)
    cache.set('a', '1')
    expect(cache.size).toBe(1)
    cache.set('b', '2')
    expect(cache.size).toBe(2)
    cache.delete('a')
    expect(cache.size).toBe(1)
  })

  it('stores optional metadata (model and tokenCount)', () => {
    const cache = new ResponseCache()
    cache.set('k', 'resp', { model: 'gpt-4', tokenCount: 150 })
    const entry = cache.get('k')
    expect(entry?.model).toBe('gpt-4')
    expect(entry?.tokenCount).toBe(150)
  })

  it('includes ISO-8601 cachedAt timestamp', () => {
    const cache = new ResponseCache()
    cache.set('k', 'resp')
    const entry = cache.get('k')
    expect(entry?.cachedAt).toBeDefined()
    expect(new Date(entry!.cachedAt!).toISOString()).toBe(entry!.cachedAt)
  })

  it('evicts the least-recently-used entry when maxEntries is exceeded', () => {
    const cache = new ResponseCache(3)
    cache.set('a', '1')
    cache.set('b', '2')
    cache.set('c', '3')
    cache.set('d', '4')
    expect(cache.has('a')).toBe(false)
    expect(cache.has('b')).toBe(true)
    expect(cache.has('c')).toBe(true)
    expect(cache.has('d')).toBe(true)
  })

  it('promotes an entry on get() so it is not evicted', () => {
    const cache = new ResponseCache(3)
    cache.set('a', '1')
    cache.set('b', '2')
    cache.set('c', '3')
    cache.get('a') // promote 'a'
    cache.set('d', '4')
    expect(cache.has('a')).toBe(true)
    expect(cache.has('b')).toBe(false)
  })

  it('skips responses longer than MAX_RESPONSE_LENGTH (120,000 chars)', () => {
    const cache = new ResponseCache()
    const longResp = 'x'.repeat(120_001)
    cache.set('long', longResp)
    expect(cache.has('long')).toBe(false)
  })

  it('accepts responses exactly at MAX_RESPONSE_LENGTH boundary', () => {
    const cache = new ResponseCache()
    const maxResp = 'x'.repeat(120_000)
    cache.set('at-limit', maxResp)
    expect(cache.has('at-limit')).toBe(true)
  })

  it('overwrites an existing key with the new value', () => {
    const cache = new ResponseCache()
    cache.set('k', 'old')
    cache.set('k', 'new')
    expect(cache.get('k')?.response).toBe('new')
    expect(cache.size).toBe(1)
  })

  it('snapshot() returns all entries as public CacheEntry objects', () => {
    const cache = new ResponseCache()
    cache.set('a', '1', { model: 'm' })
    cache.set('b', '2')
    const snap = cache.snapshot()
    expect(snap.length).toBe(2)
    expect(snap.every(e => typeof e.response === 'string')).toBe(true)
  })

  it('persists to localStorage on set() and hydrates on construction', () => {
    const cache1 = new ResponseCache()
    cache1.set('persist-key', 'persist-value', { model: 'test' })

    // Verify data was written to the mock store
    expect(store['ai-novel-workshop:response-cache']).toBeDefined()

    const cache2 = new ResponseCache()
    expect(cache2.has('persist-key')).toBe(true)
    expect(cache2.get('persist-key')?.response).toBe('persist-value')
    expect(cache2.get('persist-key')?.model).toBe('test')
  })

  it('handles corrupted localStorage gracefully', () => {
    store['ai-novel-workshop:response-cache'] = 'not valid json!!!'
    const cache = new ResponseCache()
    expect(cache.size).toBe(0)
  })

  it('ignores localStorage entries with wrong version', () => {
    store['ai-novel-workshop:response-cache'] = JSON.stringify({
      version: 999,
      entries: { k: { response: 'v', lastAccessed: Date.now(), cachedAt: '' } }
    })
    const cache = new ResponseCache()
    expect(cache.size).toBe(0)
  })

  it('replaces entries to re-insert at most-recently-used position', () => {
    const cache = new ResponseCache(2)
    cache.set('a', '1')
    cache.set('b', '2')
    cache.set('a', '1-new') // replace 'a' -> becomes MRU
    cache.set('c', '3')     // evicts 'b' (now LRU)
    expect(cache.has('a')).toBe(true)
    expect(cache.has('b')).toBe(false)
  })

  it('handles localStorage.setItem throwing (quota exceeded) gracefully', () => {
    const originalSetItem = globalThis.localStorage.setItem
    globalThis.localStorage.setItem = () => { throw new Error('QuotaExceededError') }
    const cache = new ResponseCache()
    // Should not throw even though persistence fails
    expect(() => cache.set('k', 'v')).not.toThrow()
    expect(cache.has('k')).toBe(true) // still stores in memory
    globalThis.localStorage.setItem = originalSetItem
  })

  it('filter skips entries with missing response or lastAccessed fields', () => {
    store['ai-novel-workshop:response-cache'] = JSON.stringify({
      version: 1,
      entries: {
        valid: { response: 'ok', lastAccessed: Date.now(), cachedAt: new Date().toISOString() },
        noResponse: { lastAccessed: Date.now(), cachedAt: '' },
        noAccess: { response: 'ok', cachedAt: '' },
      }
    })
    const cache = new ResponseCache()
    expect(cache.has('valid')).toBe(true)
    expect(cache.has('noResponse')).toBe(false)
    expect(cache.has('noAccess')).toBe(false)
  })
})
