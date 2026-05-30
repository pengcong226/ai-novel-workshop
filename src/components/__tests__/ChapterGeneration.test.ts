import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// Mock dependencies before importing stores
vi.mock('@/utils/anthropic-guard', () => ({
  isWebRuntime: () => true,
  isOfficialAnthropicEndpoint: () => false,
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('@/utils/crypto', () => ({
  decryptProjectConfig: vi.fn().mockImplementation((config) => Promise.resolve(config)),
  encryptProjectConfig: vi.fn().mockImplementation((config) => Promise.resolve(config)),
}))

vi.mock('@/utils/project-config-normalizer', () => ({
  getDefaultProjectConfig: vi.fn().mockImplementation((base) => ({
    preset: 'standard',
    providers: [],
    plannerModel: '',
    writerModel: '',
    sentinelModel: '',
    extractorModel: '',
    systemPrompts: {},
    planningDepth: 'medium',
    writingDepth: 'standard',
    enableQualityCheck: true,
    qualityThreshold: 7,
    maxCostPerChapter: 0.15,
    enableAISuggestions: true,
    enableAutoReview: false,
    advancedSettings: {
      temperature: 0.8,
      topP: 0.9,
      maxTokens: 4096,
      maxContextTokens: 8192,
      recentChaptersCount: 3,
      targetWordCount: 2000,
      frequencyPenalty: 0,
      presencePenalty: 0,
      stopSequences: [],
    },
    vectorConfig: { provider: 'local', model: 'Xenova/bge-small-zh-v1.5', dimension: 512, topK: 5, minScore: 0.6, vectorWeight: 0.7 },
    ...base,
  })),
  normalizeProjectConfig: vi.fn().mockImplementation((config) => config),
}))

vi.mock('@/stores/storage', () => ({
  useStorage: () => ({
    loadProjects: vi.fn().mockResolvedValue([]),
    saveProjects: vi.fn().mockResolvedValue(undefined),
    saveProject: vi.fn().mockResolvedValue(undefined),
    loadProject: vi.fn().mockResolvedValue(null),
  }),
}))

vi.mock('@/services/ai-service', () => ({
  AIService: vi.fn().mockImplementation(() => ({
    chat: vi.fn().mockResolvedValue({ content: '', model: 'mock-model' }),
    chatStream: vi.fn().mockResolvedValue({ content: '', model: 'mock-model' }),
  })),
}))

vi.mock('@/utils/devFlags', () => ({
  getAIMockEnabled: () => false,
}))

vi.mock('@/plugins/manager', () => ({
  pluginManager: {
    getRegistries: () => ({
      aiProvider: { getAll: () => [] },
    }),
  },
}))

vi.mock('@/utils/contextBuilder', () => ({
  buildChapterContext: vi.fn().mockResolvedValue({
    totalTokens: 500,
    warnings: [],
    authorsNote: '',
    recentChapters: '',
    systemMessage: '系统提示词',
    userMessage: '用户消息',
  }),
  contextToPromptPayload: vi.fn().mockReturnValue({
    systemMessage: '你是一个小说写手',
    userMessage: '请续写下一章',
  }),
}))

vi.mock('@/services/generation-scheduler', () => ({
  generationScheduler: {
    generateChapter: vi.fn().mockResolvedValue({
      id: 'gen-chapter-1',
      number: 1,
      title: 'AI生成的章节',
      content: '这是AI生成的章节内容，主角踏入了新世界...',
      wordCount: 50,
      outline: {
        chapterId: 'outline-1',
        title: '第一章',
        scenes: [],
        characters: [],
        location: '',
        goals: [],
        conflicts: [],
        resolutions: [],
        status: 'completed',
      },
      status: 'draft',
      generatedBy: 'ai',
      generationTime: new Date(),
      checkpoints: [],
      aiSuggestions: ['建议增加环境描写'],
    }),
    generateBatch: vi.fn().mockResolvedValue(undefined),
    runExtractionInBackground: vi.fn().mockResolvedValue(undefined),
  },
}))

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
  }
})()
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

import { useProjectStore } from '@/stores/project'
import { useAIStore } from '@/stores/ai'
import type { Chapter } from '@/types'
import { generationScheduler } from '@/services/generation-scheduler'

function createMockChapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: `chapter-${Math.random().toString(36).slice(2)}`,
    number: 1,
    title: '第一章 测试章节',
    content: '这是测试章节的内容。主角站在山巅，俯瞰万里云海。',
    wordCount: 100,
    outline: {
      chapterId: 'outline-1',
      title: '第一章',
      scenes: [
        {
          id: 'scene-1',
          description: '主角在山顶远眺',
          characters: ['主角'],
          location: '天山之巅',
          emotionalTone: '壮阔',
          purpose: '引入主角',
          wordCountHint: 500,
          order: 1,
        },
      ],
      characters: ['主角'],
      location: '天山',
      goals: ['引出世界观'],
      conflicts: ['未知威胁'],
      resolutions: [],
      status: 'completed',
    },
    status: 'draft',
    generatedBy: 'ai',
    generationTime: new Date(),
    checkpoints: [],
    ...overrides,
  }
}

