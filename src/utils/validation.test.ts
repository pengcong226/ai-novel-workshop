import { describe, expect, it } from 'vitest'
import {
  validateProjectName,
  validateChapterTitle,
  validateChapterContent,
  validateApiKey,
  validateModelConfig,
  validateImportFile,
  sanitizeUserInput,
  validateEntityName,
  validateBaseUrl,
  mergeValidationResults,
  type ModelConfigInput,
} from '@/utils/validation'

// ---------------------------------------------------------------------------
// validateProjectName
// ---------------------------------------------------------------------------

describe('validateProjectName', () => {
  it('accepts a valid project name', () => {
    const result = validateProjectName('我的小说')
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('rejects empty string', () => {
    const result = validateProjectName('')
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('不能为空')
  })

  it('rejects whitespace-only string', () => {
    const result = validateProjectName('   ')
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('不能为空')
  })

  it('rejects non-string input', () => {
    const result = validateProjectName(123 as unknown as string)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('字符串')
  })

  it('rejects names over 100 characters', () => {
    const result = validateProjectName('a'.repeat(101))
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('100')
  })

  it('accepts names at the boundary (100 chars)', () => {
    const result = validateProjectName('a'.repeat(100))
    expect(result.valid).toBe(true)
  })

  it('rejects names containing HTML/script injection characters', () => {
    expect(validateProjectName('test<script>').valid).toBe(false)
    expect(validateProjectName('test"name').valid).toBe(false)
    expect(validateProjectName("test'name").valid).toBe(false)
    expect(validateProjectName('test&name').valid).toBe(false)
    expect(validateProjectName('test`name').valid).toBe(false)
    expect(validateProjectName('test{name}').valid).toBe(false)
    expect(validateProjectName('test\\name').valid).toBe(false)
  })

  it('accepts CJK characters', () => {
    const result = validateProjectName('第一章：命运的开端')
    expect(result.valid).toBe(true)
  })

  it('trims whitespace before validation', () => {
    const result = validateProjectName('  valid name  ')
    expect(result.valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// validateChapterTitle
// ---------------------------------------------------------------------------

describe('validateChapterTitle', () => {
  it('accepts a valid chapter title', () => {
    expect(validateChapterTitle('第一章 初见').valid).toBe(true)
  })

  it('rejects empty title', () => {
    const result = validateChapterTitle('')
    expect(result.valid).toBe(false)
  })

  it('rejects whitespace-only title', () => {
    const result = validateChapterTitle('   ')
    expect(result.valid).toBe(false)
  })

  it('rejects titles over 200 characters', () => {
    const result = validateChapterTitle('a'.repeat(201))
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('200')
  })

  it('rejects non-string input', () => {
    expect(validateChapterTitle(null as unknown as string).valid).toBe(false)
  })

  it('rejects HTML injection characters', () => {
    expect(validateChapterTitle('title <img onerror=alert(1)>').valid).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// validateChapterContent
// ---------------------------------------------------------------------------

describe('validateChapterContent', () => {
  it('accepts normal text content', () => {
    expect(validateChapterContent('这是一段正常的内容。').valid).toBe(true)
  })

  it('rejects non-string input', () => {
    expect(validateChapterContent(123 as unknown as string).valid).toBe(false)
  })

  it('rejects content with null bytes', () => {
    const result = validateChapterContent('abc\0def')
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('空字节')
  })

  it('rejects content exceeding 10 MB byte limit', () => {
    // Each CJK char is ~3 bytes, so ~3.5M chars should exceed 10 MB
    const bigContent = '你'.repeat(3_500_000)
    const result = validateChapterContent(bigContent)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('超过限制')
  })

  it('accepts content just under the byte limit', () => {
    // ASCII char = 1 byte, 10MB = 10*1024*1024 bytes
    const okContent = 'a'.repeat(10 * 1024 * 1024 - 1)
    expect(validateChapterContent(okContent).valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// validateApiKey
// ---------------------------------------------------------------------------

describe('validateApiKey', () => {
  it('accepts a valid OpenAI key', () => {
    const result = validateApiKey('sk-abc123def456ghi', 'openai')
    expect(result.valid).toBe(true)
  })

  it('accepts a valid Anthropic key', () => {
    const result = validateApiKey('sk-ant-abc123def456ghi', 'anthropic')
    expect(result.valid).toBe(true)
  })

  it('rejects OpenAI key with wrong prefix', () => {
    const result = validateApiKey('ant-abc123def456ghi', 'openai')
    expect(result.valid).toBe(false)
  })

  it('rejects Anthropic key with wrong prefix', () => {
    const result = validateApiKey('sk-abc123def456ghi', 'anthropic')
    expect(result.valid).toBe(false)
  })

  it('allows empty key for custom provider', () => {
    const result = validateApiKey('', 'custom')
    expect(result.valid).toBe(true)
  })

  it('rejects empty key for non-custom providers', () => {
    expect(validateApiKey('', 'openai').valid).toBe(false)
    expect(validateApiKey('', 'anthropic').valid).toBe(false)
  })

  it('rejects key that is too short', () => {
    const result = validateApiKey('sk-ab', 'openai')
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('过短')
  })

  it('rejects key that is too long (>512 chars)', () => {
    const result = validateApiKey('sk-' + 'a'.repeat(520), 'openai')
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('过长')
  })

  it('rejects key with whitespace characters', () => {
    const result = validateApiKey('sk-abc def ghi', 'openai')
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('非法字符')
  })

  it('rejects key with HTML characters', () => {
    const result = validateApiKey('sk-abc<def', 'custom')
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('非法字符')
  })

  it('accepts custom provider key with arbitrary valid format', () => {
    const result = validateApiKey('my-custom-key-12345', 'custom')
    expect(result.valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// validateModelConfig
// ---------------------------------------------------------------------------

describe('validateModelConfig', () => {
  it('accepts valid config with all fields', () => {
    const config: ModelConfigInput = {
      temperature: 0.7,
      topP: 0.9,
      maxTokens: 4096,
      maxContextTokens: 128000,
      frequencyPenalty: 0,
      presencePenalty: 0,
      targetWordCount: 5000,
      recentChaptersCount: 5,
      qualityThreshold: 7,
      maxCostPerChapter: 1.5,
    }
    expect(validateModelConfig(config).valid).toBe(true)
  })

  it('accepts empty config (all undefined)', () => {
    expect(validateModelConfig({}).valid).toBe(true)
  })

  it('rejects temperature out of range', () => {
    expect(validateModelConfig({ temperature: -0.1 }).valid).toBe(false)
    expect(validateModelConfig({ temperature: 2.1 }).valid).toBe(false)
    expect(validateModelConfig({ temperature: 0 }).valid).toBe(true)
    expect(validateModelConfig({ temperature: 2 }).valid).toBe(true)
  })

  it('rejects topP out of range', () => {
    expect(validateModelConfig({ topP: -0.1 }).valid).toBe(false)
    expect(validateModelConfig({ topP: 1.1 }).valid).toBe(false)
  })

  it('rejects maxTokens out of range', () => {
    expect(validateModelConfig({ maxTokens: 0 }).valid).toBe(false)
    expect(validateModelConfig({ maxTokens: 1_000_001 }).valid).toBe(false)
  })

  it('rejects maxContextTokens out of range', () => {
    expect(validateModelConfig({ maxContextTokens: 999 }).valid).toBe(false)
    expect(validateModelConfig({ maxContextTokens: 2_000_001 }).valid).toBe(false)
  })

  it('rejects non-finite numbers', () => {
    expect(validateModelConfig({ temperature: Infinity }).valid).toBe(false)
    expect(validateModelConfig({ temperature: NaN }).valid).toBe(false)
    expect(validateModelConfig({ maxTokens: Infinity }).valid).toBe(false)
  })

  it('rejects non-number types for numeric fields', () => {
    expect(validateModelConfig({ temperature: 'warm' as unknown as number }).valid).toBe(false)
    expect(validateModelConfig({ maxTokens: '4096' as unknown as number }).valid).toBe(false)
  })

  it('accumulates multiple errors', () => {
    const result = validateModelConfig({ temperature: 5, topP: -1, maxTokens: 0 })
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBe(3)
  })

  it('validates frequencyPenalty range [-2, 2]', () => {
    expect(validateModelConfig({ frequencyPenalty: -2.1 }).valid).toBe(false)
    expect(validateModelConfig({ frequencyPenalty: 2.1 }).valid).toBe(false)
    expect(validateModelConfig({ frequencyPenalty: -2 }).valid).toBe(true)
    expect(validateModelConfig({ frequencyPenalty: 2 }).valid).toBe(true)
  })

  it('validates presencePenalty range [-2, 2]', () => {
    expect(validateModelConfig({ presencePenalty: -3 }).valid).toBe(false)
    expect(validateModelConfig({ presencePenalty: 3 }).valid).toBe(false)
  })

  it('validates targetWordCount range [100, 500000]', () => {
    expect(validateModelConfig({ targetWordCount: 99 }).valid).toBe(false)
    expect(validateModelConfig({ targetWordCount: 500_001 }).valid).toBe(false)
    expect(validateModelConfig({ targetWordCount: 100 }).valid).toBe(true)
  })

  it('validates recentChaptersCount range [0, 100]', () => {
    expect(validateModelConfig({ recentChaptersCount: -1 }).valid).toBe(false)
    expect(validateModelConfig({ recentChaptersCount: 101 }).valid).toBe(false)
    expect(validateModelConfig({ recentChaptersCount: 0 }).valid).toBe(true)
  })

  it('validates qualityThreshold range [0, 10]', () => {
    expect(validateModelConfig({ qualityThreshold: -0.1 }).valid).toBe(false)
    expect(validateModelConfig({ qualityThreshold: 10.1 }).valid).toBe(false)
  })

  it('validates maxCostPerChapter range [0, 100]', () => {
    expect(validateModelConfig({ maxCostPerChapter: -0.01 }).valid).toBe(false)
    expect(validateModelConfig({ maxCostPerChapter: 100.01 }).valid).toBe(false)
    expect(validateModelConfig({ maxCostPerChapter: 0 }).valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// validateImportFile
// ---------------------------------------------------------------------------

describe('validateImportFile', () => {
  it('accepts a valid .anproj file', () => {
    const result = validateImportFile({ name: 'backup.anproj', size: 1024, type: 'application/json' })
    expect(result.valid).toBe(true)
  })

  it('accepts .anprojl extension', () => {
    expect(validateImportFile({ name: 'old.anprojl', size: 1024 }).valid).toBe(true)
  })

  it('accepts .json extension', () => {
    expect(validateImportFile({ name: 'data.json', size: 1024, type: 'application/json' }).valid).toBe(true)
  })

  it('rejects empty file', () => {
    const result = validateImportFile({ name: 'empty.anproj', size: 0 })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('文件为空')
  })

  it('rejects file exceeding 100 MB', () => {
    const result = validateImportFile({ name: 'big.anproj', size: 101 * 1024 * 1024 })
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('超过限制')
  })

  it('rejects unsupported extensions', () => {
    const result = validateImportFile({ name: 'file.exe', size: 1024 })
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('不支持的文件类型')
  })

  it('rejects unsupported MIME types when provided', () => {
    const result = validateImportFile({ name: 'file.json', size: 1024, type: 'text/html' })
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('MIME')
  })

  it('accepts empty MIME type (some environments omit it)', () => {
    const result = validateImportFile({ name: 'file.anproj', size: 1024, type: '' })
    expect(result.valid).toBe(true)
  })

  it('accepts application/x-ndjson MIME type', () => {
    expect(validateImportFile({ name: 'f.anproj', size: 100, type: 'application/x-ndjson' }).valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// sanitizeUserInput
// ---------------------------------------------------------------------------

describe('sanitizeUserInput', () => {
  it('returns normal text unchanged (modulo trim)', () => {
    expect(sanitizeUserInput('hello world')).toBe('hello world')
  })

  it('strips control characters except newline and tab', () => {
    const input = 'a\x00b\x01c\x08d'
    expect(sanitizeUserInput(input)).toBe('abcd')
  })

  it('preserves newlines and tabs', () => {
    const input = 'line1\nline2\tindented'
    expect(sanitizeUserInput(input)).toBe('line1\nline2\tindented')
  })

  it('normalizes CRLF and CR to LF', () => {
    expect(sanitizeUserInput('a\r\nb\rc')).toBe('a\nb\nc')
  })

  it('removes null bytes', () => {
    expect(sanitizeUserInput('a\0b')).toBe('ab')
  })

  it('collapses excessive whitespace within lines', () => {
    expect(sanitizeUserInput('a    b\t\tc')).toBe('a b c')
  })

  it('trims overall string', () => {
    expect(sanitizeUserInput('  hello  ')).toBe('hello')
  })

  it('respects maxLength parameter', () => {
    const long = 'a'.repeat(1000)
    expect(sanitizeUserInput(long, 100).length).toBe(100)
  })

  it('uses default maxLength of 500', () => {
    const long = 'a'.repeat(600)
    expect(sanitizeUserInput(long).length).toBe(500)
  })

  it('returns empty string for non-string input', () => {
    expect(sanitizeUserInput(null as unknown as string)).toBe('')
    expect(sanitizeUserInput(undefined as unknown as string)).toBe('')
    expect(sanitizeUserInput(123 as unknown as string)).toBe('')
  })

  it('handles empty string', () => {
    expect(sanitizeUserInput('')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// validateEntityName
// ---------------------------------------------------------------------------

describe('validateEntityName', () => {
  it('accepts a valid entity name', () => {
    expect(validateEntityName('主角').valid).toBe(true)
  })

  it('rejects empty name', () => {
    expect(validateEntityName('').valid).toBe(false)
    expect(validateEntityName('   ').valid).toBe(false)
  })

  it('rejects non-string input', () => {
    expect(validateEntityName(42 as unknown as string).valid).toBe(false)
  })

  it('rejects names over 200 characters', () => {
    expect(validateEntityName('a'.repeat(201)).valid).toBe(false)
  })

  it('accepts names at the 200 char boundary', () => {
    expect(validateEntityName('a'.repeat(200)).valid).toBe(true)
  })

  it('rejects names with unsafe HTML characters', () => {
    expect(validateEntityName('name<script>').valid).toBe(false)
    expect(validateEntityName('name{injection}').valid).toBe(false)
    expect(validateEntityName('name\\path').valid).toBe(false)
  })

  it('accepts names with CJK, punctuation, digits', () => {
    expect(validateEntityName('龙城-守卫者 III').valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// validateBaseUrl
// ---------------------------------------------------------------------------

describe('validateBaseUrl', () => {
  it('accepts a valid https URL', () => {
    expect(validateBaseUrl('https://api.openai.com').valid).toBe(true)
  })

  it('accepts a valid http URL', () => {
    expect(validateBaseUrl('http://localhost:3000').valid).toBe(true)
  })

  it('rejects empty string', () => {
    expect(validateBaseUrl('').valid).toBe(false)
  })

  it('rejects whitespace-only string', () => {
    expect(validateBaseUrl('   ').valid).toBe(false)
  })

  it('rejects non-string input', () => {
    expect(validateBaseUrl(null as unknown as string).valid).toBe(false)
  })

  it('rejects invalid URL format', () => {
    expect(validateBaseUrl('not-a-url').valid).toBe(false)
  })

  it('rejects non-http(s) protocols', () => {
    expect(validateBaseUrl('ftp://example.com').valid).toBe(false)
    expect(validateBaseUrl('file:///etc/passwd').valid).toBe(false)
  })

  it('rejects javascript: protocol', () => {
    expect(validateBaseUrl('javascript:alert(1)').valid).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// mergeValidationResults
// ---------------------------------------------------------------------------

describe('mergeValidationResults', () => {
  it('returns valid when all results are valid', () => {
    const result = mergeValidationResults(
      { valid: true, errors: [] },
      { valid: true, errors: [] },
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('merges errors from multiple invalid results', () => {
    const result = mergeValidationResults(
      { valid: false, errors: ['err1'] },
      { valid: true, errors: [] },
      { valid: false, errors: ['err2', 'err3'] },
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(['err1', 'err2', 'err3'])
  })

  it('returns invalid if any single result is invalid', () => {
    const result = mergeValidationResults(
      { valid: true, errors: [] },
      { valid: false, errors: ['bad'] },
    )
    expect(result.valid).toBe(false)
  })

  it('returns valid for zero results', () => {
    const result = mergeValidationResults()
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })
})
