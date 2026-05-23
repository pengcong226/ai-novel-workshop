import type { ChapterOutline, OutlineChangeImpact, Project, Scene } from '@/types'
import { useAIStore } from '@/stores/ai'
import { safeParseAIJson } from '@/utils/safeParseAIJson'

const MAX_FIELD_LENGTH = 1200
const MAX_SHORT_FIELD_LENGTH = 200
const MAX_LIST_ITEMS = 30

interface ChapterUpdateInput {
  chapterId: string
  title?: string
  scenes?: Scene[]
  characters?: string[]
  location?: string
  goals?: string[]
  conflicts?: string[]
  resolutions?: string[]
  foreshadowingToPlant?: string[]
  foreshadowingToResolve?: string[]
  generationPrompt?: string
  status?: ChapterOutline['status']
  aiRefinedAt?: number
  notes?: string
}

export interface OutlineRefinementChange {
  path: string
  before: unknown
  after: unknown
}

export interface OutlineRefinementProposal {
  summary: string
  chapterUpdates: ChapterUpdateInput[]
  changes: OutlineRefinementChange[]
  createdAt: number
}

export interface RefineOutlineRequest {
  project: Project
  focusChapterId?: string
  instruction?: string
}

function containsUnsafeText(value: string): boolean {
  return /<[^>]+>/.test(value)
    || /\b(?:javascript|data|vbscript|tauri):/i.test(value)
    || /(?:^|\s)(?:rm\s+-rf|curl\s+|wget\s+|sudo\s+|chmod\s+|powershell\b|cmd\.exe\b|bash\s+-c|sh\s+-c)/i.test(value)
}

function boundedString(value: unknown, maxLength: number = MAX_FIELD_LENGTH): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed || containsUnsafeText(trimmed)) return undefined
  return trimmed.slice(0, maxLength)
}

function boundedStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value
    .map(item => boundedString(item, MAX_SHORT_FIELD_LENGTH))
    .filter((item): item is string => Boolean(item))
    .slice(0, MAX_LIST_ITEMS)
  return items.length > 0 ? items : undefined
}

function normalizeScene(value: unknown, index: number): Scene | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const description = boundedString(raw.description)
  if (!description) return null

  return {
    id: `ai-refined-scene-${index + 1}`,
    description,
    characters: boundedStringArray(raw.characters) ?? [],
    location: boundedString(raw.location, MAX_SHORT_FIELD_LENGTH) ?? '',
    emotionalTone: boundedString(raw.emotionalTone, 100),
    purpose: boundedString(raw.purpose, MAX_SHORT_FIELD_LENGTH),
    wordCountHint: typeof raw.wordCountHint === 'number' && Number.isFinite(raw.wordCountHint)
      ? Math.max(0, Math.trunc(raw.wordCountHint))
      : undefined,
    order: index,
  }
}

function cloneOutline(outline: ChapterOutline): ChapterOutline {
  return {
    ...outline,
    scenes: outline.scenes.map((scene, index) => ({ ...scene, characters: [...scene.characters], order: scene.order ?? index })),
    characters: [...outline.characters],
    goals: [...outline.goals],
    conflicts: [...outline.conflicts],
    resolutions: [...outline.resolutions],
    foreshadowingToPlant: outline.foreshadowingToPlant ? [...outline.foreshadowingToPlant] : undefined,
    foreshadowingToResolve: outline.foreshadowingToResolve ? [...outline.foreshadowingToResolve] : undefined,
  }
}

function normalizeChapterUpdate(raw: unknown, existing: ChapterOutline, now: number): ChapterUpdateInput | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Record<string, unknown>
  const update: ChapterUpdateInput = { chapterId: existing.chapterId }

  const title = boundedString(input.title, MAX_SHORT_FIELD_LENGTH)
  if (title) update.title = title

  const location = boundedString(input.location, MAX_SHORT_FIELD_LENGTH)
  if (location) update.location = location

  const notes = boundedString(input.notes)
  if (notes) update.notes = notes

  const generationPrompt = boundedString(input.generationPrompt)
  if (generationPrompt) update.generationPrompt = generationPrompt

  const characters = boundedStringArray(input.characters)
  if (characters) update.characters = characters

  const goals = boundedStringArray(input.goals)
  if (goals) update.goals = goals

  const conflicts = boundedStringArray(input.conflicts)
  if (conflicts) update.conflicts = conflicts

  const resolutions = boundedStringArray(input.resolutions)
  if (resolutions) update.resolutions = resolutions

  const foreshadowingToPlant = boundedStringArray(input.foreshadowingToPlant)
  if (foreshadowingToPlant) update.foreshadowingToPlant = foreshadowingToPlant

  const foreshadowingToResolve = boundedStringArray(input.foreshadowingToResolve)
  if (foreshadowingToResolve) update.foreshadowingToResolve = foreshadowingToResolve

  if (Array.isArray(input.scenes)) {
    const scenes = input.scenes
      .map((scene, index) => normalizeScene(scene, index))
      .filter((scene): scene is Scene => Boolean(scene))
      .slice(0, MAX_LIST_ITEMS)
    if (scenes.length > 0) update.scenes = scenes
  }

  if (Object.keys(update).length === 1) return null

  update.status = existing.status
  update.aiRefinedAt = now
  return update
}

