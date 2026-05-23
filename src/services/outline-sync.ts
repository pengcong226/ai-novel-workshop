import type { Chapter, ChapterOutline, OutlineChangeImpact, OutlineChangeType, Project, Scene } from '@/types'
import { v4 as uuidv4 } from 'uuid'

export interface OutlineSyncResult {
  changed: boolean
  impact?: OutlineChangeImpact
}

function cloneScenes(scenes: Scene[]): Scene[] {
  return scenes.map((scene, index) => ({
    ...scene,
    characters: [...scene.characters],
    order: scene.order ?? index
  }))
}

function cloneOutline(outline: ChapterOutline): ChapterOutline {
  return {
    ...outline,
    scenes: cloneScenes(outline.scenes),
    characters: [...outline.characters],
    goals: [...outline.goals],
    conflicts: [...outline.conflicts],
    resolutions: [...outline.resolutions],
    foreshadowingToPlant: outline.foreshadowingToPlant ? [...outline.foreshadowingToPlant] : undefined,
    foreshadowingToResolve: outline.foreshadowingToResolve ? [...outline.foreshadowingToResolve] : undefined
  }
}

function comparableOutline(outline: ChapterOutline): Omit<ChapterOutline, 'lastSyncedAt' | 'draftedAt' | 'aiRefinedAt'> {
  const { lastSyncedAt: _lastSyncedAt, draftedAt: _draftedAt, aiRefinedAt: _aiRefinedAt, ...comparable } = outline
  return comparable
}

function areOutlinesSemanticallyEqual(a: ChapterOutline, b: ChapterOutline): boolean {
  return JSON.stringify(comparableOutline(a)) === JSON.stringify(comparableOutline(b))
}

function appendImpact(project: Project, impact: OutlineChangeImpact): void {
  project.outline.changeHistory = [
    impact,
    ...(project.outline.changeHistory ?? [])
  ]
}

function createImpact(
  type: OutlineChangeType,
  affectedChapterIds: string[],
  summary: string,
  createdAt: number,
  chapterNumber?: number
): OutlineChangeImpact {
  return {
    id: uuidv4(),
    type,
    chapterNumber,
    affectedChapterIds,
    summary,
    createdAt
  }
}

function findOutlineForChapter(project: Project, chapter: Chapter): ChapterOutline | undefined {
  const byId = project.outline.chapters.find(outline => outline.chapterId === chapter.outline.chapterId)
  return byId ?? project.outline.chapters[chapter.number - 1]
}

export function syncChapterToOutline(
  project: Project,
  chapter: Chapter,
  now: number = Date.now()
): OutlineSyncResult {
  const outline = findOutlineForChapter(project, chapter)
  if (!outline) {
    return { changed: false }
  }

  const nextOutline = cloneOutline(chapter.outline)
  nextOutline.chapterId = outline.chapterId
  nextOutline.status = 'completed'
  nextOutline.lastSyncedAt = now

  if (areOutlinesSemanticallyEqual(outline, nextOutline)) {
    return { changed: false }
  }

  Object.assign(outline, nextOutline)

  const impact = createImpact(
    'chapter_completed',
    [outline.chapterId],
    `第${chapter.number}章已同步到大纲`,
    now,
    chapter.number
  )
  appendImpact(project, impact)

  return { changed: true, impact }
}

export function markAffectedOutlinesOutdated(
  project: Project,
  fromChapterNumber: number,
  summary: string,
  now: number = Date.now()
): OutlineSyncResult {
  const affected = project.outline.chapters
    .slice(Math.max(fromChapterNumber, 0))
    .filter(outline => outline.status !== 'completed' && outline.status !== 'outdated')

  if (affected.length === 0) {
    return { changed: false }
  }

  for (const outline of affected) {
    outline.status = 'outdated'
    outline.lastSyncedAt = undefined
  }

  const impact = createImpact(
    'outline_refined',
    affected.map(outline => outline.chapterId),
    summary,
    now,
    fromChapterNumber
  )
  appendImpact(project, impact)

  return { changed: true, impact }
}

export function refreshForeshadowingStatus(
  project: Project,
  completedChapterNumber: number,
  now: number = Date.now()
): OutlineSyncResult {
  const affectedChapterIds = new Set<string>()

  for (const foreshadowing of project.outline.foreshadowings) {
    if (foreshadowing.status === 'abandoned') continue

    if (foreshadowing.resolveChapter && foreshadowing.resolveChapter <= completedChapterNumber) {
      if (foreshadowing.status !== 'resolved') {
        foreshadowing.status = 'resolved'
        const outline = project.outline.chapters[foreshadowing.resolveChapter - 1]
        if (outline) affectedChapterIds.add(outline.chapterId)
      }
    } else if (foreshadowing.plantChapter <= completedChapterNumber && foreshadowing.status !== 'planted') {
      foreshadowing.status = 'planted'
      const outline = project.outline.chapters[foreshadowing.plantChapter - 1]
      if (outline) affectedChapterIds.add(outline.chapterId)
    }
  }

  for (const volume of project.outline.volumes) {
    for (const anchor of volume.anchors ?? []) {
      if (!anchor.isResolved && anchor.targetChapterNumber <= completedChapterNumber) {
        anchor.isResolved = true
        const outline = project.outline.chapters[anchor.targetChapterNumber - 1]
        if (outline) affectedChapterIds.add(outline.chapterId)
      }
    }
  }

  if (affectedChapterIds.size === 0) {
    return { changed: false }
  }

  const impact = createImpact(
    'chapter_completed',
    [...affectedChapterIds],
    `第${completedChapterNumber}章已刷新伏笔与锚点状态`,
    now,
    completedChapterNumber
  )
  appendImpact(project, impact)

  return { changed: true, impact }
}

export function syncCompletedChapter(
  project: Project,
  chapter: Chapter,
  now: number = Date.now()
): OutlineSyncResult[] {
  return [
    syncChapterToOutline(project, chapter, now),
    refreshForeshadowingStatus(project, chapter.number, now)
  ].filter(result => result.changed)
}
