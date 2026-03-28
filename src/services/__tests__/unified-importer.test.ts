import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockParseConversationTraceFile,
  mockExtractTraceArtifacts,
  mockBuildTraceReviewQueue,
  mockApplyTraceReviewItems,
  mockRegexAddScript,
  mockRegexExecute,
  mockCharacterCardStore,
} = vi.hoisted(() => {
  const enabledScript = {
    id: 'regex-enabled',
    scriptName: 'enabled script',
    disabled: false,
    runOnEdit: false,
    findRegex: '/foo/g',
    trimStrings: [],
    replaceString: 'bar',
    placement: [2],
    substituteRegex: 0,
    minDepth: null,
    maxDepth: null,
    markdownOnly: false,
    promptOnly: false,
  }

  const disabledScript = {
    id: 'regex-disabled',
    scriptName: 'disabled script',
    disabled: true,
    runOnEdit: false,
    findRegex: '/x/g',
    trimStrings: [],
    replaceString: 'y',
    placement: [2],
    substituteRegex: 0,
    minDepth: null,
    maxDepth: null,
    markdownOnly: false,
    promptOnly: false,
  }

  return {
    mockParseConversationTraceFile: vi.fn(),
    mockExtractTraceArtifacts: vi.fn(),
    mockBuildTraceReviewQueue: vi.fn(),
    mockApplyTraceReviewItems: vi.fn(),
    mockRegexAddScript: vi.fn(),
    mockRegexExecute: vi.fn((text: string) => ({ replacedText: text })),
    mockCharacterCardStore: {
      character: {},
      prompts: [],
      regexScripts: [enabledScript, disabledScript],
      updateAISettings: vi.fn(),
    },
  }
})


vi.mock('../conversation-trace-parser', () => ({
  parseConversationTraceFile: mockParseConversationTraceFile,
}))

vi.mock('../conversation-trace-extractor', () => ({
  extractTraceArtifacts: mockExtractTraceArtifacts,
}))

vi.mock('../conversation-trace-conflict', () => ({
  buildTraceReviewQueue: mockBuildTraceReviewQueue,
}))

vi.mock('../conversation-trace-apply', () => ({
  applyTraceReviewItems: mockApplyTraceReviewItems,
}))

vi.mock('../character-card-importer', () => ({
  createCharacterCardImporter: () => ({
    importFromPNG: vi.fn(),
    importCharacterCard: vi.fn(),
  }),
}))

vi.mock('../worldbook-importer', () => ({
  createWorldbookImporter: () => ({
    importWorldbook: vi.fn(),
  }),
}))

vi.mock('../regex-script', () => ({
  createRegexScriptManager: () => ({
    addScript: mockRegexAddScript,
    execute: mockRegexExecute,
  }),
}))

vi.mock('@/stores/worldbook', () => ({
  useWorldbookStore: () => ({
    worldbook: { entries: [] },
    entries: [],
    loadWorldbook: vi.fn(async () => {}),
    importEntries: vi.fn(async () => {}),
  }),
}))

vi.mock('@/stores/knowledge', () => ({
  useKnowledgeStore: () => ({
    entries: [],
    loadKnowledge: vi.fn(async () => {}),
  }),
}))

vi.mock('@/stores/project', () => ({
  useProjectStore: () => ({
    currentProject: {
      id: 'project-1',
      world: {},
      characters: [{ id: 'c1' }],
    },
  }),
}))

vi.mock('@/stores/character-card', () => ({
  useCharacterCardStore: () => mockCharacterCardStore,
}))

import { UnifiedImporter } from '../unified-importer'

