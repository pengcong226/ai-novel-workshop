/**
 * Safe JSON parsing utilities with error handling
 */

/**
 * Safely parse JSON string with error handling
 * @param text - JSON string to parse
 * @param defaultValue - Default value to return on parse error
 * @returns Parsed value or default value
 */
export function safeJsonParse<T>(text: string, defaultValue: T): T {
  try {
    return JSON.parse(text) as T
  } catch (error) {
    console.error('Failed to parse JSON:', error)
    return defaultValue
  }
}

/**
 * Safely parse JSON string with error logging
 * @param text - JSON string to parse
 * @param context - Context information for error logging
 * @returns Parsed value or null on error
 */
export function safeJsonParseWithLogging<T>(text: string, context?: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch (error) {
    console.error(`Failed to parse JSON${context ? ` in ${context}` : ''}:`, error)
    return null
  }
}

/**
 * Safely parse JSON with detailed error information
 * @param text - JSON string to parse
 * @throws Error with detailed message on parse failure
 */
export function parseJsonOrThrow<T>(text: string, context?: string): T {
  try {
    return JSON.parse(text) as T
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `JSON parse error${context ? ` in ${context}` : ''}: ${message}. Input: ${text.substring(0, 100)}...`
    )
  }
}
