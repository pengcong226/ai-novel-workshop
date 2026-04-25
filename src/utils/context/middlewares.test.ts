import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContextPayload } from './pipeline'

const {
  buildAuthorsNoteMock,
  buildVectorContextMock,
  useSandboxStoreMock,
} = vi.hoisted(() => ({
  buildAuthorsNoteMock: vi.fn(),
  buildVectorContextMock: vi.fn(),
  useSandboxStoreMock: vi.fn(),
}))

vi.mock('../contextBuilder', () => ({
  inferCurrentScene: vi.fn(() => ''),
  buildAuthorsNote: buildAuthorsNoteMock,
  buildWorldInfo: vi.fn(() => ''),
  buildCharacterInfo: vi.fn(() => ''),
  buildStateConstraints: vi.fn(() => ''),
  buildSummary: vi.fn(() => ({ summary: '' })),
  buildRecentChapters: vi.fn(() => ''),
  buildOutline: vi.fn(() => ''),
  buildVectorContext: buildVectorContextMock,
}))

vi.mock('@/stores/sandbox', () => ({
  useSandboxStore: useSandboxStoreMock,
}))

import { AuthorsNoteMiddleware, StyleMiddleware, VectorContextMiddleware } from './middlewares'

function createPayload(overrides: Partial<ContextPayload> = {}): ContextPayload {
  return {
    project: {
      id: 'project-1',
      genre: '玄幻',
      chapters: [
        { id: 'ch-1', number: 1, title: '第一章', content: '旧内容' },
      ],
      config: {
        styleProfile: {
          id: 'style-1',
          name: '古典武侠',
          description: '江湖气浓',
          tone: '严肃',
          narrativePerspective: '第三人称',
          pacing: '舒缓',
          vocabulary: '典雅',
          sentenceStyle: '长短结合',
          dialogueStyle: '简洁',
          descriptionLevel: '适中',
          avoidList: ['网络流行语'],
          examplePhrases: ['风过长街'],
          customInstructions: '保留留白',
        },
        advancedSettings: {
          recentChaptersCount: 3,
          targetWordCount: 2000,
          maxContextTokens: 8192,
        },
      },
    } as ContextPayload['project'],
    currentChapter: {
      id: 'ch-2',
      number: 2,
      title: '第二章',
      outline: {
        characters: ['林青'],
      },
    } as ContextPayload['currentChapter'],
    vectorService: undefined,
    vectorConfig: undefined,
    recentChapters: [],
    budget: {
      total: 10000,
      remaining: 10000,
      distribution: {
        STYLE_PROFILE: 1200,
        AUTHORS_NOTE: 1200,
        VECTOR_CONTEXT: 1300,
      },
    },
    rewriteDirectionPrompt: undefined,
    systemParts: [],
    userHeadParts: [],
    userTailParts: [],
    warnings: [],
    totalTokensUsed: 0,
    builtSections: {
      systemPrompt: '',
      styleProfile: '',
      authorsNote: '',
      worldInfo: '',
      characters: '',
      stateConstraints: '',
      vectorContext: '',
      summary: '',
      recentChapters: '',
      outline: '',
    },
    ...overrides,
  }
}

describe('context middlewares', () => {
  beforeEach(() => {
    buildAuthorsNoteMock.mockReset()
    buildVectorContextMock.mockReset()
    useSandboxStoreMock.mockReset()
  })

  it('injects style profile into system parts and built sections', async () => {
    const payload = createPayload()

    const middleware = new StyleMiddleware()
    await middleware.process(payload)

    expect(payload.builtSections.styleProfile).toContain('【项目写作风格')
    expect(payload.builtSections.styleProfile).toContain('古典武侠')
    expect(payload.builtSections.styleProfile).toContain('网络流行语')
    expect(payload.systemParts.some(part => part.includes('古典武侠'))).toBe(true)
    expect(payload.totalTokensUsed).toBeGreaterThan(0)
  })

  it('appends rewriteDirectionPrompt into authors note output', async () => {
    buildAuthorsNoteMock.mockReturnValue('基础作者注释')

    const payload = createPayload({
      rewriteDirectionPrompt: '保持第一人称叙述，压缩心理独白',
    })

    const middleware = new AuthorsNoteMiddleware()
    await middleware.process(payload)

    expect(payload.builtSections.authorsNote).toContain('基础作者注释')
    expect(payload.builtSections.authorsNote).toContain('【改写方向指引】')
    expect(payload.builtSections.authorsNote).toContain('保持第一人称叙述，压缩心理独白')
    expect(payload.systemParts[0]).toContain('【改写方向指引】')
  })

  it('passes topK/minScore/vectorWeight from payload.vectorConfig into buildVectorContext', async () => {
    buildVectorContextMock.mockResolvedValue('向量上下文片段')
    useSandboxStoreMock.mockReturnValue({
      entities: [
        { id: 'entity-1', type: 'CHARACTER', name: '林青' },
      ],
      stateEvents: [
        { entityId: 'entity-1', chapterNumber: 2 },
      ],
    })

    const payload = createPayload({
      currentChapter: {
        id: 'ch-5',
        number: 5,
        title: '第五章',
        outline: { characters: ['林青'] },
      } as ContextPayload['currentChapter'],
      vectorService: {} as ContextPayload['vectorService'],
      vectorConfig: {
        provider: 'local',
        model: '/dist/models/Xenova/bge-m3',
        dimension: 1024,
        topK: 9,
        minScore: 0.55,
        vectorWeight: 0.2,
      },
      budget: {
        total: 10000,
        remaining: 10000,
        distribution: {
          VECTOR_CONTEXT: 1500,
        },
      },
    })

    const middleware = new VectorContextMiddleware()
    await middleware.process(payload)

    expect(buildVectorContextMock).toHaveBeenCalledTimes(1)
    const args = buildVectorContextMock.mock.calls[0]

    expect(args[3]).toBe(1500)
    expect(args[4]).toEqual(['林青'])
    expect(args[5]).toEqual({
      topK: 9,
      minScore: 0.55,
      vectorWeight: 0.2,
    })
    expect(payload.builtSections.vectorContext).toContain('向量上下文片段')
  })
})
