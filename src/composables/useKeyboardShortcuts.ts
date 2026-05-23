import { computed, onMounted, onUnmounted, shallowRef } from 'vue'
import { getLogger } from '@/utils/logger'

export type ShortcutScope = 'global' | 'workspace' | 'chapter-editor'

export interface KeyboardShortcut {
  id: string
  label: string
  keys: string[]
  scope: ShortcutScope
  description?: string
  allowInInputs?: boolean
  preventDefault?: boolean
  stopPropagation?: boolean
  repeatable?: boolean
  disabled?: () => boolean
  when?: () => boolean
  handler: (event: KeyboardEvent) => void | Promise<void>
}

interface RegisteredShortcut extends KeyboardShortcut {
  ownerId: symbol
}

const shortcuts = shallowRef<RegisteredShortcut[]>([])
const logger = getLogger('keyboard-shortcuts')
let listenerCount = 0

function normalizeKey(key: string): string {
  const normalized = key.trim().toLowerCase()
  if (normalized === 'cmd' || normalized === 'command' || normalized === 'meta') return 'meta'
  if (normalized === 'control') return 'ctrl'
  if (normalized === 'option') return 'alt'
  if (normalized === 'esc') return 'escape'
  if (normalized === 'space') return ' '
  return normalized
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return target.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select'
}

function matchesShortcut(event: KeyboardEvent, keys: string[]): boolean {
  const keySet = new Set(keys.map(normalizeKey))
  const expectsMod = keySet.has('mod')
  const expectedCtrl = keySet.has('ctrl') || (expectsMod && !isMacPlatform())
  const expectedMeta = keySet.has('meta') || (expectsMod && isMacPlatform())
  const expectedAlt = keySet.has('alt')
  const expectedShift = keySet.has('shift')

  if (event.ctrlKey !== expectedCtrl) return false
  if (event.metaKey !== expectedMeta) return false

  if (event.altKey !== expectedAlt) return false
  if (event.shiftKey !== expectedShift) return false

  const mainKey = keys
    .map(normalizeKey)
    .find(key => !['mod', 'ctrl', 'meta', 'alt', 'shift'].includes(key))

  return mainKey ? normalizeKey(event.key) === mainKey : false
}

function isBlockingDialogOpen(): boolean {
  return Boolean(document.querySelector('.el-overlay:not([style*="display: none"])'))
}

function handleKeydown(event: KeyboardEvent) {
  const dialogOpen = isBlockingDialogOpen()
  for (const shortcut of [...shortcuts.value].reverse()) {
    if (dialogOpen && shortcut.scope !== 'chapter-editor' && shortcut.id !== 'workspace.shortcuts') continue
    if (!shortcut.allowInInputs && isEditableTarget(event.target)) continue
    if (shortcut.when && !shortcut.when()) continue
    if (!matchesShortcut(event, shortcut.keys)) continue

    if (shortcut.preventDefault !== false) event.preventDefault()
    if (shortcut.stopPropagation) event.stopPropagation()
    if (event.repeat && shortcut.repeatable !== true) return
    if (shortcut.disabled?.()) return
    void (async () => {
      await shortcut.handler(event)
    })().catch(error => {
      logger.error('快捷键执行失败', { shortcutId: shortcut.id, error })
    })
    return
  }
}

function installListener() {
  if (listenerCount === 0) {
    window.addEventListener('keydown', handleKeydown)
  }
  listenerCount += 1
}

function uninstallListener() {
  listenerCount = Math.max(0, listenerCount - 1)
  if (listenerCount === 0) {
    window.removeEventListener('keydown', handleKeydown)
  }
}

function isMacPlatform(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  const platform = nav.userAgentData?.platform || navigator.userAgent
  return platform.toLowerCase().includes('mac')
}

export function formatShortcut(keys: string[]): string {
  return keys.map(key => {
    const normalized = normalizeKey(key)
    if (normalized === 'mod') return isMacPlatform() ? '⌘' : 'Ctrl'
    if (normalized === 'ctrl') return 'Ctrl'
    if (normalized === 'meta') return '⌘'
    if (normalized === 'alt') return 'Alt'
    if (normalized === 'shift') return 'Shift'
    if (normalized === 'escape') return 'Esc'
    if (normalized === ' ') return 'Space'
    return key.length === 1 ? key.toUpperCase() : key
  }).join(' + ')
}

export function useKeyboardShortcuts() {
  const ownerId = Symbol('keyboard-shortcuts-owner')

  onMounted(installListener)
  onUnmounted(() => {
    shortcuts.value = shortcuts.value.filter(shortcut => shortcut.ownerId !== ownerId)
    uninstallListener()
  })

  function registerShortcuts(items: KeyboardShortcut[]) {
    shortcuts.value = [
      ...shortcuts.value.filter(shortcut => shortcut.ownerId !== ownerId),
      ...items.map(item => ({ ...item, ownerId })),
    ]
  }

  return {
    shortcuts: computed(() => shortcuts.value),
    registerShortcuts,
    formatShortcut,
  }
}
