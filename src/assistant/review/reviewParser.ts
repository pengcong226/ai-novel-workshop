import type { SuggestionAction, SuggestionCategory, SuggestionPriority } from '@/types/suggestions'
import { safeParseAIJson } from '@/utils/safeParseAIJson'
import type { ReviewParagraph } from './reviewParagraphs'

interface ReviewResponseItem {
  title: string
  message: string
  category: SuggestionCategory
  priority: SuggestionPriority
  paragraphIndex?: number
  textSnippet?: string
  suggestedFix?: string
  actions?: SuggestionAction[]
}

export interface ParsedReviewSuggestion {
  title: string
  message: string
  category: SuggestionCategory
  priority: SuggestionPriority
  paragraphIndex?: number
  textSnippet?: string
  suggestedFix?: string
  actions?: SuggestionAction[]
}

interface ParseReviewResponseOptions {
  paragraphs: ReviewParagraph[]
}

const CATEGORIES: readonly SuggestionCategory[] = ['consistency', 'quality', 'optimization', 'style', 'problem', 'reminder']
const PRIORITIES: readonly SuggestionPriority[] = ['low', 'medium', 'high']
const MAX_TITLE_LENGTH = 120
const MAX_MESSAGE_LENGTH = 1200
const MAX_SNIPPET_LENGTH = 240
const MAX_FIX_LENGTH = 1600

export function parseReviewResponse(rawContent: string, options: ParseReviewResponseOptions): ParsedReviewSuggestion[] {
  const parsed = safeParseAIJson<unknown>(rawContent)
  if (!Array.isArray(parsed)) return []

  return parsed
    .map(item => normalizeReviewItem(item, options.paragraphs))
    .filter((item): item is ParsedReviewSuggestion => item !== null)
}

function normalizeReviewItem(item: unknown, paragraphs: ReviewParagraph[]): ParsedReviewSuggestion | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null

  const source = item as Partial<Record<keyof ReviewResponseItem, unknown>>
  const title = normalizeString(source.title, MAX_TITLE_LENGTH)
  const message = normalizeString(source.message, MAX_MESSAGE_LENGTH)
  if (!title || !message) return null

  const paragraphIndex = normalizeParagraphIndex(source.paragraphIndex, paragraphs)
  const textSnippet = paragraphIndex === undefined
    ? undefined
    : normalizeSnippet(source.textSnippet, paragraphs[paragraphIndex])
  const suggestedFix = textSnippet
    ? normalizeString(source.suggestedFix, MAX_FIX_LENGTH)
    : undefined
  const actions = buildActions(paragraphIndex, textSnippet, suggestedFix)

  return {
    title,
    message,
    category: isCategory(source.category) ? source.category : 'optimization',
    priority: isPriority(source.priority) ? source.priority : 'medium',
    paragraphIndex,
    textSnippet,
    suggestedFix,
    actions: actions.length > 0 ? actions : undefined,
  }
}

function normalizeString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized ? normalized.slice(0, maxLength) : undefined
}

function normalizeParagraphIndex(value: unknown, paragraphs: ReviewParagraph[]): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined
  if (value < 0 || value >= paragraphs.length) return undefined
  return value
}

function normalizeSnippet(value: unknown, paragraph: ReviewParagraph): string | undefined {
  const snippet = normalizeString(value, MAX_SNIPPET_LENGTH)
  if (!snippet) return undefined
  return paragraph.text.includes(snippet) ? snippet : undefined
}

function buildActions(paragraphIndex: number | undefined, textSnippet: string | undefined, suggestedFix: string | undefined): SuggestionAction[] {
  const actions: SuggestionAction[] = []

  if (paragraphIndex !== undefined) {
    actions.push({
      type: 'navigate',
      label: '跳转到此处',
      navigateTarget: `paragraph:${paragraphIndex}`,
    })
  }

  if (textSnippet && suggestedFix) {
    actions.push({
      type: 'apply_fix',
      label: '采纳修复',
      originalSnippet: textSnippet,
      fixContent: suggestedFix,
    })
  }

  return actions
}

function isCategory(value: unknown): value is SuggestionCategory {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value)
}

function isPriority(value: unknown): value is SuggestionPriority {
  return typeof value === 'string' && (PRIORITIES as readonly string[]).includes(value)
}
