export function normalizeChapterForProject<T extends Record<string, unknown>>(
  chapter: T,
  projectId: string
): T & { projectId: string } {
  return {
    ...chapter,
    projectId
  }
}

export function normalizeChaptersForProject<T extends Record<string, unknown>>(
  chapters: T[],
  projectId: string
): Array<T & { projectId: string }> {
  return chapters.map(chapter => normalizeChapterForProject(chapter, projectId))
}
