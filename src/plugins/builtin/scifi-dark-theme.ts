import type { PluginManifest, PluginContext, ThemeExtension } from '../types'

export const manifest: PluginManifest = {
  id: 'builtin-scifi-dark-theme',
  name: '赛博暗夜',
  version: '1.0.0',
  description: '赛博朋克风格暗色主题',
  author: 'AI小说工坊'
}

const theme: ThemeExtension = {
  id: 'builtin-scifi-dark-theme',
  name: '赛博暗夜',
  mode: 'dark',
  cssVariables: {
    '--ds-bg-primary': '#0a0a0f',
    '--ds-bg-secondary': '#12121a',
    '--ds-bg-tertiary': '#1a1a26',
    '--ds-bg-elevated': '#1e1e2e',
    '--ds-bg-hover': 'rgba(255, 255, 255, 0.04)',
    '--ds-bg-active': 'rgba(255, 255, 255, 0.08)',
    '--ds-surface': '#16161f',
    '--ds-surface-hover': '#1c1c28',
    '--ds-surface-border': 'rgba(255, 255, 255, 0.06)',
    '--ds-text-primary': '#ececf1',
    '--ds-text-secondary': '#8e8ea0',
    '--ds-text-tertiary': '#565869',
    '--ds-text-inverse': '#0a0a0f',
    '--ds-accent': '#6c5ce7',
    '--ds-accent-hover': '#7c6df7',
    '--ds-accent-subtle': 'rgba(108, 92, 231, 0.12)',
    '--ds-accent-text': '#a78bfa',
    '--ds-glass-bg': 'rgba(22, 22, 31, 0.75)',
    '--ds-glass-border': 'rgba(255, 255, 255, 0.08)',
    '--el-bg-color': '#12121a',
    '--el-bg-color-overlay': '#1e1e2e',
    '--el-bg-color-page': '#0a0a0f',
    '--el-text-color-primary': '#ececf1',
    '--el-text-color-regular': '#8e8ea0',
    '--el-text-color-secondary': '#565869',
    '--el-text-color-placeholder': '#565869',
    '--el-border-color': 'rgba(255, 255, 255, 0.06)',
    '--el-border-color-light': 'rgba(255, 255, 255, 0.08)',
    '--el-border-color-lighter': 'rgba(255, 255, 255, 0.1)',
    '--el-fill-color': '#1a1a26',
    '--el-fill-color-light': '#12121a',
    '--el-fill-color-lighter': 'rgba(255, 255, 255, 0.04)',
    '--el-fill-color-blank': '#0a0a0f',
    '--el-color-primary': '#6c5ce7',
    '--el-color-primary-light-3': '#7c6df7',
    '--el-color-primary-light-5': '#a79ff5',
    '--el-color-primary-light-7': 'rgba(108, 92, 231, 0.28)',
    '--el-color-primary-light-9': 'rgba(108, 92, 231, 0.12)',
    '--el-color-primary-dark-2': '#5b4bd6'
  }
}

export function activate(context: PluginContext): void {
  context.register.theme(theme)
}