function buildUpdatedOutline(existing: ChapterOutline, update: ChapterUpdateInput): ChapterOutline {
  const current = cloneOutline(existing)
  return {
    ...current,
    chapterId: existing.chapterId,
    title: update.title ?? current.title,
    scenes: update.scenes ? update.scenes.map((scene, index) => ({ ...scene, characters: [...scene.characters], order: index })) : current.scenes,
    characters: update.characters ? [...update.characters] : current.characters,
    location: update.location ?? current.location,
    goals: update.goals ? [...update.goals] : current.goals,
    conflicts: update.conflicts ? [...update.conflicts] : current.conflicts,
    resolutions: update.resolutions ? [...update.resolutions] : current.resolutions,
    foreshadowingToPlant: update.foreshadowingToPlant ? [...update.foreshadowingToPlant] : current.foreshadowingToPlant,
    foreshadowingToResolve: update.foreshadowingToResolve ? [...update.foreshadowingToResolve] : current.foreshadowingToResolve,
    generationPrompt: update.generationPrompt ?? current.generationPrompt,
    status: update.status ?? current.status,
    aiRefinedAt: update.aiRefinedAt ?? current.aiRefinedAt,
    notes: update.notes ?? current.notes,
  }
}

function hasSemanticChange(existing: ChapterOutline, update: ChapterUpdateInput): boolean {
  const next = buildUpdatedOutline(existing, update)
  const { aiRefinedAt: _a, draftedAt: _b, lastSyncedAt: _c, ...nextComparable } = next
  const { aiRefinedAt: _d, draftedAt: _e, lastSyncedAt: _f, ...existingComparable } = existing
  return JSON.stringify(nextComparable) !== JSON.stringify(existingComparable)
}

function changedFields(existing: ChapterOutline, update: ChapterUpdateInput): Array<keyof ChapterOutline> {
  const next = buildUpdatedOutline(existing, update)
  const fields: Array<keyof ChapterOutline> = [
    'title',
    'scenes',
    'characters',
    'location',
    'goals',
    'conflicts',
    'resolutions',
    'foreshadowingToPlant',
    'foreshadowingToResolve',
    'generationPrompt',
    'notes',
    'status',
  ]

  return fields.filter(field => JSON.stringify(existing[field]) !== JSON.stringify(next[field]))
}

function collectChanges(existing: ChapterOutline, update: ChapterUpdateInput): OutlineRefinementChange[] {
  const next = buildUpdatedOutline(existing, update)

  return changedFields(existing, update)
    .map(field => ({
      path: `chapters.${existing.chapterId}.${String(field)}`,
      before: existing[field],
      after: next[field],
    }))
}

export function normalizeOutlineRefinementProposal(
  rawContent: string,
  project: Project,
  now: number = Date.now()
): OutlineRefinementProposal | null {
  const parsed = safeParseAIJson<unknown>(rawContent)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  const raw = parsed as Record<string, unknown>
  const rawChapters = Array.isArray(raw.chapters)
    ? raw.chapters.slice(0, Math.max(project.outline.chapters.length, MAX_LIST_ITEMS))
    : []
  if (rawChapters.length === 0) return null

  const updates: ChapterUpdateInput[] = []
  const changes: OutlineRefinementChange[] = []
  const existingById = new Map(project.outline.chapters.map(chapter => [chapter.chapterId, chapter]))
  const seenChapterIds = new Set<string>()

  for (const rawChapter of rawChapters) {
    if (!rawChapter || typeof rawChapter !== 'object') continue
    const rawChapterRecord = rawChapter as Record<string, unknown>
    const chapterId = boundedString(rawChapterRecord.chapterId, 100)
    if (!chapterId || seenChapterIds.has(chapterId)) continue
    seenChapterIds.add(chapterId)

    const existing = existingById.get(chapterId)
    if (!existing) continue

    const update = normalizeChapterUpdate(rawChapterRecord, existing, now)
    if (!update || !hasSemanticChange(existing, update)) continue

    updates.push(update)
    changes.push(...collectChanges(existing, update))
  }

  if (updates.length === 0) return null

  return {
    summary: boundedString(raw.summary, 300) ?? 'AI 已生成大纲细化建议',
    chapterUpdates: updates,
    changes,
    createdAt: now,
  }
}


