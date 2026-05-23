import { safeParseAIJson } from '@/utils/safeParseAIJson'
import { getLogger } from '@/utils/logger'
import type { ChapterOutline, Scene } from '@/types'
import { BaseAgent } from './BaseAgent'
import type { AgentConfig, AgentContext, AgentRole, AgentResult } from './types'

const logger = getLogger('agent:planner')

export interface PlannerRevision {
  needsRevision: boolean
  reason?: string
  revisedOutline?: Partial<ChapterOutline>
}

const MAX_PLANNER_FIELD_LENGTH = 1000
const MAX_PLANNER_LIST_ITEMS = 20

function boundedString(value: unknown, maxLength: number = MAX_PLANNER_FIELD_LENGTH): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, maxLength)
}

function boundedStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value
    .map(item => boundedString(item, 200))
    .filter((item): item is string => Boolean(item))
    .slice(0, MAX_PLANNER_LIST_ITEMS)
  return items.length > 0 ? items : undefined
}

function normalizeScene(value: unknown, index: number): Scene | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const description = boundedString(raw.description)
  if (!description) return null

  return {
    id: boundedString(raw.id, 100) ?? `planner-scene-${index + 1}`,
    description,
    characters: boundedStringArray(raw.characters) ?? [],
    location: boundedString(raw.location, 200) ?? '',
    emotionalTone: boundedString(raw.emotionalTone, 100),
    purpose: boundedString(raw.purpose, 200),
    wordCountHint: typeof raw.wordCountHint === 'number' && Number.isFinite(raw.wordCountHint)
      ? Math.max(0, Math.trunc(raw.wordCountHint))
      : undefined,
    order: index
  }
}

export function normalizePlannerRefinement(
  rawContent: string,
  outline: ChapterOutline,
  now: number = Date.now()
): Partial<ChapterOutline> | null {
  const parsed = safeParseAIJson<unknown>(rawContent)
  if (!parsed || typeof parsed !== 'object') return null

  const raw = parsed as Record<string, unknown>
  const refined: Partial<ChapterOutline> = {}

  const title = boundedString(raw.title, 200)
  if (title && title !== outline.title) refined.title = title

  const location = boundedString(raw.location, 200)
  if (location && location !== outline.location) refined.location = location

  const characters = boundedStringArray(raw.characters)
  if (characters) refined.characters = characters

  const goals = boundedStringArray(raw.goals)
  if (goals) refined.goals = goals

  const conflicts = boundedStringArray(raw.conflicts)
  if (conflicts) refined.conflicts = conflicts

  const resolutions = boundedStringArray(raw.resolutions)
  if (resolutions) refined.resolutions = resolutions

  const foreshadowingToPlant = boundedStringArray(raw.foreshadowingToPlant)
  if (foreshadowingToPlant) refined.foreshadowingToPlant = foreshadowingToPlant

  const foreshadowingToResolve = boundedStringArray(raw.foreshadowingToResolve)
  if (foreshadowingToResolve) refined.foreshadowingToResolve = foreshadowingToResolve

  if (Array.isArray(raw.scenes)) {
    const scenes = raw.scenes
      .map((scene, index) => normalizeScene(scene, index))
      .filter((scene): scene is Scene => Boolean(scene))
      .slice(0, MAX_PLANNER_LIST_ITEMS)
    if (scenes.length > 0) refined.scenes = scenes
  }

  if (Object.keys(refined).length === 0) return null

  refined.status = 'planned'
  refined.aiRefinedAt = now
  return refined
}

export class PlannerAgent extends BaseAgent {
  readonly role: AgentRole = 'planner'

