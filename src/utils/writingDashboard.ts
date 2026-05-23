import type { Chapter, Project } from '@/types'

export interface ChapterStatusCounts {
  draft: number
  revised: number
  final: number
}

export interface ChapterSourceCounts {
  manual: number
  ai: number
  hybrid: number
}

export interface WritingDashboardSummary {
  title: string
  currentWords: number
  targetWords: number
  progressPercent: number
  chapterCount: number
  completedChapterCount: number
  averageChapterWords: number
  statusCounts: ChapterStatusCounts
  sourceCounts: ChapterSourceCounts
  nextChapter?: Chapter
  recentChapters: Chapter[]
}

export interface DashboardChapterPreviewInput {
  content?: string
  summary?: string
  summaryData?: {
    summary?: string
  }
}

const emptyStatusCounts = (): ChapterStatusCounts => ({ draft: 0, revised: 0, final: 0 })
const emptySourceCounts = (): ChapterSourceCounts => ({ manual: 0, ai: 0, hybrid: 0 })

export function countWritingTextUnits(content: string): number {
  const cjkMatches = content.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)
  const latinMatches = content.match(/[\p{Letter}\p{Number}]+(?:[-'][\p{Letter}\p{Number}]+)*/gu) ?? []
  const latinWithoutCjk = latinMatches.filter(token => !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(token))

  return (cjkMatches?.length ?? 0) + latinWithoutCjk.length
}

export function buildWritingDashboard(project: Project | null | undefined): WritingDashboardSummary {
  if (!project) {
    return {
      title: '未加载项目',
      currentWords: 0,
      targetWords: 0,
      progressPercent: 0,
      chapterCount: 0,
      completedChapterCount: 0,
      averageChapterWords: 0,
      statusCounts: emptyStatusCounts(),
      sourceCounts: emptySourceCounts(),
      recentChapters: [],
    }
  }

  const chapters = project.chapters ?? []
  const chapterWords = chapters.reduce((total, chapter) => total + Math.max(0, chapter.wordCount || 0), 0)
  const currentWords = Math.max(chapterWords, project.currentWords || 0, 0)
  const targetWords = Math.max(0, project.targetWords || 0)
  const progressPercent = targetWords > 0 ? Math.min(100, Math.max(0, Math.round((currentWords / targetWords) * 100))) : 0
  const statusCounts = emptyStatusCounts()
  const sourceCounts = emptySourceCounts()

  for (const chapter of chapters) {
    statusCounts[chapter.status] += 1
    sourceCounts[chapter.generatedBy] += 1
  }

  const recentChapters = [...chapters]
    .sort((left, right) => getChapterTime(right) - getChapterTime(left))
    .slice(0, 5)

  return {
    title: project.title || '未命名项目',
    currentWords,
    targetWords,
    progressPercent,
    chapterCount: chapters.length,
    completedChapterCount: statusCounts.revised + statusCounts.final,
    averageChapterWords: chapters.length > 0 ? Math.round(currentWords / chapters.length) : 0,
    statusCounts,
    sourceCounts,
    nextChapter: [...chapters].sort((left, right) => left.number - right.number).find(chapter => chapter.status !== 'final'),
    recentChapters,
  }
}

export function getDashboardChapterPreview(chapter: DashboardChapterPreviewInput): string {
  return chapter.summaryData?.summary || chapter.summary || chapter.content?.slice(0, 80) || '暂无摘要，进入章节继续完善正文。'
}

function getChapterTime(chapter: Chapter): number {
  const time = chapter.generationTime instanceof Date ? chapter.generationTime.getTime() : new Date(chapter.generationTime).getTime()
  return Number.isFinite(time) ? time : 0
}
