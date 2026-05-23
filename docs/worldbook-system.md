# 世界书系统集成文档

## 概述

AI小说工坊已完整集成SillyTavern世界书系统，实现完全兼容的酒馆生态，支持社区资源导入导出，提供关键词触发的精确上下文注入能力。

## 核心特性

### ✅ SillyTavern完全兼容

- **Character Card V1/V2/V3** - PNG角色卡元数据格式
- **世界书JSON格式** - 完整支持所有字段
- **JSONL批量格式** - 条目集合导入导出
- **关键词触发系统** - 精确/模糊/正则匹配
- **条件表达式** - 章节/角色/地点条件

### ✅ 三层注入策略

```
Token预算分配 (总预算: 2700)
├─ 世界书: 1800 tokens (最高优先级，关键词精确匹配)
├─ RAG: 400 tokens (语义检索，智能补充)
└─ Entity & StateEvent: 500 tokens (状态追踪，动态更新)
```

**优先级逻辑**:
1. **世界书** - 关键词精确匹配，优先级最高，Token预算最大
2. **RAG** - 语义相似度检索，补充世界书遗漏内容
3. **Entity & StateEvent** - 状态追踪，动态更新，记录角色/物品变化

### ✅ 关键词触发机制

**精确匹配**:
```typescript
{
  keys: ["林渊", "主角"],
  keylogic: "AND"  // 全部匹配才触发
}
```

**模糊匹配**:
```typescript
{
  keys: ["修炼", "境界"],
  keylogic: "OR"  // 任一匹配即触发
}
```

**正则表达式**:
```typescript
{
  keyregex: "/(章|节)[0-9]+/",  // 匹配章节标题
  depth: 4  // 扫描最近4层对话
}
```

**条件表达式**:
```typescript
{
  extensions: {
    chapter_range: { start: 10, end: 20 },  // 第10-20章
    character_presence: ["char-1", "char-2"],  // 角色在场
    location_visit: ["loc-1"]  // 访问地点
  }
}
```

## 导入导出

### 导入世界书

**支持格式**:
- PNG (Character Card V1/V2/V3)
- JSON (SillyTavern世界书)
- JSONL (批量条目)

**导入界面**:
1. 点击"导入世界书"按钮
2. 拖拽或选择文件（最多10个，单个最大10MB）
3. 预览导入内容，检测冲突
4. 选择冲突解决策略（保留/覆盖/跳过）
5. 确认导入

**导入选项**:
```typescript
interface WorldbookImportOptions {
  conflictResolution: 'keep_both' | 'overwrite' | 'skip'
  createGroups: boolean  // 自动创建分组
  validate: boolean  // 验证条目有效性
  deduplicate: boolean  // 去重
  targetGroup?: string  // 导入到指定分组
}
```

### 导出世界书

**导出格式**:
- **PNG** - 角色卡格式，可导入SillyTavern
- **JSON** - 标准SillyTavern世界书格式
- **JSONL** - 批量条目格式
- **YAML** - 可读性强，适合编辑
- **Markdown** - 文档格式，适合阅读

**导出选项**:
```typescript
interface WorldbookExportOptions {
  format: 'png' | 'json' | 'jsonl' | 'yaml' | 'markdown'
  includeDisabled: boolean  // 包含已禁用条目
  includeExtensions: boolean  // 包含扩展字段
  includeMetadata: boolean  // 包含元数据
  groupFilter?: string[]  // 导出指定分组
}
```

## Vue组件

### WorldbookPanel.vue - 主管理面板

**功能**:
- 条目列表展示（表格视图）
- 搜索和筛选（关键词、分组、启用状态）
- 排序（插入顺序、优先级、标题、时间）
- 批量操作（启用/禁用/删除）
- 分组管理
- 导入/导出按钮
- Token计数显示

**使用**:
```vue
<template>
  <WorldbookPanel />
</template>

<script setup>
import WorldbookPanel from '@/components/WorldbookPanel.vue'
</script>
```

### WorldbookEntryEditor.vue - 条目编辑器

**功能**:
- 三标签页界面（基础信息、触发条件、高级设置）
- 表单编辑（标题、内容、关键词）
- Markdown预览（实时渲染）
- Token计数器
- AI关键词提取
- 批量导入关键词
- 触发条件编辑器
- 章节范围设置
- 角色出场条件
- 地点访问条件

**使用**:
```vue
<template>
  <WorldbookEntryEditor
    :entry="editingEntry"
    :mode="'edit'"
    @save="handleSave"
    @cancel="handleCancel"
  />
</template>
```

### WorldbookImportDialog.vue - 导入对话框

