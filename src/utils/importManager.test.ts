import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Chapter } from '@/types'

// Mock external dependencies before importing the module under test

vi.mock('@/utils/novelImporter', () => ({
  importNovel: vi.fn(async () => ({
    success: true,
    project: { id: 'imported', title: 'imported', chapters: [] },
    message: 'ok',
  })),
  importMultipleFiles: vi.fn(async () => ({
    success: true,
    project: { id: 'multi', title: 'multi', chapters: [] },
    message: 'ok',
  })),
}))

vi.mock('@/utils/chapterParser', () => ({
  parseNovelText: vi.fn(() => ({
    chapters: [
      { number: 1, title: '第一章', content: '故事开始。', startIndex: 0, endIndex: 10, wordCount: 5 },
      { number: 2, title: '第二章', content: '故事继续。', startIndex: 11, endIndex: 21, wordCount: 5 },
    ],
    stats: {
      totalWords: 10,
      totalChapters: 2,
      avgWordsPerChapter: 5,
    },
  })),
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

import {
  validateFile,
  detectConflicts,
  resolveConflicts,
  getSupportedImportFormats,
  type ImportManagerConfig,
  type ConflictInfo,
} from '@/utils/importManager'
import type { ParsedChapter } from '@/utils/chapterParser'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: ImportManagerConfig = {
  maxFileSize: 100 * 1024 * 1024,
  maxChapters: 10000,
  allowedFormats: ['txt', 'md', 'docx'],
  defaultConflictStrategy: 'skip',
  autoDetectEncoding: true,
}

function makeFile(name: string, size: number, type?: string): File {
  // Create a minimal File-like object
  const blob = new Blob(['x'.repeat(size)], { type: type || 'text/plain' })
  return new File([blob], name, { lastModified: Date.now() })
}

function makeChapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: 'ch-1',
    number: 1,
    title: '第一章',
    content: '内容',
    wordCount: 10,
    outline: {
      chapterId: 'ch-1',
      title: '第一章',
      scenes: [],
      characters: [],
      location: '',
      goals: [],
      conflicts: [],
      resolutions: [],
      foreshadowingToPlant: [],
      foreshadowingToResolve: [],
      status: 'planned',
    },
    status: 'draft',
    generatedBy: 'manual',
    generationTime: new Date(),
    checkpoints: [],
    ...overrides,
  }
}

function makeParsedChapter(overrides: Partial<ParsedChapter> = {}): ParsedChapter {
  return {
    number: 1,
    title: '第一章',
    content: '内容',
    startIndex: 0,
    endIndex: 10,
    wordCount: 5,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// validateFile
// ---------------------------------------------------------------------------

describe('validateFile', () => {
  it('accepts a valid txt file', () => {
    const file = makeFile('novel.txt', 1024)
    const result = validateFile(file, DEFAULT_CONFIG)
    expect(result.valid).toBe(true)
    expect(result.format).toBe('txt')
    expect(result.errors).toEqual([])
  })

  it('accepts a valid md file', () => {
    const file = makeFile('novel.md', 2048)
    const result = validateFile(file, DEFAULT_CONFIG)
    expect(result.valid).toBe(true)
    expect(result.format).toBe('md')
  })

  it('accepts a valid docx file', () => {
    const file = makeFile('novel.docx', 4096)
    const result = validateFile(file, DEFAULT_CONFIG)
    expect(result.valid).toBe(true)
    expect(result.format).toBe('docx')
  })

  it('rejects an empty file (size 0)', () => {
    const file = makeFile('empty.txt', 0)
    const result = validateFile(file, DEFAULT_CONFIG)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('文件为空')
  })

  it('rejects files exceeding maxFileSize', () => {
    const file = makeFile('huge.txt', 101 * 1024 * 1024)
    const result = validateFile(file, DEFAULT_CONFIG)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('超过限制')
  })

  it('rejects unsupported file extensions', () => {
    const file = makeFile('file.exe', 1024)
    const result = validateFile(file, DEFAULT_CONFIG)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('不支持的文件格式')
  })

  it('warns for files >50 MB', () => {
    const file = makeFile('big.txt', 60 * 1024 * 1024)
    const result = validateFile(file, DEFAULT_CONFIG)
    expect(result.valid).toBe(true)
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0]).toContain('较大')
  })

  it('accepts .text extension (maps to txt)', () => {
    const file = makeFile('novel.text', 1024)
    const result = validateFile(file, DEFAULT_CONFIG)
    expect(result.valid).toBe(true)
    expect(result.format).toBe('txt')
  })

  it('accepts .markdown extension (maps to md)', () => {
    const file = makeFile('novel.markdown', 1024)
    const result = validateFile(file, DEFAULT_CONFIG)
    expect(result.valid).toBe(true)
    expect(result.format).toBe('md')
  })

  it('includes fileInfo with name, size, and sizeFormatted', () => {
    const file = makeFile('test.txt', 2048)
    const result = validateFile(file, DEFAULT_CONFIG)
    expect(result.fileInfo).toBeDefined()
    expect(result.fileInfo!.name).toBe('test.txt')
    expect(result.fileInfo!.size).toBe(2048)
    expect(result.fileInfo!.sizeFormatted).toContain('KB')
  })

  it('rejects format not in allowedFormats list', () => {
    const config: ImportManagerConfig = {
      ...DEFAULT_CONFIG,
      allowedFormats: ['txt'], // md and docx not allowed
    }
    const file = makeFile('novel.md', 1024)
    const result = validateFile(file, config)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('不在允许的格式列表中')
  })
})

// ---------------------------------------------------------------------------
// detectConflicts
// ---------------------------------------------------------------------------

describe('detectConflicts', () => {
  it('detects duplicate title conflicts', () => {
    const existing = [makeChapter({ title: '第一章', number: 1 })]
    const incoming = [makeParsedChapter({ title: '第一章', number: 2 })]
    const conflicts = detectConflicts(existing, incoming)
    expect(conflicts.length).toBe(1)
    expect(conflicts[0].type).toBe('duplicate_title')
    expect(conflicts[0].message).toContain('第一章')
  })

  it('detects duplicate number conflicts', () => {
    const existing = [makeChapter({ title: '旧章节', number: 1 })]
    const incoming = [makeParsedChapter({ title: '新章节', number: 1 })]
    const conflicts = detectConflicts(existing, incoming)
    expect(conflicts.length).toBe(1)
    expect(conflicts[0].type).toBe('duplicate_number')
  })

  it('detects empty content conflicts', () => {
    const existing: Chapter[] = []
    const incoming = [makeParsedChapter({ title: '空章节', content: '' })]
    const conflicts = detectConflicts(existing, incoming)
    expect(conflicts.length).toBe(1)
    expect(conflicts[0].type).toBe('empty_content')
  })

  it('detects whitespace-only content as empty', () => {
    const existing: Chapter[] = []
    const incoming = [makeParsedChapter({ title: '空章节', content: '   ' })]
    const conflicts = detectConflicts(existing, incoming)
    expect(conflicts.length).toBe(1)
    expect(conflicts[0].type).toBe('empty_content')
  })

  it('returns empty array when there are no conflicts', () => {
    const existing = [makeChapter({ title: '第一章', number: 1 })]
    const incoming = [makeParsedChapter({ title: '第二章', number: 2, content: 'content' })]
    const conflicts = detectConflicts(existing, incoming)
    expect(conflicts).toEqual([])
  })

  it('detects multiple conflict types for the same chapter', () => {
    const existing = [makeChapter({ title: '第一章', number: 1 })]
    const incoming = [makeParsedChapter({ title: '第一章', number: 1, content: '' })]
    const conflicts = detectConflicts(existing, incoming)
    // Should have: duplicate_title + duplicate_number + empty_content
    expect(conflicts.length).toBe(3)
    const types = conflicts.map(c => c.type)
    expect(types).toContain('duplicate_title')
    expect(types).toContain('duplicate_number')
    expect(types).toContain('empty_content')
  })

  it('handles empty incoming chapters', () => {
    const existing = [makeChapter()]
    const conflicts = detectConflicts(existing, [])
    expect(conflicts).toEqual([])
  })

  it('handles empty existing chapters', () => {
    const incoming = [makeParsedChapter({ title: '新章节', content: 'content' })]
    const conflicts = detectConflicts([], incoming)
    expect(conflicts).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// resolveConflicts
// ---------------------------------------------------------------------------

describe('resolveConflicts', () => {
  it('returns all chapters when no conflicts', () => {
    const chapters = [makeParsedChapter({ number: 1 }), makeParsedChapter({ number: 2 })]
    const result = resolveConflicts(chapters, [], 'skip')
    expect(result).toHaveLength(2)
  })

  it('skip strategy: removes conflicting chapters', () => {
    const chapters = [
      makeParsedChapter({ number: 1, title: '第一章' }),
      makeParsedChapter({ number: 2, title: '第二章' }),
    ]
    const conflicts: ConflictInfo[] = [
      {
        type: 'duplicate_title',
        newChapter: chapters[0],
        message: 'dup',
      },
    ]
    const result = resolveConflicts(chapters, conflicts, 'skip')
    expect(result).toHaveLength(1)
    expect(result[0].number).toBe(2)
  })

  it('always removes empty-content chapters regardless of strategy', () => {
    const chapters = [
      makeParsedChapter({ number: 1, title: '空', content: '' }),
      makeParsedChapter({ number: 2, title: '非空', content: 'content' }),
    ]
    const conflicts: ConflictInfo[] = [
      {
        type: 'empty_content',
        newChapter: chapters[0],
        message: 'empty',
      },
    ]
    // Even with 'replace' strategy, empty content should be filtered
    const result = resolveConflicts(chapters, conflicts, 'replace')
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('非空')
  })

  it('replace strategy: keeps all chapters (caller handles replacement)', () => {
    const chapters = [
      makeParsedChapter({ number: 1, title: '冲突章' }),
    ]
    const conflicts: ConflictInfo[] = [
      {
        type: 'duplicate_number',
        newChapter: chapters[0],
        message: 'dup',
      },
    ]
    const result = resolveConflicts(chapters, conflicts, 'replace')
    expect(result).toHaveLength(1)
  })

  it('merge strategy: keeps all chapters (caller handles merging)', () => {
    const chapters = [
      makeParsedChapter({ number: 1 }),
    ]
    const conflicts: ConflictInfo[] = [
      {
        type: 'duplicate_title',
        newChapter: chapters[0],
        message: 'dup',
      },
    ]
    const result = resolveConflicts(chapters, conflicts, 'merge')
    expect(result).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// getSupportedImportFormats
// ---------------------------------------------------------------------------

describe('getSupportedImportFormats', () => {
  it('returns 3 import formats', () => {
    const formats = getSupportedImportFormats()
    expect(formats).toHaveLength(3)
  })

  it('includes txt, md, and docx', () => {
    const formats = getSupportedImportFormats()
    const ids = formats.map(f => f.id)
    expect(ids).toEqual(expect.arrayContaining(['txt', 'md', 'docx']))
  })

  it('each format has id, name, extensions, description', () => {
    const formats = getSupportedImportFormats()
    for (const fmt of formats) {
      expect(fmt.id).toBeTruthy()
      expect(fmt.name).toBeTruthy()
      expect(Array.isArray(fmt.extensions)).toBe(true)
      expect(fmt.extensions.length).toBeGreaterThan(0)
      expect(fmt.description).toBeTruthy()
    }
  })

  it('txt format lists .txt and .text extensions', () => {
    const formats = getSupportedImportFormats()
    const txt = formats.find(f => f.id === 'txt')!
    expect(txt.extensions).toContain('.txt')
    expect(txt.extensions).toContain('.text')
  })

  it('md format lists .md and .markdown extensions', () => {
    const formats = getSupportedImportFormats()
    const md = formats.find(f => f.id === 'md')!
    expect(md.extensions).toContain('.md')
    expect(md.extensions).toContain('.markdown')
  })

  it('docx format lists .docx extension', () => {
    const formats = getSupportedImportFormats()
    const docx = formats.find(f => f.id === 'docx')!
    expect(docx.extensions).toContain('.docx')
  })
})
