# AI小说工坊 - 插件系统

一个强大、灵活、易用的插件系统，为AI小说工坊提供完整的扩展能力。

## 🌟 特性

- **完整的扩展点** - 9大扩展点覆盖所有需求
- **类型安全** - 完整的TypeScript类型定义
- **模块化架构** - 每个注册表独立，职责清晰
- **权限控制** - 细粒度的权限系统
- **生命周期管理** - 完整的插件生命周期钩子
- **持久化存储** - localStorage存储配置
- **开发友好** - 清晰的API和完整的文档

## 📦 安装

插件系统已内置在AI小说工坊中，无需额外安装。

## 🚀 快速开始

### 1. 创建你的第一个插件

```typescript
// my-plugin.ts
import type { PluginManifest, PluginContext } from '@/plugins/types'

export const manifest: PluginManifest = {
  id: 'my-first-plugin',
  name: '我的第一个插件',
  version: '1.0.0',
  author: 'Me',
  description: '一个简单的示例插件',
  permissions: ['project-data'],

  contributes: {
    menuItems: [{
      id: 'my-menu',
      label: '我的功能',
      icon: '🎉',
      handler: () => {
        alert('你好，插件！')
      }
    }]
  }
}

export async function activate(context: PluginContext) {
  context.ui.showMessage('插件已激活！', 'success')
}
```

### 2. 安装插件

```typescript
import { usePluginStore } from '@/stores/plugin'
import { manifest, activate } from './my-plugin'

const pluginStore = usePluginStore()

// 安装
await pluginStore.installPlugin(manifest, async () => ({ activate }))

// 激活
await pluginStore.activatePlugin('my-first-plugin')
```

### 3. 在UI中管理

1. 打开项目
2. 进入"配置"页面
3. 找到"插件管理"卡片
4. 点击"管理插件"

## 📚 扩展点

### 1. AI Provider
添加自定义AI提供商

```typescript
context.register.aiProvider({
  id: 'my-provider',
  name: 'My AI',
  type: 'ai-provider',
  config: { ... },
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
  format: 'pdf',
  fileExtension: '.pdf',
  mimeType: 'application/pdf',
  capabilities: { ... },
  async export(data, options) {
    return blob
  }
})
```

### 3. 导入器
添加新的导入格式

```typescript
context.register.importer({
  id: 'my-importer',
  name: 'My Importer',
  type: 'importer',
  supportedFormats: ['txt', 'md'],
  fileExtensions: ['.txt', '.md'],
  async import(file, options) {
    return result
  }
})
```

### 4. 处理器
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

### 5. 菜单项
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

### 6. 侧边栏面板
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

### 7. 工具栏按钮
扩展编辑器工具栏

```typescript
context.register.toolbarButton({
  id: 'my-button',
  label: '我的工具',
  icon: '🔧',
  location: 'chapter-editor',
  order: 100,
  handler(context) {
    // context包含章节信息
  }
})
```

### 8. 快捷命令
添加AI助手快捷命令

```typescript
context.register.quickCommand({
  id: 'my-command',
  text: '我的命令',
  command: '/my-command',
  icon: '⚡',
  handler() {
    // 执行命令
  }
})
```

### 9. AI动作处理器
处理自定义AI动作

```typescript
context.register.aiActionHandler({
  type: 'my-action',
  async handler(data, context) {
    // 处理动作
  }
})
```

## 📖 文档

- [快速启动指南](./docs/PLUGIN_QUICK_START.md) - 5分钟上手插件开发
- [插件开发指南](./docs/PLUGIN_DEVELOPMENT.md) - 完整的开发文档
- [插件使用指南](./docs/PLUGIN_USAGE_GUIDE.md) - 用户使用手册
- [插件系统总结](./docs/PLUGIN_SYSTEM_SUMMARY.md) - 架构和特性

## 🎨 示例插件

### 内置插件
- **OpenAI Provider** - OpenAI GPT系列模型支持
- **Anthropic Provider** - Claude系列模型支持
- **Local Provider** - 本地模型支持

### 示例插件
- **EPUB导出器** - 导出为EPUB格式
- **PDF导出器** - 导出为PDF格式
- **文本处理器** - 文本清洗和风格转换
- **智谱GLM Provider** - 国产大模型支持

## 🔧 API参考

### 插件上下文

