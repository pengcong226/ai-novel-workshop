import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useAutoSave } from './useAutoSave'

// Mock the project store
const mockSaveCurrentProject = vi.fn()
const mockDebouncedSaveCurrentProject = vi.fn()

vi.mock('@/stores/project', () => ({
  useProjectStore: () => ({
    saveCurrentProject: mockSaveCurrentProject,
    debouncedSaveCurrentProject: mockDebouncedSaveCurrentProject,
  }),
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}))

function mountAutoSave() {
  let result!: ReturnType<typeof useAutoSave>

  const wrapper = mount(
    defineComponent({
      setup() {
        result = useAutoSave()
        return result
      },
      render: () => h('div'),
    }),
  )

  return { wrapper, ...result }
}

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initializes isDirty as false', () => {
    const { isDirty } = mountAutoSave()
    expect(isDirty.value).toBe(false)
  })

  it('initializes isSaving as false', () => {
    const { isSaving } = mountAutoSave()
    expect(isSaving.value).toBe(false)
  })

  it('initializes lastSavedAt as null', () => {
    const { lastSavedAt } = mountAutoSave()
    expect(lastSavedAt.value).toBeNull()
  })

  it('markDirty sets isDirty to true', () => {
    const { isDirty, markDirty } = mountAutoSave()

    expect(isDirty.value).toBe(false)
    markDirty()
    expect(isDirty.value).toBe(true)
  })

  it('markDirty triggers debouncedSaveCurrentProject', () => {
    const { markDirty } = mountAutoSave()

    markDirty()
    expect(mockDebouncedSaveCurrentProject).toHaveBeenCalledTimes(1)
  })

  it('save is a no-op when not dirty', async () => {
    const { save } = mountAutoSave()

    await save()
    expect(mockSaveCurrentProject).not.toHaveBeenCalled()
  })

  it('save calls saveCurrentProject and resets isDirty', async () => {
    mockSaveCurrentProject.mockResolvedValue(undefined)
    const { isDirty, markDirty, save } = mountAutoSave()

    markDirty()
    expect(isDirty.value).toBe(true)

    await save()
    expect(mockSaveCurrentProject).toHaveBeenCalledTimes(1)
    expect(isDirty.value).toBe(false)
  })

  it('save sets lastSavedAt to a Date on success', async () => {
    mockSaveCurrentProject.mockResolvedValue(undefined)
    const { markDirty, save, lastSavedAt } = mountAutoSave()

    markDirty()
    const before = Date.now()
    await save()

    expect(lastSavedAt.value).toBeInstanceOf(Date)
    expect(lastSavedAt.value!.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('save does not reset isDirty on failure', async () => {
    mockSaveCurrentProject.mockRejectedValue(new Error('save failed'))
    const { isDirty, markDirty, save } = mountAutoSave()

    markDirty()
    await save()

    // isDirty remains true because save failed
    expect(isDirty.value).toBe(true)
  })

  it('save sets isSaving correctly during the save lifecycle', async () => {
    let resolveSave!: () => void
    mockSaveCurrentProject.mockImplementation(
      () => new Promise<void>((resolve) => { resolveSave = resolve }),
    )

    const { markDirty, save, isSaving } = mountAutoSave()

    markDirty()
    const savePromise = save()

    // isSaving is true while in-flight
    expect(isSaving.value).toBe(true)

    resolveSave()
    await savePromise

    expect(isSaving.value).toBe(false)
  })

  it('registers beforeunload listener on mount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')

    mountAutoSave()

    const beforeUnloadRegistration = addSpy.mock.calls.find(
      (call) => call[0] === 'beforeunload',
    )
    expect(beforeUnloadRegistration).toBeDefined()
  })
})
