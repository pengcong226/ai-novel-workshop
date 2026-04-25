import { afterEach, describe, expect, it, vi } from 'vitest'
import { isWebRuntime } from '@/utils/anthropic-guard'

interface WindowWithTauriInternals {
  __TAURI_INTERNALS__?: { invoke?: unknown }
}

describe('anthropic-guard runtime detection', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('treats a browser without Tauri internals as web runtime', () => {
    vi.stubGlobal('window', {})

    expect(isWebRuntime()).toBe(true)
  })

  it('treats empty Tauri internals as web runtime', () => {
    vi.stubGlobal('window', {
      __TAURI_INTERNALS__: {}
    } satisfies WindowWithTauriInternals)

    expect(isWebRuntime()).toBe(true)
  })

  it('treats spoofed callable Tauri invoke as web runtime in web builds', () => {
    vi.stubGlobal('window', {
      __TAURI_INTERNALS__: {
        invoke: () => undefined
      }
    } satisfies WindowWithTauriInternals)

    expect(isWebRuntime()).toBe(true)
  })
})