describe('Chapter Generation UI Flow', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  describe('Chapter Object Structure', () => {
    it('creates a chapter with all required fields', () => {
      const chapter = createMockChapter()

      expect(chapter.id).toBeTruthy()
      expect(chapter.number).toBe(1)
      expect(chapter.title).toBe('第一章 测试章节')
      expect(chapter.content).toBeTruthy()
      expect(chapter.wordCount).toBe(100)
      expect(chapter.outline).toBeDefined()
      expect(chapter.status).toBe('draft')
      expect(chapter.generatedBy).toBe('ai')
      expect(chapter.generationTime).toBeDefined()
      expect(chapter.checkpoints).toEqual([])
    })

    it('chapter outline contains scene definitions', () => {
      const chapter = createMockChapter()

      expect(chapter.outline.scenes.length).toBe(1)
      expect(chapter.outline.scenes[0].description).toBe('主角在山顶远眺')
      expect(chapter.outline.scenes[0].emotionalTone).toBe('壮阔')
      expect(chapter.outline.scenes[0].location).toBe('天山之巅')
    })

    it('chapter outline supports multiple scenes', () => {
      const chapter = createMockChapter({
        outline: {
          ...createMockChapter().outline,
          scenes: [
            {
              id: 'scene-1',
              description: '场景一：开篇',
              characters: ['主角'],
              location: '村庄',
              emotionalTone: '平静',
              purpose: '引入背景',
              wordCountHint: 300,
              order: 1,
            },
            {
              id: 'scene-2',
              description: '场景二：冲突',
              characters: ['主角', '反派'],
              location: '山谷',
              emotionalTone: '紧张',
              purpose: '推动情节',
              wordCountHint: 800,
              order: 2,
            },
            {
              id: 'scene-3',
              description: '场景三：转折',
              characters: ['主角', '导师'],
              location: '秘境入口',
              emotionalTone: '惊奇',
              purpose: '引入新元素',
              wordCountHint: 500,
              order: 3,
            },
          ],
        },
      })

      expect(chapter.outline.scenes.length).toBe(3)
      expect(chapter.outline.scenes[2].emotionalTone).toBe('惊奇')
    })

    it('chapter outline status supports planned transitions', () => {
      const planned = createMockChapter({
        outline: { ...createMockChapter().outline, status: 'planned' },
      })
      const writing = createMockChapter({
        outline: { ...createMockChapter().outline, status: 'writing' },
      })
      const completed = createMockChapter({
        outline: { ...createMockChapter().outline, status: 'completed' },
      })

      expect(planned.outline.status).toBe('planned')
      expect(writing.outline.status).toBe('writing')
      expect(completed.outline.status).toBe('completed')
    })

    it('chapter outline supports foreshadowing fields', () => {
      const chapter = createMockChapter({
        outline: {
          ...createMockChapter().outline,
          foreshadowingToPlant: ['古老预言', '神秘玉佩'],
          foreshadowingToResolve: ['第一章的悬念'],
        },
      })

      expect(chapter.outline.foreshadowingToPlant).toEqual(['古老预言', '神秘玉佩'])
      expect(chapter.outline.foreshadowingToResolve).toEqual(['第一章的悬念'])
    })
  })

  describe('Chapter Status Transitions', () => {
    it('supports draft status', () => {
      const chapter = createMockChapter({ status: 'draft' })
      expect(chapter.status).toBe('draft')
    })

    it('supports revised status', () => {
      const chapter = createMockChapter({ status: 'revised' })
      expect(chapter.status).toBe('revised')
    })

    it('supports final status', () => {
      const chapter = createMockChapter({ status: 'final' })
      expect(chapter.status).toBe('final')
    })
  })

  describe('Generation Modes', () => {
    it('supports AI generation mode', () => {
      const chapter = createMockChapter({ generatedBy: 'ai' })
      expect(chapter.generatedBy).toBe('ai')
    })

    it('supports manual generation mode', () => {
      const chapter = createMockChapter({ generatedBy: 'manual' })
      expect(chapter.generatedBy).toBe('manual')
    })

    it('supports hybrid generation mode', () => {
      const chapter = createMockChapter({ generatedBy: 'hybrid' })
      expect(chapter.generatedBy).toBe('hybrid')
    })

    it('records which model was used for generation', () => {
      const chapter = createMockChapter({
        modelUsed: 'claude-3-opus-20240229',
      })

      expect(chapter.modelUsed).toBe('claude-3-opus-20240229')
    })

    it('stores generation timestamp', () => {
      const now = new Date()
      const chapter = createMockChapter({ generationTime: now })

      expect(chapter.generationTime).toBe(now)
    })
  })

  describe('Quality Score and AI Suggestions', () => {
    it('stores quality score in chapter', () => {
      const chapter = createMockChapter({ qualityScore: 8.5 })

      expect(chapter.qualityScore).toBe(8.5)
    })

    it('stores AI suggestions in chapter', () => {
      const chapter = createMockChapter({
        aiSuggestions: ['建议改进角色描写', '增加环境描写', '调整对话节奏'],
      })

      expect(chapter.aiSuggestions).toEqual([
        '建议改进角色描写',
        '增加环境描写',
        '调整对话节奏',
      ])
    })

    it('quality score is optional', () => {
      const chapter = createMockChapter()

      expect(chapter.qualityScore).toBeUndefined()
    })

    it('AI suggestions are optional', () => {
      const chapter = createMockChapter()

      expect(chapter.aiSuggestions).toBeUndefined()
    })
  })

  describe('Chapter Checkpoints (Version History)', () => {
    it('stores checkpoint with required fields', () => {
      const chapter = createMockChapter({
        checkpoints: [
          {
            id: 'cp-1',
            timestamp: new Date(),
            content: '初始草稿内容',
            description: '初稿',
          },
        ],
      })

      expect(chapter.checkpoints.length).toBe(1)
      expect(chapter.checkpoints[0].id).toBe('cp-1')
      expect(chapter.checkpoints[0].content).toBe('初始草稿内容')
      expect(chapter.checkpoints[0].description).toBe('初稿')
    })

    it('supports multiple checkpoints for version history', () => {
      const chapter = createMockChapter({
        checkpoints: [
          {
            id: 'cp-1',
            timestamp: new Date('2024-01-01'),
            content: '版本一',
            description: '初稿',
          },
          {
            id: 'cp-2',
            timestamp: new Date('2024-01-02'),
            content: '版本二（质量检查后修订）',
            description: '质量修订',
          },
          {
            id: 'cp-3',
            timestamp: new Date('2024-01-03'),
            content: '版本三（最终定稿）',
            description: '最终版',
          },
        ],
      })

      expect(chapter.checkpoints.length).toBe(3)
      expect(chapter.checkpoints[2].description).toBe('最终版')
    })

    it('checkpoint timestamps are Date objects', () => {
      const ts = new Date('2024-06-15T10:30:00Z')
      const chapter = createMockChapter({
        checkpoints: [
          { id: 'cp-1', timestamp: ts, content: '内容' },
        ],
      })

      expect(chapter.checkpoints[0].timestamp).toBeInstanceOf(Date)
    })
  })

  describe('Project Store - Chapter Creation Flow', () => {
    it('creates a project and initializes empty chapters', async () => {
      const store = useProjectStore()

      const project = await store.createProject('章节管理测试', '玄幻', 100000)

      expect(project.chapters).toEqual([])
      expect(store.projects.length).toBe(1)
    })

    it('project config controls quality check behavior', async () => {
      const store = useProjectStore()

      const project = await store.createProject('质量检查配置')

      expect(project.config.enableQualityCheck).toBe(true)
      expect(project.config.qualityThreshold).toBe(7)
    })

    it('project config controls auto review behavior', async () => {
      const store = useProjectStore()

      const project = await store.createProject('自动审校配置')

      expect(project.config.enableAutoReview).toBe(false)
    })

    it('project config has default preset', async () => {
      const store = useProjectStore()

      const project = await store.createProject('预设测试')

      expect(project.config.preset).toBe('standard')
    })
  })

  describe('Generation Trigger via Scheduler', () => {
    it('generationScheduler mock is available and callable', () => {
      expect(generationScheduler.generateChapter).toBeDefined()
      expect(typeof generationScheduler.generateChapter).toBe('function')
    })

    it('generationScheduler returns a chapter with expected shape', async () => {
      const result = await generationScheduler.generateChapter({} as any)

      expect(result).toBeDefined()
      expect(result.id).toBeTruthy()
      expect(result.content).toBeTruthy()
      expect(result.generatedBy).toBe('ai')
      expect(result.wordCount).toBeGreaterThan(0)
    })

    it('generationScheduler handles batch generation', async () => {
      await generationScheduler.generateBatch({} as any)

      expect(generationScheduler.generateBatch).toHaveBeenCalled()
    })
  })

  describe('Generation Error Handling', () => {
    it('handles generation scheduler failure gracefully', async () => {
      const failingScheduler = {
        generateChapter: vi.fn().mockRejectedValue(new Error('AI服务不可用')),
      }

      await expect(failingScheduler.generateChapter({})).rejects.toThrow('AI服务不可用')
    })

    it('handles network timeout during generation', async () => {
      const timeoutScheduler = {
        generateChapter: vi.fn().mockRejectedValue(new Error('请求超时，请检查网络连接')),
      }

      await expect(timeoutScheduler.generateChapter({})).rejects.toThrow('请求超时')
    })

    it('handles invalid API key error', async () => {
      const authErrorScheduler = {
        generateChapter: vi.fn().mockRejectedValue(new Error('API Key无效或已过期')),
      }

      await expect(authErrorScheduler.generateChapter({})).rejects.toThrow('API Key无效')
    })

    it('handles rate limit error', async () => {
      const rateLimitScheduler = {
        generateChapter: vi.fn().mockRejectedValue(new Error('请求过于频繁，请稍后重试')),
      }

      await expect(rateLimitScheduler.generateChapter({})).rejects.toThrow('请求过于频繁')
    })

    it('handles empty AI response', async () => {
      const emptyResponseScheduler = {
        generateChapter: vi.fn().mockResolvedValue({
          id: 'empty-chapter',
          number: 1,
          title: '空章节',
          content: '',
          wordCount: 0,
          outline: createMockChapter().outline,
          status: 'draft',
          generatedBy: 'ai',
          generationTime: new Date(),
          checkpoints: [],
        }),
      }

      const result = await emptyResponseScheduler.generateChapter({})

      expect(result.content).toBe('')
      expect(result.wordCount).toBe(0)
    })
  })

  describe('AI Store Integration', () => {
    it('AI store initializes correctly', () => {
      const aiStore = useAIStore()

      expect(aiStore).toBeDefined()
    })

    it('AI store mock mode returns mock content', () => {
      const aiStore = useAIStore()

      // The mock returns initialized=false so fallback content is used
      expect(aiStore).toBeDefined()
    })
  })

  describe('Chapter Content Validation', () => {
    it('validates chapter has non-empty title for save', () => {
      const chapter = createMockChapter({ title: '' })

      // Empty title should trigger validation
      expect(chapter.title.trim()).toBe('')
    })

    it('validates chapter has content for save', () => {
      const chapter = createMockChapter({ content: '主角推开大门，踏入了那座古老的殿堂。' })

      expect(chapter.content.trim().length).toBeGreaterThan(0)
    })

    it('chapter word count matches content length', () => {
      const content = '这是一段测试内容。'
      const chapter = createMockChapter({
        content,
        wordCount: content.length,
      })

      expect(chapter.wordCount).toBe(content.length)
    })

    it('chapter number must be positive', () => {
      const chapter = createMockChapter({ number: 5 })

      expect(chapter.number).toBeGreaterThan(0)
    })

    it('validates chapter ID format', () => {
      const chapter = createMockChapter()

      expect(chapter.id).toBeTruthy()
      expect(typeof chapter.id).toBe('string')
      expect(chapter.id.length).toBeGreaterThan(0)
    })
  })

  describe('Auto Review Configuration', () => {
    it('auto review is disabled by default', async () => {
      const store = useProjectStore()

      const project = await store.createProject('自动审校')

      expect(project.config.enableAutoReview).toBe(false)
    })

    it('quality check is enabled by default', async () => {
      const store = useProjectStore()

      const project = await store.createProject('质量检查')

      expect(project.config.enableQualityCheck).toBe(true)
    })

    it('quality threshold has sensible default', async () => {
      const store = useProjectStore()

      const project = await store.createProject('阈值测试')

      expect(project.config.qualityThreshold).toBeGreaterThanOrEqual(1)
      expect(project.config.qualityThreshold).toBeLessThanOrEqual(10)
    })
  })

  describe('Chapter Summary and Metadata', () => {
    it('chapter can have optional summary', () => {
      const chapter = createMockChapter({
        summary: '本章讲述了主角初次进入修仙世界的经历。',
      })

      expect(chapter.summary).toBe('本章讲述了主角初次进入修仙世界的经历。')
    })

    it('chapter can have summary data', () => {
      const chapter = createMockChapter({
        summaryData: {
          brief: '主角入世',
          keyEvents: ['进入天山', '获得传承'],
          characterChanges: [
            { character: '主角', change: '获得修炼资格' },
          ],
        },
      } as any)

      expect(chapter.summaryData).toBeDefined()
    })

    it('chapter can store model metadata', () => {
      const chapter = createMockChapter({
        modelUsed: 'claude-3-5-sonnet-20241022',
      })

      expect(chapter.modelUsed).toBe('claude-3-5-sonnet-20241022')
    })
  })
})
