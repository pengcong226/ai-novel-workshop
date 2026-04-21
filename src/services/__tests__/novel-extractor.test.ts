import { beforeEach, describe, expect, it } from 'vitest'
import { NovelExtractor } from '../novel-extractor'
import { serializeSession, type DeepImportSession } from '@/types/deep-import'

const PROJECT_ID = 'project-1'

function createLocalStorageMock(): Storage {
  const store = new Map<string, string>()

  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    }
  }
}

function createSession(sessionId: string, isComplete: boolean): DeepImportSession {
  return {
    id: sessionId,
    projectId: PROJECT_ID,
    totalChapters: 10,
    extractedChapters: isComplete ? [1, 2, 3] : [1],
    results: new Map(),
    nameToIdMap: {},
    totalTokenUsage: { input: 0, output: 0 },
    totalCostUSD: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    mode: 'full',
    isComplete,
  }
}

function writeSession(session: DeepImportSession): string {
  const key = `${session.projectId}_deep_import_${session.id}`
  localStorage.setItem(key, JSON.stringify(serializeSession(session)))
  return key
}

describe('novel-extractor resumable session index', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createLocalStorageMock(),
      configurable: true,
      writable: true,
    })
    localStorage.clear()
  })

  it('maintains per-project index on cacheSession and clearCachedSession', async () => {
    const extractor = new NovelExtractor(PROJECT_ID, {
      mode: 'full',
      extractPlotEvents: false,
      checkpointInterval: 0,
      maxCostUSD: 999,
      batchSize: 1,
    })

    const session = createSession('s1', false)
    const sessionKey = `${PROJECT_ID}_deep_import_${session.id}`
    const indexKey = `${PROJECT_ID}_deep_import_index`

    await (extractor as any).cacheSession(session)

    const indexAfterCache = JSON.parse(localStorage.getItem(indexKey) || '[]')
    expect(indexAfterCache).toContain(sessionKey)

    NovelExtractor.clearCachedSession(PROJECT_ID, session.id)

    const indexAfterClear = JSON.parse(localStorage.getItem(indexKey) || '[]')
    expect(localStorage.getItem(sessionKey)).toBeNull()
    expect(indexAfterClear).not.toContain(sessionKey)
  })

  it('uses index first and prunes invalid indexed entries', async () => {
    const indexKey = `${PROJECT_ID}_deep_import_index`

    const completeKey = writeSession(createSession('complete', true))
    const incompleteKey = writeSession(createSession('incomplete-1', false))
    const laterIncompleteKey = writeSession(createSession('incomplete-2', false))

    const missingKey = `${PROJECT_ID}_deep_import_missing`
    const brokenKey = `${PROJECT_ID}_deep_import_broken`
    localStorage.setItem(brokenKey, '{broken-json')

    localStorage.setItem(indexKey, JSON.stringify([
      completeKey,
      missingKey,
      brokenKey,
      incompleteKey,
      laterIncompleteKey,
    ]))

    const session = await NovelExtractor.checkResumableSession(PROJECT_ID)

    expect(session?.id).toBe('incomplete-1')
    expect(localStorage.getItem(brokenKey)).toBeNull()

    const prunedIndex = JSON.parse(localStorage.getItem(indexKey) || '[]')
    expect(prunedIndex).toEqual([completeKey, incompleteKey, laterIncompleteKey])
  })

  it('falls back to legacy scan and backfills index when missing', async () => {
    const indexKey = `${PROJECT_ID}_deep_import_index`

    const completeKey = writeSession(createSession('legacy-complete', true))
    const incompleteKey = writeSession(createSession('legacy-incomplete', false))
    const brokenKey = `${PROJECT_ID}_deep_import_legacy-broken`
    localStorage.setItem(brokenKey, '{broken-json')

    const session = await NovelExtractor.checkResumableSession(PROJECT_ID)

    expect(session?.id).toBe('legacy-incomplete')
    expect(localStorage.getItem(brokenKey)).toBeNull()

    const backfilledIndex = JSON.parse(localStorage.getItem(indexKey) || '[]')
    expect(backfilledIndex).toEqual([completeKey, incompleteKey])
  })
})