```typescript
interface PluginContext {
  project: {
    getCurrentProject(): Project | null
    saveProject(): Promise<void>
    updateProject(updates: Partial<Project>): void
    getChapters(): Chapter[]
    getCharacters(): Character[]
    getWorldSetting(): WorldSetting
    getOutline(): Outline
  }

  ai: {
    chat(messages: Message[], options?: ChatOptions): Promise<string>
    chatStream(messages: Message[], callback: StreamCallback): Promise<void>
    generateText(prompt: string, options?: GenerateOptions): Promise<string>
  }

  data: {
    query(collection: string, query: VectorQuery): Promise<VectorSearchResult[]>
    addDocument(doc: VectorDocument): Promise<void>
    getMemory(contextType: string): Promise<MemoryContext>
  }

  ui: {
    showMessage(message: string, type?: 'success' | 'error' | 'warning' | 'info'): void
    showDialog(options: DialogOptions): Promise<any>
    showNotification(options: NotificationOptions): void
    confirm(message: string): Promise<boolean>
  }

  events: {
    on(event: string, handler: (payload: any) => void): void
    off(event: string, handler: (payload: any) => void): void
    emit(event: string, payload?: any): void
  }

  register: {
    aiProvider(contribution: AIProviderContribution): void
    exporter(contribution: ExporterContribution): void
    importer(contribution: ImporterContribution): void
    processor(contribution: ProcessorContribution): void
    menuItem(contribution: MenuItemContribution): void
    sidebarPanel(contribution: SidebarPanelContribution): void
    toolbarButton(contribution: ToolbarButtonContribution): void
    quickCommand(contribution: QuickCommandContribution): void
    aiActionHandler(contribution: AIActionHandlerContribution): void
  }

  utils: {
    log(message: string, level?: 'info' | 'warn' | 'error'): void
    sleep(ms: number): Promise<void>
    clone<T>(obj: T): T
    deepMerge<T>(target: T, source: Partial<T>): T
  }
}
```

### 插件Store

```typescript
// 状态
pluginStore.plugins           // 所有已安装插件
pluginStore.activePlugins     // 已激活插件ID列表
pluginStore.loading           // 加载状态
pluginStore.error             // 错误信息

// 方法
pluginStore.loadInstalledPlugins()         // 加载已安装插件
pluginStore.installPlugin(manifest, entryPoint)  // 安装插件
pluginStore.uninstallPlugin(pluginId)      // 卸载插件
pluginStore.activatePlugin(pluginId)       // 激活插件
pluginStore.deactivatePlugin(pluginId)     // 停用插件
pluginStore.togglePlugin(pluginId)         // 切换激活状态
pluginStore.updatePluginSettings(pluginId, settings)  // 更新设置
pluginStore.getPlugin(pluginId)            // 获取插件信息
pluginStore.isPluginActive(pluginId)       // 检查是否激活
pluginStore.isPluginInstalled(pluginId)    // 检查是否安装

// 获取扩展点
pluginStore.getMenuItems()             // 获取所有菜单项
pluginStore.getSidebarPanels()         // 获取所有侧边栏面板
pluginStore.getToolbarButtons()        // 获取所有工具栏按钮
pluginStore.getQuickCommands()         // 获取所有快捷命令
pluginStore.getRegistries()            // 获取所有注册表
```

## 🔐 权限系统

插件需要声明所需的权限：

```typescript
type PluginPermission =
  | 'storage'          // 访问存储
  | 'network'          // 网络请求
  | 'filesystem'       // 文件系统
  | 'ai-api'          // AI API调用
  | 'project-data'     // 项目数据访问
  | 'user-settings'    // 用户设置修改
```

## 📂 项目结构

```
src/plugins/
├── types.ts                    # 类型定义
├── context.ts                  # 插件上下文
├── manager.ts                  # 插件管理器
├── storage.ts                  # 存储管理
├── loader.ts                   # 插件加载器
├── registries/                 # 注册表
│   ├── provider-registry.ts
│   ├── exporter-registry.ts
│   ├── importer-registry.ts
│   ├── processor-registry.ts
│   ├── menu-registry.ts
│   ├── sidebar-registry.ts
│   ├── toolbar-registry.ts
│   ├── quick-command-registry.ts
│   └── action-handler-registry.ts
├── builtin/                    # 内置插件
│   ├── openai-provider.ts
│   ├── anthropic-provider.ts
│   └── local-provider.ts
└── examples/                   # 示例插件
    ├── epub-exporter.ts
    ├── pdf-exporter.ts
    ├── text-cleaner.ts
    └── zhipu-provider.ts
```

## 🎯 最佳实践

1. **命名规范** - 使用kebab-case命名插件ID
2. **版本管理** - 使用语义化版本号
3. **权限声明** - 只请求必要的权限
4. **错误处理** - 捕获所有异常并提供有意义的错误消息
5. **性能优化** - 使用懒加载，避免阻塞主线程
6. **文档完善** - 提供清晰的README和API文档

## 🐛 调试

```javascript
// 浏览器控制台
const pluginManager = window.__PLUGIN_MANAGER__
pluginManager.getAllPlugins()      // 查看所有插件
pluginManager.getActivePlugins()   // 查看激活插件
pluginManager.getRegistries()      // 查看注册表
```

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📞 支持

- 📖 [文档](./docs/)
- 🐛 [问题反馈](https://github.com/your-repo/issues)
- 💬 [社区讨论](https://github.com/your-repo/discussions)

---

**Happy Plugin Development! 🎉**
