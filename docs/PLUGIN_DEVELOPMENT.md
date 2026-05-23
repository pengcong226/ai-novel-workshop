# AI小说工坊 - 插件开发指南

## 概述

AI小说工坊插件系统提供了强大的扩展能力，允许开发者创建自定义插件来扩展应用功能。

## 插件类型

### 1. AI Provider 插件
添加自定义AI提供商支持（如国产大模型、本地模型等）

### 2. 导出器插件
添加新的导出格式（EPUB、PDF、LaTeX等）

### 3. 导入器插件
添加新的导入格式支持

### 4. 处理器插件
注入数据处理管道，在导入、导出、生成过程中处理数据

### 5. UI扩展插件
- 菜单项
- 侧边栏面板
- 工具栏按钮

### 6. AI助手扩展插件
- 快捷命令
- AI动作处理器

## 插件结构

### 基础结构

```typescript
// 插件清单
export const manifest: PluginManifest = {
  id: 'my-plugin',                    // 插件唯一标识
  name: '我的插件',                    // 插件名称
  version: '1.0.0',                   // 版本号（semver）
  author: '作者名',                    // 作者
  description: '插件描述',             // 描述

  permissions: ['ai-api', 'storage'], // 所需权限

  contributes: {
    // 贡献点声明
  }
}

// 插件激活钩子
export async function activate(context: PluginContext) {
  console.log('插件已激活')
}

// 插件停用钩子
export async function deactivate() {
  console.log('插件已停用')
}

// 插件卸载钩子
export async function uninstall() {
  console.log('插件已卸载')
}
```

## 插件上下文API

插件上下文提供了访问应用核心功能的API：

```typescript
interface PluginContext {
  // 项目数据访问
  project: {
    getCurrentProject(): Project | null
    saveProject(): Promise<void>
    updateProject(updates: Partial<Project>): void
    getChapters(): Chapter[]
    getCharacters(): Character[]
    getWorldSetting(): WorldSetting
    getOutline(): Outline
  }

  // AI服务
  ai: {
    chat(messages: Message[], options?: ChatOptions): Promise<string>
    chatStream(messages: Message[], callback: StreamCallback): Promise<void>
    generateText(prompt: string, options?: GenerateOptions): Promise<string>
  }

  // 数据访问
  data: {
    query(collection: string, query: VectorQuery): Promise<VectorSearchResult[]>
    addDocument(doc: VectorDocument): Promise<void>
    getMemory(contextType: string): Promise<MemoryContext>
  }

  // UI交互
  ui: {
    showMessage(message: string, type?: 'success' | 'error' | 'warning' | 'info'): void
    showDialog(options: DialogOptions): Promise<any>
    showNotification(options: NotificationOptions): void
    confirm(message: string): Promise<boolean>
  }

  // 事件系统
  events: {
    on(event: string, handler: (payload: any) => void): void
    off(event: string, handler: (payload: any) => void): void
    emit(event: string, payload?: any): void
  }

  // 注册API
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

  // 工具函数
  utils: {
    log(message: string, level?: 'info' | 'warn' | 'error'): void
    sleep(ms: number): Promise<void>
    clone<T>(obj: T): T
    deepMerge<T>(target: T, source: Partial<T>): T
  }
}
```

## 开发示例

### 示例1：创建EPUB导出器

```typescript
import type { ExporterContribution, ExportData, ExportOptions } from '@/types'

const epubExporter: ExporterContribution = {
  id: 'epub-exporter',
  name: 'EPUB导出器',
  type: 'exporter',

  format: 'epub',
  fileExtension: '.epub',
  mimeType: 'application/epub+zip',

  capabilities: {
    supportsBatch: true,
    supportsCustomTemplate: true,
    supportsMetadata: true,
    supportsImages: true
  },

  async export(data: ExportData, options: ExportOptions): Promise<Blob> {
    // 实现EPUB导出逻辑
    const epubContent = generateEpub(data)
    return new Blob([epubContent], { type: 'application/epub+zip' })
  },

  async exportBatch(items: ExportData[], options: ExportOptions): Promise<Blob> {
    // 实现批量导出逻辑
    const epubContent = generateBatchEpub(items)
    return new Blob([epubContent], { type: 'application/epub+zip' })
  }
}

export const manifest: PluginManifest = {
  id: 'epub-exporter-plugin',
  name: 'EPUB导出器',
  version: '1.0.0',
  author: 'Your Name',
  description: '将小说导出为EPUB格式',
  permissions: ['filesystem'],
  contributes: {
    exporters: [epubExporter]
  }
}

export async function activate(context: PluginContext) {
  context.register.exporter(epubExporter)
}
```