describe('unified-importer conversation trace mode', () => {
  beforeEach(() => {
    mockParseConversationTraceFile.mockReset()
    mockExtractTraceArtifacts.mockReset()
    mockBuildTraceReviewQueue.mockReset()
    mockApplyTraceReviewItems.mockReset()
    mockRegexAddScript.mockReset()
    mockRegexExecute.mockReset()
    mockRegexExecute.mockImplementation((text: string) => ({ replacedText: text }))
  })

  it('analyzes JSONL and returns review items without apply by default', async () => {
    mockParseConversationTraceFile.mockResolvedValue({
      messages: [
        { role: 'user', content: 'u1', sourceLine: 1, sourceRecord: {} },
        { role: 'assistant', content: 'a1', sourceLine: 2, sourceRecord: {} },
      ],
      errors: [],
      stats: {
        totalLines: 2,
        parsedRecords: 2,
        includedMessages: 2,
        filteredMessages: 0,
        parseErrors: 0,
      },
    })

    mockExtractTraceArtifacts.mockResolvedValue({
      artifacts: [
        {
          id: 'art-1',
          type: 'knowledge',
          title: '知识',
          confidence: 0.9,
          source: [{ line: 2, role: 'assistant', snippet: 's' }],
          payload: { content: 'fact' },
        },
      ],
      stats: {
        totalMessages: 2,
        processedMessages: 2,
        artifacts: 1,
        skippedMessages: 0,
      },
      warnings: [],
    })

    mockBuildTraceReviewQueue.mockReturnValue({
      items: [
        {
          id: 'rev-1',
          action: 'apply',
          note: '',
          conflicts: [],
          artifact: {
            id: 'art-1',
            type: 'knowledge',
            title: '知识',
            confidence: 0.9,
            source: [{ line: 2, role: 'assistant', snippet: 's' }],
            payload: { content: 'fact' },
          },
        },
      ],
      conflicts: [],
    })

    const importer = new UnifiedImporter()
    const file = new File(['{}'], 'trace.jsonl', { type: 'application/x-ndjson' })

    const result = await importer.importFromFile(file)

    expect(result.success).toBe(true)
    expect(result.conversationTrace?.analyzed).toBe(true)
    expect(result.conversationTrace?.parsedMessages).toBe(2)
    expect(result.conversationTrace?.extractedArtifacts).toBe(1)
    expect(result.reviewItems).toHaveLength(1)
    expect(mockApplyTraceReviewItems).not.toHaveBeenCalled()
  })

  it('applies reviewed items when applyReviewed is true', async () => {
    mockParseConversationTraceFile.mockResolvedValue({
      messages: [{ role: 'assistant', content: 'a1', sourceLine: 1, sourceRecord: {} }],
      errors: [],
      stats: {
        totalLines: 1,
        parsedRecords: 1,
        includedMessages: 1,
        filteredMessages: 0,
        parseErrors: 0,
      },
    })

    mockExtractTraceArtifacts.mockResolvedValue({
      artifacts: [
        {
          id: 'art-1',
          type: 'worldbook',
          title: '世界书候选',
          confidence: 0.88,
          source: [{ line: 1, role: 'assistant', snippet: 's' }],
          payload: { key: ['青岚宗'], content: '设定' },
        },
      ],
      stats: {
        totalMessages: 1,
        processedMessages: 1,
        artifacts: 1,
        skippedMessages: 0,
      },
      warnings: [],
    })

    const reviewItems = [
      {
        id: 'rev-1',
        action: 'apply',
        note: '',
        conflicts: [],
        artifact: {
          id: 'art-1',
          type: 'worldbook',
          title: '世界书候选',
          confidence: 0.88,
          source: [{ line: 1, role: 'assistant', snippet: 's' }],
          payload: { key: ['青岚宗'], content: '设定' },
        },
      },
    ]

    mockBuildTraceReviewQueue.mockReturnValue({
      items: reviewItems,
      conflicts: [],
    })

    mockApplyTraceReviewItems.mockResolvedValue({
      stats: {
        reviewed: 1,
        applied: 1,
        skipped: 0,
        merged: 0,
        conflicts: 0,
      },
      session: { id: 'sess-1' },
    })

    const importer = new UnifiedImporter()
    const file = new File(['{}'], 'trace.jsonl', { type: 'application/x-ndjson' })

    const result = await importer.importFromFile(file, {
      conversationTraceOptions: {
        applyReviewed: true,
        reviewItems,
      },
    })

    expect(result.success).toBe(true)
    expect(mockApplyTraceReviewItems).toHaveBeenCalledTimes(1)
    expect(result.conversationTrace?.applied?.applied).toBe(1)
    expect(result.conversationTrace?.sessionId).toBe('sess-1')
  })

  it('loads active regex scripts for trace preprocessing when enabled', async () => {
    mockParseConversationTraceFile.mockResolvedValue({
      messages: [{ role: 'assistant', content: 'foo', sourceLine: 1, sourceRecord: {} }],
      errors: [],
      stats: {
        totalLines: 1,
        parsedRecords: 1,
        includedMessages: 1,
        filteredMessages: 0,
        parseErrors: 0,
      },
    })

    mockExtractTraceArtifacts.mockResolvedValue({
      artifacts: [],
      stats: {
        totalMessages: 1,
        processedMessages: 1,
        artifacts: 0,
        skippedMessages: 0,
      },
      warnings: [],
    })

    mockBuildTraceReviewQueue.mockReturnValue({
      items: [],
      conflicts: [],
    })

    const importer = new UnifiedImporter()
    const file = new File(['{}'], 'trace.jsonl', { type: 'application/x-ndjson' })

    const result = await importer.importFromFile(file, {
      conversationTraceOptions: {
        useRegexPreprocess: true,
      },
    })

    expect(result.success).toBe(true)
    expect(mockRegexAddScript).toHaveBeenCalledTimes(1)
    expect(mockRegexAddScript).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'regex-enabled', disabled: false })
    )
  })

  it('does not create regex preprocessing manager when disabled', async () => {
    mockParseConversationTraceFile.mockResolvedValue({
      messages: [{ role: 'assistant', content: 'foo', sourceLine: 1, sourceRecord: {} }],
      errors: [],
      stats: {
        totalLines: 1,
        parsedRecords: 1,
        includedMessages: 1,
        filteredMessages: 0,
        parseErrors: 0,
      },
    })

    mockExtractTraceArtifacts.mockResolvedValue({
      artifacts: [],
      stats: {
        totalMessages: 1,
        processedMessages: 1,
        artifacts: 0,
        skippedMessages: 0,
      },
      warnings: [],
    })

    mockBuildTraceReviewQueue.mockReturnValue({
      items: [],
      conflicts: [],
    })

    const importer = new UnifiedImporter()
    const file = new File(['{}'], 'trace.jsonl', { type: 'application/x-ndjson' })

    const result = await importer.importFromFile(file, {
      conversationTraceOptions: {
        useRegexPreprocess: false,
      },
    })

    expect(result.success).toBe(true)
    expect(mockRegexAddScript).not.toHaveBeenCalled()
    expect(mockExtractTraceArtifacts).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ regexManager: undefined })
    )
  })
})
