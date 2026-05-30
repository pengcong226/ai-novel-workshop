/**
 * Shared mock factories for test data.
 *
 * Every factory returns a fully-shaped object with sensible defaults so tests
 * only need to override the fields they actually care about.
 *
 * Usage:
 *   import { createMockProject, createMockChapter, createMockEntity, createMockStateEvent } from '@/test/mocks'
 *   const project = createMockProject({ title: 'My Story' })
 */

import { vi } from 'vitest'
import type { Project, Chapter, Outline, ProjectConfig, ChapterOutline, Checkpoint } from '@/types/index'
import type { Entity, StateEvent, EntityType, EntityImportance, StateEventType } from '@/types/sandbox'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let _seq = 0
const nextId = (prefix = 'test') => `${prefix}-${++_seq}`

/** Reset the internal ID counter (call in beforeEach for deterministic IDs). */
export function resetMockIdCounter(): void {
  _seq = 0
}

// ---------------------------------------------------------------------------
// ProjectConfig
// ---------------------------------------------------------------------------
export function createMockProjectConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
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
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Outline
// ---------------------------------------------------------------------------
export function createMockOutline(overrides: Partial<Outline> = {}): Outline {
  return {
    id: nextId('outline'),
    synopsis: 'A test synopsis',
    theme: 'test theme',
    mainPlot: {
      id: nextId('plot'),
      name: 'Main Plot',
      description: 'The main plot line',
    },
    subPlots: [],
    volumes: [],
    chapters: [],
    foreshadowings: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// ChapterOutline
// ---------------------------------------------------------------------------
export function createMockChapterOutline(overrides: Partial<ChapterOutline> = {}): ChapterOutline {
  return {
    chapterId: nextId('ch-outline'),
    title: 'Chapter Outline',
    scenes: [],
    characters: [],
    location: 'Test Location',
    goals: [],
    conflicts: [],
    resolutions: [],
    status: 'planned',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Checkpoint
// ---------------------------------------------------------------------------
export function createMockCheckpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    id: nextId('ckpt'),
    timestamp: new Date('2025-01-01T00:00:00Z'),
    content: 'Checkpoint content',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Chapter
// ---------------------------------------------------------------------------
export function createMockChapter(overrides: Partial<Chapter> = {}): Chapter {
  const number = overrides.number ?? 1
  return {
    id: nextId('chapter'),
    number,
    title: `Chapter ${number}`,
    content: `Content of chapter ${number}.`,
    wordCount: 100,
    outline: createMockChapterOutline(),
    status: 'draft',
    generatedBy: 'manual',
    generationTime: new Date('2025-01-01T00:00:00Z'),
    checkpoints: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------
export function createMockProject(overrides: Partial<Project> = {}): Project {
  return {
    id: nextId('project'),
    title: 'Test Project',
    description: 'A test project description',
    genre: 'fantasy',
    targetWords: 100000,
    currentWords: 0,
    status: 'draft',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    outline: createMockOutline(),
    chapters: [],
    config: createMockProjectConfig(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------
export function createMockEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: nextId('entity'),
    projectId: 'test-project',
    type: 'CHARACTER' as EntityType,
    name: 'Test Entity',
    aliases: [],
    importance: 'major' as EntityImportance,
    category: '',
    systemPrompt: '',
    description: 'A test entity',
    isArchived: false,
    createdAt: Date.now(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// StateEvent
// ---------------------------------------------------------------------------
export function createMockStateEvent(overrides: Partial<StateEvent> = {}): StateEvent {
  return {
    id: nextId('event'),
    projectId: 'test-project',
    chapterNumber: 1,
    entityId: 'test-entity',
    eventType: 'PROPERTY_UPDATE' as StateEventType,
    payload: {
      key: 'status',
      value: 'active',
    },
    source: 'MANUAL',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Bulk helpers
// ---------------------------------------------------------------------------

/** Create `count` sequential chapters starting at `startNumber`. */
export function createMockChapters(
  count: number,
  startNumber = 1,
  overrides: Partial<Chapter> = {},
): Chapter[] {
  return Array.from({ length: count }, (_, i) =>
    createMockChapter({ number: startNumber + i, ...overrides }),
  )
}

/** Create `count` entities of the given type with sequential names. */
export function createMockEntities(
  count: number,
  type: EntityType = 'CHARACTER',
  overrides: Partial<Entity> = {},
): Entity[] {
  return Array.from({ length: count }, (_, i) =>
    createMockEntity({ type, name: `${type} ${i + 1}`, ...overrides }),
  )
}

// ---------------------------------------------------------------------------
// Common store mocks
// ---------------------------------------------------------------------------

/** Create a minimal mock of useSandboxStore for tests that depend on it. */
export function createMockSandboxStore(overrides: Record<string, unknown> = {}) {
  return {
    entities: [] as Entity[],
    stateEvents: [] as StateEvent[],
    isLoaded: false,
    loadedProjectId: null,
    loadData: vi.fn().mockResolvedValue(undefined),
    batchAddEntities: vi.fn().mockResolvedValue(undefined),
    batchAddStateEvents: vi.fn().mockResolvedValue(undefined),
    replaceProjectData: vi.fn().mockResolvedValue(undefined),
    getEntitiesByType: vi.fn(() => [] as Entity[]),
    getEntitiesByName: vi.fn(() => null),
    activeEntitiesState: [],
    ...overrides,
  }
}

/** Create a minimal mock of useStorage for tests that depend on it. */
export function createMockStorage(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  }
}
