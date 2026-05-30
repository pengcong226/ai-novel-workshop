import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { pluginManagerMock } = vi.hoisted(() => ({
  pluginManagerMock: {
    installPlugin: vi.fn(),
    uninstallPlugin: vi.fn(),
    activatePlugin: vi.fn(),
    deactivatePlugin: vi.fn(),
    getPlugin: vi.fn(),
    getRegistries: vi.fn(() => ({
      menuItem: { getAll: vi.fn(() => []) },
      sidebarPanel: { getAll: vi.fn(() => []) },
      toolbarButton: { getAll: vi.fn(() => []) },
      quickCommand: { getAll: vi.fn(() => []) },
    })),
  },
}))

vi.mock('@/plugins/manager', () => ({
  pluginManager: pluginManagerMock,
}))

vi.mock('@/plugins/storage', () => ({
  PluginStorage: {
    loadInstalledPlugins: vi.fn(() => []),
    loadAllPluginSettings: vi.fn(() => ({})),
    updatePluginSettings: vi.fn(),
    clearAllPlugins: vi.fn(),
    exportPluginConfig: vi.fn(),
    importPluginConfig: vi.fn(),
  },
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}))

vi.mock('@/assistant/commands/inputRouter', () => ({
  routeAssistantInput: vi.fn(),
}))

import { usePluginStore } from './plugin'

