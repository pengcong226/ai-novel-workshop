import { describe, expect, it } from 'vitest'
import type { ChapterOutline, Project, ProjectConfig } from '@/types'
import {
  applyOutlineRefinementProposal,
  normalizeOutlineRefinementProposal,
} from '../outline-refiner'

function createOutline(index: number): ChapterOutline {
  return {
    chapterId: `outline-${index}`,
    title: `第${index}章`,
    scenes: [{ id: `scene-${index}`, description: '旧场景', characters: [], location: '', order: 0 }],
    characters: ['主角'],
    location: '旧地点',
    goals: ['旧目标'],
    conflicts: ['旧冲突'],
    resolutions: [],
    status: 'planned',
  }
}

const testConfig: ProjectConfig = {
  preset: 'standard',
  providers: [],
  plannerModel: '',
  writerModel: '',
  sentinelModel: '',
  extractorModel: '',
  planningDepth: 'medium',
  writingDepth: 'standard',
  enableQualityCheck: true,
  qualityThreshold: 0.8,
  maxCostPerChapter: 1,
  enableAISuggestions: true,
  enableVectorRetrieval: true,
}

function createProject(outlines: ChapterOutline[]): Project {
  return {
    id: 'project-1',
    title: '测试项目',
    description: '',
    genre: '玄幻',
    targetWords: 100000,
    currentWords: 0,
    status: 'draft',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    outline: {
      id: 'outline-1',
      synopsis: '旧梗概',
      theme: '旧主题',
      mainPlot: { id: 'main', name: '主线', description: '旧主线' },
      subPlots: [],
      volumes: [],
      chapters: outlines,
      foreshadowings: [],
    },
    chapters: [],
    config: testConfig,
  }
}

describe('outline-refiner', () => {
  it('normalizes safe chapter refinements and drops AI-provided actions', () => {
    const project = createProject([createOutline(1)])
    const proposal = normalizeOutlineRefinementProposal(
      `\n\`\`\`json\n${JSON.stringify({
        summary: '强化第一章目标',
        chapters: [
          {
            chapterId: 'outline-1',
            title: '新标题',
            goals: ['新目标', 123],
            scenes: [{ description: '新场景', characters: ['主角', false], location: '新地点', order: 'bad' }],
            actions: [{ type: 'execute', command: 'rm -rf .' }],
          },
        ],
        actions: [{ type: 'navigate' }],
      })}\n\`\`\``,
      project,
      1000
    )

    expect(proposal).toMatchObject({
      summary: '强化第一章目标',
      createdAt: 1000,
    })
    expect(proposal?.chapterUpdates).toHaveLength(1)
    const update = proposal?.chapterUpdates[0]
    expect(update).toMatchObject({
      chapterId: 'outline-1',
      title: '新标题',
      goals: ['新目标'],
      status: 'planned',
      aiRefinedAt: 1000,
    })
    expect(update?.scenes?.[0]).toMatchObject({
      description: '新场景',
      characters: ['主角'],
      location: '新地点',
      order: 0,
    })
    expect(update).not.toHaveProperty('actions')
    expect(proposal?.changes.map(change => change.path)).toContain('chapters.outline-1.title')
  })

  it('rejects unknown chapter ids and unusable output', () => {
    const project = createProject([createOutline(1)])

    expect(normalizeOutlineRefinementProposal('{"chapters":[{"chapterId":"missing","title":"新标题"}]}', project)).toBeNull()
    expect(normalizeOutlineRefinementProposal('{"actions":[{"type":"execute"}]}', project)).toBeNull()
  })

  it('applies an accepted proposal and appends outline change history', () => {
    const project = createProject([createOutline(1), createOutline(2)])
    const proposal = normalizeOutlineRefinementProposal(
      JSON.stringify({
        summary: '更新后续章节目标',
        chapters: [
          { chapterId: 'outline-2', title: '第二章新标题', conflicts: ['新冲突'] },
        ],
      }),
      project,
      2000
    )

    if (!proposal) throw new Error('Expected outline refinement proposal')
    const impact = applyOutlineRefinementProposal(project, proposal, 3000)

    expect(project.outline.chapters[1]).toMatchObject({
      title: '第二章新标题',
      conflicts: ['新冲突'],
      status: 'planned',
      aiRefinedAt: 2000,
      lastSyncedAt: 3000,
    })
    expect(impact).toMatchObject({
      type: 'outline_refined',
      affectedChapterIds: ['outline-2'],
      summary: '更新后续章节目标',
      createdAt: 3000,
    })
    expect(project.outline.changeHistory?.[0]).toBe(impact)
  })

  it('revalidates accepted proposals before applying them', () => {
    const project = createProject([createOutline(1)])
    const tamperedProposal = {
      summary: '篡改提案',
      createdAt: 2000,
      changes: [
        { path: 'chapters.outline-1.title', before: '第1章', after: '安全标题' },
        { path: 'chapters.outline-1.scenes', before: project.outline.chapters[0].scenes, after: [] },
      ],
      chapterUpdates: [{
        chapterId: 'outline-1',
        title: '安全标题',
        command: 'rm -rf .',
        actions: [{ type: 'execute' }],
        scenes: [{ id: '<img>', description: '安全场景', characters: [], location: '' }],
        notes: '<img src=x onerror=alert(1)>',
      }],
    } as unknown as NonNullable<ReturnType<typeof normalizeOutlineRefinementProposal>>

    const impact = applyOutlineRefinementProposal(project, tamperedProposal, 3000)
    const persisted = project.outline.chapters[0] as ChapterOutline & { command?: string; actions?: unknown[] }

    expect(impact?.affectedChapterIds).toEqual(['outline-1'])
    expect(persisted.title).toBe('安全标题')
    expect(persisted.command).toBeUndefined()
    expect(persisted.actions).toBeUndefined()
    expect(persisted.notes).toBeUndefined()
    expect(persisted.scenes[0].id).toBe('ai-refined-scene-1')
  })


  it('rejects stale proposals when the chapter changed after preview', () => {
    const project = createProject([createOutline(1)])
    const proposal = normalizeOutlineRefinementProposal(
      JSON.stringify({
        summary: '更新第一章',
        chapters: [{ chapterId: 'outline-1', title: 'AI 标题' }],
      }),
      project,
      2000
    )

    if (!proposal) throw new Error('Expected outline refinement proposal')
    project.outline.chapters[0].title = '用户手动标题'

    expect(applyOutlineRefinementProposal(project, proposal, 3000)).toBeNull()
    expect(project.outline.chapters[0].title).toBe('用户手动标题')
    expect(project.outline.changeHistory).toBeUndefined()
  })

  it('does not append change history when no accepted updates still apply', () => {
    const project = createProject([createOutline(1)])
    const staleProposal = {
      summary: '过期提案',
      createdAt: 2000,
      changes: [],
      chapterUpdates: [{ chapterId: 'missing', title: '新标题' }],
    } as unknown as NonNullable<ReturnType<typeof normalizeOutlineRefinementProposal>>

    expect(applyOutlineRefinementProposal(project, staleProposal, 3000)).toBeNull()
    expect(project.outline.changeHistory).toBeUndefined()
  })
})
