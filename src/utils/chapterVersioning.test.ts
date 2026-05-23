import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Chapter } from '@/types'
import type { ChapterSnapshot } from '@/types/chapter-version'

const storage = {
  saveChapterSnapshot: vi.fn(),
  listChapterSnapshots: vi.fn(),
  getChapterSnapshot: vi.fn(),
  deleteChapterSnapshot: vi.fn(),
  pruneChapterSnapshots: vi.fn(),
}

vi.mock('@/stores/storage', () => ({
  useStorage: () => storage,
}))

const baseChapter: Chapter = {
  id: 'chapter-1',
  number: 3,
  title: '第三章 风起',
  content: '第一段内容\n\n第二段内容',
  wordCount: 0,
  outline: {
    chapterId: 'chapter-1',
    title: '第三章 风起',
    scenes: [],
    characters: [],
    location: '',
    goals: [],
    conflicts: [],
    resolutions: [],
    foreshadowingToPlant: [],
    foreshadowingToResolve: [],
    status: 'planned',
  },
  status: 'draft',
  generatedBy: 'manual',
  generationTime: new Date('2026-01-01T00:00:00.000Z'),
  checkpoints: [],
  aiSuggestions: [],
}

function makeSnapshot(overrides: Partial<ChapterSnapshot> = {}): ChapterSnapshot {
  return {
    id: overrides.id || crypto.randomUUID(),
    chapterId: overrides.chapterId || baseChapter.id,
    projectId: overrides.projectId || 'project-1',
    title: overrides.title || baseChapter.title,
    content: overrides.content || baseChapter.content,
    wordCount: overrides.wordCount ?? baseChapter.content.length,
    createdAt: overrides.createdAt ?? Date.now(),
    source: overrides.source || 'auto',
  }
}

describe('chapterVersioning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a snapshot through storage with UI-facing metadata', async () => {
    const { createSnapshot } = await import('@/utils/chapterVersioning')

    const snapshot = await createSnapshot(baseChapter, 'project-1', 'manual')

    expect(snapshot).toMatchObject({
      chapterId: 'chapter-1',
      projectId: 'project-1',
      title: '第三章 风起',
      content: '第一段内容\n\n第二段内容',
      wordCount: 12,
      source: 'manual',
    })
    expect(snapshot.id).toBeTruthy()
    expect(snapshot.createdAt).toEqual(expect.any(Number))
    expect(storage.saveChapterSnapshot).toHaveBeenCalledWith(snapshot)
  })

  it('falls back to chapter number when snapshot title is blank', async () => {
    const { createSnapshot } = await import('@/utils/chapterVersioning')

    const snapshot = await createSnapshot({ ...baseChapter, title: '' }, 'project-1')

    expect(snapshot.title).toBe('第3章')
  })

  it('lists snapshots for a chapter newest first', async () => {
    const older = makeSnapshot({ id: 'older', createdAt: 100 })
    const newer = makeSnapshot({ id: 'newer', createdAt: 200 })
    storage.listChapterSnapshots.mockResolvedValue([older, newer])
    const { listSnapshots } = await import('@/utils/chapterVersioning')

    await expect(listSnapshots('chapter-1', 'project-1')).resolves.toEqual([newer, older])
    expect(storage.listChapterSnapshots).toHaveBeenCalledWith('chapter-1', 'project-1')
  })

  it('returns undefined for a missing snapshot', async () => {
    storage.getChapterSnapshot.mockResolvedValue(undefined)
    const { getSnapshot } = await import('@/utils/chapterVersioning')

    await expect(getSnapshot('missing', 'project-1', 'chapter-1')).resolves.toBeUndefined()
    expect(storage.getChapterSnapshot).toHaveBeenCalledWith('missing', 'project-1', 'chapter-1')
  })

  it('deletes only the selected snapshot', async () => {
    const { deleteSnapshot } = await import('@/utils/chapterVersioning')

    await deleteSnapshot('snapshot-1', 'project-1', 'chapter-1')

    expect(storage.deleteChapterSnapshot).toHaveBeenCalledWith('snapshot-1', 'project-1', 'chapter-1')
  })

  it('prunes old snapshots through storage', async () => {
    storage.pruneChapterSnapshots.mockResolvedValue(2)
    const { pruneSnapshots } = await import('@/utils/chapterVersioning')

    await expect(pruneSnapshots('chapter-1', 'project-1', 20)).resolves.toBe(2)
    expect(storage.pruneChapterSnapshots).toHaveBeenCalledWith('chapter-1', 'project-1', 20)
  })
})
