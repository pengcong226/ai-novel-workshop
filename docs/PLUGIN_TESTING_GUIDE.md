# 插件系统测试指南

## 🚀 快速验证

### 1. 启动应用
```bash
npm run dev
```

应用启动时，浏览器控制台应显示：
```
🚀 开始初始化插件系统...
✅ 已安装插件加载完成
✅ 内置插件初始化完成
✅ OpenAI Provider 已激活
✅ Anthropic Provider 已激活
✅ Local Provider 已激活
🎉 插件系统初始化完成
💡 开发模式: 插件管理器已暴露到 window.__PLUGIN_MANAGER__
🎉 应用启动完成
```

### 2. 验证内置插件

打开浏览器控制台，执行：

```javascript
// 获取插件系统状态
const pluginStore = window.__PLUGIN_MANAGER__

// 查看已注册的AI Provider
console.log('AI Providers:', pluginStore.aiProvider.getAll())

// 查看已注册的导出器
console.log('Exporters:', pluginStore.exporter.getAll())

// 查看已注册的菜单项
console.log('Menu Items:', pluginStore.menuItem.getAll())

// 查看已注册的侧边栏面板
console.log('Sidebar Panels:', pluginStore.sidebarPanel.getAll())
```

### 3. 测试插件管理界面

1. 打开应用
2. 进入任意项目
3. 点击左侧菜单"配置"
4. 找到"插件管理"卡片
5. 点击"管理插件"按钮
6. 查看三个标签页：
   - **已安装**: 显示已安装的插件
   - **扩展**: 显示可用的扩展类型
   - **快捷命令**: 显示已注册的快捷命令

### 4. 测试安装示例插件

#### 从JSON安装智谱GLM Provider

```javascript
const zhipuManifest = {
  "id": "zhipu-glm-provider",
  "name": "智谱GLM Provider",
  "version": "1.0.0",
  "author": "AI Assistant",
  "description": "智谱AI GLM大模型支持",
  "permissions": ["network"],
  "contributes": {
    "aiProviders": [{
      "id": "zhipu-glm",
      "name": "智谱GLM",
      "type": "ai-provider",
      "config": {
        "providerType": "custom-ai",
        "defaultBaseURL": "https://open.bigmodel.cn/api/paas/v4",
        "requiresApiKey": true,
        "supportsStreaming": true,
        "supportedModels": [
          { "id": "glm-4", "name": "GLM-4", "contextLength": 128000 },
          { "id": "glm-4-flash", "name": "GLM-4-Flash", "contextLength": 128000 }
        ]
      }
    }]
  }
}

const zhipuModule = {
  async activate(context) {
    const contribution = {
      id: 'zhipu-glm',
      name: '智谱GLM',
      type: 'ai-provider',
      config: {
        providerType: 'custom-ai',
        defaultBaseURL: 'https://open.bigmodel.cn/api/paas/v4',
        requiresApiKey: true,
        supportsStreaming: true,
        supportedModels: [
          { id: 'glm-4', name: 'GLM-4', contextLength: 128000 },
          { id: 'glm-4-flash', name: 'GLM-4-Flash', contextLength: 128000 }
        ]
      },
      createProvider(config) {
        return {
          async chat(request) {
            const response = await fetch(`${config.baseURL}/chat/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
              },
              body: JSON.stringify({
                model: request.model,
                messages: request.messages,
                stream: false
              })
            })
            const data = await response.json()
            return {
              content: data.choices[0].message.content,
              usage: data.usage
            }
          },
          async validateConfig() {
            return !!(config.apiKey && config.baseURL)
          },
          async getModels() {
            return [
              { id: 'glm-4', name: 'GLM-4', contextLength: 128000 },
              { id: 'glm-4-flash', name: 'GLM-4-Flash', contextLength: 128000 }
            ]
          },
          estimateCost(request) {
            const inputTokens = request.messages.reduce((sum, msg) => sum + msg.content.length / 4, 0)
            return {
              inputTokens: Math.ceil(inputTokens),
              outputTokens: Math.ceil(inputTokens * 0.5),
              estimatedCost: inputTokens * 0.00001
            }
          }
        }
      }
    }
    context.register.aiProvider(contribution)
    console.log('✅ 智谱GLM Provider 已注册')
  },
  async deactivate() {
    console.log('✅ 智谱GLM Provider 已停用')
  }
}

