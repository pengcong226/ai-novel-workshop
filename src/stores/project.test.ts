import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectStore } from './project'

// ---- mock helpers ----

const mockStorage = {
  loadProjects: vi.fn().mockResolvedValue([]),
  saveProjects: vi.fn().mockResolvedValue(undefined),
  loadProject: vi.fn().mockResolvedValue(null),
  saveProject: vi.fn().mockResolvedValue(undefined),
  deleteProject: vi.fn().mockResolvedValue(undefined),
  loadChapter: vi.fn().mockResolvedValue(null),
  saveChapter: vi.fn().mockResolvedValue(undefined),
  deleteChapter: vi.fn().mockResolvedValue(undefined),
  reorderChapters: vi.fn().mockResolvedValue(undefined),
  loadFullProject: vi.fn().mockResolvedValue(null),
}

vi.mock('./storage', () => ({
  useStorage: () => mockStorage,
}))

vi.mock('./sandbox', () => ({
  useSandboxStore: () => ({
    entities: [],
    stateEvents: [],
    isLoaded: false,
    loadedProjectId: null,
    loadData: vi.fn().mockResolvedValue(undefined),
    batchAddEntities: vi.fn().mockResolvedValue(undefined),
    batchAddStateEvents: vi.fn().mockResolvedValue(undefined),
    replaceProjectData: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-' + Math.random().toString(36).slice(2, 8)),
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}))

vi.mock('@/utils/crypto', () => ({
  decryptProjectConfig: vi.fn((config) => config),
  encryptProjectConfig: vi.fn((config) => config),
}))

vi.mock('@/utils/project-config-normalizer', () => ({
  getDefaultProjectConfig: vi.fn(() => ({
    aiProvider: 'openai',
    aiModel: 'gpt-4',
    language: 'zh',
  })),
  normalizeProjectConfig: vi.fn((config) => config ?? {}),
}))

vi.mock('@/utils/v1ToV5Migration', () => ({
  migrateV1ToV5Full: vi.fn(() => ({ entities: [], stateEvents: [] })),
}))

vi.mock('@/utils/chapterReorder', () => ({
  reorderChaptersByIds: vi.fn((chapters, _ids) => [...chapters]),
}))

vi.mock('@/utils/projectBackup', () => ({
  createProjectBackup: vi.fn(() => ({})),
  parseProjectBackupJson: vi.fn(() => ({ backup: null, errors: [] })),
  reassignProjectBackupIds: vi.fn((b) => b),
}))

vi.mock('@/utils/autoBackup', () => ({
  maybeAutoBackup: vi.fn(),
}))

// ---- helpers ----

function createLocalStorageStub(): Storage {
  const store = new Map<string, string>()
  return {
    get length() { return store.size },
    clear: () => store.clear(),
    getItem: (k: string) => store.get(k) ?? null,
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => store.delete(k),
    setItem: (k: string, v: string) => store.set(k, v),
  }
}

// ---- tests ----

describe('project store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('localStorage', createLocalStorageStub())
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('starts with empty projects and no current project', () => {
      const store = useProjectStore()

      expect(store.projects).toEqual([])
      expect(store.currentProject).toBeNull()
      expect(store.loading).toBe(false)
      expect(store.error).toBeNull()
      expect(store.projectCount).toBe(0)
      expect(store.hasCurrentProject).toBe(false)
    })
  })

  describe('loadProjects', () => {
    it('loads projects from storage', async () => {
      const fakeProjects = [
        { id: 'p1', title: '项目一' },
        { id: 'p2', title: '项目二' },
      ]
      mockStorage.loadProjects.mockResolvedValueOnce(fakeProjects)

      const store = useProjectStore()
      await store.loadProjects()

      expect(store.projects).toEqual(fakeProjects)
      expect(store.projectCount).toBe(2)
      expect(store.loading).toBe(false)
      expect(store.error).toBeNull()
    })

    it('sets error when loading fails', async () => {
      mockStorage.loadProjects.mockRejectedValueOnce(new Error('网络错误'))

      const store = useProjectStore()
      await store.loadProjects()

      expect(store.projects).toEqual([])
      expect(store.error).toBe('网络错误')
      expect(store.loading).toBe(false)
    })

    it('sets loading to true during load', async () => {
      let resolveLoad: () => void
      const loadPromise = new Promise<void>((r) => { resolveLoad = r })
      mockStorage.loadProjects.mockReturnValueOnce(loadPromise)

      const store = useProjectStore()
      const p = store.loadProjects()

      expect(store.loading).toBe(true)
      resolveLoad!()
      await p
      expect(store.loading).toBe(false)
    })
  })

  describe('createProject', () => {
    it('creates a project with the given title and defaults', async () => {
      const store = useProjectStore()
      const project = await store.createProject('测试小说', '科幻', 200000)

      expect(project.title).toBe('测试小说')
      expect(project.genre).toBe('科幻')
      expect(project.targetWords).toBe(200000)
      expect(project.status).toBe('draft')
      expect(project.currentWords).toBe(0)
      expect(project.chapters).toEqual([])
      expect(project.outline).toBeDefined()
      expect(project.config).toBeDefined()

      expect(store.projects).toHaveLength(1)
      expect(mockStorage.saveProjects).toHaveBeenCalled()
      expect(mockStorage.saveProject).toHaveBeenCalled()
    })

    it('uses default genre and targetWords when omitted', async () => {
      const store = useProjectStore()
      const project = await store.createProject('默认项目')

      expect(project.genre).toBe('玄幻')
      expect(project.targetWords).toBe(100000)
    })

    it('returns a project with a unique id', async () => {
      const store = useProjectStore()
      const p1 = await store.createProject('A')
      const p2 = await store.createProject('B')

      expect(p1.id).not.toBe(p2.id)
    })
  })

  describe('deleteProject', () => {
    it('removes the project from the list', async () => {
      mockStorage.loadProjects.mockResolvedValueOnce([
        { id: 'p1', title: '要删的' },
      ])
      const store = useProjectStore()
      await store.loadProjects()

      await store.deleteProject('p1')

      expect(store.projects).toEqual([])
      expect(mockStorage.deleteProject).toHaveBeenCalledWith('p1')
      expect(mockStorage.saveProjects).toHaveBeenCalled()
    })

    it('clears currentProject if the deleted project is active', async () => {
      mockStorage.loadProject.mockResolvedValueOnce({
        id: 'p1',
        title: '当前项目',
        chapters: [],
        config: {},
      })
      mockStorage.loadProjects.mockResolvedValueOnce([{ id: 'p1', title: '当前项目' }])

      const store = useProjectStore()
      await store.loadProjects()
      await store.openProject('p1')
      expect(store.currentProject).not.toBeNull()

      await store.deleteProject('p1')

      expect(store.currentProject).toBeNull()
    })

    it('sets error on failure', async () => {
      mockStorage.deleteProject.mockRejectedValueOnce(new Error('删除项目失败'))
      const store = useProjectStore()

      await expect(store.deleteProject('x')).rejects.toThrow('删除项目失败')
      expect(store.error).toBe('删除项目失败')
    })
  })

  describe('openProject', () => {
    it('loads a project and sets it as current', async () => {
      const fakeProject = {
        id: 'p1',
        title: '打开的项目',
        chapters: [],
        config: { aiProvider: 'openai' },
      }
      mockStorage.loadProject.mockResolvedValueOnce(fakeProject)

      const store = useProjectStore()
      await store.openProject('p1')

      expect(store.currentProject).not.toBeNull()
      expect(store.currentProject!.id).toBe('p1')
      expect(store.currentProject!.title).toBe('打开的项目')
      expect(store.hasCurrentProject).toBe(true)
    })

    it('sets error when project does not exist', async () => {
      mockStorage.loadProject.mockResolvedValueOnce(null)

      const store = useProjectStore()
      await store.openProject('missing-id')

      expect(store.currentProject).toBeNull()
      expect(store.error).toBe('项目不存在')
    })
  })

  describe('saveCurrentProject', () => {
    it('does nothing when there is no current project', async () => {
      const store = useProjectStore()
      await store.saveCurrentProject()

      expect(mockStorage.saveProject).not.toHaveBeenCalled()
    })

    it('persists the current project to storage', async () => {
      mockStorage.loadProject.mockResolvedValueOnce({
        id: 'p1',
        title: '保存测试',
        chapters: [],
        config: {},
      })
      const store = useProjectStore()
      await store.openProject('p1')

      await store.saveCurrentProject()

      expect(mockStorage.saveProject).toHaveBeenCalled()
      expect(store.currentProject).not.toBeNull()
    })
  })

  describe('saveChapter', () => {
    it('throws when no project is loaded', async () => {
      const store = useProjectStore()

      await expect(
        store.saveChapter({ id: 'ch1', title: '第一章' })
      ).rejects.toThrow('保存章节失败：项目未加载')
    })

    it('saves a chapter and updates currentWords', async () => {
      mockStorage.loadProject.mockResolvedValueOnce({
        id: 'p1',
        title: 'P',
        chapters: [{ id: 'ch1', number: 1, title: '旧', wordCount: 50 }],
        config: {},
      })

      const store = useProjectStore()
      await store.openProject('p1')

      await store.saveChapter({ id: 'ch1', title: '新标题', wordCount: 120 })

      expect(mockStorage.saveChapter).toHaveBeenCalled()
      // content should be stripped from the in-memory chapter
      const savedChapter = store.currentProject!.chapters.find((c: any) => c.id === 'ch1')
      expect(savedChapter).toBeDefined()
      expect((savedChapter as any).wordCount).toBe(120)
    })
  })

  describe('deleteChapter', () => {
    it('removes the chapter and updates word count', async () => {
      mockStorage.loadProject.mockResolvedValueOnce({
        id: 'p1',
        title: 'P',
        chapters: [
          { id: 'ch1', number: 1, title: '一', wordCount: 100 },
          { id: 'ch2', number: 2, title: '二', wordCount: 200 },
        ],
        config: {},
      })

      const store = useProjectStore()
      await store.openProject('p1')

      await store.deleteChapter('ch1')

      expect(mockStorage.deleteChapter).toHaveBeenCalledWith('ch1', 'p1')
      expect(store.currentProject!.chapters).toHaveLength(1)
      expect(store.currentProject!.chapters[0].id).toBe('ch2')
    })
  })

  describe('loadGlobalConfig / saveGlobalConfig', () => {
    it('loads global config from localStorage', async () => {
      localStorage.setItem(
        'global-config',
        JSON.stringify({ aiProvider: 'anthropic', aiModel: 'claude-3' })
      )

      const store = useProjectStore()
      await store.loadGlobalConfig()

      expect(store.globalConfig).not.toBeNull()
    })

    it('saves normalized config to localStorage', async () => {
      const store = useProjectStore()
      await store.saveGlobalConfig({
        aiProvider: 'openai',
        aiModel: 'gpt-4',
      } as any)

      expect(store.globalConfig).not.toBeNull()
      expect(localStorage.getItem('global-config')).toBeTruthy()
    })
  })

  describe('restoreFromBackup', () => {
    it('sets currentProject and persists', async () => {
      const store = useProjectStore()
      const backupData = { id: 'restored', title: '备份恢复', chapters: [], config: {} }

      await store.restoreFromBackup(backupData)

      expect(store.currentProject).toEqual(backupData)
      expect(mockStorage.saveProject).toHaveBeenCalled()
    })
  })
})