describe('plugin store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // Reset localStorage mock
    localStorage.clear()
  })

  // ── Initial state ────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts with empty plugin arrays and default flags', () => {
      const store = usePluginStore()

      expect(store.plugins).toEqual([])
      expect(store.activePlugins).toEqual([])
      expect(store.pluginSettings).toEqual({})
      expect(store.loading).toBe(false)
      expect(store.error).toBeNull()
    })

    it('computed properties return zero/empty for empty state', () => {
      const store = usePluginStore()

      expect(store.pluginCount).toBe(0)
      expect(store.activePluginCount).toBe(0)
      expect(store.installedPluginIds).toEqual([])
    })
  })

  // ── Computed properties ──────────────────────────────────────────────────

  describe('computed properties', () => {
    it('pluginCount reflects installed plugins', () => {
      const store = usePluginStore()
      store.plugins = [
        { id: 'p1', name: 'Plugin 1', version: '1.0.0' },
        { id: 'p2', name: 'Plugin 2', version: '1.0.0' },
      ] as any[]

      expect(store.pluginCount).toBe(2)
    })

    it('activePluginCount reflects activated plugins', () => {
      const store = usePluginStore()
      store.activePlugins = ['p1', 'p2', 'p3']

      expect(store.activePluginCount).toBe(3)
    })

    it('installedPluginIds returns IDs from plugins array', () => {
      const store = usePluginStore()
      store.plugins = [
        { id: 'alpha', name: 'Alpha', version: '1.0.0' },
        { id: 'beta', name: 'Beta', version: '2.0.0' },
      ] as any[]

      expect(store.installedPluginIds).toEqual(['alpha', 'beta'])
    })
  })

  // ── isPluginActive / isPluginInstalled ───────────────────────────────────

  describe('isPluginActive / isPluginInstalled', () => {
    it('isPluginActive checks activePlugins array', () => {
      const store = usePluginStore()
      store.activePlugins = ['p1']

      expect(store.isPluginActive('p1')).toBe(true)
      expect(store.isPluginActive('p2')).toBe(false)
    })

    it('isPluginInstalled checks plugins array', () => {
      const store = usePluginStore()
      store.plugins = [{ id: 'p1', name: 'Plugin', version: '1.0.0' }] as any[]

      expect(store.isPluginInstalled('p1')).toBe(true)
      expect(store.isPluginInstalled('p2')).toBe(false)
    })
  })

  // ── getPlugin / getPluginSettings ────────────────────────────────────────

  describe('getPlugin / getPluginSettings', () => {
    it('getPlugin returns the manifest or undefined', () => {
      const store = usePluginStore()
      const manifest = { id: 'p1', name: 'Plugin', version: '1.0.0' }
      store.plugins = [manifest] as any[]

      expect(store.getPlugin('p1')).toStrictEqual(manifest)
      expect(store.getPlugin('nonexistent')).toBeUndefined()
    })

    it('getPluginSettings returns settings object or empty default', () => {
      const store = usePluginStore()
      store.pluginSettings = { p1: { theme: 'dark' } }

      expect(store.getPluginSettings('p1')).toEqual({ theme: 'dark' })
      expect(store.getPluginSettings('nonexistent')).toEqual({})
    })
  })

  // ── activatePlugin ───────────────────────────────────────────────────────

  describe('activatePlugin', () => {
    it('adds plugin to activePlugins on success', async () => {
      pluginManagerMock.activatePlugin.mockResolvedValue(undefined)
      const store = usePluginStore()

      await store.activatePlugin('p1')

      expect(store.activePlugins).toContain('p1')
      expect(store.loading).toBe(false)
    })

    it('does not duplicate plugin in activePlugins', async () => {
      pluginManagerMock.activatePlugin.mockResolvedValue(undefined)
      const store = usePluginStore()

      await store.activatePlugin('p1')
      await store.activatePlugin('p1')

      expect(store.activePlugins.filter(id => id === 'p1')).toHaveLength(1)
    })

    it('sets error on failure', async () => {
      pluginManagerMock.activatePlugin.mockRejectedValue(new Error('Activation failed'))
      const store = usePluginStore()

      await expect(store.activatePlugin('p1')).rejects.toThrow('Activation failed')

      expect(store.error).toBe('Activation failed')
      expect(store.loading).toBe(false)
    })
  })

  // ── deactivatePlugin ─────────────────────────────────────────────────────

  describe('deactivatePlugin', () => {
    it('removes plugin from activePlugins on success', async () => {
      pluginManagerMock.deactivatePlugin.mockResolvedValue(undefined)
      const store = usePluginStore()
      store.activePlugins = ['p1', 'p2']

      await store.deactivatePlugin('p1')

      expect(store.activePlugins).toEqual(['p2'])
    })

    it('sets error on failure', async () => {
      pluginManagerMock.deactivatePlugin.mockRejectedValue(new Error('Deactivation failed'))
      const store = usePluginStore()

      await expect(store.deactivatePlugin('p1')).rejects.toThrow('Deactivation failed')

      expect(store.error).toBe('Deactivation failed')
    })
  })

  // ── togglePlugin ─────────────────────────────────────────────────────────

  describe('togglePlugin', () => {
    it('activates inactive plugin', async () => {
      pluginManagerMock.activatePlugin.mockResolvedValue(undefined)
      const store = usePluginStore()

      await store.togglePlugin('p1')

      expect(store.activePlugins).toContain('p1')
    })

    it('deactivates active plugin', async () => {
      pluginManagerMock.deactivatePlugin.mockResolvedValue(undefined)
      const store = usePluginStore()
      store.activePlugins = ['p1']

      await store.togglePlugin('p1')

      expect(store.activePlugins).not.toContain('p1')
    })
  })

  // ── installPlugin / uninstallPlugin ──────────────────────────────────────

  describe('installPlugin / uninstallPlugin', () => {
    it('installPlugin adds manifest to plugins list', async () => {
      pluginManagerMock.installPlugin.mockResolvedValue(undefined)
      const store = usePluginStore()
      const manifest = { id: 'new-plugin', name: 'New Plugin', version: '1.0.0' }

      await store.installPlugin(manifest as any, async () => ({}))

      expect(store.plugins).toHaveLength(1)
      expect(store.plugins[0].id).toBe('new-plugin')
    })

    it('uninstallPlugin removes plugin from all state', async () => {
      pluginManagerMock.uninstallPlugin.mockResolvedValue(undefined)
      const store = usePluginStore()
      store.plugins = [{ id: 'p1', name: 'Plugin', version: '1.0.0' }] as any[]
      store.activePlugins = ['p1']
      store.pluginSettings = { p1: { key: 'value' } }

      await store.uninstallPlugin('p1')

      expect(store.plugins).toHaveLength(0)
      expect(store.activePlugins).not.toContain('p1')
      expect(store.pluginSettings).not.toHaveProperty('p1')
    })

    it('uninstallPlugin sets error on failure', async () => {
      pluginManagerMock.uninstallPlugin.mockRejectedValue(new Error('Uninstall failed'))
      const store = usePluginStore()

      await expect(store.uninstallPlugin('p1')).rejects.toThrow('Uninstall failed')

      expect(store.error).toBe('Uninstall failed')
    })
  })

  // ── updatePluginSettings ─────────────────────────────────────────────────

  describe('updatePluginSettings', () => {
    it('merges settings for a plugin', async () => {
      const store = usePluginStore()
      store.pluginSettings = { p1: { existing: true } }

      await store.updatePluginSettings('p1', { newKey: 'value' })

      expect(store.pluginSettings.p1).toEqual({ existing: true, newKey: 'value' })
    })

    it('creates settings entry if none exists', async () => {
      const store = usePluginStore()

      await store.updatePluginSettings('new-plugin', { key: 'val' })

      expect(store.pluginSettings['new-plugin']).toEqual({ key: 'val' })
    })
  })

  // ── setExperimentalMode ──────────────────────────────────────────────────

  describe('setExperimentalMode', () => {
    it('updates the experimentalMode flag', () => {
      const store = usePluginStore()

      store.setExperimentalMode(true)

      expect(store.experimentalMode).toBe(true)
    })

    it('persists to localStorage', () => {
      const store = usePluginStore()

      store.setExperimentalMode(true)

      expect(localStorage.getItem('plugin-experimental-mode')).toBe('true')
    })

    it('sets localStorage to false when disabling', () => {
      const store = usePluginStore()

      store.setExperimentalMode(false)

      expect(localStorage.getItem('plugin-experimental-mode')).toBe('false')
    })
  })

  // ── getRegistries / getMenuItems / etc ───────────────────────────────────

  describe('registry accessors', () => {
    it('getRegistries delegates to pluginManager', () => {
      const store = usePluginStore()
      const registries = store.getRegistries()

      expect(registries).toBeDefined()
      expect(registries.menuItem.getAll()).toEqual([])
    })

    it('getMenuItems returns menu items from registry', () => {
      const store = usePluginStore()
      const items = store.getMenuItems()

      expect(Array.isArray(items)).toBe(true)
    })

    it('getSidebarPanels returns panels from registry', () => {
      const store = usePluginStore()
      const panels = store.getSidebarPanels()

      expect(Array.isArray(panels)).toBe(true)
    })

    it('getToolbarButtons returns buttons from registry', () => {
      const store = usePluginStore()
      const buttons = store.getToolbarButtons()

      expect(Array.isArray(buttons)).toBe(true)
    })

    it('getQuickCommands returns commands from registry', () => {
      const store = usePluginStore()
      const commands = store.getQuickCommands()

      expect(Array.isArray(commands)).toBe(true)
    })
  })

  // ── loadInstalledPlugins ─────────────────────────────────────────────────

  describe('loadInstalledPlugins', () => {
    it('sets loading state during load', async () => {
      const { PluginStorage } = await import('@/plugins/storage')
      let loadingDuringLoad = false
      ;(PluginStorage.loadInstalledPlugins as any).mockImplementation(async () => {
        loadingDuringLoad = true
        return []
      })

      const store = usePluginStore()
      await store.loadInstalledPlugins()

      expect(loadingDuringLoad).toBe(true)
      expect(store.loading).toBe(false)
    })

    it('sets error on failure', async () => {
      const { PluginStorage } = await import('@/plugins/storage')
      ;(PluginStorage.loadInstalledPlugins as any).mockRejectedValue(new Error('Load failed'))

      const store = usePluginStore()
      await store.loadInstalledPlugins()

      expect(store.error).toBe('Load failed')
      expect(store.loading).toBe(false)
    })
  })

  // ── clearAllPlugins ──────────────────────────────────────────────────────

  describe('clearAllPlugins', () => {
    it('clears all plugin state', async () => {
      pluginManagerMock.deactivatePlugin.mockResolvedValue(undefined)
      const store = usePluginStore()
      store.plugins = [{ id: 'p1', name: 'Plugin', version: '1.0.0' }] as any[]
      store.activePlugins = ['p1']
      store.pluginSettings = { p1: {} }

      await store.clearAllPlugins()

      expect(store.plugins).toEqual([])
      expect(store.activePlugins).toEqual([])
      expect(store.pluginSettings).toEqual({})
    })
  })

  // ── $reset ───────────────────────────────────────────────────────────────

  describe('$reset', () => {
    it('resets all state to defaults', () => {
      const store = usePluginStore()
      store.plugins = [{ id: 'p1', name: 'Plugin', version: '1.0.0' }] as any[]
      store.activePlugins = ['p1']
      store.pluginSettings = { p1: {} }
      store.loading = true
      store.error = 'error'
      store.experimentalMode = true

      store.$reset()

      expect(store.plugins).toEqual([])
      expect(store.activePlugins).toEqual([])
      expect(store.pluginSettings).toEqual({})
      expect(store.loading).toBe(false)
      expect(store.error).toBeNull()
      expect(store.experimentalMode).toBe(false)
    })
  })
})
