# 世界书导出服务使用指南

## 概述

`WorldbookExporter` 服务提供了将世界书导出为多种格式的功能，包括：
- **JSON** - SillyTavern 标准格式
- **JSONL** - 每行一个条目，便于流式处理
- **YAML** - 人类可读的格式
- **Markdown** - 文档格式，便于阅读和分享
- **PNG** - 嵌入世界书数据的图片（支持嵌入角色卡）

## 安装

```typescript
import {
  WorldbookExporter,
  createWorldbookExporter,
  exportWorldbookAsJson,
  exportWorldbookAsJsonl,
  exportWorldbookAsYaml,
  exportWorldbookAsMarkdown,
  exportWorldbookAsPng
} from '@/services/worldbook-exporter'
import type { Worldbook, WorldbookExportOptions } from '@/types/worldbook'
```

## 基础用法

### 1. 创建导出器实例

```typescript
const exporter = createWorldbookExporter()
// 或
const exporter = new WorldbookExporter()
```

### 2. 导出为 JSON（SillyTavern 格式）

```typescript
const worldbook: Worldbook = {
  name: '我的世界书',
  entries: [
    {
      uid: 1,
      key: ['主角', 'protagonist'],
      content: '主角是一个勇敢的战士...',
      comment: '主角介绍',
      constant: false,
      disable: false,
      order: 10,
      novelWorkshop: {
        category: '角色',
        tags: ['主角', '战士']
      }
    }
  ]
}

// 基础导出
const result = await exporter.export(worldbook, { format: 'json' })

if (result.success) {
  const jsonData = result.data as string
  console.log(`导出成功: ${result.exportedCount} 个条目`)
  console.log(`建议文件名: ${result.suggestedFilename}`)
}
```

### 3. 导出为 JSONL

```typescript
// JSONL 格式适合大数据处理
const jsonl = await exporter.exportAsJsonl(worldbook, {
  enabledOnly: true,  // 只导出启用的条目
  sortBy: 'order'     // 按顺序排序
})

// 每行是一个 JSON 对象
jsonl.split('\n').forEach(line => {
  const entry = JSON.parse(line)
  console.log(`条目 ${entry.uid}: ${entry.key.join(', ')}`)
})
```

### 4. 导出为 YAML

```typescript
// YAML 格式更适合人类阅读和编辑
const yaml = await exporter.exportAsYaml(worldbook, {
  includeExtensions: true,  // 包含 AI 小说工坊扩展字段
  includeStatistics: true   // 包含统计信息
})

console.log(yaml)
```

### 5. 导出为 Markdown

```typescript
// 详细模板（包含完整信息）
const detailedMd = await exporter.exportAsMarkdown(worldbook, {
  template: 'detailed',
  includeStatistics: true,
  includeToc: true,
  groupByCategory: true
})

// 紧凑模板（简洁版本）
const compactMd = await exporter.exportAsMarkdown(worldbook, {
  template: 'compact',
  includeStatistics: false,
  includeToc: false
})

// 参考模板（YAML 格式，便于复制）
const referenceMd = await exporter.exportAsMarkdown(worldbook, {
  template: 'reference'
})
```

### 6. 导出为 PNG（嵌入世界书数据）

```typescript
// 导出为 PNG 图片
const pngBlob = await exporter.exportAsPng(worldbook, {
  width: 400,
  height: 600,
  backgroundImage: 'https://example.com/background.jpg'
})

// 嵌入到角色卡
const characterCardPng = await exporter.exportAsPng(worldbook, {
  embedInCharacter: true,
  characterCard: {
    name: '角色名',
    description: '角色描述',
    personality: '性格特点',
    scenario: '场景设定',
    first_mes: '开场白'
  }
})

// 下载 PNG
const url = URL.createObjectURL(pngBlob)
const a = document.createElement('a')
a.href = url
a.download = 'worldbook.png'
a.click()
URL.revokeObjectURL(url)
```

## 高级选项

### 过滤和排序

```typescript
const options: WorldbookExportOptions = {
  format: 'json',

  // 只导出启用的条目
  enabledOnly: true,

  // 包含禁用的条目
  includeDisabled: false,

  // 排序方式
  sortBy: 'order',  // 'uid' | 'order' | 'alphabetical' | 'category' | 'created_at'

  // 包含扩展字段
  includeExtensions: true,

  // 包含统计信息
  includeStatistics: true,

  // 包含 AI 生成元数据
  includeAiMetadata: true,

  // 自定义过滤
  filter: (entry) => {
    // 只导出特定分类的条目
    return entry.novelWorkshop?.category === '角色'
  }
}

const result = await exporter.export(worldbook, options)
```

