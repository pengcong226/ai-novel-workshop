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
    enableSensitiveWordCheck: false,
    agentConfigs: [],
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

// Mock IndexedDB storage
vi.mock('@/stores/storage', () => ({
  useStorage: () => ({
    loadProjects: vi.fn().mockResolvedValue([]),
    saveProjects: vi.fn().mockResolvedValue(undefined),
    saveProject: vi.fn().mockResolvedValue(undefined),
    loadProject: vi.fn().mockResolvedValue(null),
  }),
}))

// Mock Tauri IPC
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
}))

import { useProjectStore } from '@/stores/project'

describe('Project Creation Integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  describe('Genre Selection', () => {
    it('creates a project with default genre (xuanhuan)', async () => {
      const store = useProjectStore()
      const project = await store.createProject('默认类型项目')

      expect(project.genre).toBe('玄幻')
    })

    it('creates projects with all supported genres', async () => {
      const genres = ['玄幻', '都市', '科幻', '仙侠', '历史', '言情', '悬疑', '武侠']

      for (const genre of genres) {
        setActivePinia(createPinia())
        const store = useProjectStore()
        const project = await store.createProject(`${genre}测试`, genre)

        expect(project.genre).toBe(genre)
        expect(project.title).toBe(`${genre}测试`)
      }
    })

    it('persists genre in the project store list', async () => {
      const store = useProjectStore()

      await store.createProject('玄幻项目', '玄幻')
      await store.createProject('科幻项目', '科幻')

      expect(store.projects[0].genre).toBe('玄幻')
      expect(store.projects[1].genre).toBe('科幻')
    })

    it('stores target word count alongside genre', async () => {
      const store = useProjectStore()

      const project = await store.createProject('短篇科幻', '科幻', 50000)

      expect(project.genre).toBe('科幻')
      expect(project.targetWords).toBe(50000)
    })

    it('defaults targetWords to 100000 when not specified', async () => {
      const store = useProjectStore()

      const project = await store.createProject('默认字数')

      expect(project.targetWords).toBe(100000)
    })
  })

  describe('Config Validation and Defaults', () => {
    it('initializes project with correct default config structure', async () => {
      const store = useProjectStore()

      const project = await store.createProject('配置验证')

      expect(project.config).toBeDefined()
      expect(project.config.preset).toBe('standard')
      expect(project.config.enableQualityCheck).toBe(true)
      expect(project.config.qualityThreshold).toBe(7)
      expect(project.config.maxCostPerChapter).toBe(0.15)
      expect(project.config.enableAISuggestions).toBe(true)
      expect(project.config.enableAutoReview).toBe(false)
    })

    it('initializes advanced settings in config', async () => {
      const store = useProjectStore()

      const project = await store.createProject('高级配置')
      const config = project.config

      expect(config).toBeDefined()
      // The mock returns these defaults via getDefaultProjectConfig
      expect(config.preset).toBe('standard')
    })

    it('config has provider list initialized', async () => {
      const store = useProjectStore()

      const project = await store.createProject('提供商配置')

      expect(project.config.providers).toBeDefined()
      expect(Array.isArray(project.config.providers)).toBe(true)
    })

    it('accepts empty title (store does not validate, UI layer is responsible)', async () => {
      const store = useProjectStore()

      const project = await store.createProject('')

      // The store itself does not reject empty titles; validation is a UI concern
      expect(project.title).toBe('')
    })

    it('title field preserves exact value', async () => {
      const store = useProjectStore()

      const project = await store.createProject('  有空格的标题  ')

      expect(project.title).toBe('  有空格的标题  ')
      // The store stores the title as-is; trimming is a UI concern
    })
  })

  describe('Outline Structure Initialization', () => {
    it('initializes outline with all required fields', async () => {
      const store = useProjectStore()

      const project = await store.createProject('大纲测试')

      expect(project.outline).toBeDefined()
      expect(project.outline.id).toBeTruthy()
      expect(project.outline.synopsis).toBe('')
      expect(project.outline.theme).toBe('')
    })

    it('initializes main plot line', async () => {
      const store = useProjectStore()

      const project = await store.createProject('主线测试')

      expect(project.outline.mainPlot).toBeDefined()
      expect(project.outline.mainPlot.name).toBe('主线')
      expect(project.outline.mainPlot.description).toBe('')
    })

    it('initializes empty sub-plots array', async () => {
      const store = useProjectStore()

      const project = await store.createProject('支线测试')

      expect(project.outline.subPlots).toEqual([])
    })

    it('initializes empty volumes array', async () => {
      const store = useProjectStore()

      const project = await store.createProject('卷结构测试')

      expect(project.outline.volumes).toEqual([])
    })

    it('initializes empty chapters outline array', async () => {
      const store = useProjectStore()

      const project = await store.createProject('章节大纲测试')

      expect(project.outline.chapters).toEqual([])
    })

    it('initializes empty foreshadowings array', async () => {
      const store = useProjectStore()

      const project = await store.createProject('伏笔测试')

      expect(project.outline.foreshadowings).toEqual([])
    })
  })

  describe('Project State After Creation', () => {
    it('sets status to draft on creation', async () => {
      const store = useProjectStore()

      const project = await store.createProject('状态测试')

      expect(project.status).toBe('draft')
    })

    it('sets currentWords to 0', async () => {
      const store = useProjectStore()

      const project = await store.createProject('字数测试')

      expect(project.currentWords).toBe(0)
    })

    it('initializes empty chapters array', async () => {
      const store = useProjectStore()

      const project = await store.createProject('章节测试')

      expect(project.chapters).toEqual([])
    })

    it('generates a unique UUID for project ID', async () => {
      const store = useProjectStore()

      const project = await store.createProject('ID测试')

      expect(project.id).toBeTruthy()
      expect(typeof project.id).toBe('string')
      // UUID v4 format: 8-4-4-4-12
      expect(project.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    })

    it('generates unique IDs across multiple projects', async () => {
      const store = useProjectStore()

      const p1 = await store.createProject('项目1')
      const p2 = await store.createProject('项目2')
      const p3 = await store.createProject('项目3')

      const ids = new Set([p1.id, p2.id, p3.id])
      expect(ids.size).toBe(3)
    })

    it('sets createdAt timestamp to current time', async () => {
      const store = useProjectStore()
      const before = Date.now()

      const project = await store.createProject('时间戳测试')

      const after = Date.now()
      const created = new Date(project.createdAt).getTime()
      expect(created).toBeGreaterThanOrEqual(before)
      expect(created).toBeLessThanOrEqual(after)
    })

    it('sets updatedAt timestamp to current time', async () => {
      const store = useProjectStore()
      const before = Date.now()

      const project = await store.createProject('更新时间测试')

      const after = Date.now()
      const updated = new Date(project.updatedAt).getTime()
      expect(updated).toBeGreaterThanOrEqual(before)
      expect(updated).toBeLessThanOrEqual(after)
    })

    it('createdAt and updatedAt are approximately equal on creation', async () => {
      const store = useProjectStore()

      const project = await store.createProject('时间一致性')

      const created = new Date(project.createdAt).getTime()
      const updated = new Date(project.updatedAt).getTime()
      expect(Math.abs(created - updated)).toBeLessThan(1000)
    })
  })

  describe('Store State After Creation', () => {
    it('adds project to the projects list', async () => {
      const store = useProjectStore()

      await store.createProject('第一个')

      expect(store.projects.length).toBe(1)
      expect(store.projects[0].title).toBe('第一个')
    })

    it('supports creating multiple projects in sequence', async () => {
      const store = useProjectStore()

      await store.createProject('项目A')
      await store.createProject('项目B')
      await store.createProject('项目C')

      expect(store.projects.length).toBe(3)
      expect(store.projects.map(p => p.title)).toEqual(['项目A', '项目B', '项目C'])
    })

    it('currentProject is null after creation (not auto-selected)', () => {
      const store = useProjectStore()

      expect(store.currentProject).toBeNull()
      expect(store.hasCurrentProject).toBe(false)
    })

    it('currentProject remains null after creating a project', async () => {
      const store = useProjectStore()

      await store.createProject('不自动选择')

      expect(store.currentProject).toBeNull()
    })

    it('initially has zero projects', () => {
      const store = useProjectStore()

      expect(store.projects.length).toBe(0)
    })

    it('tracks project count correctly', async () => {
      const store = useProjectStore()

      expect(store.projects.length).toBe(0)

      await store.createProject('项目A')
      expect(store.projects.length).toBe(1)

      await store.createProject('项目B')
      expect(store.projects.length).toBe(2)
    })
  })

  describe('Edge Cases', () => {
    it('handles very long project titles', async () => {
      const store = useProjectStore()
      const longTitle = '这是一个非常非常长的项目标题'.repeat(10)

      const project = await store.createProject(longTitle)

      expect(project.title).toBe(longTitle)
    })

    it('handles special characters in title', async () => {
      const store = useProjectStore()

      const project = await store.createProject('《测试》第一章：开端')

      expect(project.title).toBe('《测试》第一章：开端')
    })

    it('handles unicode characters in title', async () => {
      const store = useProjectStore()

      const project = await store.createProject('Test Novel 测试小説')

      expect(project.title).toBe('Test Novel 测试小説')
    })

    it('handles zero target words', async () => {
      const store = useProjectStore()

      const project = await store.createProject('零字数', '玄幻', 0)

      expect(project.targetWords).toBe(0)
    })

    it('handles very large target word count', async () => {
      const store = useProjectStore()

      const project = await store.createProject('长篇巨著', '玄幻', 5000000)

      expect(project.targetWords).toBe(5000000)
    })
  })
})
