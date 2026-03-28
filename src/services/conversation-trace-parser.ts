/**
 * 会话轨迹 JSONL 解析器
 * @module services/conversation-trace-parser
 */

import type {
  ConversationTraceParseOptions,
  ConversationTraceParseResult,
  ConversationTraceRecord,
  TraceMessage,
  TraceParseError,
  TraceRole,
} from '@/types/conversation-trace'

const DEFAULT_INCLUDE_ROLES: TraceRole[] = ['user', 'assistant']
const DEFAULT_MAX_MESSAGES = 5000
const DEFAULT_MAX_ERRORS = 200
const DEFAULT_MAX_ERROR_RAW_LINE_LENGTH = 1000
const DEFAULT_MAX_LINE_LENGTH = 20000

interface ParseAccumulator {
  messages: TraceMessage[]
  errors: TraceParseError[]
  stats: ConversationTraceParseResult['stats']
}

interface ParseLineOptions {
  includeRoles: TraceRole[]
  includeEmptyContent: boolean
  includeSourceRecord: boolean
  maxErrorRawLineLength: number
}

interface ParseLineResult {
  parsed: boolean
  filtered: boolean
  message?: TraceMessage
  error?: TraceParseError
}

function normalizeRole(value: unknown): TraceRole {
  if (typeof value !== 'string') {
    return 'other'
  }

  const role = value.toLowerCase()

  if (role === 'assistant' || role === 'ai' || role === 'model') return 'assistant'
  if (role === 'user' || role === 'human') return 'user'
  if (role === 'system') return 'system'
  if (role === 'tool') return 'tool'

  return 'other'
}

function extractTextBlocks(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value]
  }

  if (!Array.isArray(value)) {
    return []
  }

  const result: string[] = []
  for (const item of value) {
    if (typeof item === 'string') {
      result.push(item)
      continue
    }

    if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
      result.push(item.text)
    }
  }

  return result
}

function extractContent(record: ConversationTraceRecord): string {
  const directBlocks = extractTextBlocks(record.content)
  if (directBlocks.length > 0) {
    return directBlocks.join('\n').trim()
  }

  const message = record.message
  if (message && typeof message === 'object') {
    const msgRecord = message as Record<string, unknown>
    const msgBlocks = extractTextBlocks(msgRecord.content)
    if (msgBlocks.length > 0) {
      return msgBlocks.join('\n').trim()
    }
  }

  if (typeof record.text === 'string') {
    return record.text.trim()
  }

  return ''
}

function extractTimestamp(record: ConversationTraceRecord): number | undefined {
  const candidates = [record.timestamp, record.time, record.created_at, record.createdAt]

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate
    }

    if (typeof candidate === 'string') {
      const parsed = Date.parse(candidate)
      if (!Number.isNaN(parsed)) {
        return parsed
      }
    }
  }

  return undefined
}

function extractRole(record: ConversationTraceRecord): TraceRole {
  const directRole = normalizeRole(record.role)
  if (directRole !== 'other') {
    return directRole
  }

  const directType = normalizeRole(record.type)
  if (directType !== 'other') {
    return directType
  }

  if (record.message && typeof record.message === 'object') {
    const messageRole = normalizeRole((record.message as Record<string, unknown>).role)
    if (messageRole !== 'other') {
      return messageRole
    }
  }

  return 'other'
}

function truncateRawLine(line: string, maxLength: number): string {
  if (maxLength <= 0) {
    return ''
  }

  if (line.length <= maxLength) {
    return line
  }

  return line.slice(0, maxLength)
}

function createParseError(
  line: number,
  message: string,
  rawLine: string,
  maxRawLength: number
): TraceParseError {
  return {
    line,
    message,
    rawLine: truncateRawLine(rawLine, maxRawLength),
  }
}