  protected async run(context: AgentContext, config: AgentConfig): Promise<Omit<AgentResult<PlannerRevision | Partial<ChapterOutline>>, 'role' | 'durationMs'>> {
    const outline = context.outline as ChapterOutline | undefined
    const violations = context.violations ?? []
    if (!outline) {
      return { status: 'success', message: '无章节大纲，跳过规划修订', data: { needsRevision: false } }
    }

    if (context.phase === 'pre-generation' && violations.length === 0) {
      return this.refineBeforeGeneration(context, outline, config)
    }

    if (violations.length === 0) {
      return { status: 'success', message: '无需规划修订', data: { needsRevision: false } }
    }

    try {
      const { useAIStore } = await import('@/stores/ai')
      const aiStore = useAIStore()
      if (!aiStore.checkInitialized()) {
        return { status: 'success', message: 'AI 未初始化，跳过规划修订', data: { needsRevision: false } }
      }

      const outlineJson = JSON.stringify({
        title: outline.title,
        scenes: outline.scenes,
        characters: outline.characters,
        goals: outline.goals,
        conflicts: outline.conflicts,
      }, null, 2)

      const prompt = `你是叙事规划顾问。哨兵模型检测到以下逻辑冲突：
${violations.map((violation, index) => `${index + 1}. ${violation}`).join('\n')}

当前章节计划：
${outlineJson}

请判断：这些冲突是写手的执行问题，还是计划本身存在逻辑矛盾？

输出严格 JSON：
{
  "needsRevision": true或false,
  "reason": "简要说明判断依据",
  "revisedOutline": { "goals": [...], "conflicts": [...], "scenes": [...] }
}`

      const response = await aiStore.chat(
        [{ role: 'user', content: prompt }],
        {
          type: 'outline',
          complexity: 'medium',
          priority: 'quality',
          ...(config.model?.trim() ? { preferredModel: config.model.trim() } : {})
        },
        { maxTokens: 1500 }
      )
      const parsed = safeParseAIJson<PlannerRevision>(response.content)
      return {
        status: 'success',
        message: parsed?.needsRevision ? '规划师建议修订大纲' : '规划师建议写手修补',
        data: parsed ?? { needsRevision: false },
      }
    } catch (error) {
      logger.warn('规划师审查调用失败，降级为写手直接修补:', error)
      return { status: 'success', message: '规划师失败，降级为写手修补', data: { needsRevision: false } }
    }
  }

  private async refineBeforeGeneration(
    context: AgentContext,
    outline: ChapterOutline,
    config: AgentConfig
  ): Promise<Omit<AgentResult<Partial<ChapterOutline>>, 'role' | 'durationMs'>> {
    if (outline.status !== 'outdated' && outline.status !== 'planned') {
      return { status: 'success', message: '当前大纲无需生成前细化' }
    }

    try {
      const { useAIStore } = await import('@/stores/ai')
      const aiStore = useAIStore()
      if (!aiStore.checkInitialized()) {
        return { status: 'success', message: 'AI 未初始化，跳过生成前细化' }
      }

      const outlineJson = JSON.stringify({
        title: outline.title,
        scenes: outline.scenes,
        characters: outline.characters,
        location: outline.location,
        goals: outline.goals,
        conflicts: outline.conflicts,
        resolutions: outline.resolutions,
        foreshadowingToPlant: outline.foreshadowingToPlant,
        foreshadowingToResolve: outline.foreshadowingToResolve,
      }, null, 2)

      const prompt = `你是小说大纲规划师。请在生成正文前细化当前章节大纲，使其更适合直接写作。

项目信息：
${context.project ? JSON.stringify({ title: context.project.title, genre: context.project.genre, synopsis: context.project.outline.synopsis, theme: context.project.outline.theme }) : '{}'}

当前章节大纲：
${outlineJson}

只输出严格 JSON，不要输出命令、HTML、动作或解释：
{
  "title": "章节标题",
  "scenes": [{ "description": "场景内容", "characters": ["人物"], "location": "地点", "emotionalTone": "情绪", "purpose": "叙事目的", "wordCountHint": 800 }],
  "characters": ["人物"],
  "location": "主场景",
  "goals": ["本章目标"],
  "conflicts": ["本章冲突"],
  "resolutions": ["本章解决"],
  "foreshadowingToPlant": ["本章伏笔"],
  "foreshadowingToResolve": ["本章回收"]
}`

      const response = await aiStore.chat(
        [{ role: 'user', content: prompt }],
        {
          type: 'outline',
          complexity: 'medium',
          priority: 'quality',
          ...(config.model?.trim() ? { preferredModel: config.model.trim() } : {})
        },
        { maxTokens: 1800 }
      )
      const refinedOutline = normalizePlannerRefinement(response.content, outline)
      return refinedOutline
        ? { status: 'success', message: '规划师已细化生成前大纲', data: refinedOutline }
        : { status: 'success', message: '规划师未返回可用细化结果' }
    } catch (error) {
      logger.warn('生成前规划师细化失败:', error)
      return { status: 'success', message: '生成前规划师细化失败' }
    }
  }
}
