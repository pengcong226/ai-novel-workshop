export interface InputValidationResult {
  valid: boolean
  warnings: string[]
}

export interface SanitizeOptions {
  maxLength?: number
  preserveLineBreaks?: boolean
  strict?: boolean
  escapeBraces?: boolean  // defaults to false; only set true when braces could be interpreted as template placeholders
}

const DEFAULT_MAX_LENGTH = 500
export function stripControlChars(input: string): string {
  return replaceControlChars(input, '')
}

function replaceControlChars(input: string, replacement: string): string {
  return Array.from(input)
    .map(char => {
      const code = char.charCodeAt(0)
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127) ? char : replacement
    })
    .join('')
}

const SUSPICIOUS_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  // Chinese prompt injection
  { pattern: /忽略(?:上面|之前|上述|以上)?(?:所有)?(?:指令|要求|规则)/gi, message: '检测到疑似绕过系统指令的中文注入语句' },
  { pattern: /请无视(?:上面|之前|上述|以上)?(?:所有)?(?:指令|要求|规则)/gi, message: '检测到疑似绕过系统指令的中文注入语句' },
  { pattern: /不要(?:遵循|遵守|执行)(?:上面|之前|上述|以上)?(?:所有)?(?:指令|要求|规则)/gi, message: '检测到疑似绕过系统指令的中文注入语句' },
  { pattern: /你(?:现在)?(?:是|扮演)(?:一个)?(?:(?:没有|不受)(?:任何)?(?:限制|约束|规则))/gi, message: '检测到疑似角色劫持的中文注入语句' },
  // English prompt injection
  { pattern: /ignore\s+(?:all\s+)?(?:previous|above|prior|earlier)\s+(?:instructions?|rules?|prompts?|directives?)/gi, message: '检测到疑似绕过系统指令的英文注入语句' },
  { pattern: /disregard\s+(?:all\s+)?(?:previous|above|prior|earlier)\s+(?:instructions?|rules?|prompts?|directives?)/gi, message: '检测到疑似绕过系统指令的英文注入语句' },
  { pattern: /forget\s+(?:all\s+)?(?:previous|above|prior|earlier)\s+(?:instructions?|rules?|prompts?)/gi, message: '检测到疑似绕过系统指令的英文注入语句' },
  { pattern: /override\s+(?:your\s+)?(?:instructions?|programming|rules?|safety)/gi, message: '检测到疑似绕过系统指令的英文注入语句' },
  { pattern: /you\s+(?:are|now)\s+(?:a|an)\s+(?:unrestricted|uncensored|unfiltered)/gi, message: '检测到疑似角色劫持的英文注入语句' },
  // System prompt probing
  { pattern: /system\s*prompt/gi, message: '检测到疑似探测系统提示词的语句' },
  { pattern: /developer\s*message/gi, message: '检测到疑似探测开发者消息的语句' },
  { pattern: /(?:show|reveal|print|output|repeat)\s+(?:your|the)\s+(?:system|initial|original)\s+(?:prompt|instructions?)/gi, message: '检测到疑似探测系统提示词的语句' },
  // Role tag spoofing
  { pattern: /<\/?(?:system|assistant|user|instructions?|prompt)>/gi, message: '检测到疑似伪造角色标签的语句' },
  // Code block injection
  { pattern: /```(?:system|assistant|user|prompt)?/gi, message: '检测到疑似利用代码块注入的语句' },
  // Encoded instruction bypass attempts
  { pattern: /(?:decode|execute|run)\s+(?:this|the)?\s*(?:base64|hex|encoded)/gi, message: '检测到疑似编码绕过指令' },
  { pattern: /\bDAN\b.*(?:jailbreak|mode|prompt)/gi, message: '检测到疑似DAN越狱注入语句' },
]

/**
 * Normalize confusable Unicode characters to their ASCII equivalents
 * to prevent homoglyph-based prompt injection bypasses.
 */
function normalizeConfusables(input: string): string {
  return input
    // Fullwidth Latin -> ASCII (U+FF01..U+FF5E -> U+0021..U+007E)
    .replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/‘|’/g, "'")   // smart single quotes -> straight
    .replace(/“|”/g, '"')   // smart double quotes -> straight
    .replace(/–|—/g, '-')   // en/em dash -> hyphen
}

function normalizeWhitespace(input: string, preserveLineBreaks: boolean): string {
  const cleaned = replaceControlChars(input, ' ')
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

export function validateInput(input: string): InputValidationResult {
  const warnings: string[] = []
  // Normalize confusables before pattern matching to prevent homoglyph bypasses
  const normalized = normalizeConfusables(input)

  for (const rule of SUSPICIOUS_PATTERNS) {
    if (rule.pattern.test(normalized)) {
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
    strict = false,
    escapeBraces = false
  } = options

  let sanitized = normalizeWhitespace(input, preserveLineBreaks)
  // Normalize confusables first, then validate against normalized text
  sanitized = normalizeConfusables(sanitized)
  const validation = validateInput(sanitized)

  for (const rule of SUSPICIOUS_PATTERNS) {
    sanitized = sanitized.replace(rule.pattern, '[已清洗可疑指令]')
  }

  // Apply control char escaping
  sanitized = sanitized.replace(/</g, '＜').replace(/>/g, '＞')
  if (escapeBraces) {
    sanitized = sanitized.replace(/\{/g, '｛').replace(/\}/g, '｝')
  }

  if (sanitized.length > maxLength) {
    sanitized = `${sanitized.slice(0, Math.max(maxLength - 15, 0))}...[已截断]`
  }

  if (strict && !validation.valid) {
    return '[输入因触发严格模式已被拦截]'
  }

  return sanitized
}