// 安装
const { usePluginStore } = await import('/src/stores/plugin.ts')
const { PluginLoader } = await import('/src/plugins/loader.ts')

const pluginStore = usePluginStore()
const result = PluginLoader.loadFromJson(JSON.stringify(zhipuManifest))

await pluginStore.installPlugin(result.manifest, async () => zhipuModule)
await pluginStore.activatePlugin('zhipu-glm-provider')

console.log('✅ 智谱GLM Provider 插件安装成功')
console.log('已注册的AI Providers:', pluginStore.getRegistries().aiProvider.getAll())
```

### 5. 测试UI扩展

在插件管理界面，点击"扩展"标签，应该看到：
- **AI Provider**: 3个内置Provider (OpenAI, Anthropic, Local)
- **导出器**: 0个（可通过插件添加）
- **导入器**: 0个（可通过插件添加）
- **处理器**: 0个（可通过插件添加）
- **菜单项**: 0个（可通过插件添加）
- **侧边栏面板**: 0个（可通过插件添加）
- **工具栏按钮**: 0个（可通过插件添加）
- **快捷命令**: 0个（可通过插件添加）
- **AI动作处理器**: 0个（可通过插件添加）

### 6. 测试插件配置

1. 在"已安装"标签中找到"OpenAI Provider"
2. 点击设置按钮（齿轮图标）
3. 修改配置
4. 点击保存
5. 验证配置是否保存成功

## 🧪 单元测试

### 测试插件加载器

```javascript
import { PluginLoader } from '@/plugins/loader'

describe('PluginLoader', () => {
  test('should load valid manifest from JSON', () => {
    const json = JSON.stringify({
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      author: 'Test Author',
      description: 'Test Description'
    })

    const result = PluginLoader.loadFromJson(json)

    expect(result.valid).toBe(true)
    expect(result.manifest.id).toBe('test-plugin')
  })

  test('should reject invalid manifest', () => {
    const json = JSON.stringify({
      id: 'test-plugin'
      // 缺少必需字段
    })

    const result = PluginLoader.loadFromJson(json)

    expect(result.valid).toBe(false)
    expect(result.error).toBeDefined()
  })
})
```

### 测试插件管理器

```javascript
import { pluginManager } from '@/plugins/manager'

describe('PluginManager', () => {
  beforeEach(() => {
    // 清空所有插件
    pluginManager['plugins'].clear()
  })

  test('should install plugin', async () => {
    const manifest = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      author: 'Test',
      description: 'Test'
    }

    await pluginManager.installPlugin(manifest, async () => ({
      activate: jest.fn()
    }))

    const plugin = pluginManager.getPlugin('test-plugin')
    expect(plugin).toBeDefined()
    expect(plugin.active).toBe(false)
  })

  test('should activate plugin', async () => {
    const manifest = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      author: 'Test',
      description: 'Test'
    }

    const activate = jest.fn()

    await pluginManager.installPlugin(manifest, async () => ({ activate }))
    await pluginManager.activatePlugin('test-plugin')

    expect(activate).toHaveBeenCalled()
    const plugin = pluginManager.getPlugin('test-plugin')
    expect(plugin.active).toBe(true)
  })
})
```

### 测试注册表

```javascript
import { MenuItemRegistry } from '@/plugins/registries'

describe('MenuItemRegistry', () => {
  let registry: MenuItemRegistry

  beforeEach(() => {
    registry = new MenuItemRegistry()
  })

  test('should register menu item', () => {
    const item = {
      id: 'test-menu',
      label: 'Test Menu',
      icon: '🎯',
      handler: jest.fn()
    }

    registry.register(item)

    const items = registry.getAll()
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('test-menu')
  })

  test('should unregister menu item', () => {
    const item = {
      id: 'test-menu',
      label: 'Test Menu',
      icon: '🎯',
      handler: jest.fn()
    }

    registry.register(item)
    registry.unregister('test-menu')

    const items = registry.getAll()
    expect(items).toHaveLength(0)
  })
})
```

## 📊 性能测试

### 测试插件加载性能

```javascript
// 测试加载100个插件的时间
const manifests = Array.from({ length: 100 }, (_, i) => ({
  id: `test-plugin-${i}`,
  name: `Test Plugin ${i}`,
  version: '1.0.0',
  author: 'Test',
  description: 'Test'
}))