**功能**:
- 三步向导（上传 → 预览 → 完成）
- 拖拽上传
- 多文件支持
- 冲突检测
- 导入结果统计

**使用**:
```vue
<template>
  <WorldbookImportDialog
    @imported="handleImported"
    @cancel="handleCancel"
  />
</template>
```

## 服务层API

### worldbook-importer.ts - 导入服务

```typescript
import { importWorldbook } from '@/services/worldbook-importer'

// 导入世界书
const result = await importWorldbook(file, {
  conflictResolution: 'keep_both',
  createGroups: true,
  validate: true,
  deduplicate: true
})

console.log(`成功导入 ${result.entries.length} 个条目`)
```

### worldbook-exporter.ts - 导出服务

```typescript
import { exportWorldbook } from '@/services/worldbook-exporter'

// 导出为JSON
const blob = await exportWorldbook(worldbook, {
  format: 'json',
  includeDisabled: false,
  includeExtensions: true
})

// 下载文件
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = 'my-worldbook.json'
a.click()
```

### worldbook-png-writer.ts - PNG写卡服务

```typescript
import { createWorldbookPng, downloadPng } from '@/services/worldbook-png-writer'

// 创建世界书PNG
const blob = await createWorldbookPng(worldbook, {
  width: 512,
  height: 512,
  backgroundColor: '#667eea',
  cardFormat: 'v2'
})

// 下载PNG
downloadPng(blob, 'my-worldbook.png')
```

### worldbook-injector.ts - 注入服务

```typescript
import { injectWorldbook } from '@/services/worldbook-injector'

// 构建上下文
const context = await injectWorldbook(
  currentChapter,
  projectConfig,
  worldbookStore.entries
)

// 返回注入的条目
console.log(`注入了 ${context.injectedEntries.length} 个条目`)
console.log(`总Token数: ${context.totalTokens}`)
```

### worldbook-ai.ts - AI辅助服务

```typescript
import { extractKeywords, optimizeContent } from '@/services/worldbook-ai'

// AI提取关键词
const keywords = await extractKeywords(content)

// AI优化内容
const optimized = await optimizeContent(content, {
  maxLength: 500,
  style: 'concise'
})
```

## 迁移工具

### 从旧系统迁移

如果你有旧的Character和WorldSetting数据，可以使用迁移工具：

```typescript
import { migrateToWorldbook } from '@/utils/worldbook-migration'

// 迁移项目
const result = await migrateToWorldbook(project)

// 迁移报告
console.log(`创建了 ${result.entriesCreated} 个条目`)
console.log(`迁移了 ${result.charactersMigrated} 个角色`)
console.log(`迁移了 ${result.worldSettingsMigrated} 个设定`)
```

**迁移策略**:
- **Character → 多个WorldbookEntry** (基本信息、性格、能力、关系、成长轨迹)
- **WorldSetting → 多个WorldbookEntry** (时代、地理、势力、规则、力量体系)
- **自动生成关键词** (从名称、标签、描述提取)
- **保留原始数据** (迁移后不删除旧数据)

## Pinia Store

### worldbook.ts - 状态管理

```typescript
import { useWorldbookStore } from '@/stores/worldbook'

const worldbookStore = useWorldbookStore()

// 加载世界书
await worldbookStore.loadWorldbook()

// 添加条目
await worldbookStore.addEntry({
  title: '林渊的剑法',
  keys: ['林渊', '剑法', '太虚剑'],
  content: '林渊修炼的太虚剑法，共九式...',
  priority: 80,
  enabled: true
})

// 更新条目
await worldbookStore.updateEntry(entryId, {
  content: '更新后的内容'
})

// 删除条目
await worldbookStore.deleteEntry(entryId)

// 获取统计信息
console.log(`总条目: ${worldbookStore.entryCount}`)
console.log(`已启用: ${worldbookStore.enabledEntryCount}`)
```

## 配置

### 启用向量检索

世界书系统默认启用向量检索（RAG）作为补充：

```typescript
// src/stores/project.ts
const defaultConfig: ProjectConfig = {
  enableVectorRetrieval: true,  // ✅ 默认启用
  vectorConfig: {
    provider: 'local',
    model: 'bge-small-zh-v1.5',  // 中文优化模型
    dimension: 512,
  },
}
```

### 切换向量模型

参见 [BGE-M3模型配置指南](./bge-m3-model-guide.md)

可选模型:
- **bge-small-zh-v1.5** (默认，512维，中文优化，~100MB)
- **bge-m3** (推荐，1024维，多语言，~2GB)
- **text-embedding-3-small** (云端，1536维，OpenAI)

### Token预算配置

