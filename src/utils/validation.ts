/**
 * Centralized validation utilities for AI Novel Workshop.
 *
 * This module intentionally does NOT duplicate:
 *  - Prompt-injection / control-char sanitization (inputSanitizer.ts)
 *  - Backup file structural validation (projectBackup.ts)
 *  - Config normalization with defaults (project-config-normalizer.ts)
 *
 * What it does cover:
 *  - Domain value validation (project names, chapter titles, entity names)
 *  - API key format checks per provider
 *  - Model config range validation (temperature, token limits, etc.)
 *  - Import file pre-flight checks (size, extension)
 *  - General user-input sanitization (XSS-safe, length-bounded)
 */

// ─── Shared types ───────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

function ok(): ValidationResult {
  return { valid: true, errors: [] }
}

function fail(...errors: string[]): ValidationResult {
  return { valid: false, errors }
}

function merge(...results: ValidationResult[]): ValidationResult {
  const errors = results.flatMap(r => r.errors)
  return errors.length === 0 ? ok() : { valid: false, errors }
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PROJECT_NAME_MAX_LENGTH = 100
const PROJECT_NAME_MIN_LENGTH = 1
const CHAPTER_TITLE_MAX_LENGTH = 200
const CHAPTER_CONTENT_MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const ENTITY_NAME_MAX_LENGTH = 200
const ENTITY_NAME_MIN_LENGTH = 1

const MAX_IMPORT_FILE_SIZE = 100 * 1024 * 1024 // 100 MB
const ALLOWED_IMPORT_EXTENSIONS = ['.anproj', '.anprojl', '.json']
const ALLOWED_IMPORT_MIME_TYPES = new Set([
  'application/json',
  'application/x-ndjson',
  '' // some environments don't set MIME type
])

// Characters that are unsafe in user-visible names (HTML/script injection vectors)
// We allow CJK, letters, digits, punctuation, spaces, and common literary symbols
const UNSAFE_NAME_PATTERN = /[<>"'&`{}[\]\\]/

// ─── 1. Project name validation ─────────────────────────────────────────────

export function validateProjectName(name: string): ValidationResult {
  if (typeof name !== 'string') return fail('项目名称必须是字符串')

  const trimmed = name.trim()
  if (trimmed.length < PROJECT_NAME_MIN_LENGTH) return fail('项目名称不能为空')
  if (trimmed.length > PROJECT_NAME_MAX_LENGTH) return fail(`项目名称不能超过 ${PROJECT_NAME_MAX_LENGTH} 个字符`)
  if (UNSAFE_NAME_PATTERN.test(trimmed)) return fail('项目名称包含不允许的特殊字符')

  return ok()
}

// ─── 2. Chapter title validation ────────────────────────────────────────────

export function validateChapterTitle(title: string): ValidationResult {
  if (typeof title !== 'string') return fail('章节标题必须是字符串')

  const trimmed = title.trim()
  if (trimmed.length === 0) return fail('章节标题不能为空')
  if (trimmed.length > CHAPTER_TITLE_MAX_LENGTH) return fail(`章节标题不能超过 ${CHAPTER_TITLE_MAX_LENGTH} 个字符`)
  if (UNSAFE_NAME_PATTERN.test(trimmed)) return fail('章节标题包含不允许的特殊字符')

  return ok()
}

// ─── 3. Chapter content validation ──────────────────────────────────────────

export function validateChapterContent(content: string): ValidationResult {
  if (typeof content !== 'string') return fail('章节内容必须是字符串')

  const byteSize = new TextEncoder().encode(content).length
  if (byteSize > CHAPTER_CONTENT_MAX_BYTES) {
    const maxMB = CHAPTER_CONTENT_MAX_BYTES / (1024 * 1024)
    return fail(`章节内容大小 (${(byteSize / 1024 / 1024).toFixed(1)} MB) 超过限制 (${maxMB} MB)`)
  }

  // Check for null bytes which indicate encoding corruption
  if (content.includes('\0')) return fail('章节内容包含非法空字节，可能存在编码问题')

  return ok()
}

// ─── 4. API key format validation ───────────────────────────────────────────

export type ApiKeyProvider = 'openai' | 'anthropic' | 'custom'

const API_KEY_PATTERNS: Record<string, { pattern: RegExp; description: string }> = {
  openai: {
    pattern: /^sk-[A-Za-z0-9_-]{10,}$/,
    description: 'OpenAI API Key 应以 sk- 开头，后跟至少 10 个字母/数字/下划线/连字符'
  },
  anthropic: {
    pattern: /^sk-ant-[A-Za-z0-9_-]{10,}$/,
    description: 'Anthropic API Key 应以 sk-ant- 开头，后跟至少 10 个字母/数字/下划线/连字符'
  }
}

export function validateApiKey(key: string, provider: ApiKeyProvider = 'custom'): ValidationResult {
  if (typeof key !== 'string') return fail('API Key 必须是字符串')

  const trimmed = key.trim()
  if (trimmed.length === 0) {
    // Empty key is allowed for local providers
    return provider === 'custom' ? ok() : fail(`${provider} API Key 不能为空`)
  }

  if (trimmed.length < 8) return fail('API Key 长度过短')
  if (trimmed.length > 512) return fail('API Key 长度过长')

  // Only check format for known providers
  const knownPattern = API_KEY_PATTERNS[provider]
  if (knownPattern && !knownPattern.pattern.test(trimmed)) {
    return fail(knownPattern.description)
  }

  // Generic safety: key should not contain whitespace or HTML chars
  if (/[\s<>"'&]/.test(trimmed)) return fail('API Key 包含非法字符')

  return ok()
}

// ─── 5. Model config validation ─────────────────────────────────────────────

export interface ModelConfigInput {
  temperature?: unknown
  topP?: unknown
  maxTokens?: unknown
  maxContextTokens?: unknown
  frequencyPenalty?: unknown
  presencePenalty?: unknown
  targetWordCount?: unknown
  recentChaptersCount?: unknown
  qualityThreshold?: unknown
  maxCostPerChapter?: unknown
}

export function validateModelConfig(config: ModelConfigInput): ValidationResult {
  const errors: string[] = []

  if (config.temperature !== undefined) {
    if (typeof config.temperature !== 'number' || !Number.isFinite(config.temperature)) {
      errors.push('temperature 必须是有效数字')
    } else if (config.temperature < 0 || config.temperature > 2) {
      errors.push('temperature 必须在 0 ~ 2 之间')
    }
  }

  if (config.topP !== undefined) {
    if (typeof config.topP !== 'number' || !Number.isFinite(config.topP)) {
      errors.push('topP 必须是有效数字')
    } else if (config.topP < 0 || config.topP > 1) {
      errors.push('topP 必须在 0 ~ 1 之间')
    }
  }

  if (config.maxTokens !== undefined) {
    if (typeof config.maxTokens !== 'number' || !Number.isFinite(config.maxTokens)) {
      errors.push('maxTokens 必须是有效数字')
    } else if (config.maxTokens < 1 || config.maxTokens > 1_000_000) {
      errors.push('maxTokens 必须在 1 ~ 1,000,000 之间')
    }
  }

  if (config.maxContextTokens !== undefined) {
    if (typeof config.maxContextTokens !== 'number' || !Number.isFinite(config.maxContextTokens)) {
      errors.push('maxContextTokens 必须是有效数字')
    } else if (config.maxContextTokens < 1000 || config.maxContextTokens > 2_000_000) {
      errors.push('maxContextTokens 必须在 1,000 ~ 2,000,000 之间')
    }
  }

  if (config.frequencyPenalty !== undefined) {
    if (typeof config.frequencyPenalty !== 'number' || !Number.isFinite(config.frequencyPenalty)) {
      errors.push('frequencyPenalty 必须是有效数字')
    } else if (config.frequencyPenalty < -2 || config.frequencyPenalty > 2) {
      errors.push('frequencyPenalty 必须在 -2 ~ 2 之间')
    }
  }

  if (config.presencePenalty !== undefined) {
    if (typeof config.presencePenalty !== 'number' || !Number.isFinite(config.presencePenalty)) {
      errors.push('presencePenalty 必须是有效数字')
    } else if (config.presencePenalty < -2 || config.presencePenalty > 2) {
      errors.push('presencePenalty 必须在 -2 ~ 2 之间')
    }
  }

  if (config.targetWordCount !== undefined) {
    if (typeof config.targetWordCount !== 'number' || !Number.isFinite(config.targetWordCount)) {
      errors.push('targetWordCount 必须是有效数字')
    } else if (config.targetWordCount < 100 || config.targetWordCount > 500_000) {
      errors.push('targetWordCount 必须在 100 ~ 500,000 之间')
    }
  }

  if (config.recentChaptersCount !== undefined) {
    if (typeof config.recentChaptersCount !== 'number' || !Number.isFinite(config.recentChaptersCount)) {
      errors.push('recentChaptersCount 必须是有效数字')
    } else if (config.recentChaptersCount < 0 || config.recentChaptersCount > 100) {
      errors.push('recentChaptersCount 必须在 0 ~ 100 之间')
    }
  }

  if (config.qualityThreshold !== undefined) {
    if (typeof config.qualityThreshold !== 'number' || !Number.isFinite(config.qualityThreshold)) {
      errors.push('qualityThreshold 必须是有效数字')
    } else if (config.qualityThreshold < 0 || config.qualityThreshold > 10) {
      errors.push('qualityThreshold 必须在 0 ~ 10 之间')
    }
  }

  if (config.maxCostPerChapter !== undefined) {
    if (typeof config.maxCostPerChapter !== 'number' || !Number.isFinite(config.maxCostPerChapter)) {
      errors.push('maxCostPerChapter 必须是有效数字')
    } else if (config.maxCostPerChapter < 0 || config.maxCostPerChapter > 100) {
      errors.push('maxCostPerChapter 必须在 0 ~ 100 之间')
    }
  }

  return errors.length === 0 ? ok() : { valid: false, errors }
}

// ─── 6. Import file validation ──────────────────────────────────────────────

export function validateImportFile(file: { name: string; size: number; type?: string }): ValidationResult {
  const errors: string[] = []

  if (file.size > MAX_IMPORT_FILE_SIZE) {
    const maxMB = MAX_IMPORT_FILE_SIZE / (1024 * 1024)
    errors.push(`文件大小 (${(file.size / 1024 / 1024).toFixed(1)} MB) 超过限制 (${maxMB} MB)`)
  }

  if (file.size === 0) {
    errors.push('文件为空')
  }

  const extension = getFileExtension(file.name)
  if (extension && !ALLOWED_IMPORT_EXTENSIONS.includes(extension)) {
    errors.push(`不支持的文件类型: ${extension}。允许的类型: ${ALLOWED_IMPORT_EXTENSIONS.join(', ')}`)
  }

  const mime = file.type || ''
  if (mime && !ALLOWED_IMPORT_MIME_TYPES.has(mime)) {
    errors.push(`不支持的 MIME 类型: ${mime}`)
  }

  return errors.length === 0 ? ok() : { valid: false, errors }
}

function getFileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.')
  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : ''
}

// ─── 7. General input sanitization ──────────────────────────────────────────

export function sanitizeUserInput(input: string, maxLength = 500): string {
  if (typeof input !== 'string') return ''

  return input
    // Strip control characters except newline/tab
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Remove null bytes
    .replace(/\0/g, '')
    // Collapse excessive whitespace within lines (preserve single newlines)
    .split('\n')
    .map(line => line.replace(/[ \t]{2,}/g, ' ').trim())
    .join('\n')
    // Trim overall
    .trim()
    // Enforce length
    .slice(0, maxLength)
}

// ─── 8. Entity name validation ──────────────────────────────────────────────

export function validateEntityName(name: string): ValidationResult {
  if (typeof name !== 'string') return fail('实体名称必须是字符串')

  const trimmed = name.trim()
  if (trimmed.length < ENTITY_NAME_MIN_LENGTH) return fail('实体名称不能为空')
  if (trimmed.length > ENTITY_NAME_MAX_LENGTH) return fail(`实体名称不能超过 ${ENTITY_NAME_MAX_LENGTH} 个字符`)
  if (UNSAFE_NAME_PATTERN.test(trimmed)) return fail('实体名称包含不允许的特殊字符')

  return ok()
}

// ─── 9. Provider base URL validation ────────────────────────────────────────

export function validateBaseUrl(url: string): ValidationResult {
  if (typeof url !== 'string' || url.trim().length === 0) {
    return fail('API 地址不能为空')
  }

  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return fail('API 地址必须使用 http 或 https 协议')
    }
  } catch {
    return fail('API 地址格式无效')
  }

  return ok()
}

// ─── 10. Batch validation helper ────────────────────────────────────────────

export { merge as mergeValidationResults }
