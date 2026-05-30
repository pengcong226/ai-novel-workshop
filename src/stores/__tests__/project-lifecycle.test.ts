/**
 * Integration tests for the Project lifecycle store.
 *
 * Tests the full data flow: create -> save -> load/open -> delete,
 * including chapter CRUD, computed getters, and cross-store interactions
 * with the sandbox store.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Module-level mocks (hoisted)
// ---------------------------------------------------------------------------

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('@/utils/crypto', () => ({
  decryptProjectConfig: vi.fn((config: unknown) => Promise.resolve(config)),
  encryptProjectConfig: vi.fn((config: unknown) => Promise.resolve(config)),
}))

vi.mock('@/utils/project-config-normalizer', () => ({
  getDefaultProjectConfig: vi.fn(() => ({
    preset: 'standard',
    providers: [],
    plannerModel: 'gpt-4',
    writerModel: 'gpt-4',
    sentinelModel: 'gpt-4',
    extractorModel: 'gpt-4',
    planningDepth: 'medium',
    writingDepth: 'standard',
    enableQualityCheck: false,
    qualityThreshold: 70,
    maxCostPerChapter: 0.1,
    enableAISuggestions: false,
    enableVectorRetrieval: false,
  })),
  normalizeProjectConfig: vi.fn((config: unknown) => config ?? {}),
}))

vi.mock('@/utils/v1ToV5Migration', () => ({
  migrateV1ToV5Full: vi.fn(() => ({ entities: [], stateEvents: [] })),
}))

vi.mock('@/utils/chapterReorder', () => ({
  reorderChaptersByIds: vi.fn((chapters: unknown[]) => [...chapters]),
}))

vi.mock('@/utils/projectBackup', () => ({
  createProjectBackup: vi.fn(() => ({})),
  parseProjectBackupJson: vi.fn(() => ({ backup: null, errors: [] })),
  reassignProjectBackupIds: vi.fn((b: unknown) => b),
}))

vi.mock('@/utils/autoBackup', () => ({
  maybeAutoBackup: vi.fn(),
}))

vi.mock('uuid', () => ({
  v4: vi.fn(() => `mock-uuid-${++uuidCounter}`),
}))

// ---------------------------------------------------------------------------
// Storage mock (surrogate for real IndexedDB / Tauri IPC)
// ---------------------------------------------------------------------------

const storageMock = {
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
  loadChaptersMeta: vi.fn().mockResolvedValue([]),
}

vi.mock('@/stores/storage', () => ({
  useStorage: () => storageMock,
}))

// Sandbox mock (for project open which calls sandboxStore.loadData)
const sandboxMock = {
  entities: [] as unknown[],
  stateEvents: [] as unknown[],
  isLoaded: false,
  loadedProjectId: null as string | null,
  loadData: vi.fn().mockResolvedValue(undefined),
  batchAddEntities: vi.fn().mockResolvedValue(undefined),
  batchAddStateEvents: vi.fn().mockResolvedValue(undefined),
  replaceProjectData: vi.fn().mockResolvedValue(undefined),
}

vi.mock('@/stores/sandbox', () => ({
  useSandboxStore: () => sandboxMock,
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { createTestPinia } from '@/test/helpers'
import { useProjectStore } from '@/stores/project'
import type { Project } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let uuidCounter = 0

function resetUuidCounter(): void {
  uuidCounter = 0
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: `proj-${uuidCounter + 1}`,
    title: 'Test Novel',
    description: '',
    genre: 'fantasy',
    targetWords: 100000,
    currentWords: 0,
    status: 'draft',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    outline: {
      id: 'outline-1',
      synopsis: '',
      theme: '',
      mainPlot: { id: 'plot-1', name: 'Main', description: '' },
      subPlots: [],
      volumes: [],
      chapters: [],
      foreshadowings: [],
    },
    chapters: [],
    config: {
      preset: 'standard',
      providers: [],
      plannerModel: 'gpt-4',
      writerModel: 'gpt-4',
      sentinelModel: 'gpt-4',
      extractorModel: 'gpt-4',
      planningDepth: 'medium',
      writingDepth: 'standard',
      enableQualityCheck: false,
      qualityThreshold: 70,
      maxCostPerChapter: 0.1,
      enableAISuggestions: false,
      enableVectorRetrieval: false,
    },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('project lifecycle integration: create -> save -> load -> delete', () => {
  beforeEach(() => {
    createTestPinia()
    resetUuidCounter()
    vi.clearAllMocks()

    // Reset sandbox mock state
    sandboxMock.entities = []
    sandboxMock.stateEvents = []
    sandboxMock.isLoaded = false
    sandboxMock.loadedProjectId = null

    // Default: empty storage
    storageMock.loadProjects.mockResolvedValue([])
    storageMock.loadProject.mockResolvedValue(null)
    storageMock.saveProject.mockResolvedValue(undefined)
    storageMock.saveProjects.mockResolvedValue(undefined)
    storageMock.deleteProject.mockResolvedValue(undefined)
    storageMock.loadChaptersMeta.mockResolvedValue([])
  })

  // =========================================================================
  // Initial state
  // =========================================================================
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

  // =========================================================================
  // loadProjects
  // =========================================================================
  describe('loadProjects', () => {
    it('loads projects from storage and sets the projects array', async () => {
      const storedProjects = [
        { id: 'p-1', title: 'Novel A', genre: 'fantasy' },
        { id: 'p-2', title: 'Novel B', genre: 'scifi' },
      ]
      storageMock.loadProjects.mockResolvedValue(storedProjects)

      const store = useProjectStore()
      await store.loadProjects()

      expect(store.projects).toEqual(storedProjects)
      expect(store.projectCount).toBe(2)
    })

    it('handles empty storage gracefully', async () => {
      storageMock.loadProjects.mockResolvedValue(null)

      const store = useProjectStore()
      await store.loadProjects()

      expect(store.projects).toEqual([])
      expect(store.projectCount).toBe(0)
    })
  })

  // =========================================================================
  // createProject
  // =========================================================================
  describe('createProject', () => {
    it('creates a new project with correct defaults and saves it', async () => {
      const store = useProjectStore()

      const project = await store.createProject('My Novel', 'xuanhuan', 50000)

      expect(project.title).toBe('My Novel')
      expect(project.genre).toBe('xuanhuan')
      expect(project.targetWords).toBe(50000)
      expect(project.status).toBe('draft')
      expect(project.chapters).toEqual([])
      expect(project.config).toBeDefined()

      // Verify it was persisted
      expect(storageMock.saveProject).toHaveBeenCalledTimes(1)
      expect(storageMock.saveProjects).toHaveBeenCalledTimes(1)

      // Verify it appears in the project list
      expect(store.projects).toHaveLength(1)
      expect(store.projects[0].id).toBe(project.id)
      expect(store.projectCount).toBe(1)
    })

    it('generates unique IDs for each project', async () => {
      const store = useProjectStore()

      const proj1 = await store.createProject('Novel 1')
      const proj2 = await store.createProject('Novel 2')

      expect(proj1.id).not.toBe(proj2.id)
      expect(store.projects).toHaveLength(2)
      expect(store.projectCount).toBe(2)
    })

    it('creates project with default outline structure', async () => {
      const store = useProjectStore()

      const project = await store.createProject('Structured Novel')

      expect(project.outline).toBeDefined()
      expect(project.outline.mainPlot).toBeDefined()
      expect(project.outline.mainPlot.name).toBe('主线')
      expect(project.outline.subPlots).toEqual([])
      expect(project.outline.volumes).toEqual([])
      expect(project.outline.chapters).toEqual([])
    })
  })

  // =========================================================================
  // openProject
  // =========================================================================
  describe('openProject', () => {
    it('opens an existing project and sets it as currentProject', async () => {
      const storedProject = makeProject({ id: 'proj-1', title: 'Loaded Novel' })
      storageMock.loadProject.mockResolvedValue(storedProject)

      const store = useProjectStore()
      await store.openProject('proj-1')

      expect(store.currentProject).not.toBeNull()
      expect(store.currentProject!.id).toBe('proj-1')
      expect(store.currentProject!.title).toBe('Loaded Novel')
      expect(store.hasCurrentProject).toBe(true)
      expect(store.loading).toBe(false)
      expect(store.error).toBeNull()
    })

    it('triggers sandbox loadData when opening a project', async () => {
      const storedProject = makeProject({ id: 'proj-1' })
      storageMock.loadProject.mockResolvedValue(storedProject)

      const store = useProjectStore()
      await store.openProject('proj-1')

      expect(sandboxMock.loadData).toHaveBeenCalledWith('proj-1')
    })

    it('sets error when project is not found', async () => {
      storageMock.loadProject.mockResolvedValue(null)

      const store = useProjectStore()
      await store.openProject('nonexistent')

      expect(store.currentProject).toBeNull()
      expect(store.error).toBeTruthy()
    })
  })

  // =========================================================================
  // saveCurrentProject
  // =========================================================================
  describe('saveCurrentProject', () => {
    it('persists currentProject to storage and syncs project list', async () => {
      // Load the project list first so the project is tracked in projects.value
      storageMock.loadProjects.mockResolvedValue([
        { id: 'proj-1', title: 'Saving Novel' },
      ])
      const storedProject = makeProject({ id: 'proj-1', title: 'Saving Novel' })
      storageMock.loadProject.mockResolvedValue(storedProject)

      const store = useProjectStore()
      await store.loadProjects()
      await store.openProject('proj-1')
      store.currentProject!.title = 'Updated Title'

      await store.saveCurrentProject()

      expect(storageMock.saveProject).toHaveBeenCalled()
      // saveProjects is called because 'proj-1' is already in the projects list
      expect(storageMock.saveProjects).toHaveBeenCalled()
      // Verify the projects list was updated with the new title
      expect(store.projects.find(p => p.id === 'proj-1')!.title).toBe('Updated Title')
    })

    it('is a no-op when currentProject is null', async () => {
      const store = useProjectStore()
      // No project opened
      await store.saveCurrentProject()

      expect(storageMock.saveProject).not.toHaveBeenCalled()
    })

    it('updates the projects list entry for the current project', async () => {
      // First load some projects into the list
      storageMock.loadProjects.mockResolvedValue([
        { id: 'proj-1', title: 'Old Title', genre: 'fantasy' },
      ])
      const storedProject = makeProject({ id: 'proj-1', title: 'Old Title' })
      storageMock.loadProject.mockResolvedValue(storedProject)

      const store = useProjectStore()
      await store.loadProjects()
      await store.openProject('proj-1')

      store.currentProject!.title = 'New Title'
      await store.saveCurrentProject()

      // The projects list should have the updated title
      expect(store.projects.find(p => p.id === 'proj-1')!.title).toBe('New Title')
    })
  })

  // =========================================================================
  // deleteProject
  // =========================================================================
  describe('deleteProject', () => {
    it('removes a project from the list and clears currentProject if it matches', async () => {
      storageMock.loadProjects.mockResolvedValue([
        { id: 'proj-1', title: 'Novel 1' },
        { id: 'proj-2', title: 'Novel 2' },
      ])
      const storedProject = makeProject({ id: 'proj-1' })
      storageMock.loadProject.mockResolvedValue(storedProject)

      const store = useProjectStore()
      await store.loadProjects()
      await store.openProject('proj-1')

      expect(store.projects).toHaveLength(2)
      expect(store.hasCurrentProject).toBe(true)

      await store.deleteProject('proj-1')

      expect(storageMock.deleteProject).toHaveBeenCalledWith('proj-1')
      expect(store.projects).toHaveLength(1)
      expect(store.projects[0].id).toBe('proj-2')
      expect(store.currentProject).toBeNull()
      expect(store.projectCount).toBe(1)
    })

    it('does not clear currentProject when deleting a different project', async () => {
      storageMock.loadProjects.mockResolvedValue([
        { id: 'proj-1', title: 'Novel 1' },
        { id: 'proj-2', title: 'Novel 2' },
      ])
      const storedProject = makeProject({ id: 'proj-1' })
      storageMock.loadProject.mockResolvedValue(storedProject)

      const store = useProjectStore()
      await store.loadProjects()
      await store.openProject('proj-1')

      await store.deleteProject('proj-2')

      expect(store.projects).toHaveLength(1)
      expect(store.currentProject).not.toBeNull()
      expect(store.currentProject!.id).toBe('proj-1')
    })

    it('syncs the project list to storage after deletion', async () => {
      storageMock.loadProjects.mockResolvedValue([
        { id: 'proj-1', title: 'Novel 1' },
      ])

      const store = useProjectStore()
      await store.loadProjects()
      await store.deleteProject('proj-1')

      // saveProjects should be called with the updated (empty) list
      expect(storageMock.saveProjects).toHaveBeenCalledWith([])
    })
  })

  // =========================================================================
  // Chapter CRUD
  // =========================================================================
  describe('chapter CRUD', () => {
    it('saveChapter persists a chapter to storage', async () => {
      const storedProject = makeProject({ id: 'proj-1', chapters: [] })
      storageMock.loadProject.mockResolvedValue(storedProject)

      const store = useProjectStore()
      await store.openProject('proj-1')

      const chapter = {
        id: 'ch-1',
        number: 1,
        title: 'Chapter 1',
        content: 'Once upon a time...',
        wordCount: 5,
      }

      await store.saveChapter(chapter)

      expect(storageMock.saveChapter).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ch-1', projectId: 'proj-1' }),
        'proj-1',
      )

      // Chapter should appear in currentProject's chapters (without content for memory efficiency)
      expect(store.currentProject!.chapters).toHaveLength(1)
      expect(store.currentProject!.chapters[0].id).toBe('ch-1')
    })

    it('deleteChapter removes a chapter and recalculates word count', async () => {
      const storedProject = makeProject({
        id: 'proj-1',
        chapters: [
          { id: 'ch-1', number: 1, title: 'Ch1', wordCount: 100 } as any,
          { id: 'ch-2', number: 2, title: 'Ch2', wordCount: 200 } as any,
        ],
        currentWords: 300,
      })
      storageMock.loadProject.mockResolvedValue(storedProject)

      const store = useProjectStore()
      await store.openProject('proj-1')

      expect(store.currentProject!.chapters).toHaveLength(2)
      expect(store.currentProject!.currentWords).toBe(300)

      await store.deleteChapter('ch-1')

      expect(store.currentProject!.chapters).toHaveLength(1)
      expect(store.currentProject!.chapters[0].id).toBe('ch-2')
      expect(store.currentProject!.currentWords).toBe(200)
      expect(storageMock.deleteChapter).toHaveBeenCalledWith('ch-1', 'proj-1')
    })

    it('loadChapter delegates to storage', async () => {
      const storedProject = makeProject({ id: 'proj-1' })
      storageMock.loadProject.mockResolvedValue(storedProject)
      storageMock.loadChapter.mockResolvedValue({
        id: 'ch-1',
        title: 'Chapter 1',
        content: 'Full content here',
      })

      const store = useProjectStore()
      await store.openProject('proj-1')

      const chapter = await store.loadChapter('ch-1')

      expect(storageMock.loadChapter).toHaveBeenCalledWith('proj-1', 'ch-1')
      expect(chapter).toBeDefined()
      expect(chapter!.content).toBe('Full content here')
    })
  })

  // =========================================================================
  // Computed getters
  // =========================================================================
  describe('computed getters', () => {
    it('currentChaptersSorted returns chapters sorted by number', async () => {
      const storedProject = makeProject({
        id: 'proj-1',
        chapters: [
          { id: 'ch-2', number: 2, title: 'Chapter 2' } as any,
          { id: 'ch-1', number: 1, title: 'Chapter 1' } as any,
          { id: 'ch-3', number: 3, title: 'Chapter 3' } as any,
        ],
      })
      storageMock.loadProject.mockResolvedValue(storedProject)

      const store = useProjectStore()
      await store.openProject('proj-1')

      const sorted = store.currentChaptersSorted
      expect(sorted.map(c => c.number)).toEqual([1, 2, 3])
    })

    it('currentProjectStats computes chapter count, total words, and average', async () => {
      const storedProject = makeProject({
        id: 'proj-1',
        chapters: [
          { id: 'ch-1', number: 1, wordCount: 100 } as any,
          { id: 'ch-2', number: 2, wordCount: 300 } as any,
        ],
      })
      storageMock.loadProject.mockResolvedValue(storedProject)

      const store = useProjectStore()
      await store.openProject('proj-1')

      const stats = store.currentProjectStats
      expect(stats.chapterCount).toBe(2)
      expect(stats.totalWords).toBe(400)
      expect(stats.avgWordsPerChapter).toBe(200)
    })

    it('currentProjectStats returns zeros when no project is open', () => {
      const store = useProjectStore()

      const stats = store.currentProjectStats
      expect(stats.chapterCount).toBe(0)
      expect(stats.totalWords).toBe(0)
      expect(stats.avgWordsPerChapter).toBe(0)
    })
  })

  // =========================================================================
  // Full lifecycle: create -> save -> reload -> delete
  // =========================================================================
  describe('full lifecycle round-trip', () => {
    it('create -> open -> save -> delete clears everything', async () => {
      const store = useProjectStore()

      // 1. Create
      const project = await store.createProject('Lifecycle Test', 'fantasy', 50000)
      expect(store.projects).toHaveLength(1)
      expect(store.projectCount).toBe(1)

      // 2. Simulate reloading from storage (re-open)
      const savedProject = makeProject({
        id: project.id,
        title: 'Lifecycle Test',
        genre: 'fantasy',
        targetWords: 50000,
      })
      storageMock.loadProject.mockResolvedValue(savedProject)

      await store.openProject(project.id)
      expect(store.currentProject!.id).toBe(project.id)
      expect(store.currentProject!.title).toBe('Lifecycle Test')

      // 3. Modify and save
      store.currentProject!.title = 'Updated Title'
      await store.saveCurrentProject()
      expect(storageMock.saveProject).toHaveBeenCalled()

      // 4. Delete
      await store.deleteProject(project.id)
      expect(store.projects).toHaveLength(0)
      expect(store.projectCount).toBe(0)
      expect(store.currentProject).toBeNull()
    })

    it('multiple projects can coexist independently', async () => {
      const store = useProjectStore()

      const proj1 = await store.createProject('Novel 1')
      const proj2 = await store.createProject('Novel 2')
      const proj3 = await store.createProject('Novel 3')

      expect(store.projects).toHaveLength(3)
      expect(store.projectCount).toBe(3)

      // Open one project
      storageMock.loadProject.mockResolvedValue(
        makeProject({ id: proj2.id, title: 'Novel 2' }),
      )
      await store.openProject(proj2.id)
      expect(store.currentProject!.id).toBe(proj2.id)

      // Delete the other one - should not affect current
      await store.deleteProject(proj1.id)
      expect(store.projects).toHaveLength(2)
      expect(store.currentProject!.id).toBe(proj2.id)

      // Delete current
      await store.deleteProject(proj2.id)
      expect(store.currentProject).toBeNull()
      expect(store.projects).toHaveLength(1)
      expect(store.projects[0].id).toBe(proj3.id)
    })
  })
})
