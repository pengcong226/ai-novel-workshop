import type { PluginManifest, PluginContext, ThemeExtension } from '../types'

export const manifest: PluginManifest = {
  id: 'builtin-classic-light-theme',
  name: '经典明亮',
  version: '1.0.0',
  description: '经典浅色主题',
  author: 'AI小说工坊'
}

const theme: ThemeExtension = {
  id: 'builtin-classic-light-theme',
  name: '经典明亮',
  mode: 'light',
  cssVariables: {
    '--ds-bg-primary': '#ffffff',
    '--ds-bg-secondary': '#f8f9fa',
    '--ds-bg-tertiary': '#f0f1f3',
    '--ds-bg-elevated': '#ffffff',
    '--ds-bg-hover': 'rgba(0, 0, 0, 0.03)',
    '--ds-bg-active': 'rgba(0, 0, 0, 0.06)',
    '--ds-surface': '#ffffff',
    '--ds-surface-hover': '#f5f5f7',
    '--ds-surface-border': 'rgba(0, 0, 0, 0.08)',
    '--ds-text-primary': '#1a1a2e',
    '--ds-text-secondary': '#6b7280',
    '--ds-text-tertiary': '#9ca3af',
    '--ds-text-inverse': '#ffffff',
    '--ds-accent': '#6c5ce7',
    '--ds-accent-hover': '#7c6df7',
    '--ds-accent-subtle': 'rgba(108, 92, 231, 0.08)',
    '--ds-accent-text': '#6c5ce7',
    '--ds-glass-bg': 'rgba(255, 255, 255, 0.8)',
    '--ds-glass-border': 'rgba(0, 0, 0, 0.06)',
    '--el-bg-color': '#f8f9fa',
    '--el-bg-color-overlay': '#ffffff',
    '--el-bg-color-page': '#ffffff',
    '--el-text-color-primary': '#1a1a2e',
    '--el-text-color-regular': '#6b7280',
    '--el-text-color-secondary': '#9ca3af',
    '--el-text-color-placeholder': '#9ca3af',
    '--el-border-color': 'rgba(0, 0, 0, 0.08)',
    '--el-border-color-light': 'rgba(0, 0, 0, 0.06)',
    '--el-border-color-lighter': 'rgba(0, 0, 0, 0.04)',
    '--el-fill-color': '#f0f1f3',
    '--el-fill-color-light': '#f8f9fa',
    '--el-fill-color-lighter': '#ffffff',
    '--el-fill-color-blank': '#ffffff',
    '--el-color-primary': '#6c5ce7',
    '--el-color-primary-light-3': '#7c6df7',
    '--el-color-primary-light-5': '#a79ff5',
    '--el-color-primary-light-7': 'rgba(108, 92, 231, 0.28)',
    '--el-color-primary-light-9': 'rgba(108, 92, 231, 0.08)',
    '--el-color-primary-dark-2': '#5b4bd6'
  }
}

export function activate(context: PluginContext): void {
  context.register.theme(theme)
}
