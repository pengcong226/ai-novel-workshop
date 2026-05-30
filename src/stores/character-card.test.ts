import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCharacterCardStore } from './character-card'

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}))

vi.mock('@/utils/generateId', () => ({
  generateId: vi.fn(() => `gen-id-${++idCounter}`),
}))

vi.mock('@/services/character-card-importer', () => ({
  createCharacterCardImporter: () => ({
    importCharacterCard: vi.fn(),
    importFromPNG: vi.fn(),
  }),
}))

vi.mock('@/services/character-card-exporter', () => ({
  createCharacterCardExporter: () => ({
    exportCharacterCard: vi.fn(),
    downloadCharacterCard: vi.fn(),
  }),
}))

vi.mock('@/stores/sandbox', () => ({
  useSandboxStore: () => ({
    entities: [],
    activeEntitiesState: {},
    loreEntities: [],
    addEntity: vi.fn(),
    addStateEvent: vi.fn(),
  }),
}))

vi.mock('uuid', () => ({
  v4: vi.fn(() => `mock-uuid-${++uuidCounter}`),
}))

let idCounter = 0
let uuidCounter = 0

describe('character-card store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    idCounter = 0
    uuidCounter = 0
  })

  // ── Initial state ────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts with empty character and default AI settings', () => {
      const store = useCharacterCardStore()

      expect(store.character).toEqual({})
      expect(store.aiSettings.temperature).toBe(1)
      expect(store.aiSettings.frequency_penalty).toBe(0)
      expect(store.aiSettings.top_p).toBe(0.9)
      expect(store.prompts).toEqual([])
      expect(store.regexScripts).toEqual([])
      expect(store.worldbookEntries).toEqual([])
      expect(store.loading).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  // ── characterName computed ───────────────────────────────────────────────

  describe('characterName computed', () => {
    it('returns character.name when set', () => {
      const store = useCharacterCardStore()
      store.character = { name: 'Alice' }

      expect(store.characterName).toBe('Alice')
    })

    it('falls back to character.data.name', () => {
      const store = useCharacterCardStore()
      store.character = { data: { name: 'Bob' } }

      expect(store.characterName).toBe('Bob')
    })

    it('returns "Unknown" when neither is set', () => {
      const store = useCharacterCardStore()

      expect(store.characterName).toBe('Unknown')
    })
  })

  // ── Worldbook computed properties ────────────────────────────────────────

  describe('worldbook computed properties', () => {
    it('worldbookCount returns total entries', () => {
      const store = useCharacterCardStore()
      store.worldbookEntries = [
        { uid: 1, key: [], keysecondary: [], content: 'a', disable: false, constant: false, selective: false, order: 0, position: 0, depth: 4 },
        { uid: 2, key: [], keysecondary: [], content: 'b', disable: true, constant: false, selective: false, order: 0, position: 0, depth: 4 },
        { uid: 3, key: [], keysecondary: [], content: 'c', disable: false, constant: true, selective: false, order: 0, position: 0, depth: 4 },
      ]

      expect(store.worldbookCount).toBe(3)
    })

    it('enabledWorldbookCount excludes disabled entries', () => {
      const store = useCharacterCardStore()
      store.worldbookEntries = [
        { uid: 1, key: [], keysecondary: [], content: 'a', disable: false, constant: false, selective: false, order: 0, position: 0, depth: 4 },
        { uid: 2, key: [], keysecondary: [], content: 'b', disable: true, constant: false, selective: false, order: 0, position: 0, depth: 4 },
      ]

      expect(store.enabledWorldbookCount).toBe(1)
    })

    it('constantWorldbookCount counts only constant entries', () => {
      const store = useCharacterCardStore()
      store.worldbookEntries = [
        { uid: 1, key: [], keysecondary: [], content: 'a', disable: false, constant: true, selective: false, order: 0, position: 0, depth: 4 },
        { uid: 2, key: [], keysecondary: [], content: 'b', disable: false, constant: false, selective: false, order: 0, position: 0, depth: 4 },
        { uid: 3, key: [], keysecondary: [], content: 'c', disable: false, constant: true, selective: false, order: 0, position: 0, depth: 4 },
      ]

      expect(store.constantWorldbookCount).toBe(2)
    })
  })

  // ── Regex script computed properties ─────────────────────────────────────

  describe('regex script computed properties', () => {
    it('regexScriptCount and enabledRegexScriptCount work correctly', () => {
      const store = useCharacterCardStore()
      store.regexScripts = [
        { id: 'r1', scriptName: 'Script 1', disabled: false, runOnEdit: false, findRegex: '', trimStrings: [], replaceString: '', placement: [2], substituteRegex: 0, minDepth: null, maxDepth: null, markdownOnly: false, promptOnly: false },
        { id: 'r2', scriptName: 'Script 2', disabled: true, runOnEdit: false, findRegex: '', trimStrings: [], replaceString: '', placement: [2], substituteRegex: 0, minDepth: null, maxDepth: null, markdownOnly: false, promptOnly: false },
      ]

      expect(store.regexScriptCount).toBe(2)
      expect(store.enabledRegexScriptCount).toBe(1)
    })
  })

  // ── Prompt computed properties ───────────────────────────────────────────

  describe('prompt computed properties', () => {
    it('promptCount and enabledPromptCount work correctly', () => {
      const store = useCharacterCardStore()
      store.prompts = [
        { identifier: 'p1', name: 'Prompt 1', enabled: true, content: 'hello' },
        { identifier: 'p2', name: 'Prompt 2', enabled: false, content: 'world' },
        { identifier: 'p3', name: 'Prompt 3', content: 'default' }, // enabled defaults to true
      ]

      expect(store.promptCount).toBe(3)
      expect(store.enabledPromptCount).toBe(2) // p1 and p3 (p3 has no explicit false)
    })
  })

  // ── updateCharacter ──────────────────────────────────────────────────────

  describe('updateCharacter', () => {
    it('merges updates into existing character', () => {
      const store = useCharacterCardStore()
      store.character = { name: 'Alice', description: 'Original' }

      store.updateCharacter({ personality: 'Brave' })

      expect(store.character.name).toBe('Alice')
      expect(store.character.description).toBe('Original')
      expect(store.character.personality).toBe('Brave')
    })
  })

  // ── updateAISettings ─────────────────────────────────────────────────────

  describe('updateAISettings', () => {
    it('merges partial updates into AI settings', () => {
      const store = useCharacterCardStore()
      const original = { ...store.aiSettings }

      store.updateAISettings({ temperature: 0.5, top_p: 1.0 })

      expect(store.aiSettings.temperature).toBe(0.5)
      expect(store.aiSettings.top_p).toBe(1.0)
      // Unchanged fields preserved
      expect(store.aiSettings.frequency_penalty).toBe(original.frequency_penalty)
    })
  })

  // ── addWorldbookEntry ────────────────────────────────────────────────────

  describe('addWorldbookEntry', () => {
    it('adds an entry with auto-incremented uid', () => {
      const store = useCharacterCardStore()

      store.addWorldbookEntry({ content: 'First', comment: 'Entry 1' })
      store.addWorldbookEntry({ content: 'Second', comment: 'Entry 2' })

      expect(store.worldbookEntries).toHaveLength(2)
      expect(store.worldbookEntries[0].uid).toBe(1)
      expect(store.worldbookEntries[1].uid).toBe(2)
    })

    it('uses defaults for missing fields', () => {
      const store = useCharacterCardStore()

      store.addWorldbookEntry({})

      const entry = store.worldbookEntries[0]
      expect(entry.key).toEqual([])
      expect(entry.keysecondary).toEqual([])
      expect(entry.content).toBe('')
      expect(entry.constant).toBe(false)
      expect(entry.disable).toBe(false)
      expect(entry.selective).toBe(false)
      expect(entry.depth).toBe(4)
    })

    it('preserves provided fields', () => {
      const store = useCharacterCardStore()

      store.addWorldbookEntry({
        key: ['hello', 'world'],
        content: 'content',
        constant: true,
        disable: true,
        comment: 'My comment',
      })

      const entry = store.worldbookEntries[0]
      expect(entry.key).toEqual(['hello', 'world'])
      expect(entry.content).toBe('content')
      expect(entry.constant).toBe(true)
      expect(entry.disable).toBe(true)
      expect(entry.comment).toBe('My comment')
    })
  })

  // ── updateWorldbookEntry ─────────────────────────────────────────────────

  describe('updateWorldbookEntry', () => {
    it('updates an entry by uid', () => {
      const store = useCharacterCardStore()
      store.addWorldbookEntry({ content: 'Original' })

      // uid is auto-incremented to 1
      const uid = store.worldbookEntries[0].uid
      store.updateWorldbookEntry(uid, { content: 'Updated', comment: 'Changed' })

      expect(store.worldbookEntries[0].content).toBe('Updated')
      expect(store.worldbookEntries[0].comment).toBe('Changed')
    })

    it('is a no-op for non-existent uid', () => {
      const store = useCharacterCardStore()
      store.addWorldbookEntry({ content: 'Real' })

      store.updateWorldbookEntry(999, { content: 'Ghost' })

      expect(store.worldbookEntries[0].content).toBe('Real')
    })
  })

  // ── deleteWorldbookEntry ─────────────────────────────────────────────────

  describe('deleteWorldbookEntry', () => {
    it('removes entry by uid', () => {
      const store = useCharacterCardStore()
      store.addWorldbookEntry({ content: 'Keep' })
      store.addWorldbookEntry({ content: 'Remove' })

      const uidToRemove = store.worldbookEntries[1].uid
      store.deleteWorldbookEntry(uidToRemove)

      expect(store.worldbookEntries).toHaveLength(1)
      expect(store.worldbookEntries[0].content).toBe('Keep')
    })

    it('is a no-op for non-existent uid', () => {
      const store = useCharacterCardStore()
      store.addWorldbookEntry({ content: 'Content' })

      store.deleteWorldbookEntry(999)

      expect(store.worldbookEntries).toHaveLength(1)
    })
  })

  // ── Regex script CRUD ────────────────────────────────────────────────────

  describe('regex script CRUD', () => {
    it('addRegexScript creates a script with defaults', () => {
      const store = useCharacterCardStore()

      store.addRegexScript({})

      expect(store.regexScripts).toHaveLength(1)
      expect(store.regexScripts[0].id).toBe('gen-id-1')
      expect(store.regexScripts[0].scriptName).toBe('新脚本')
      expect(store.regexScripts[0].disabled).toBe(false)
      expect(store.regexScripts[0].findRegex).toBe('')
    })

    it('addRegexScript preserves provided fields', () => {
      const store = useCharacterCardStore()

      store.addRegexScript({
        id: 'custom-id',
        scriptName: 'Custom Script',
        findRegex: '/pattern/g',
        disabled: true,
      })

      expect(store.regexScripts[0].id).toBe('custom-id')
      expect(store.regexScripts[0].scriptName).toBe('Custom Script')
      expect(store.regexScripts[0].findRegex).toBe('/pattern/g')
      expect(store.regexScripts[0].disabled).toBe(true)
    })

    it('updateRegexScript merges updates by ID', () => {
      const store = useCharacterCardStore()
      store.addRegexScript({ id: 'r1', scriptName: 'Original' })

      store.updateRegexScript('r1', { scriptName: 'Updated', findRegex: '/new/g' })

      expect(store.regexScripts[0].scriptName).toBe('Updated')
      expect(store.regexScripts[0].findRegex).toBe('/new/g')
    })

    it('updateRegexScript is a no-op for non-existent ID', () => {
      const store = useCharacterCardStore()
      store.addRegexScript({ id: 'r1', scriptName: 'Original' })

      store.updateRegexScript('nonexistent', { scriptName: 'Ghost' })

      expect(store.regexScripts[0].scriptName).toBe('Original')
    })

    it('deleteRegexScript removes script by ID', () => {
      const store = useCharacterCardStore()
      store.addRegexScript({ id: 'r1', scriptName: 'Keep' })
      store.addRegexScript({ id: 'r2', scriptName: 'Remove' })

      store.deleteRegexScript('r2')

      expect(store.regexScripts).toHaveLength(1)
      expect(store.regexScripts[0].scriptName).toBe('Keep')
    })

    it('deleteRegexScript is a no-op for non-existent ID', () => {
      const store = useCharacterCardStore()
      store.addRegexScript({ id: 'r1' })

      store.deleteRegexScript('nonexistent')

      expect(store.regexScripts).toHaveLength(1)
    })
  })

  // ── clear ────────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('resets all data to defaults', () => {
      const store = useCharacterCardStore()
      store.updateCharacter({ name: 'Alice' })
      store.updateAISettings({ temperature: 0.5 })
      store.addWorldbookEntry({ content: 'entry' })
      store.addRegexScript({ scriptName: 'script' })

      store.clear()

      expect(store.character).toEqual({})
      expect(store.aiSettings.temperature).toBe(1)
      expect(store.worldbookEntries).toEqual([])
      expect(store.regexScripts).toEqual([])
      expect(store.prompts).toEqual([])
    })
  })

  // ── $reset ───────────────────────────────────────────────────────────────

  describe('$reset', () => {
    it('resets all state including loading and error', () => {
      const store = useCharacterCardStore()
      store.updateCharacter({ name: 'Alice' })
      store.loading = true
      store.error = 'some error'
      store.bridgeError = 'bridge error'
      store.projectId = 'proj-1'

      store.$reset()

      expect(store.character).toEqual({})
      expect(store.loading).toBe(false)
      expect(store.error).toBeNull()
      expect(store.bridgeError).toBeNull()
      expect(store.projectId).toBeNull()
    })
  })
})
