import type { Chapter } from '@/types'
import type { ChapterSnapshot } from '@/types/chapter-version'
import { useStorage } from '@/stores/storage'
import { getLogger } from '@/utils/logger'

export type { ChapterSnapshot } from '@/types/chapter-version'

const logger = getLogger('utils:chapterVersioning')

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

  const storage = useStorage()
  await storage.saveChapterSnapshot(snapshot)
  logger.info('快照已保存', { chapterId: chapter.id, source })
  return snapshot
}

export async function listSnapshots(chapterId: string, projectId: string): Promise<ChapterSnapshot[]> {
  const storage = useStorage()
  const snapshots = await storage.listChapterSnapshots(chapterId, projectId)
  return snapshots.sort((a, b) => b.createdAt - a.createdAt)
}

export async function getSnapshot(
  id: string,
  projectId: string,
  chapterId: string
): Promise<ChapterSnapshot | undefined> {
  const storage = useStorage()
  return storage.getChapterSnapshot(id, projectId, chapterId)
}

export async function deleteSnapshot(id: string, projectId: string, chapterId: string): Promise<void> {
  const storage = useStorage()
  await storage.deleteChapterSnapshot(id, projectId, chapterId)
}

export async function pruneSnapshots(
  chapterId: string,
  projectId: string,
  keepCount: number = 20
): Promise<number> {
  const storage = useStorage()
  const deletedCount = await storage.pruneChapterSnapshots(chapterId, projectId, keepCount)
  if (deletedCount > 0) {
    logger.info(`已清理 ${deletedCount} 个旧快照`, { chapterId })
  }
  return deletedCount
}