console.time('Load 100 plugins')
for (const manifest of manifests) {
  await pluginManager.installPlugin(manifest, async () => ({
    activate: () => console.log(`Activated ${manifest.id}`)
  }))
}
console.timeEnd('Load 100 plugins')

// 应该在1秒内完成
```

### 测试注册表查询性能

```javascript
// 注册1000个菜单项
const registry = new MenuItemRegistry()
for (let i = 0; i < 1000; i++) {
  registry.register({
    id: `menu-${i}`,
    label: `Menu ${i}`,
    icon: '🎯',
    handler: () => {}
  })
}

// 测试查询性能
console.time('Get all menu items')
const items = registry.getAll()
console.timeEnd('Get all menu items')

// 应该在10ms内完成
```

## 🐛 调试技巧

### 1. 查看插件状态

```javascript
// 获取所有插件
const plugins = pluginStore.plugins
console.table(plugins.map(p => ({
  ID: p.id,
  Name: p.name,
  Version: p.version,
  Active: pluginStore.isPluginActive(p.id)
})))
```

### 2. 查看注册表内容

```javascript
// 查看所有注册表
const registries = pluginStore.getRegistries()
console.log('AI Providers:', registries.aiProvider.getAll())
console.log('Exporters:', registries.exporter.getAll())
console.log('Importers:', registries.importer.getAll())
console.log('Processors:', registries.processor.getAll())
console.log('Menu Items:', registries.menuItem.getAll())
console.log('Sidebar Panels:', registries.sidebarPanel.getAll())
console.log('Toolbar Buttons:', registries.toolbarButton.getAll())
console.log('Quick Commands:', registries.quickCommand.getAll())
console.log('Action Handlers:', registries.aiActionHandler.getAll())
```

### 3. 清除插件数据

```javascript
// 清除所有插件数据（重置）
localStorage.removeItem('ai-novel-plugins')
location.reload()
```

### 4. 手动触发插件事件

```javascript
// 手动触发插件生命周期
await pluginStore.activatePlugin('plugin-id')
await pluginStore.deactivatePlugin('plugin-id')
await pluginStore.uninstallPlugin('plugin-id')
```

## ✅ 验收标准

### 功能验收

- [ ] 应用启动时插件系统自动初始化
- [ ] 内置的3个Provider插件自动加载并激活
- [ ] 插件管理界面正常显示
- [ ] 可以查看已安装的插件列表
- [ ] 可以激活/停用插件
- [ ] 可以配置插件设置
- [ ] 可以从URL安装插件
- [ ] 可以从文件安装插件
- [ ] 可以从JSON安装插件
- [ ] 插件UI扩展正常显示（菜单项、侧边栏面板、工具栏按钮）
- [ ] 插件注册表正常工作（可以查询已注册的贡献）

### 性能验收

- [ ] 插件系统初始化时间 < 500ms
- [ ] 单个插件加载时间 < 100ms
- [ ] 注册表查询时间 < 10ms
- [ ] 插件激活/停用时间 < 50ms

### 稳定性验收

- [ ] 插件安装失败不影响应用运行
- [ ] 插件激活失败不影响其他插件
- [ ] 插件错误有友好的错误提示
- [ ] 插件数据持久化到localStorage
- [ ] 应用重启后插件状态恢复

## 🎉 测试通过

如果以上测试全部通过，恭喜！插件系统已经完全就绪，可以开始使用了！

### 下一步

1. **开发自定义插件**: 参考 `docs/PLUGIN_DEVELOPMENT.md`
2. **使用插件功能**: 参考 `docs/PLUGIN_USAGE_GUIDE.md`
3. **探索示例插件**: 查看 `src/plugins/examples/` 目录

### 获取帮助

- **文档**: `docs/` 目录下的各种文档
- **示例**: `src/plugins/examples/` 目录下的示例插件
- **调试**: 浏览器控制台使用 `window.__PLUGIN_MANAGER__`

祝您使用愉快！ 🎊