function parseLine(
  line: string,
  lineNumber: number,
  options: ParseLineOptions
): ParseLineResult {
  let raw: unknown

  try {
    raw = JSON.parse(line)
  } catch (error) {
    return {
      parsed: false,
      filtered: false,
      error: createParseError(
        lineNumber,
        error instanceof Error ? error.message : String(error),
        line,
        options.maxErrorRawLineLength
      ),
    }
  }

  if (!raw || typeof raw !== 'object') {
    return {
      parsed: false,
      filtered: false,
      error: createParseError(
        lineNumber,
        'JSONL 行不是对象结构',
        line,
        options.maxErrorRawLineLength
      ),
    }
  }

  const record = raw as ConversationTraceRecord
  const role = extractRole(record)
  const content = extractContent(record)

  if (!options.includeRoles.includes(role)) {
    return { parsed: true, filtered: true }
  }

  if (!options.includeEmptyContent && !content) {
    return { parsed: true, filtered: true }
  }

  return {
    parsed: true,
    filtered: false,
    message: {
      role,
      content,
      timestamp: extractTimestamp(record),
      sourceLine: lineNumber,
      sourceRecord: options.includeSourceRecord ? record : undefined,
    },
  }
}

function buildResult(acc: ParseAccumulator): ConversationTraceParseResult {
  return {
    messages: acc.messages,
    errors: acc.errors,
    stats: acc.stats,
  }
}

function createAccumulator(): ParseAccumulator {
  return {
    messages: [],
    errors: [],
    stats: {
      totalLines: 0,
      parsedRecords: 0,
      includedMessages: 0,
      filteredMessages: 0,
      parseErrors: 0,
    },
  }
}

function normalizeParserOptions(options: ConversationTraceParseOptions): {
  includeRoles: TraceRole[]
  includeEmptyContent: boolean
  includeSourceRecord: boolean
  maxMessages: number
  maxErrors: number
  maxErrorRawLineLength: number
  maxLineLength: number
} {
  const includeRoles = options.includeRoles ?? DEFAULT_INCLUDE_ROLES
  const includeEmptyContent = options.includeEmptyContent ?? false
  const includeSourceRecord = options.includeSourceRecord ?? false
  const maxMessages = Math.max(0, options.maxMessages ?? DEFAULT_MAX_MESSAGES)
  const maxErrors = Math.max(0, options.maxErrors ?? DEFAULT_MAX_ERRORS)
  const maxErrorRawLineLength = Math.max(0, options.maxErrorRawLineLength ?? DEFAULT_MAX_ERROR_RAW_LINE_LENGTH)
  const maxLineLength = Math.max(1, options.maxLineLength ?? DEFAULT_MAX_LINE_LENGTH)

  return {
    includeRoles,
    includeEmptyContent,
    includeSourceRecord,
    maxMessages,
    maxErrors,
    maxErrorRawLineLength,
    maxLineLength,
  }
}

function pushParseError(acc: ParseAccumulator, error: TraceParseError, maxErrors: number): void {
  acc.stats.parseErrors++
  if (acc.errors.length < maxErrors) {
    acc.errors.push(error)
  }
}

export async function parseConversationTraceText(
  text: string,
  options: ConversationTraceParseOptions = {}
): Promise<ConversationTraceParseResult> {
  const normalized = normalizeParserOptions(options)

  const lines = text.split(/\r?\n/)
  const nonEmptyLineCount = lines.reduce((count, line) => (line.trim() ? count + 1 : count), 0)
  const acc = createAccumulator()
  acc.stats.totalLines = nonEmptyLineCount

  if (normalized.maxMessages === 0) {
    return buildResult(acc)
  }

  let processed = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) {
      continue
    }

    processed++

    if (line.length > normalized.maxLineLength) {
      pushParseError(
        acc,
        createParseError(i + 1, 'JSONL 单行长度超过限制', line, normalized.maxErrorRawLineLength),
        normalized.maxErrors
      )
      options.onProgress?.(processed, nonEmptyLineCount)
      if (acc.stats.parseErrors >= normalized.maxErrors) {
        break
      }
      continue
    }

    const parsed = parseLine(line, i + 1, {
      includeRoles: normalized.includeRoles,
      includeEmptyContent: normalized.includeEmptyContent,
      includeSourceRecord: normalized.includeSourceRecord,
      maxErrorRawLineLength: normalized.maxErrorRawLineLength,
    })

    if (parsed.error) {
      pushParseError(acc, parsed.error, normalized.maxErrors)
      options.onProgress?.(processed, nonEmptyLineCount)
      if (acc.stats.parseErrors >= normalized.maxErrors) {
        break
      }
      continue
    }

    if (parsed.parsed) {
      acc.stats.parsedRecords++
    }

    if (parsed.filtered) {
      acc.stats.filteredMessages++
      options.onProgress?.(processed, nonEmptyLineCount)
      continue
    }

    if (parsed.message && acc.messages.length < normalized.maxMessages) {
      acc.messages.push(parsed.message)
      acc.stats.includedMessages++
    }

    options.onProgress?.(processed, nonEmptyLineCount)

    if (acc.messages.length >= normalized.maxMessages) {
      break
    }
  }

  return buildResult(acc)
}