### Markdown 模板选项

```typescript
interface MarkdownExportOptions extends WorldbookExportOptions {
  // 模板类型
  template?: 'detailed' | 'compact' | 'reference'

  // 是否包含目录
  includeToc?: boolean

  // 是否包含统计信息
  includeStatistics?: boolean
}
```

### PNG 导出选项

```typescript
interface PngExportOptions extends WorldbookExportOptions {
  // 图片尺寸
  width?: number   // 默认 400
  height?: number  // 默认 600

  // 背景图片（URL 或 Base64）
  backgroundImage?: string

  // 是否嵌入到角色卡
  embedInCharacter?: boolean

  // 角色卡数据（嵌入时需要）
  characterCard?: {
    name: string
    description?: string
    personality?: string
    scenario?: string
    first_mes?: string
    mes_example?: string
    [key: string]: unknown
  }
}
```

## 便捷函数

对于常见导出操作，可以使用便捷函数：

```typescript
// 导出为 JSON
const result = await exportWorldbookAsJson(worldbook, { pretty: true })

// 导出为 JSONL
const jsonl = await exportWorldbookAsJsonl(worldbook)

// 导出为 YAML
const yaml = await exportWorldbookAsYaml(worldbook)

// 导出为 Markdown
const markdown = await exportWorldbookAsMarkdown(worldbook, { template: 'detailed' })

// 导出为 PNG
const pngBlob = await exportWorldbookAsPng(worldbook)
```

## 完整示例

### 导出并下载

```typescript
import { saveAs } from 'file-saver'
import { exportWorldbookAsJson, exportWorldbookAsMarkdown } from '@/services/worldbook-exporter'

async function exportAndDownload(worldbook: Worldbook) {
  // 导出为 JSON
  const jsonResult = await exportWorldbookAsJson(worldbook, {
    includeExtensions: true,
    pretty: true
  })

  if (jsonResult.success && jsonResult.data) {
    const blob = new Blob([jsonResult.data as string], { type: 'application/json' })
    saveAs(blob, jsonResult.suggestedFilename || 'worldbook.json')
  }

  // 导出为 Markdown
  const markdown = await exportWorldbookAsMarkdown(worldbook, {
    template: 'detailed',
    includeStatistics: true,
    groupByCategory: true
  })

  const mdBlob = new Blob([markdown], { type: 'text/markdown' })
  saveAs(mdBlob, `${worldbook.name || 'worldbook'}.md`)
}
```

### 批量导出

```typescript
async function batchExport(worldbooks: Worldbook[]) {
  const exporter = new WorldbookExporter()

  for (const worldbook of worldbooks) {
    const formats = ['json', 'yaml', 'markdown'] as const

    for (const format of formats) {
      const result = await exporter.export(worldbook, { format })

      if (result.success && result.data) {
        const blob = new Blob(
          [result.data as string],
          { type: result.mimeType || 'text/plain' }
        )
        saveAs(blob, result.suggestedFilename || `worldbook.${format}`)
      }
    }
  }
}
```

## 格式兼容性

### JSON 格式

完全兼容 SillyTavern Character Book 格式：

```json
{
  "entries": [
    {
      "uid": 1,
      "key": ["关键词"],
      "content": "条目内容",
      "enabled": true,
      "order": 10
    }
  ]
}
```

### JSONL 格式

每行一个条目，适合流式处理：

```
{"uid":1,"key":["关键词"],"content":"条目1"}
{"uid":2,"key":["关键词2"],"content":"条目2"}
```

### YAML 格式

人类可读，便于手动编辑：

```yaml
name: 我的世界书
entries:
  - uid: 1
    key:
      - 关键词
    content: 条目内容
```

### Markdown 格式

文档格式，便于阅读和分享：

```markdown
# 我的世界书

## 统计信息

- 总条目数: 10
- 启用条目数: 8

## 目录

- [角色](#角色)
  - [主角](#entry-1)

### 主角 {#entry-1}

**UID**: 1

**关键词**:
- 主要: 主角, protagonist
```

## 注意事项

1. **PNG 导出**：需要浏览器环境支持 Canvas API
2. **YAML 导出**：依赖 `js-yaml` 库，会动态导入
3. **扩展字段**：默认不包含 AI 小说工坊扩展字段，需要显式启用
4. **过滤和排序**：在导出前应用，不影响原始数据
5. **文件名**：自动生成，包含世界书名称和时间戳

## 相关文档

- [世界书类型定义](../src/types/worldbook.ts)
- [世界书导入服务](../src/services/worldbook-importer.ts)
- [世界书注入服务](../src/services/worldbook-injector.ts)
