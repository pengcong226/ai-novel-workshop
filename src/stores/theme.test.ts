import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useThemeStore } from './theme'

const themeRegistry = vi.hoisted(() => ({
  get: vi.fn((id: string) => ({
    id,
    name: '经典明亮',
    mode: 'light',
    cssVariables: {
      '--el-bg-color': '#ffffff',
    },
  })),
}))

vi.mock('./plugin', () => ({
  usePluginStore: () => ({
    getRegistries: () => ({
      theme: themeRegistry,
    }),
  }),
}))

function createLocalStorageStub(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  }
}

function createDocumentStub(): Document {
  const classes = new Set<string>(['dark'])
  const styleValues = new Map<string, string>()
  const elements = new Map<string, { id: string; innerHTML: string }>()

  return {
    documentElement: {
      classList: {
        add: (name: string) => classes.add(name),
        remove: (name: string) => classes.delete(name),
        contains: (name: string) => classes.has(name),
      },
      style: {
        setProperty: (key: string, value: string) => styleValues.set(key, value),
        getPropertyValue: (key: string) => styleValues.get(key) ?? '',
      },
    },
    head: {
      appendChild: (element: { id: string; innerHTML: string }) => {
        elements.set(element.id, element)
        return element
      },
    },
    createElement: () => ({ id: '', innerHTML: '' }),
    getElementById: (id: string) => elements.get(id) ?? null,
  } as unknown as Document
}

describe('theme store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('window', { localStorage: createLocalStorageStub() })
    vi.stubGlobal('document', createDocumentStub())
    themeRegistry.get.mockClear()
  })

  it('defaults to the classic light theme', () => {
    const themeStore = useThemeStore()

    expect(themeStore.activeThemeId).toBe('builtin-classic-light-theme')
  })

  it('preserves an explicit dark theme preference', () => {
    window.localStorage.setItem('active-theme-id', 'builtin-scifi-dark-theme')

    const themeStore = useThemeStore()

    expect(themeStore.activeThemeId).toBe('builtin-scifi-dark-theme')
  })

  it('applies light theme without leaving the dark class', () => {
    const themeStore = useThemeStore()

    themeStore.applyTheme()

    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.style.getPropertyValue('--el-bg-color')).toBe('#ffffff')
  })
})
