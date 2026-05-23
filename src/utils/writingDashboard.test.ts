import { describe, expect, it } from 'vitest'
import type { Chapter, Project } from '@/types'
import { buildWritingDashboard, countWritingTextUnits, getDashboardChapterPreview } from '@/utils/writingDashboard'

function makeChapter(overrides: Partial<Chapter> = {}): Chapter {
  const id = overrides.id || `chapter-${overrides.number ?? 1}`

  return {
    id,
    number: overrides.number ?? 1,
    title: overrides.title || `第${overrides.number ?? 1}章`,
    content: overrides.content ?? '',
    wordCount: overrides.wordCount ?? 0,
    outline: {
      chapterId: id,
      title: overrides.title || `第${overrides.number ?? 1}章`,
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
    status: overrides.status || 'draft',
    generatedBy: overrides.generatedBy || 'manual',
    generationTime: overrides.generationTime || new Date('2026-01-01T00:00:00.000Z'),
    checkpoints: [],
    aiSuggestions: [],
    qualityScore: overrides.qualityScore,
  }
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    title: '测试项目',
    description: '',
    genre: '玄幻',
    targetWords: 100000,
    currentWords: 0,
    status: 'writing',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    outline: {
      id: 'outline-1',
      synopsis: '',
      theme: '',
      mainPlot: { id: 'main', name: '主线', description: '' },
      subPlots: [],
      volumes: [],
      chapters: [],
      foreshadowings: [],
    },
    chapters: [],
    config: {} as Project['config'],
    ...overrides,
  }
}

describe('buildWritingDashboard', () => {
  it('calculates zero-state metrics when project is null', () => {
    const dashboard = buildWritingDashboard(null)

    expect(dashboard).toMatchObject({
      title: '未加载项目',
      currentWords: 0,
      targetWords: 0,
      progressPercent: 0,
      chapterCount: 0,
      averageChapterWords: 0,
      statusCounts: { draft: 0, revised: 0, final: 0 },
      sourceCounts: { manual: 0, ai: 0, hybrid: 0 },
      recentChapters: [],
    })
  })

  it('calculates chapter and word progress from currentProject chapters', () => {
    const project = makeProject({
      targetWords: 1000,
      currentWords: 10,
      chapters: [
        makeChapter({ number: 1, wordCount: 120 }),
        makeChapter({ number: 2, wordCount: 80 }),
      ],
    })

    const dashboard = buildWritingDashboard(project)

    expect(dashboard.currentWords).toBe(200)
    expect(dashboard.targetWords).toBe(1000)
    expect(dashboard.progressPercent).toBe(20)
    expect(dashboard.chapterCount).toBe(2)
    expect(dashboard.averageChapterWords).toBe(100)
  })

  it('prefers explicit currentWords when chapter metadata is incomplete', () => {
    const project = makeProject({
      currentWords: 36_000,
      chapters: [makeChapter({ number: 1, content: '', wordCount: 120 })],
    })

    const dashboard = buildWritingDashboard(project)

    expect(dashboard.currentWords).toBe(36_000)
  })

  it('counts completed draft and generated chapters by status/source', () => {
    const project = makeProject({
      chapters: [
        makeChapter({ number: 1, status: 'draft', generatedBy: 'manual' }),
        makeChapter({ number: 2, status: 'revised', generatedBy: 'ai' }),
        makeChapter({ number: 3, status: 'final', generatedBy: 'hybrid' }),
        makeChapter({ number: 4, status: 'final', generatedBy: 'ai' }),
      ],
    })

    const dashboard = buildWritingDashboard(project)

    expect(dashboard.statusCounts).toEqual({ draft: 1, revised: 1, final: 2 })
    expect(dashboard.sourceCounts).toEqual({ manual: 1, ai: 2, hybrid: 1 })
    expect(dashboard.completedChapterCount).toBe(3)
  })

  it('returns next writable chapter from the first non-completed chapter', () => {
    const project = makeProject({
      chapters: [
        makeChapter({ number: 1, status: 'final' }),
        makeChapter({ number: 2, status: 'revised' }),
        makeChapter({ number: 3, status: 'draft' }),
      ],
    })

    const dashboard = buildWritingDashboard(project)

    expect(dashboard.nextChapter?.number).toBe(2)
  })

  it('handles empty chapters without NaN progress', () => {
    const dashboard = buildWritingDashboard(makeProject({ targetWords: 0, chapters: [] }))

    expect(dashboard.progressPercent).toBe(0)
    expect(dashboard.averageChapterWords).toBe(0)
  })

  it('clamps target word progress between 0 and 100', () => {
    expect(buildWritingDashboard(makeProject({ targetWords: 100, currentWords: -10 })).progressPercent).toBe(0)
    expect(buildWritingDashboard(makeProject({ targetWords: 100, currentWords: 150 })).progressPercent).toBe(100)
  })

  it('handles Unicode and CJK content word counts consistently', () => {
    expect(countWritingTextUnits('主角突破 realm-9，进入 new world')).toBe(9)
  })

  it('returns a safe preview when lazy chapter metadata omits content', () => {
    expect(getDashboardChapterPreview({})).toBe('暂无摘要，进入章节继续完善正文。')
  })

  it('sorts recent chapters by generationTime descending with missing dates last', () => {
    const project = makeProject({
      chapters: [
        makeChapter({ number: 1, title: '旧章', generationTime: new Date('2026-01-01T00:00:00.000Z') }),
        makeChapter({ number: 2, title: '无日期', generationTime: undefined as unknown as Date }),
        makeChapter({ number: 3, title: '新章', generationTime: new Date('2026-01-03T00:00:00.000Z') }),
      ],
    })

    const dashboard = buildWritingDashboard(project)

    expect(dashboard.recentChapters.map(chapter => chapter.title)).toEqual(['新章', '旧章', '无日期'])
  })
})