export async function parseConversationTraceFile(
  file: File,
  options: ConversationTraceParseOptions = {}
): Promise<ConversationTraceParseResult> {
  if (!file.stream) {
    return parseConversationTraceText(await file.text(), options)
  }

  const normalized = normalizeParserOptions(options)
  const acc = createAccumulator()

  if (normalized.maxMessages === 0) {
    return buildResult(acc)
  }

  const reader = file.stream().getReader()
  const decoder = new TextDecoder('utf-8')

  let buffer = ''
  let lineNumber = 0
  let processed = 0

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''

    if (buffer.length > normalized.maxLineLength) {
      lineNumber++
      processed++
      acc.stats.totalLines++
      pushParseError(
        acc,
        createParseError(lineNumber, 'JSONL 单行长度超过限制', buffer, normalized.maxErrorRawLineLength),
        normalized.maxErrors
      )
      options.onProgress?.(processed, Math.max(processed, acc.stats.totalLines))
      return buildResult(acc)
    }

    for (const line of lines) {
      lineNumber++

      if (!line.trim()) {
        continue
      }

      processed++
      acc.stats.totalLines++

      if (line.length > normalized.maxLineLength) {
        pushParseError(
          acc,
          createParseError(lineNumber, 'JSONL 单行长度超过限制', line, normalized.maxErrorRawLineLength),
          normalized.maxErrors
        )
        options.onProgress?.(processed, Math.max(processed, acc.stats.totalLines))

        if (acc.stats.parseErrors >= normalized.maxErrors) {
          return buildResult(acc)
        }
        continue
      }

      const parsed = parseLine(line, lineNumber, {
        includeRoles: normalized.includeRoles,
        includeEmptyContent: normalized.includeEmptyContent,
        includeSourceRecord: normalized.includeSourceRecord,
        maxErrorRawLineLength: normalized.maxErrorRawLineLength,
      })

      if (parsed.error) {
        pushParseError(acc, parsed.error, normalized.maxErrors)
        options.onProgress?.(processed, Math.max(processed, acc.stats.totalLines))

        if (acc.stats.parseErrors >= normalized.maxErrors) {
          return buildResult(acc)
        }
        continue
      } else {
        if (parsed.parsed) {
          acc.stats.parsedRecords++
        }

        if (parsed.filtered) {
          acc.stats.filteredMessages++
        } else if (parsed.message && acc.messages.length < normalized.maxMessages) {
          acc.messages.push(parsed.message)
          acc.stats.includedMessages++
        }
      }

      options.onProgress?.(processed, Math.max(processed, acc.stats.totalLines))

      if (acc.messages.length >= normalized.maxMessages) {
        return buildResult(acc)
      }
    }
  }

  if (buffer.trim()) {
    lineNumber++
    processed++
    acc.stats.totalLines++

    if (buffer.length > normalized.maxLineLength) {
      pushParseError(
        acc,
        createParseError(lineNumber, 'JSONL 单行长度超过限制', buffer, normalized.maxErrorRawLineLength),
        normalized.maxErrors
      )
      options.onProgress?.(processed, Math.max(processed, acc.stats.totalLines))
      return buildResult(acc)
    }

    const parsed = parseLine(buffer, lineNumber, {
      includeRoles: normalized.includeRoles,
      includeEmptyContent: normalized.includeEmptyContent,
      includeSourceRecord: normalized.includeSourceRecord,
      maxErrorRawLineLength: normalized.maxErrorRawLineLength,
    })

    if (parsed.error) {
      pushParseError(acc, parsed.error, normalized.maxErrors)
    } else {
      if (parsed.parsed) {
        acc.stats.parsedRecords++
      }

      if (parsed.filtered) {
        acc.stats.filteredMessages++
      } else if (parsed.message && acc.messages.length < normalized.maxMessages) {
        acc.messages.push(parsed.message)
        acc.stats.includedMessages++
      }
    }

    options.onProgress?.(processed, Math.max(processed, acc.stats.totalLines))
  }

  return buildResult(acc)
}
