import { openDB, type IDBPDatabase } from 'idb'
import type { Chapter } from '@/types'
import { getLogger } from '@/utils/logger'

const logger = getLogger('utils:chapterVersioning')

export interface ChapterSnapshot {
  id: string
  chapterId: string
  projectId: string
  title: string
  content: string
  wordCount: number
  createdAt: number
  source: 'auto' | 'manual'
}

const DB_NAME = 'ai-novel-workshop-versions'
const DB_VERSION = 1
const STORE_NAME = 'chapter-snapshots'

let dbPromise: Promise<IDBPDatabase> | null = null

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
          store.createIndex('chapterId', 'chapterId')
          store.createIndex('projectId', 'projectId')
        }
      }
    })
  }
  return dbPromise
}

export async function createSnapshot(
  chapter: Chapter,
  projectId: string,
  source: 'auto' | 'manual' = 'auto'
): Promise<ChapterSnapshot> {
  const snapshot: ChapterSnapshot = {
    id: crypto.randomUUID(),
    chapterId: chapter.id,
    projectId,
    title: chapter.title || `第${chapter.number}章`,
    content: chapter.content || '',
    wordCount: (chapter.content || '').length,
    createdAt: Date.now(),
    source
  }

  const db = await getDB()
  await db.add(STORE_NAME, snapshot)
  logger.info('快照已保存', { chapterId: chapter.id, source })
  return snapshot
}

export async function listSnapshots(chapterId: string): Promise<ChapterSnapshot[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex(STORE_NAME, 'chapterId', chapterId)
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

export async function getSnapshot(id: string): Promise<ChapterSnapshot | undefined> {
  const db = await getDB()
  return db.get(STORE_NAME, id)
}

export async function deleteSnapshot(id: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORE_NAME, id)
}

export async function pruneSnapshots(chapterId: string, keepCount: number = 20): Promise<number> {
  const snapshots = await listSnapshots(chapterId)
  if (snapshots.length <= keepCount) return 0

  const toDelete = snapshots.slice(keepCount)
  const db = await getDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  for (const s of toDelete) {
    tx.store.delete(s.id)
  }
  await tx.done
  logger.info(`已清理 ${toDelete.length} 个旧快照`, { chapterId })
  return toDelete.length
}
