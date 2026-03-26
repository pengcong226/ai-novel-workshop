import { describe, expect, it } from 'vitest'
import { normalizeChapterForProject } from '../chapterPersistence'

describe('normalizeChapterForProject', () => {
  it('injects missing projectId', () => {
    const chapter = { id: 'c1', number: 1, title: 't', content: 'x', wordCount: 1 }
    const normalized = normalizeChapterForProject(chapter, 'p1')
    expect(normalized.projectId).toBe('p1')
  })

  it('keeps existing projectId when same', () => {
    const chapter = { id: 'c1', projectId: 'p1' }
    const normalized = normalizeChapterForProject(chapter, 'p1')
    expect(normalized.projectId).toBe('p1')
  })

  it('overwrites wrong projectId with authoritative project id', () => {
    const chapter = { id: 'c1', projectId: 'p2' }
    const normalized = normalizeChapterForProject(chapter, 'p1')
    expect(normalized.projectId).toBe('p1')
  })
})
