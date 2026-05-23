import type { Entity } from '@/types/sandbox'

interface MutableChapterTextFields {
  title?: string
  content?: string
  summary?: string
  summaryData?: {
    summary?: string
  }
}

type MutableEntityTextFields = Pick<Entity, 'name' | 'systemPrompt' | 'aliases'>

function replaceLiteralText(text: string, sourceRegex: RegExp, target: string): string {
  return text.replace(sourceRegex, () => target)
}

export function buildEntityTextUpdates(
  entity: MutableEntityTextFields,
  sourceRegex: RegExp,
  target: string
): Partial<MutableEntityTextFields> {
  const updates: Partial<MutableEntityTextFields> = {}

  const name = replaceLiteralText(entity.name, sourceRegex, target)
  if (name !== entity.name) {
    updates.name = name
  }

  const systemPrompt = replaceLiteralText(entity.systemPrompt, sourceRegex, target)
  if (systemPrompt !== entity.systemPrompt) {
    updates.systemPrompt = systemPrompt
  }

  const aliases = entity.aliases.map(alias => replaceLiteralText(alias, sourceRegex, target))
  if (aliases.some((alias, index) => alias !== entity.aliases[index])) {
    updates.aliases = aliases
  }

  return updates
}

export function replaceChapterText(
  chapter: MutableChapterTextFields,
  sourceRegex: RegExp,
  target: string
): void {
  if (chapter.title) chapter.title = replaceLiteralText(chapter.title, sourceRegex, target)
  if (chapter.content) chapter.content = replaceLiteralText(chapter.content, sourceRegex, target)
  if (chapter.summaryData?.summary) chapter.summaryData.summary = replaceLiteralText(chapter.summaryData.summary, sourceRegex, target)
  if (chapter.summary) chapter.summary = replaceLiteralText(chapter.summary, sourceRegex, target)
}

export function replaceAppearanceText(
  appearance: string | undefined,
  sourceRegex: RegExp,
  target: string
): string | null {
  if (!appearance) return null

  const nextAppearance = replaceLiteralText(appearance, sourceRegex, target)
  return nextAppearance === appearance ? null : nextAppearance
}
