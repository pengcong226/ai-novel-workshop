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
