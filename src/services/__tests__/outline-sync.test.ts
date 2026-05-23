import { describe, expect, it } from 'vitest'
import type { Chapter, ChapterOutline, Project } from '@/types'
import {
  markAffectedOutlinesOutdated,
  refreshForeshadowingStatus,
  syncChapterToOutline
} from '../outline-sync'

function createOutline(status: ChapterOutline['status'] = 'planned'): ChapterOutline {
  return {
    chapterId: `outline-${Math.random()}`,
    title: '第一章',
    scenes: [],
    characters: [],
    location: '',
    goals: [],
    conflicts: [],
    resolutions: [],
    status
  }
}

function createProject(outlines: ChapterOutline[]): Project {
  return {
    id: 'project-1',
    title: '测试项目',
    description: '',
    genre: '玄幻',
    targetWords: 100000,
    currentWords: 0,
    status: 'writing',
    createdAt: new Date(),
    updatedAt: new Date(),
    outline: {
      id: 'outline-1',
      synopsis: '',
      theme: '',
      mainPlot: { id: 'main', name: '主线', description: '' },
      subPlots: [],
      volumes: [
        {
          id: 'volume-1',
          number: 1,
          title: '第一卷',
          theme: '',
          startChapter: 1,
          endChapter: 3,
          mainEvents: [],
          anchors: [
            {
              id: 'anchor-1',
              targetChapterNumber: 2,
              description: '第二章事件',
              isResolved: false
            }
          ]
        }
      ],
      chapters: outlines,
      foreshadowings: [
        {
          id: 'foreshadowing-1',
          description: '第一章埋下伏笔',
          plantChapter: 1,
          resolveChapter: 2,
          status: 'planted'
        }
      ]
    },
    chapters: [],
    config: {} as Project['config']
  }
}

function createChapter(number: number, outline: ChapterOutline): Chapter {
  return {
    id: `chapter-${number}`,
    number,
    title: `第${number}章`,
    content: '正文内容',
    wordCount: 4,
    outline,
    status: 'final',
    generatedBy: 'ai',
    generationTime: new Date(),
    checkpoints: [],
    aiSuggestions: []
  }
}

describe('outline-sync', () => {
  it('syncs completed chapter metadata back to matching outline', () => {
    const chapterOutline = createOutline('writing')
    const project = createProject([chapterOutline])
    const chapter = createChapter(1, { ...chapterOutline, title: '生成标题' })

    const result = syncChapterToOutline(project, chapter, 1000)

    expect(result.changed).toBe(true)
    expect(chapterOutline.status).toBe('completed')
    expect(chapterOutline.title).toBe('生成标题')
    expect(chapterOutline.lastSyncedAt).toBe(1000)
    expect(project.outline.changeHistory?.[0]).toMatchObject({
      type: 'chapter_completed',
      chapterNumber: 1,
      affectedChapterIds: [chapterOutline.chapterId]
    })
  })

  it('does not append impact records when sync has no semantic changes', () => {
    const chapterOutline = createOutline('completed')
    chapterOutline.lastSyncedAt = 1000
    const project = createProject([chapterOutline])
    const chapter = createChapter(1, { ...chapterOutline, lastSyncedAt: 2000 })

    const result = syncChapterToOutline(project, chapter, 3000)

    expect(result.changed).toBe(false)
    expect(project.outline.changeHistory).toBeUndefined()
  })

  it('marks future affected outlines as outdated after an outline change', () => {
    const outlines = [createOutline('completed'), createOutline('planned'), createOutline('writing')]
    const project = createProject(outlines)

    const result = markAffectedOutlinesOutdated(project, 1, '第一章大纲调整', 2000)

    expect(result.changed).toBe(true)
    expect(outlines[0].status).toBe('completed')
    expect(outlines[1].status).toBe('outdated')
    expect(outlines[2].status).toBe('outdated')
    expect(project.outline.changeHistory?.[0]).toMatchObject({
      type: 'outline_refined',
      affectedChapterIds: [outlines[1].chapterId, outlines[2].chapterId],
      summary: '第一章大纲调整'
    })
  })

  it('refreshes foreshadowing and volume anchor status by completed chapter number', () => {
    const project = createProject([createOutline('completed'), createOutline('completed')])

    const result = refreshForeshadowingStatus(project, 2, 3000)

    expect(result.changed).toBe(true)
    expect(project.outline.foreshadowings[0].status).toBe('resolved')
    expect(project.outline.volumes[0].anchors?.[0].isResolved).toBe(true)
    expect(project.outline.changeHistory?.[0].type).toBe('chapter_completed')
  })
})
