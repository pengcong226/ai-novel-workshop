/**
 * Centralized keyboard shortcut definitions.
 *
 * Platform-aware: uses `mod` which resolves to Cmd on macOS and Ctrl on
 * Windows/Linux. Consumers should call `formatShortcut()` from
 * `useKeyboardShortcuts` to render human-readable labels.
 */

import type { KeyboardShortcut, ShortcutScope } from '@/composables/useKeyboardShortcuts'

// ---------------------------------------------------------------------------
// Helper: build a shortcut id from scope + action
// ---------------------------------------------------------------------------
function sid(scope: ShortcutScope, action: string): string {
  return `${scope}.${action}`
}

// ---------------------------------------------------------------------------
// Platform detection (shared with composable, kept lightweight)
// ---------------------------------------------------------------------------
function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  const platform = nav.userAgentData?.platform || navigator.userAgent
  return platform.toLowerCase().includes('mac')
}

/**
 * Return the platform modifier key label (Cmd symbol on Mac, Ctrl elsewhere).
 * Useful for tooltips and menu labels that need a static string.
 */
export function platformModifierLabel(): string {
  return isMacPlatform() ? '⌘' : 'Ctrl'
}

// ---------------------------------------------------------------------------
// Shortcut definitions grouped by scope
// ---------------------------------------------------------------------------

// --- Global shortcuts (work everywhere) ---
export const GLOBAL_SHORTCUTS = {
  help: {
    id: sid('global', 'help'),
    label: '快捷键帮助',
    description: '查看所有可用快捷键',
    keys: ['mod', '/'] as string[],
    scope: 'global' as ShortcutScope,
    allowInInputs: true,
  },
  helpQuestionMark: {
    id: sid('global', 'help-question'),
    label: '快捷键帮助',
    description: '查看所有可用快捷键（仅非输入状态）',
    keys: ['?'] as string[],
    scope: 'global' as ShortcutScope,
    allowInInputs: false,
  },
  openMutator: {
    id: sid('global', 'open-mutator'),
    label: '全局替换器',
    description: '打开全局查找替换',
    keys: ['ctrl', 'shift', 'h'] as string[],
    scope: 'global' as ShortcutScope,
  },
} as const satisfies Record<string, Partial<KeyboardShortcut> & { id: string; keys: string[]; scope: ShortcutScope }>

// --- Workspace shortcuts (project editor) ---
export const WORKSPACE_SHORTCUTS = {
  save: {
    id: sid('workspace', 'save'),
    label: '保存项目',
    description: '保存当前项目',
    keys: ['mod', 's'] as string[],
    scope: 'workspace' as ShortcutScope,
    allowInInputs: true,
  },
  search: {
    id: sid('workspace', 'search'),
    label: '全局搜索',
    description: '打开全局搜索对话框',
    keys: ['mod', 'k'] as string[],
    scope: 'workspace' as ShortcutScope,
  },
  shortcuts: {
    id: sid('workspace', 'shortcuts'),
    label: '查看快捷键',
    description: '打开快捷键帮助对话框',
    keys: ['mod', '/'] as string[],
    scope: 'workspace' as ShortcutScope,
    allowInInputs: true,
  },
  toggleZen: {
    id: sid('workspace', 'toggle-zen'),
    label: '沉浸专注模式',
    description: '切换沉浸写作模式',
    keys: ['mod', 'shift', 'z'] as string[],
    scope: 'workspace' as ShortcutScope,
  },
  openDashboard: {
    id: sid('workspace', 'open-dashboard'),
    label: '写作仪表盘',
    description: '切换到写作仪表盘面板',
    keys: ['alt', '1'] as string[],
    scope: 'workspace' as ShortcutScope,
  },
  openSandbox: {
    id: sid('workspace', 'open-sandbox'),
    label: '设定沙盘',
    description: '切换到多维设定沙盘面板',
    keys: ['alt', '2'] as string[],
    scope: 'workspace' as ShortcutScope,
  },
  openChapters: {
    id: sid('workspace', 'open-chapters'),
    label: '章节管理',
    description: '切换到章节管理面板',
    keys: ['alt', '3'] as string[],
    scope: 'workspace' as ShortcutScope,
  },
  openSummary: {
    id: sid('workspace', 'open-summary'),
    label: '摘要管理',
    description: '切换到摘要管理面板',
    keys: ['alt', '4'] as string[],
    scope: 'workspace' as ShortcutScope,
  },
  openQuality: {
    id: sid('workspace', 'open-quality'),
    label: '质量报告',
    description: '切换到质量报告面板',
    keys: ['alt', '5'] as string[],
    scope: 'workspace' as ShortcutScope,
  },
  openTokenUsage: {
    id: sid('workspace', 'open-token-usage'),
    label: 'Token 用量',
    description: '切换到 Token 用量面板',
    keys: ['alt', '6'] as string[],
    scope: 'workspace' as ShortcutScope,
  },
  openConfig: {
    id: sid('workspace', 'open-config'),
    label: '配置',
    description: '切换到配置面板',
    keys: ['alt', '7'] as string[],
    scope: 'workspace' as ShortcutScope,
  },
} as const satisfies Record<string, Partial<KeyboardShortcut> & { id: string; keys: string[]; scope: ShortcutScope }>

