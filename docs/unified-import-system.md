# 统一导入系统

## 系统概述

统一导入系统将角色卡、世界书与会话轨迹（JSONL/NDJSON）导入功能合并在一起。支持SillyTavern常见的PNG图片混合数据，也支持会话轨迹的解析、抽取、冲突审核与应用。

## 核心功能

### 1. 自动格式检测

系统能够自动识别文件类型和内容格式：

- **PNG图片**: 自动提取嵌入的元数据
- **JSON文件**: 自动识别角色卡格式（V1/V2/V3/SillyTavern扩展）或世界书格式
- **JSONL/NDJSON**: 识别为会话轨迹模式（默认仅解析 `user + assistant`）

### 2. 智能数据分发

导入时会自动将不同类型的数据分发到对应的存储：

```
PNG/JSON文件
    ↓
统一导入器
    ├─ 角色卡数据 → characterCardStore.character
    ├─ 世界书数据 → worldbookStore.entries
    ├─ 正则脚本   → regexScriptManager
    ├─ 提示词     → characterCardStore.prompts
    └─ AI设置     → characterCardStore.aiSettings

JSONL/NDJSON文件
    ↓
会话轨迹流水线
    ├─ parseConversationTraceFile (解析)
    ├─ extractTraceArtifacts (抽取)
    ├─ buildTraceReviewQueue (冲突审核队列)
    └─ applyTraceReviewItems (按审核结果落库)
```

### 3. 灵活导入选项

用户可以选择性地导入需要的部分：

```typescript
const options: UnifiedImportOptions = {
  importCharacterCard: true,    // 是否导入角色卡数据
  importWorldbook: true,        // 是否导入世界书数据
  importRegexScripts: true,     // 是否导入正则脚本
  importPrompts: true,          // 是否导入提示词
  importAISettings: true,       // 是否导入AI设置
  worldbookOptions: {           // 世界书导入选项
    conflictResolution: 'keep_both',
    deduplicate: true,
    autoCategorize: false,
    enableAllEntries: false
  },
  conversationTraceOptions: {   // 会话轨迹导入选项（JSONL/NDJSON）
    includeRoles: ['user', 'assistant'],
    includeEmptyContent: false,
    maxMessages: 5000,
    useRegexPreprocess: false,
    autoApplyNoConflict: false,
    applyReviewed: false
  }
}
```

## 使用方法

### 1. 编程式导入

```typescript
import { importFromFile } from '@/services/unified-importer'

// 从文件导入
const result = await importFromFile(file, {
  importCharacterCard: true,
  importWorldbook: true,
  importRegexScripts: true
})

// 检查结果
if (result.success) {
  if (result.characterCard?.imported) {
    console.log(`角色卡: ${result.characterCard.name}`)
  }
  if (result.worldbook?.imported) {
    console.log(`世界书: ${result.worldbook.entriesCount} 条`)
  }
  if (result.regexScripts?.imported) {
    console.log(`正则脚本: ${result.regexScripts.count} 个`)
  }
}
```

### 2. 组件式导入

```vue
<template>
  <UnifiedImportDialog
    v-model:visible="showImportDialog"
    @imported="handleImported"
  />
</template>

<script setup>
import { ref } from 'vue'
import UnifiedImportDialog from '@/components/UnifiedImportDialog.vue'

const showImportDialog = ref(false)

const handleImported = (result) => {
  if (result.success) {
    console.log('导入成功', result)
  }
}
</script>
```

### 3. 从特定格式导入

```typescript
import { createUnifiedImporter } from '@/services/unified-importer'

const importer = createUnifiedImporter()

// 从PNG导入
const pngResult = await importer.importFromPNG(pngFile, options)

// 从JSON导入
const jsonResult = await importer.importFromJSON(jsonFile, options)

// 从JSONL/NDJSON会话轨迹导入
const traceResult = await importer.importFromJSONL(jsonlFile, {
  conversationTraceOptions: {
    includeRoles: ['user', 'assistant'],
    applyReviewed: false,
    autoApplyNoConflict: false
  }
})
```

