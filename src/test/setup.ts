/**
 * Global test setup file.
 *
 * Configured via vite.config.ts test.setupFiles so it runs before every test suite.
 * Provides mocks for browser-only APIs that are unavailable in the Node-based
 * Vitest environment: localStorage, sessionStorage, IndexedDB, matchMedia,
 * ResizeObserver, IntersectionObserver, and Tauri IPC.
 */

import { vi } from 'vitest'

// ---------------------------------------------------------------------------
// localStorage / sessionStorage
// ---------------------------------------------------------------------------
const createStorageMock = () => {
  const store = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { store.set(key, String(value)) }),
    removeItem: vi.fn((key: string) => { store.delete(key) }),
    clear: vi.fn(() => { store.clear() }),
    get length() { return store.size },
    key: vi.fn((index: number) => [...store.keys()][index] ?? null),
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: createStorageMock(),
  writable: true,
})

Object.defineProperty(globalThis, 'sessionStorage', {
  value: createStorageMock(),
  writable: true,
})

// ---------------------------------------------------------------------------
// matchMedia
// ---------------------------------------------------------------------------
if (typeof globalThis.matchMedia !== 'function') {
  Object.defineProperty(globalThis, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

// ---------------------------------------------------------------------------
// ResizeObserver
// ---------------------------------------------------------------------------
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverMock {
    callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    value: ResizeObserverMock,
  })
}

// ---------------------------------------------------------------------------
// IntersectionObserver
// ---------------------------------------------------------------------------
if (typeof globalThis.IntersectionObserver === 'undefined') {
  class IntersectionObserverMock {
    callback: IntersectionObserverCallback
    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback
    }
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
    takeRecords = vi.fn(() => [])
    root = null
    rootMargin = ''
    thresholds: ReadonlyArray<number> = []
  }
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    writable: true,
    value: IntersectionObserverMock,
  })
}

// ---------------------------------------------------------------------------
// scrollIntoView (jsdom does not implement layout)
// ---------------------------------------------------------------------------
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = vi.fn()
}

// ---------------------------------------------------------------------------
// Tauri IPC mock (__TAURI_INTERNALS__)
// ---------------------------------------------------------------------------
const tauriInvokeMock = vi.fn().mockResolvedValue(undefined)

Object.defineProperty(window, '__TAURI_INTERNALS__', {
  value: {
    invoke: tauriInvokeMock,
    convertFileSrc: vi.fn((path: string) => `asset://localhost/${path}`),
    transformCallback: vi.fn(() => 0),
  },
  writable: true,
})

/**
 * Access the raw Tauri invoke mock to set per-test return values.
 * Usage: `getTauriInvokeMock().mockResolvedValueOnce(someFixture)`
 */
export function getTauriInvokeMock() {
  return tauriInvokeMock
}

// ---------------------------------------------------------------------------
// IndexedDB (via idb / fake-indexeddb)
// ---------------------------------------------------------------------------
// The `idb` library used in production requires a real IndexedDB.  When no
// polyfill is present we install a minimal stub that prevents runtime crashes.
// Tests that need real IndexedDB semantics should install `fake-indexeddb`
// in their own setup and call `import 'fake-indexeddb/auto'`.
if (typeof globalThis.indexedDB === 'undefined') {
  const noop = () => { throw new Error('indexedDB not available in test environment') }
  Object.defineProperty(globalThis, 'indexedDB', {
    value: {
      open: noop,
      deleteDatabase: noop,
      databases: () => Promise.resolve([]),
      cmp: noop,
    },
    writable: true,
    configurable: true,
  })
}

// ---------------------------------------------------------------------------
// URL.createObjectURL / revokeObjectURL
// ---------------------------------------------------------------------------
if (typeof globalThis.URL.createObjectURL !== 'function') {
  Object.defineProperty(URL, 'createObjectURL', {
    value: vi.fn(() => 'blob:mock'),
    writable: true,
  })
}
if (typeof globalThis.URL.revokeObjectURL !== 'function') {
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: vi.fn(),
    writable: true,
  })
}

// ---------------------------------------------------------------------------
// navigator.clipboard
// ---------------------------------------------------------------------------
if (typeof navigator.clipboard === 'undefined') {
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
      readText: vi.fn().mockResolvedValue(''),
    },
    writable: true,
  })
}
