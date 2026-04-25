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
    '--el-bg-color': '#1a1a2e',
    '--el-bg-color-overlay': '#16213e',
    '--el-bg-color-page': '#0f0f23',
    '--el-text-color-primary': '#e0e0e0',
    '--el-text-color-regular': '#c0c0c0',
    '--el-text-color-secondary': '#a0a0a0',
    '--el-text-color-placeholder': '#6c6c6c',
    '--el-border-color': '#2d2d44',
    '--el-border-color-light': '#3d3d54',
    '--el-border-color-lighter': '#4d4d64',
    '--el-fill-color': '#2d2d44',
    '--el-fill-color-light': '#222238',
    '--el-fill-color-lighter': '#1e1e34',
    '--el-fill-color-blank': '#1a1a2e',
    '--el-color-primary': '#409eff',
    '--el-color-primary-light-3': '#3375b9',
    '--el-color-primary-light-5': '#264d7a',
    '--el-color-primary-dark-2': '#66b1ff'
  }
}

export function activate(context: PluginContext): void {
  context.register.theme(theme)
}