## 会话轨迹导入流程（JSONL / NDJSON）

当上传 `.jsonl/.ndjson` 时，统一导入会进入 5 步流程：
1. 解析预览（默认仅 `user + assistant`）
2. 抽取预览
3. 冲突审核（默认人工审核优先）
4. 应用结果

可通过 `conversationTraceOptions` 控制：
- `includeRoles`：扩展解析角色
- `useRegexPreprocess`：是否启用正则预处理
- `autoApplyNoConflict`：是否自动应用无冲突项
- `applyReviewed`：是否按审核动作落库

应用阶段会额外执行：
- 保存导入会话历史（`traceImportHistory`）
- 尝试向量索引（失败仅记 warning，不阻断导入）

## 导入结果

### UnifiedImportResult

```typescript
interface UnifiedImportResult {
  success: boolean

  characterCard?: {
    imported: boolean
    name?: string
    hasWorldbook: boolean
    hasRegexScripts: boolean
    hasPrompts: boolean
    result?: CharacterCardImportResult
  }

  worldbook?: {
    imported: boolean
    entriesCount: number
  }

  conversationTrace?: {
    analyzed: boolean
    parsedMessages: number
    extractedArtifacts: number
    reviewItems: number
    applied?: {
      reviewed: number
      applied: number
      skipped: number
      merged: number
      conflicts: number
    }
    sessionId?: string
  }

  reviewItems?: TraceReviewItem[]

  regexScripts?: {
    imported: boolean
    count: number
  }

  prompts?: {
    imported: boolean
    count: number
  }

  aiSettings?: {
    imported: boolean
  }

  errors?: string[]
  warnings?: string[]
}
```

## 支持的格式

### 角色卡格式

1. **Character Card V1** (Legacy)
   ```json
   {
     "name": "角色名",
     "description": "描述",
     "personality": "性格",
     "scenario": "场景",
     "first_mes": "第一条消息",
     "mes_example": "消息示例",
     "character_book": { ... }
   }
   ```

2. **Character Card V2**
   ```json
   {
     "spec": "chara_card_v2",
     "spec_version": "2.0",
     "data": {
       "name": "角色名",
       "character_book": { ... },
       "extensions": { ... }
     }
   }
   ```

3. **Character Card V3**
   ```json
   {
     "spec": "chara_card_v3",
     "spec_version": "3.0",
     "data": {
       "name": "角色名",
       "character_book": { ... },
       "extensions": { ... }
     }
   }
   ```

4. **SillyTavern扩展格式**
   ```json
   {
     "name": "角色名",
     "temperature": 1,
     "top_p": 0.9,
     "prompts": [ ... ],
     "extensions": {
       "regex_scripts": [ ... ]
     },
     "character_book": { ... }
   }
   ```

### 世界书格式

1. **SillyTavern世界书**
   ```json
   {
     "entries": [
       {
         "uid": 0,
         "key": ["关键词"],
         "content": "内容"
       }
     ]
   }
   ```

2. **嵌入在角色卡中的世界书**
   ```json
   {
     "character_book": {
       "entries": [ ... ]
     }
   }
   ```

### 会话轨迹格式（JSONL / NDJSON）

- 每行一个 JSON 对象
- 默认只纳入 `user` 与 `assistant`
- 支持 `system/tool/other` 通过 `includeRoles` 扩展
- 导入流程为「解析 → 抽取 → 冲突审核 → 应用」

## 典型用例

### 用例1: 导入包含世界书的角色卡PNG

```typescript
const result = await importFromFile(pngFile, {
  importCharacterCard: true,
  importWorldbook: true,
  worldbookOptions: {
    conflictResolution: 'keep_both',
    deduplicate: true
  }
})

// 角色卡数据自动保存到 characterCardStore.character
// 世界书数据自动保存到 worldbookStore.entries
```

