/**
 * Safe JSON parsing utilities for untrusted input.
 *
 * Unlike raw `JSON.parse`, these helpers enforce a size guard and reject
 * payloads that exceed the configured limit, preventing memory exhaustion
 * from malicious or malformed input.
 */

import { getLogger } from '@/utils/logger'

const logger = getLogger('utils:safeJsonParse')

/** Default maximum JSON payload size in characters (5 MB). */
const DEFAULT_MAX_CHARS = 5 * 1024 * 1024

interface SafeParseOptions {
  /** Maximum allowed input length in characters. */
  maxChars?: number
  /** Label used in log messages for tracing. */
  source?: string
}

/**
 * Parse a JSON string with a size guard.
 *
 * Returns `null` when the input exceeds `maxChars`, is empty, or is
 * syntactically invalid.  The generic type `T` is *not* validated at
 * runtime -- callers should narrow the result as needed.
 */
export function safeJsonParse<T = unknown>(
  raw: string | null | undefined,
  options: SafeParseOptions = {},
): T | null {
  const { maxChars = DEFAULT_MAX_CHARS, source = 'unknown' } = options

  if (!raw || typeof raw !== 'string') return null

  if (raw.length > maxChars) {
    logger.warn(`[safeJsonParse:${source}] Payload exceeds size limit`, {
      length: raw.length,
      maxChars,
    })
    return null
  }

  try {
    return JSON.parse(raw) as T
  } catch (err) {
    logger.warn(`[safeJsonParse:${source}] JSON parse failed`, {
      error: err instanceof Error ? err.message : String(err),
      preview: raw.slice(0, 200),
    })
    return null
  }
}

/**
 * Parse a JSON string from an untrusted file import.
 *
 * Uses a stricter 2 MB limit by default, appropriate for user-uploaded
 * project/backup/character-card files.
 */
export function safeJsonParseFile<T = unknown>(
  raw: string,
  source = 'file-import',
): T | null {
  return safeJsonParse<T>(raw, { maxChars: 2 * 1024 * 1024, source })
}