// --- Chapter editor shortcuts ---
export const CHAPTER_EDITOR_SHORTCUTS = {
  save: {
    id: sid('chapter-editor', 'save'),
    label: '保存章节',
    description: '保存当前编辑的章节',
    keys: ['mod', 's'] as string[],
    scope: 'chapter-editor' as ShortcutScope,
    allowInInputs: true,
  },
  generate: {
    id: sid('chapter-editor', 'generate'),
    label: 'AI 连载生成',
    description: '触发 AI 生成章节内容',
    keys: ['mod', 'enter'] as string[],
    scope: 'chapter-editor' as ShortcutScope,
    allowInInputs: true,
  },
  find: {
    id: sid('chapter-editor', 'find'),
    label: '查找替换',
    description: '打开查找替换面板',
    keys: ['mod', 'f'] as string[],
    scope: 'chapter-editor' as ShortcutScope,
    allowInInputs: true,
  },
  findAlt: {
    id: sid('chapter-editor', 'find-alt'),
    label: '查找替换（备选）',
    description: '打开查找替换面板',
    keys: ['mod', 'h'] as string[],
    scope: 'chapter-editor' as ShortcutScope,
    allowInInputs: true,
  },
  review: {
    id: sid('chapter-editor', 'review'),
    label: '运行审校',
    description: '运行 AI 审校并显示审校面板',
    keys: ['mod', 'shift', 'r'] as string[],
    scope: 'chapter-editor' as ShortcutScope,
    allowInInputs: true,
  },
  quality: {
    id: sid('chapter-editor', 'quality'),
    label: '防吃书预警',
    description: '运行质量一致性检查',
    keys: ['mod', 'shift', 'q'] as string[],
    scope: 'chapter-editor' as ShortcutScope,
    allowInInputs: true,
  },
  close: {
    id: sid('chapter-editor', 'close'),
    label: '关闭编辑器',
    description: '关闭章节编辑器',
    keys: ['escape'] as string[],
    scope: 'chapter-editor' as ShortcutScope,
    allowInInputs: false,
  },
} as const satisfies Record<string, Partial<KeyboardShortcut> & { id: string; keys: string[]; scope: ShortcutScope }>

// ---------------------------------------------------------------------------
// Aggregate: all shortcuts for the help dialog
// ---------------------------------------------------------------------------

export type ShortcutGroupKey = 'global' | 'workspace' | 'chapter-editor'

/**
 * Return all defined shortcuts grouped by scope. Used by the help dialog.
 * Each item is a partial KeyboardShortcut (no `handler` -- display-only).
 */
export function getAllShortcutDefinitions(): Array<{
  id: string
  label: string
  description?: string
  keys: string[]
  scope: ShortcutScope
}> {
  return [
    ...Object.values(GLOBAL_SHORTCUTS),
    ...Object.values(WORKSPACE_SHORTCUTS),
    ...Object.values(CHAPTER_EDITOR_SHORTCUTS),
  ]
}
