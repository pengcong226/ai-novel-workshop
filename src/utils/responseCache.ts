/**
 * LRU response cache for AI responses.
 *
 * Stores recent AI responses keyed by a deterministic hash of the request
 * parameters so they can be replayed when the user is offline or the same
 * request is repeated.  The cache lives entirely in-memory with an optional
 * localStorage persistence layer so that responses survive page reloads.
 *
 * Eviction follows a standard LRU policy: once the cache exceeds `maxEntries`
 * the least-recently-used entry is removed.
 */

export interface CacheEntry {
  /** The cached AI response text. */
  response: string
  /** ISO-8601 timestamp when the entry was stored. */
  cachedAt: string
  /** The model identifier that produced this response. */
  model?: string
  /** Approximate token count (input + output) if known. */
  tokenCount?: number
}

interface InternalEntry extends CacheEntry {
  /** LRU tracking: last-access timestamp (ms). */
  lastAccessed: number
}

interface CacheSnapshot {
  version: number
  entries: Record<string, InternalEntry>
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CACHE_VERSION = 1
const DEFAULT_MAX_ENTRIES = 200
const STORAGE_KEY = 'ai-novel-workshop:response-cache'
const MAX_RESPONSE_LENGTH = 120_000 // ~120 KB per entry cap

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Produce a stable hash of the request context so the same prompt always maps
 * to the same cache key.  Uses a simple FNV-1a variant over the serialised
 * string — fast and good enough for cache de-duplication.
 */
export function hashRequest(params: {
  prompt: string
  model?: string
  systemPrompt?: string
  chapterNumber?: number
}): string {
  const raw = [
    params.model ?? '',
    params.systemPrompt ?? '',
    String(params.chapterNumber ?? ''),
    params.prompt,
  ].join('\x00')

  // FNV-1a 32-bit
  let hash = 0x811c9dc5
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  return hash.toString(36)
}

// ---------------------------------------------------------------------------
// ResponseCache class
// ---------------------------------------------------------------------------

export class ResponseCache {
  private entries = new Map<string, InternalEntry>()
  private maxEntries: number

  constructor(maxEntries = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries
    this.loadFromStorage()
  }

  // -- Public API -----------------------------------------------------------

  /**
   * Retrieve a cached response, or `undefined` if the key is absent / expired.
   * Marks the entry as recently accessed (promotes it in LRU order).
   */
  get(key: string): CacheEntry | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined

    // Promote
    entry.lastAccessed = Date.now()
    this.entries.delete(key)
    this.entries.set(key, entry)

    return {
      response: entry.response,
      cachedAt: entry.cachedAt,
      model: entry.model,
      tokenCount: entry.tokenCount,
    }
  }

  /**
   * Store an AI response in the cache.  Responses longer than
   * `MAX_RESPONSE_LENGTH` are silently skipped to avoid bloating memory.
   */
  set(
    key: string,
    response: string,
    meta?: { model?: string; tokenCount?: number },
  ): void {
    if (response.length > MAX_RESPONSE_LENGTH) return

    // Remove existing entry to re-insert at the end (most-recently-used)
    this.entries.delete(key)

    const entry: InternalEntry = {
      response,
      cachedAt: new Date().toISOString(),
      model: meta?.model,
      tokenCount: meta?.tokenCount,
      lastAccessed: Date.now(),
    }

    this.entries.set(key, entry)
    this.evict()
    this.persistToStorage()
  }

  /** Check whether the key exists in the cache. */
  has(key: string): boolean {
    return this.entries.has(key)
  }

  /** Remove a specific entry. */
  delete(key: string): boolean {
    const result = this.entries.delete(key)
    if (result) this.persistToStorage()
    return result
  }

  /** Clear the entire cache. */
  clear(): void {
    this.entries.clear()
    this.persistToStorage()
  }

  /** Current number of cached entries. */
  get size(): number {
    return this.entries.size
  }

  /** Return a snapshot of all entries (for diagnostics / UI). */
  snapshot(): CacheEntry[] {
    const result: CacheEntry[] = []
    for (const entry of this.entries.values()) {
      result.push({
        response: entry.response,
        cachedAt: entry.cachedAt,
        model: entry.model,
        tokenCount: entry.tokenCount,
      })
    }
    return result
  }

  // -- Internal -------------------------------------------------------------

  /** Evict least-recently-used entries until we are within budget. */
  private evict(): void {
    while (this.entries.size > this.maxEntries) {
      // Map iteration order is insertion order; first entry is the oldest.
      const oldestKey = this.entries.keys().next().value
      if (oldestKey !== undefined) {
        this.entries.delete(oldestKey)
      } else {
        break
      }
    }
  }

  /** Persist to localStorage so responses survive page reloads. */
  private persistToStorage(): void {
    try {
      const obj: CacheSnapshot = {
        version: CACHE_VERSION,
        entries: Object.fromEntries(this.entries),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
    } catch {
      // localStorage might be full or unavailable — silently degrade.
    }
  }

  /** Hydrate from localStorage on construction. */
  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return

      const snapshot: CacheSnapshot = JSON.parse(raw)
      if (snapshot.version !== CACHE_VERSION) {
        localStorage.removeItem(STORAGE_KEY)
        return
      }

      for (const [key, entry] of Object.entries(snapshot.entries)) {
        if (
          typeof entry.response === 'string' &&
          typeof entry.lastAccessed === 'number'
        ) {
          this.entries.set(key, entry)
        }
      }

      this.evict()
    } catch {
      // Corrupted data — wipe and start fresh.
      localStorage.removeItem(STORAGE_KEY)
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

/** Global singleton cache instance. */
export const responseCache = new ResponseCache()