### 用例2: 仅导入世界书

```typescript
const result = await importFromFile(file, {
  importCharacterCard: false,
  importWorldbook: true,
  worldbookOptions: {
    conflictResolution: 'overwrite',
    enableAllEntries: true
  }
})
```

### 用例3: 导入完整SillyTavern角色卡

```typescript
const result = await importFromFile(file, {
  importCharacterCard: true,
  importWorldbook: true,
  importRegexScripts: true,
  importPrompts: true,
  importAISettings: true
})

// 一次性导入所有数据:
// - 角色信息
// - 世界书
// - 正则脚本
// - 提示词
// - AI设置
```

### 用例4: 导入会话轨迹JSONL并进入审核流程

```typescript
const result = await importFromFile(traceFile, {
  conversationTraceOptions: {
    includeRoles: ['user', 'assistant'],
    applyReviewed: false,
    autoApplyNoConflict: false
  }
})

console.log(result.conversationTrace?.parsedMessages)
console.log(result.conversationTrace?.reviewItems)
// UI 可使用 result.reviewItems 进行逐项审核后再提交应用
```

## 与原有系统的关系

### 统一导入 vs 独立导入

**统一导入** (`UnifiedImporter`):
- ✅ 一次导入所有数据
- ✅ 自动分发到各个store
- ✅ 适合PNG/JSON/JSONL/NDJSON（混合数据与会话轨迹）
- ✅ 用户友好的界面

**独立导入** (`CharacterCardImporter`, `WorldbookImporter`):
- ✅ 更精细的控制
- ✅ 适合仅导入特定类型数据
- ✅ 适合API调用
- ✅ 更低的依赖

### 兼容性

统一导入系统完全兼容原有的导入系统：

```typescript
// 仍然可以使用原有方式
import { createCharacterCardImporter } from '@/services/character-card-importer'
import { createWorldbookImporter } from '@/services/worldbook-importer'

const characterCardImporter = createCharacterCardImporter()
const worldbookImporter = createWorldbookImporter()

// 或者使用新的统一方式
import { createUnifiedImporter } from '@/services/unified-importer'

const unifiedImporter = createUnifiedImporter()
```

## 内部实现

### 格式检测逻辑

```typescript
private isCharacterCardFormat(data: any): boolean {
  // V2/V3格式
  if (data.spec === 'chara_card_v2' || data.spec === 'chara_card_v3') {
    return true
  }

  // SillyTavern扩展格式
  if (
    data.temperature !== undefined ||
    data.prompts ||
    data.extensions?.regex_scripts
  ) {
    return true
  }

  // V1格式（需要区分纯世界书）
  if (data.name && (data.first_mes || data.mes_example)) {
    return true
  }

  // 纯世界书格式
  if (data.entries && Array.isArray(data.entries)) {
    return false
  }

  return false
}
```

### PNG解析流程

```
PNG文件
    ↓
提取tEXt/zTXt元数据
    ↓
检测 chara / ccv3 关键字
    ↓
Base64解码 + JSON解析
    ↓
格式检测（角色卡 vs 世界书）
    ↓
分发到对应Store
```

## 最佳实践

1. **优先使用统一导入**: 对于用户上传的文件，使用统一导入可以自动处理所有情况
2. **提供选项**: 让用户选择需要导入的部分，避免覆盖现有数据
3. **冲突处理**: 根据场景选择合适的冲突处理策略
4. **错误提示**: 清晰地告诉用户导入的结果（成功、部分成功、失败）

## 文件清单

- `src/services/unified-importer.ts` - 统一导入服务
- `src/components/UnifiedImportDialog.vue` - 统一导入对话框组件
- `docs/unified-import-system.md` - 本文档

## 后续改进

1. **批量导入**: 支持一次导入多个文件
2. **预览功能**: 导入前预览将要导入的内容
3. **选择性导入**: 在预览界面选择性导入特定条目
4. **导入历史**: 记录导入历史，支持撤销