### 示例2：创建文本处理器

```typescript
import type { ProcessorContribution, ProcessorContext } from '@/types'

const textCleaner: ProcessorContribution = {
  id: 'text-cleaner',
  name: '文本清洗处理器',
  type: 'processor',
  stage: 'pre-import',

  async process(data: any, context: ProcessorContext): Promise<any> {
    if (typeof data !== 'string') return data

    let text = data
    // 移除BOM标记
    text = text.replace(/^\uFEFF/, '')
    // 统一换行符
    text = text.replace(/\r\n/g, '\n')
    // 压缩多余空行
    text = text.replace(/\n{3,}/g, '\n\n')

    return text
  }
}

export const manifest: PluginManifest = {
  id: 'text-processor-plugin',
  name: '文本处理器',
  version: '1.0.0',
  author: 'Your Name',
  description: '提供文本清洗功能',
  contributes: {
    processors: [textCleaner]
  }
}

export async function activate(context: PluginContext) {
  context.register.processor(textCleaner)
}
```

### 示例3：创建侧边栏面板

```typescript
import type { SidebarPanelContribution } from '@/types'
import MyPanel from './MyPanel.vue'

const myPanel: SidebarPanelContribution = {
  id: 'my-panel',
  title: '我的面板',
  icon: '📊',
  component: MyPanel,
  position: 'right',
  order: 10,
  width: 300
}

export const manifest: PluginManifest = {
  id: 'my-panel-plugin',
  name: '我的面板',
  version: '1.0.0',
  author: 'Your Name',
  description: '添加自定义侧边栏面板',
  contributes: {
    sidebarPanels: [myPanel]
  }
}

export async function activate(context: PluginContext) {
  context.register.sidebarPanel(myPanel)
}
```

## 权限系统

插件需要声明所需的权限：

```typescript
type PluginPermission =
  | 'storage'          // 访问存储（IndexedDB, localStorage）
  | 'network'          // 发起网络请求
  | 'filesystem'       // 访问文件系统
  | 'ai-api'          // 调用AI API
  | 'project-data'     // 访问项目数据
  | 'user-settings'    // 修改用户设置
```

## 最佳实践

1. **命名规范**
   - 插件ID使用kebab-case：`my-plugin`
   - 导出器ID包含格式：`epub-exporter`
   - 处理器ID包含功能：`text-cleaner`

2. **版本管理**
   - 使用语义化版本号
   - 遵循 semver 规范

3. **错误处理**
   - 捕获并记录所有错误
   - 提供有意义的错误消息
   - 使用 `context.ui.showMessage()` 显示用户友好的错误

4. **性能优化**
   - 避免阻塞主线程
   - 使用异步操作
   - 实现懒加载

5. **安全性**
   - 只请求必要的权限
   - 验证所有外部输入
   - 避免执行不受信任的代码

## 调试插件

在浏览器控制台中使用：

```javascript
// 获取插件管理器
const pluginManager = window.__PLUGIN_MANAGER__

// 查看所有插件
pluginManager.getAllPlugins()

// 查看已激活插件
pluginManager.getActivePlugins()

// 查看注册表
pluginManager.getRegistries()
```

## 发布插件

1. 将插件打包为单个文件
2. 创建README文档
3. 提供示例和配置说明
4. 发布到插件市场（待实现）

## 更多资源

- [API参考文档](./PLUGIN_API.md)
- [示例插件](../src/plugins/examples/)
- [问题反馈](https://github.com/your-repo/issues)
