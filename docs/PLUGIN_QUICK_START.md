# AI小说工坊 - 插件系统快速启动指南

## 🚀 5分钟快速上手

### 第一步：了解插件系统

插件系统位于以下目录：

```
src/plugins/          # 插件系统核心
├── types.ts         # 类型定义
├── context.ts       # 插件上下文API
├── manager.ts       # 插件管理器
├── storage.ts       # 存储管理
├── registries/      # 各类注册表
├── builtin/         # 内置插件
└── examples/        # 示例插件
```

### 第二步：使用内置插件

内置插件已自动加载，无需安装：

#### 使用OpenAI Provider
```typescript
// 在AIService配置中
import { openAIProviderContribution } from '@/plugins/builtin/openai-provider'

// Provider已自动注册到注册表
const providerRegistry = pluginStore.getRegistries().aiProvider
const openAI = providerRegistry.get('openai-provider')
```

#### 使用Anthropic Provider
```typescript
import { anthropicProviderContribution } from '@/plugins/builtin/anthropic-provider'

// 同样已自动注册
const anthropic = providerRegistry.get('anthropic-provider')
```

### 第三步：安装示例插件

示例插件提供了完整的实现参考：

#### 1. EPUB导出器
```bash
# 文件位置
src/plugins/examples/epub-exporter.ts
```

功能：
- 导出EPUB格式
- 支持批量导出
- 支持自定义模板

#### 2. PDF导出器
```bash
# 文件位置
src/plugins/examples/pdf-exporter.ts
```

功能：
- 导出PDF格式
- 支持元数据
- 支持图片

#### 3. 文本清洗处理器
```bash
# 文件位置
src/plugins/examples/text-cleaner.ts
```

功能：
- 文本格式清洗
- 风格转换
- 导入前处理

#### 4. 智谱GLM Provider
```bash
# 文件位置
src/plugins/examples/zhipu-provider.ts
```

功能：
- 国产大模型支持
- GLM-4, GLM-4-Air, GLM-4-Flash
- 流式输出

### 第四步：管理插件

#### 在代码中管理
```typescript
import { usePluginStore } from '@/stores/plugin'

const pluginStore = usePluginStore()

// 加载已安装插件
await pluginStore.loadInstalledPlugins()

// 查看已安装插件
const plugins = pluginStore.plugins

// 激活插件
await pluginStore.activatePlugin('my-plugin-id')

// 停用插件
await pluginStore.deactivatePlugin('my-plugin-id')

// 卸载插件
await pluginStore.uninstallPlugin('my-plugin-id')
```

#### 在UI中管理
1. 打开项目
2. 进入"配置"页面
3. 找到"插件管理"卡片
4. 点击"管理插件"

### 第五步：创建你的第一个插件

#### 最小插件示例

```typescript
// my-first-plugin.ts
import type { PluginManifest, PluginContext } from '@/plugins/types'

export const manifest: PluginManifest = {
  id: 'my-first-plugin',
  name: '我的第一个插件',
  version: '1.0.0',
  author: 'Me',
  description: '这是一个简单的示例插件',
  permissions: ['project-data'],

  contributes: {
    menuItems: [{
      id: 'my-menu-item',
      label: '我的功能',
      icon: '🎉',
      order: 100,
      handler: () => {
        alert('你好，这是我的第一个插件！')
      }
    }]
  }
}

export async function activate(context: PluginContext) {
  console.log('插件已激活')
  context.ui.showMessage('我的第一个插件已启用！', 'success')
}

export async function deactivate() {
  console.log('插件已停用')
}
```

#### 安装你的插件

```typescript
import { usePluginStore } from '@/stores/plugin'
import { manifest } from './my-first-plugin'

const pluginStore = usePluginStore()

// 安装插件
await pluginStore.installPlugin(manifest, async () => {
  // 加载插件模块
  return {
    activate,
    deactivate
  }
})

// 激活插件
await pluginStore.activatePlugin('my-first-plugin')
```

## 📚 常用API速查

### 插件上下文API

```typescript
context.project.getCurrentProject()      // 获取当前项目
context.project.saveProject()             // 保存项目
context.project.getChapters()             // 获取章节列表
context.project.getCharacters()           // 获取人物列表

context.ai.chat(messages, options)        // AI聊天
context.ai.chatStream(messages, callback) // 流式聊天
context.ai.generateText(prompt, options)  // 文本生成

context.ui.showMessage(message, type)     // 显示消息
context.ui.showDialog(options)            // 显示对话框
context.ui.showNotification(options)      // 显示通知

context.register.aiProvider(contribution)     // 注册AI Provider
context.register.exporter(contribution)       // 注册导出器
context.register.importer(contribution)       // 注册导入器
context.register.processor(contribution)      // 注册处理器
context.register.menuItem(contribution)       // 注册菜单项
context.register.sidebarPanel(contribution)   // 注册侧边栏
context.register.toolbarButton(contribution)  // 注册工具栏按钮
context.register.quickCommand(contribution)   // 注册快捷命令
```

### 插件Store API