```typescript
// src/utils/contextBuilder.ts
const TOKEN_BUDGET = {
  WORLD_BOOK: 1800,      // 世界书
  RAG_CONTEXT: 400,      // 向量检索
  ENTITY_STATE: 500,    // Entity & StateEvent 状态记忆
}
```

## 社区资源

### 世界书资源

SillyTavern社区有丰富的世界书资源：

- [SillyTavern官方世界书](https://github.com/SillyTavern/SillyTavern/tree/default/public/worldnames)
- [社区世界书合集](https://rentry.org/worldnames)
- [角色卡数据库](https://chub.ai/)

### 导入社区世界书

1. 下载世界书文件（JSON/PNG）
2. 打开AI小说工坊
3. 进入世界书管理面板
4. 点击"导入"
5. 选择下载的文件
6. 预览并确认导入

## 性能优化

### 条目数量建议

- **最佳性能**: < 500条目
- **推荐上限**: 1000条目
- **最大支持**: 5000条目

### Token优化技巧

1. **精确关键词** - 避免过于宽泛的关键词
2. **优先级设置** - 重要条目设置高优先级（80+）
3. **章节范围** - 使用条件表达式限制触发范围
4. **分组管理** - 按场景/角色分组，避免无关条目
5. **内容精简** - 条目内容控制在200字以内

### 示例配置

**高质量条目**:
```typescript
{
  title: "林渊的剑法",
  keys: ["林渊", "剑法", "太虚剑"],
  content: "林渊修炼的太虚剑法，共九式。第一式：破虚，破开虚空...",
  priority: 80,
  insertion_order: 10,
  enabled: true,
  extensions: {
    chapter_range: { start: 5, end: 50 },  // 第5-50章
    character_presence: ["林渊"]  // 林渊在场
  }
}
```

**场景条目**:
```typescript
{
  title: "青云宗设定",
  keys: ["青云宗", "宗门"],
  content: "青云宗是东域第一大宗，有三大峰...",
  priority: 60,
  group: "宗门设定",
  enabled: true
}
```

## 常见问题

### Q: 世界书和RAG的区别？

**A:**
- **世界书** - 关键词精确匹配，优先级高，Token预算大
- **RAG** - 语义相似度检索，补充世界书遗漏内容

两者互补，形成完整上下文。

### Q: 如何优化Token使用？

**A:**
1. 使用精确关键词
2. 设置优先级
3. 使用条件表达式限制触发
4. 控制条目长度（< 200字）

### Q: 导入失败怎么办？

**A:**
检查文件格式：
- PNG必须是有效的Character Card
- JSON必须符合SillyTavern世界书格式
- JSONL每行必须是一个有效条目

查看错误提示，根据提示修复格式问题。

### Q: 如何与社区分享世界书？

**A:**
导出为PNG或JSON格式：
- PNG格式可上传到角色卡网站（如chub.ai）
- JSON格式可分享到GitHub或社区论坛

## 相关文档

- [世界书导入指南](./worldbook-importer-guide.md)
- [世界书导出使用](./worldbook-exporter-usage.md)
- [BGE-M3模型配置](./bge-m3-model-guide.md)
- [向量检索原理](./vector-retrieval.md)

## 技术实现

### 类型定义

参见 [src/types/worldbook.ts](../src/types/worldbook.ts)

核心类型:
- `Worldbook` - 世界书
- `WorldbookEntry` - 条目
- `WorldbookGroup` - 分组
- `WorldbookCondition` - 条件表达式

### 服务架构

```
worldbook-importer.ts   → 导入服务
worldbook-exporter.ts   → 导出服务
worldbook-png-writer.ts → PNG写卡
worldbook-injector.ts   → 注入引擎
worldbook-ai.ts         → AI辅助
worldbook.ts (store)    → 状态管理
```

### 数据流

```
导入文件
  ↓
worldbook-importer.ts (解析)
  ↓
worldbook.ts (store) (状态管理)
  ↓
worldbook-injector.ts (注入)
  ↓
contextBuilder.ts (构建上下文)
  ↓
AI生成
```

## 更新日志

**v4.1.0** (2026-03-27)
- ✅ 完整集成SillyTavern世界书系统
- ✅ 支持PNG/JSON/JSONL导入导出
- ✅ 实现关键词触发机制
- ✅ 实现条件表达式
- ✅ 实现三层注入策略
- ✅ 默认启用RAG（bge-small-zh-v1.5）
- ✅ 创建Vue组件（管理面板、编辑器、导入对话框）
- ✅ 创建完整服务层
- ✅ 创建迁移工具
- ✅ 编写完整文档
