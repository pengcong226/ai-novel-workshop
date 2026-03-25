export interface InputValidationResult {
  valid: boolean
  warnings: string[]
}

export interface SanitizeOptions {
  maxLength?: number
  preserveLineBreaks?: boolean
  strict?: boolean
}

const DEFAULT_MAX_LENGTH = 500

const SUSPICIOUS_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /忽略(?:上面|之前|上述|以上)?(?:所有)?(?:指令|要求|规则)/gi, message: '检测到疑似绕过系统指令的中文注入语句' },
  { pattern: /请无视(?:上面|之前|上述|以上)?(?:所有)?(?:指令|要求|规则)/gi, message: '检测到疑似绕过系统指令的中文注入语句' },
  { pattern: /ignore\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions?|rules?|prompts?)/gi, message: '检测到疑似绕过系统指令的英文注入语句' },
  { pattern: /disregard\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions?|rules?|prompts?)/gi, message: '检测到疑似绕过系统指令的英文注入语句' },
  { pattern: /system\s*prompt/gi, message: '检测到疑似探测系统提示词的语句' },
  { pattern: /developer\s*message/gi, message: '检测到疑似探测开发者消息的语句' },
  { pattern: /<\/?(?:system|assistant|user|instructions?|prompt)>/gi, message: '检测到疑似伪造角色标签的语句' },
  { pattern: /```(?:system|assistant|user|prompt)?/gi, message: '检测到疑似利用代码块注入的语句' }
]

function normalizeWhitespace(input: string, preserveLineBreaks: boolean): string {
  const cleaned = input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

  if (preserveLineBreaks) {
    return cleaned
      .split('\n')
      .map(line => line.replace(/[ \t]{2,}/g, ' ').trim())
      .filter((line, index, arr) => !(line === '' && arr[index - 1] === ''))
      .join('\n')
      .trim()
  }

  return cleaned.replace(/\s+/g, ' ').trim()
}

function escapePromptControlChars(input: string): string {
  return input
    .replace(/</g, '＜')
    .replace(/>/g, '＞')
    .replace(/\{/g, '｛')
    .replace(/\}/g, '｝')
}

export function validateInput(input: string): InputValidationResult {
  const warnings: string[] = []

  for (const rule of SUSPICIOUS_PATTERNS) {
    if (rule.pattern.test(input)) {
      warnings.push(rule.message)
    }
  }

  return {
    valid: warnings.length === 0,
    warnings
  }
}

export function sanitizeForPrompt(input: string, options: SanitizeOptions = {}): string {
  if (!input) {
    return ''
  }

  const {
    maxLength = DEFAULT_MAX_LENGTH,
    preserveLineBreaks = true,
    strict = false
  } = options

  let sanitized = normalizeWhitespace(input, preserveLineBreaks)
  const validation = validateInput(sanitized)

  for (const rule of SUSPICIOUS_PATTERNS) {
    sanitized = sanitized.replace(rule.pattern, '[已清洗可疑指令]')
  }

  sanitized = escapePromptControlChars(sanitized)

  if (sanitized.length > maxLength) {
    sanitized = `${sanitized.slice(0, Math.max(maxLength - 15, 0))}...[已截断]`
  }

  if (strict && !validation.valid) {
    return '[输入因触发严格模式已被拦截]'
  }

  return sanitized
}