```typescript
pluginStore.plugins                    // 所有已安装插件
pluginStore.activePlugins              // 已激活插件ID列表
pluginStore.loading                    // 加载状态
pluginStore.error                      // 错误信息

pluginStore.loadInstalledPlugins()     // 加载已安装插件
pluginStore.installPlugin(manifest, entryPoint)  // 安装插件
pluginStore.uninstallPlugin(pluginId)  // 卸载插件
pluginStore.activatePlugin(pluginId)   // 激活插件
pluginStore.deactivatePlugin(pluginId) // 停用插件
pluginStore.togglePlugin(pluginId)     // 切换激活状态

pluginStore.getPlugin(pluginId)        // 获取插件信息
pluginStore.isPluginActive(pluginId)   // 检查是否激活
pluginStore.isPluginInstalled(pluginId)// 检查是否安装

pluginStore.getMenuItems()             // 获取所有菜单项
pluginStore.getSidebarPanels()         // 获取所有侧边栏面板
pluginStore.getToolbarButtons()        // 获取所有工具栏按钮
pluginStore.getQuickCommands()         // 获取所有快捷命令
pluginStore.getRegistries()            // 获取所有注册表
```

## 🎯 扩展点速查

### 1. AI Provider
添加自定义AI提供商

```typescript
context.register.aiProvider({
  id: 'my-provider',
  name: 'My AI Service',
  type: 'ai-provider',
  config: {
    providerType: 'my-ai',
    requiresApiKey: true,
    supportsStreaming: true,
    supportedModels: []
  },
  createProvider(config) {
    return new MyProvider(config)
  }
})
```

### 2. 导出器
添加新的导出格式

```typescript
context.register.exporter({
  id: 'my-exporter',
  name: 'My Exporter',
  type: 'exporter',
  format: 'myformat',
  fileExtension: '.myf',
  mimeType: 'application/my-format',
  capabilities: { ... },
  async export(data, options) {
    return blob
  }
})
```

### 3. 处理器
注入数据处理管道

```typescript
context.register.processor({
  id: 'my-processor',
  name: 'My Processor',
  type: 'processor',
  stage: 'pre-import',
  async process(data, context) {
    return processedData
  }
})
```

### 4. 菜单项
添加自定义菜单

```typescript
context.register.menuItem({
  id: 'my-menu',
  label: '我的功能',
  icon: '🎉',
  order: 100,
  handler() {
    // 执行功能
  }
})
```

### 5. 侧边栏面板
添加自定义面板

```typescript
context.register.sidebarPanel({
  id: 'my-panel',
  title: '我的面板',
  icon: '📊',
  component: MyPanelComponent,
  position: 'right',
  width: 300
})
```

### 6. 工具栏按钮
扩展编辑器工具栏

```typescript
context.register.toolbarButton({
  id: 'my-button',
  label: '我的工具',
  icon: '🔧',
  location: 'chapter-editor',
  order: 100,
  handler(context) {
    // context包含章节信息和选中文本
  }
})
```

## 🔍 调试技巧

### 控制台命令

```javascript
// 获取插件管理器
const pluginManager = window.__PLUGIN_MANAGER__

// 查看所有插件
pluginManager.getAllPlugins()

// 查看激活的插件
pluginManager.getActivePlugins()

// 查看注册表
const registries = pluginManager.getRegistries()
console.log('Providers:', registries.aiProvider.getAll())
console.log('Exporters:', registries.exporter.getAll())
console.log('Menu Items:', registries.menuItem.getAll())

// 测试菜单项
const menuItem = registries.menuItem.get('my-menu')
menuItem.handler()
```

### 日志调试

```typescript
export async function activate(context: PluginContext) {
  // 使用插件上下文的日志工具
  context.utils.log('插件激活开始', 'info')

  try {
    // 你的代码
    context.utils.log('功能执行成功', 'info')
  } catch (error) {
    context.utils.log(`错误: ${error.message}`, 'error')
  }
}
```

## ⚠️ 常见问题

### Q: 插件安装后没有显示？
A: 检查控制台是否有错误，确认插件已激活。

### Q: 权限不足错误？
A: 在manifest中添加所需权限。

### Q: 如何调试插件？
A: 使用浏览器开发工具，查看控制台日志。

### Q: 插件配置如何保存？
A: 使用PluginStorage自动保存到localStorage。

### Q: 如何测试插件？
A: 使用示例插件作为参考，逐步验证功能。

## 📖 进阶学习

- [插件开发指南](./PLUGIN_DEVELOPMENT.md) - 完整的开发文档
- [插件使用指南](./PLUGIN_USAGE_GUIDE.md) - 用户使用手册
- [插件系统总结](./PLUGIN_SYSTEM_SUMMARY.md) - 架构和特性
- [示例插件](../src/plugins/examples/) - 实际代码示例

## 🎉 开始创作

现在你已经了解了插件系统的基本使用方法，可以：

1. ✅ 使用内置插件
2. ✅ 安装示例插件
3. ✅ 创建自己的插件
4. ✅ 扩展应用功能

开始创作你的第一个插件吧！ 🚀

---

**需要帮助？**
- 查看文档
- 参考示例插件
- 查看API参考
- 提交Issue反馈
