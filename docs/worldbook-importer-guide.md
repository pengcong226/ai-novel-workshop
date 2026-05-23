# 世界书导入服务使用指南

## 概述

世界书导入服务 (`WorldbookImporter`) 支持从多种格式导入世界书数据到 AI小说工坊项目。

## 支持的格式

1. **JSON 格式** - 标准 SillyTavern Character Book 格式
2. **JSONL 格式** - 每行一个条目的格式
3. **PNG 格式** - 嵌入世界书数据的 PNG 图片（需要 tavern-parser）

## 基本使用

### 导入 JSON 文件

```typescript
import { WorldbookImporter } from '@/services/worldbook-importer'
import type { WorldbookImportOptions } from '@/types/worldbook'

const importer = new WorldbookImporter()

// 从文件导入
const file = new File([jsonContent], 'worldbook.json', { type: 'application/json' })

const options: WorldbookImportOptions = {
  autoGenerateIds: true,        // 自动生成 UUID
  mergeDuplicates: false,       // 是否合并重复条目
  inferCategories: true,        // 推断条目分类
  defaultCategory: '未分类',     // 默认分类
  enableAllEntries: false,      // 是否启用所有条目
  onProgress: (current, total, message) => {
    console.log(`进度: ${current}/${total} - ${message}`)
  }
}

const result = await importer.importWorldbook(file, options)

console.log('导入统计:', result.stats)
console.log('世界书数据:', result.worldbook)
```

### 导入 JSONL 文件

```typescript
const jsonlFile = new File([jsonlContent], 'worldbook.jsonl', { type: 'application/jsonl' })
const result = await importer.importWorldbook(jsonlFile, options)
```

### 导入 PNG 文件

```typescript
const pngFile = new File([pngBuffer], 'character.png', { type: 'image/png' })
const result = await importer.importWorldbook(pngFile, options)
```

### 从文件路径导入（Node.js 环境）

```typescript
const result = await importer.importWorldbook('/path/to/worldbook.json', options)
```

## 高级功能

### 条目过滤

```typescript
const options: WorldbookImportOptions = {
  filter: (entry) => {
    // 只导入启用的条目
    return entry.enabled === true
  }
}
```

### 条目转换

```typescript
const options: WorldbookImportOptions = {
  transform: (entry) => ({
    ...entry,
    // 添加前缀
    content: `[导入] ${entry.content}`,
    // 设置创建时间
    created_at: Date.now(),
    updated_at: Date.now()
  })
}
```

### 合并重复条目

```typescript
const options: WorldbookImportOptions = {
  mergeDuplicates: true,
  // 自定义合并函数（可选）
  mergeFunction: (existing, incoming) => ({
    uid: existing.uid,
    keys: [...new Set([...existing.keys, ...incoming.keys])],
    content: `${existing.content}\n\n${incoming.content}`,
    enabled: true
  })
}
```

### 进度回调

```typescript
const options: WorldbookImportOptions = {
  onProgress: (current, total, message) => {
    const percent = Math.round((current / total) * 100)
    progressBar.value = percent
    statusText.textContent = message
  }
}
```

## 导入结果处理

```typescript
const result = await importer.importWorldbook(file, options)

if (result.errors && result.errors.length > 0) {
  console.error('导入错误:')
  result.errors.forEach(({ entry, error }) => {
    console.error(`- 条目 ${entry?.uid || '未知'}: ${error}`)
  })
}

if (result.warnings && result.warnings.length > 0) {
  console.warn('导入警告:')
  result.warnings.forEach(({ entry, warning }) => {
    console.warn(`- 条目 ${entry?.uid || '未知'}: ${warning}`)
  })
}

// ID 映射（如果自动生成了 ID）
if (result.idMapping) {
  result.idMapping.forEach((newId, oldId) => {
    console.log(`ID 映射: ${oldId} -> ${newId}`)
  })
}

// 分类映射
if (result.categoryMapping) {
  result.categoryMapping.forEach((entryIds, category) => {
    console.log(`分类 "${category}": ${entryIds.length} 个条目`)
  })
}

// 使用导入的世界书
const worldbook = result.worldbook
worldbook.entries.forEach(entry => {
  console.log(`- [${entry.category}] ${entry.keys.join(', ')}: ${entry.content}`)
})
```

## 合并多个世界书

```typescript
import { mergeWorldbooks } from '@/services/worldbook-importer'

const sources = [
  file1,
  file2,
  '/path/to/worldbook3.json'
]

const result = await mergeWorldbooks(sources, {
  conflictResolution: 'merge',  // 'skip' | 'overwrite' | 'merge' | 'rename'
  preserveIds: false,           // 是否保留原始 ID
  updateTimestamps: true        // 是否更新时间戳
})

console.log(`合并完成: ${result.stats.imported} 个条目`)
```

