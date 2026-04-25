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
    '--el-bg-color': '#ffffff',
    '--el-bg-color-overlay': '#ffffff',
    '--el-bg-color-page': '#f5f7fa',
    '--el-text-color-primary': '#303133',
    '--el-text-color-regular': '#606266',
    '--el-text-color-secondary': '#909399',
    '--el-text-color-placeholder': '#c0c4cc',
    '--el-border-color': '#dcdfe6',
    '--el-border-color-light': '#e4e7ed',
    '--el-border-color-lighter': '#ebeef5',
    '--el-fill-color': '#f0f2f5',
    '--el-fill-color-light': '#f5f7fa',
    '--el-fill-color-lighter': '#fafafa',
    '--el-fill-color-blank': '#ffffff',
    '--el-color-primary': '#409eff',
    '--el-color-primary-light-3': '#79bbff',
    '--el-color-primary-light-5': '#a0cfff',
    '--el-color-primary-dark-2': '#337ecc'
  }
}

export function activate(context: PluginContext): void {
  context.register.theme(theme)
}
