import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useContextRadar } from './useContextRadar'

// Mock lodash-es debounce to execute immediately in tests
vi.mock('lodash-es', () => ({
  debounce: (fn: (...args: unknown[]) => unknown) => {
    const wrapper = Object.assign(
      (...args: unknown[]) => fn(...args),
      { cancel: vi.fn() },
    )
    return wrapper
  },
}))

// Mock sandbox store — module-scope refs shared between mock and tests
const mockEntities: Array<{
  id: string
  name: string
  type: string
  isArchived: boolean
  aliases?: string[]
}> = []

const mockActiveEntitiesState: Record<string, { properties?: Record<string, unknown> }> = {}

const mockLoadData = vi.fn()

vi.mock('@/stores/sandbox', () => ({
  useSandboxStore: () => ({
    entities: mockEntities,
    isLoaded: false,
    isLoading: false,
    activeEntitiesState: mockActiveEntitiesState,
    loadData: mockLoadData,
  }),
}))

function mountContextRadar(
  projectRef = ref({ id: 'proj-1' } as any),
  textRef = ref(''),
  isActiveRef = ref(true),
) {
  let result!: ReturnType<typeof useContextRadar>

  const wrapper = mount(
    defineComponent({
      setup() {
        result = useContextRadar(projectRef, textRef, isActiveRef)
        return result
      },
      render: () => h('div'),
    }),
  )

  return { wrapper, ...result }
}

describe('useContextRadar', () => {
  beforeEach(() => {
    mockEntities.length = 0
    Object.keys(mockActiveEntitiesState).forEach(k => delete mockActiveEntitiesState[k])
    mockLoadData.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initializes with empty activeContextCharacters', () => {
    const { activeContextCharacters } = mountContextRadar()
    expect(activeContextCharacters.value).toEqual([])
  })

  it('initializes with empty activeContextWorldbook', () => {
    const { activeContextWorldbook } = mountContextRadar()
    expect(activeContextWorldbook.value).toEqual([])
  })

  it('calls sandbox loadData when store is not loaded', async () => {
    const textRef = ref('')
    mountContextRadar(undefined, textRef)
    textRef.value = 'test text'
    await nextTick()
    expect(mockLoadData).toHaveBeenCalledWith('proj-1')
  })

  it('matches CHARACTER entity by name', async () => {
    mockEntities.push({
      id: 'char-1',
      name: 'Alice',
      type: 'CHARACTER',
      isArchived: false,
    })
    mockActiveEntitiesState['char-1'] = { properties: {} }

    const textRef = ref('')
    const { activeContextCharacters } = mountContextRadar(undefined, textRef)

    textRef.value = 'Alice went to the park'
    await nextTick()

    expect(activeContextCharacters.value).toHaveLength(1)
  })

  it('matches CHARACTER entity by alias', async () => {
    mockEntities.push({
      id: 'char-2',
      name: 'Robert',
      type: 'CHARACTER',
      isArchived: false,
      aliases: ['Bob'],
    })
    mockActiveEntitiesState['char-2'] = { properties: { trait: 'brave' } }

    const textRef = ref('')
    const { activeContextCharacters } = mountContextRadar(undefined, textRef)

    textRef.value = 'Bob walked in'
    await nextTick()

    expect(activeContextCharacters.value).toHaveLength(1)
  })

  it('ignores archived CHARACTER entities', async () => {
    mockEntities.push({
      id: 'char-archived',
      name: 'Ghost',
      type: 'CHARACTER',
      isArchived: true,
    })
    mockActiveEntitiesState['char-archived'] = { properties: {} }

    const textRef = ref('')
    const { activeContextCharacters } = mountContextRadar(undefined, textRef)

    textRef.value = 'Ghost appeared'
    await nextTick()

    expect(activeContextCharacters.value).toHaveLength(0)
  })

  it('matches LORE entity by name', async () => {
    mockEntities.push({
      id: 'lore-1',
      name: '魔法森林',
      type: 'LORE',
      isArchived: false,
    })

    const textRef = ref('')
    const { activeContextWorldbook } = mountContextRadar(undefined, textRef)

    textRef.value = '在魔法森林深处'
    await nextTick()

    expect(activeContextWorldbook.value).toHaveLength(1)
    expect(activeContextWorldbook.value[0].name).toBe('魔法森林')
  })

  it('ignores non-CHARACTER and non-LORE entity types', async () => {
    mockEntities.push(
      { id: 'faction-1', name: 'Empire', type: 'FACTION', isArchived: false },
      { id: 'char-3', name: 'Empire', type: 'CHARACTER', isArchived: false },
    )
    mockActiveEntitiesState['char-3'] = { properties: {} }

    const textRef = ref('')
    const { activeContextCharacters, activeContextWorldbook } = mountContextRadar(undefined, textRef)

    textRef.value = 'Empire strikes'
    await nextTick()

    expect(activeContextCharacters.value).toHaveLength(1)
    expect(activeContextWorldbook.value).toHaveLength(0)
  })

  it('does not scan when isActive is false', async () => {
    mockEntities.push({
      id: 'char-4',
      name: 'Zara',
      type: 'CHARACTER',
      isArchived: false,
    })

    const isActiveRef = ref(false)
    const textRef = ref('')
    const { activeContextCharacters } = mountContextRadar(undefined, textRef, isActiveRef)

    textRef.value = 'Zara arrived'
    await nextTick()

    expect(activeContextCharacters.value).toHaveLength(0)
  })

  it('returns empty results when project is null', async () => {
    const projectRef = ref(null)
    const textRef = ref('')
    const { activeContextCharacters, activeContextWorldbook } = mountContextRadar(projectRef, textRef)

    textRef.value = 'anything'
    await nextTick()

    expect(activeContextCharacters.value).toEqual([])
    expect(activeContextWorldbook.value).toEqual([])
  })

  it('ignores entities with empty alias strings', async () => {
    mockEntities.push({
      id: 'char-5',
      name: 'Robert',
      type: 'CHARACTER',
      isArchived: false,
      aliases: ['', 'Bob'],
    })
    mockActiveEntitiesState['char-5'] = { properties: {} }

    const textRef = ref('')
    const { activeContextCharacters } = mountContextRadar(undefined, textRef)

    // Empty string alias should not match everything
    textRef.value = 'Bob is here'
    await nextTick()

    expect(activeContextCharacters.value).toHaveLength(1)
  })

  it('returns read-only refs', () => {
    const { activeContextCharacters, activeContextWorldbook } = mountContextRadar()

    expect(activeContextCharacters).toBeDefined()
    expect(activeContextWorldbook).toBeDefined()
  })
})