## 导出世界书

```typescript
import { exportWorldbook } from '@/services/worldbook-importer'

// 导出为 JSON
const jsonString = await exportWorldbook(worldbook, 'json', {
  pretty: true,
  filter: (entry) => entry.enabled === true  // 只导出启用的条目
})

// 保存文件
const blob = new Blob([jsonString], { type: 'application/json' })
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = 'worldbook.json'
a.click()
URL.revokeObjectURL(url)

// 导出为 JSONL
const jsonlString = await exportWorldbook(worldbook, 'jsonl')
```

## 与项目集成

```typescript
import { useProjectStore } from '@/stores/project'

async function importWorldbookToProject(file: File) {
  const projectStore = useProjectStore()
  const importer = new WorldbookImporter()

  const result = await importer.importWorldbook(file, {
    projectId: projectStore.currentProject?.id,
    inferCategories: true
  })

  // 将条目转换为世界观设定
  const worldEntries = result.worldbook.entries.map(entry => ({
    id: entry.uid!,
    name: entry.name || entry.keys[0],
    description: entry.content,
    keywords: entry.keys,
    category: entry.category,
    enabled: entry.enabled
  }))

  // 添加到项目的世界设定
  projectStore.updateProject({
    worldBook: {
      entries: worldEntries,
      name: result.worldbook.name,
      description: result.worldbook.description
    }
  })

  return result
}
```

## 数据结构

### WorldbookEntry

```typescript
interface WorldbookEntry {
  uid?: string                    // 条目唯一标识
  keys: string[]                  // 关键词/触发词
  secondary_keys?: string[]       // 次要关键词
  content: string                 // 条目内容
  enabled?: boolean               // 是否启用
  insertion_order?: number        // 插入顺序
  type?: 'character' | 'world' | 'lore' | 'custom'  // 条目类型
  category?: string               // 分类标签
  name?: string                   // 显示名称
  comment?: string                // 备注
  // ... 更多字段见 @/types/worldbook
}
```

### WorldbookData

```typescript
interface WorldbookData {
  entries: WorldbookEntry[]       // 条目列表
  name?: string                   // 世界书名称
  description?: string            // 世界书描述
  scan_depth?: number             // 扫描深度
  token_budget?: number           // 分词器
  recursive_scanning?: boolean    // 递归扫描
  extensions?: Record<string, unknown>  // 扩展字段
}
```

## 错误处理

```typescript
try {
  const result = await importer.importWorldbook(file, options)

  if (result.stats.errors > 0) {
    console.error(`导入完成，但有 ${result.stats.errors} 个错误`)
    result.errors?.forEach(err => {
      console.error(err.error)
    })
  }
} catch (error) {
  console.error('导入失败:', error.message)

  // 根据错误类型提供用户友好的提示
  if (error.message.includes('PNG 解析失败')) {
    alert('PNG 文件格式不正确，请确保文件包含有效的世界书数据')
  } else if (error.message.includes('JSON 解析失败')) {
    alert('JSON 文件格式错误，请检查文件内容')
  } else if (error.message.includes('不支持的文件格式')) {
    alert('请使用 JSON、JSONL 或 PNG 格式的文件')
  }
}
```

## 性能优化

### 大型世界书导入

```typescript
// 分批导入大量条目
const batchSize = 100
const allEntries = worldbookData.entries

for (let i = 0; i < allEntries.length; i += batchSize) {
  const batch = allEntries.slice(i, i + batchSize)
  const batchWorldbook = { ...worldbookData, entries: batch }

  const result = await importer.importWorldbook(
    new File([JSON.stringify(batchWorldbook)], `batch-${i}.json`),
    options
  )

  console.log(`批次 ${i / batchSize + 1} 完成`)
}
```

## 注意事项

1. **ID 映射** - 如果启用 `autoGenerateIds`，原始 ID 会被新 ID 替换，映射关系保存在 `result.idMapping` 中
2. **重复检测** - 基于关键词排序后的签名进行检测，相同关键词的条目被视为重复
3. **分类推断** - 基于关键词和内容自动推断条目类型和分类
4. **PNG 格式** - 需要安装 tavern-parser 包才能解析 PNG 格式的世界书
5. **验证** - 每个条目都会验证必填字段（keys、content），无效条目会被跳过并记录错误

## 相关类型定义

详细类型定义请参考：
- `@/types/worldbook.ts` - 世界书相关类型
- `@/services/worldbook-importer.ts` - 导入服务实现