function isProposalStillCurrent(existing: ChapterOutline, update: ChapterUpdateInput, changes: OutlineRefinementChange[]): boolean {
  for (const field of changedFields(existing, update)) {
    const expected = changes.find(change => change.path === `chapters.${existing.chapterId}.${String(field)}`)
    if (!expected || JSON.stringify(existing[field]) !== JSON.stringify(expected.before)) return false
  }
  return true
}

export function applyOutlineRefinementProposal(
  project: Project,
  proposal: OutlineRefinementProposal,
  now: number = Date.now()
): OutlineChangeImpact | null {
  const affectedChapterIds: string[] = []
  const existingById = new Map(project.outline.chapters.map(chapter => [chapter.chapterId, chapter]))

  for (const update of proposal.chapterUpdates) {
    const existing = existingById.get(update.chapterId)
    if (!existing) continue

    const sanitizedUpdate = normalizeChapterUpdate(update, existing, update.aiRefinedAt ?? proposal.createdAt)
    if (!sanitizedUpdate || !hasSemanticChange(existing, sanitizedUpdate)) continue
    if (!isProposalStillCurrent(existing, sanitizedUpdate, proposal.changes)) continue

    const next = buildUpdatedOutline(existing, sanitizedUpdate)
    Object.assign(existing, next, { lastSyncedAt: now })
    affectedChapterIds.push(existing.chapterId)
  }

  if (affectedChapterIds.length === 0) return null

  const impact: OutlineChangeImpact = {
    id: `outline-refine-${now}-${Math.random().toString(36).slice(2, 10)}`,
    type: 'outline_refined',
    affectedChapterIds,
    summary: boundedString(proposal.summary, 300) ?? 'AI 已生成大纲细化建议',
    createdAt: now,
  }

  project.outline.changeHistory = [impact, ...(project.outline.changeHistory ?? [])]
  return impact
}

function buildOutlineRefinementPrompt(req: RefineOutlineRequest): string {
  const outline = req.project.outline
  const chapters = outline.chapters.map((chapter, index) => ({
    chapterId: chapter.chapterId,
    chapterNumber: index + 1,
    title: chapter.title,
    status: chapter.status,
    scenes: chapter.scenes,
    characters: chapter.characters,
    location: chapter.location,
    goals: chapter.goals,
    conflicts: chapter.conflicts,
    resolutions: chapter.resolutions,
    foreshadowingToPlant: chapter.foreshadowingToPlant,
    foreshadowingToResolve: chapter.foreshadowingToResolve,
    notes: chapter.notes,
  }))

  return `请细化中文小说项目大纲，只输出严格 JSON，不要解释，不要返回 actions、命令、HTML 或可执行指令。

项目：${req.project.title}
题材：${req.project.genre}
梗概：${outline.synopsis}
主题：${outline.theme}
用户要求：${req.instruction || '提升后续章节的可写性、连贯性和冲突推进'}
聚焦章节：${req.focusChapterId || '全局'}

当前章节大纲：
${JSON.stringify(chapters, null, 2)}

输出格式：
{
  "summary": "本次细化摘要",
  "chapters": [
    {
      "chapterId": "必须使用现有 chapterId",
      "title": "章节标题",
      "scenes": [{ "description": "场景内容", "characters": ["人物"], "location": "地点", "emotionalTone": "情绪", "purpose": "叙事目的", "wordCountHint": 800 }],
      "characters": ["人物"],
      "location": "主场景",
      "goals": ["本章目标"],
      "conflicts": ["本章冲突"],
      "resolutions": ["本章解决"],
      "foreshadowingToPlant": ["本章伏笔"],
      "foreshadowingToResolve": ["本章回收"],
      "notes": "编写提示"
    }
  ]
}`
}

export async function refineOutlineWithAI(req: RefineOutlineRequest): Promise<OutlineRefinementProposal | null> {
  const aiStore = useAIStore()
  const response = await aiStore.chat([
    { role: 'system', content: '你是中文长篇小说大纲策划师，只输出可解析 JSON。' },
    { role: 'user', content: buildOutlineRefinementPrompt(req) },
  ], {
    type: 'outline',
    complexity: 'medium',
    priority: 'quality',
  }, {
    maxTokens: 3000,
  })

  return normalizeOutlineRefinementProposal(response.content, req.project)
}
