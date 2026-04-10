# 统一导入系统 - 更新日志

## 2026-03-27

### 新增功能

#### 统一导入系统

**核心文件**:
- `src/services/unified-importer.ts` - 统一导入服务
- `src/components/UnifiedImportDialog.vue` - 统一导入对话框组件
- `docs/unified-import-system.md` - 完整系统文档
- `docs/unified-import-quickstart.md` - 快速开始指南

**功能特性**:

1. **自动格式检测**
   - 自动识别PNG/JSON/JSONL/NDJSON文件类型
   - 自动检测角色卡格式（V1/V2/V3/SillyTavern扩展）
   - 自动检测世界书格式
   - JSONL/NDJSON 自动路由到会话轨迹导入流水线
   - 智能区分纯世界书和角色卡

2. **智能数据分发**
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
       ├─ parseConversationTraceFile
       ├─ extractTraceArtifacts
       ├─ buildTraceReviewQueue
       └─ applyTraceReviewItems
   ```

3. **灵活的导入选项**
   - 可选择性导入各部分数据
   - 支持世界书冲突处理策略
   - 支持去重、自动分类等功能

4. **统一的结果格式**
   ```typescript
   interface UnifiedImportResult {
     success: boolean
     characterCard?: {
       imported: boolean
       name?: string
       hasWorldbook: boolean
       hasRegexScripts: boolean
       hasPrompts: boolean
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

#### 世界书Store增强

**新增方法**: `importEntries()`

```typescript
async function importEntries(
  newEntries: WorldbookEntry[],
  options: {
    merge?: boolean
    conflictResolution?: 'keep_both' | 'overwrite' | 'skip' | 'merge' | 'rename'
    deduplicate?: boolean
    enableAllEntries?: boolean
  } = {}
): Promise<void>
```

**功能**:
- 批量导入世界书条目
- 支持多种冲突处理策略
- 支持去重和自动启用
- 自动重新分配UID

**使用示例**:
```typescript
const worldbookStore = useWorldbookStore()

// 导入条目并处理冲突
await worldbookStore.importEntries(newEntries, {
  merge: true,
  conflictResolution: 'keep_both',
  deduplicate: true,
  enableAllEntries: false
})
```

### 系统架构

#### 文件关系

```
unified-importer.ts
    ├─ 导入 character-card-importer.ts (角色卡导入)
    ├─ 导入 worldbook-importer.ts (世界书导入)
    ├─ 导入 character-card store (角色卡存储)
    ├─ 导入 worldbook store (世界书存储)
    └─ 导入 regex-script service (正则脚本管理)

UnifiedImportDialog.vue
    └─ 使用 unified-importer.ts

使用流程:
1. 用户上传文件 → UnifiedImportDialog
2. UnifiedImportDialog → importFromFile()
3. importFromFile() → 解析文件 → 分发数据到各store
4. 返回结果 → 显示给用户
```

#### 与现有系统的关系

**统一导入** vs **独立导入**:

| 特性 | 统一导入 | 独立导入 |
|------|---------|---------|
| 使用场景 | 用户上传文件 | API调用、精细控制 |
| 数据处理 | 自动分发到各store | 手动处理结果 |
| 适用文件 | PNG/JSON（混合数据） | 特定格式文件 |
| 控制粒度 | 高层抽象 | 底层控制 |
| 依赖关系 | 依赖所有store | 按需依赖 |

**兼容性**:
- ✅ 完全兼容现有角色卡导入系统
- ✅ 完全兼容现有世界书导入系统
- ✅ 可独立使用，不影响现有功能

### 典型用例

#### 用例1: 一键导入SillyTavern角色卡

```typescript
// 之前: 需要多次导入
await characterCardImporter.importFromPNG(file)
await worldbookImporter.importWorldbook(file)
await regexScriptImporter.importFromJSON(file)

// 现在: 一次导入全部数据
const result = await importFromFile(file, {
  importCharacterCard: true,
  importWorldbook: true,
  importRegexScripts: true,
  importPrompts: true,
  importAISettings: true
})
```

#### 用例2: 处理PNG图片中的混合数据

```typescript
// PNG可能同时包含角色卡和世界书
const result = await importFromFile(pngFile)

if (result.characterCard?.imported) {
  console.log(`角色: ${result.characterCard.name}`)
  if (result.characterCard.hasWorldbook) {
    console.log('  └─ 包含世界书')
  }
}

if (result.worldbook?.imported) {
  console.log(`世界书: ${result.worldbook.entriesCount} 条`)
}
```

### 性能优化

- 单次文件读取，避免重复解析
- 批量数据库操作
- 智能缓存机制（未来计划）

### 错误处理

统一错误处理机制：

```typescript
const result = await importFromFile(file)

if (!result.success) {
  // 详细错误信息
  result.errors?.forEach(error => {
    console.error('导入错误:', error)
  })
}
```

### 文档更新

新增文档：
- `docs/unified-import-system.md` - 完整系统文档
- `docs/unified-import-quickstart.md` - 快速开始指南
- `docs/unified-import-changelog.md` - 本更新日志

更新文档：
- `docs/character-card-system.md` - 添加统一导入说明
- `docs/worldbook-system.md` - 添加统一导入说明

### 测试建议

**测试用例**:

1. **PNG角色卡导入**
   - 包含角色信息 + 世界书 + 正则脚本
   - 仅包含角色信息
   - 仅包含世界书

2. **JSON文件导入**
   - Character Card V1/V2/V3
   - SillyTavern扩展格式
   - 纯世界书格式

3. **冲突处理**
   - keep_both策略
   - overwrite策略
   - skip策略
   - deduplicate功能

4. **选择性导入**
   - 仅导入角色卡
   - 仅导入世界书
   - 组合导入

5. **错误处理**
   - 无效文件格式
   - 损坏的PNG
   - 无效的JSON
   - 空文件

### 后续计划

**优先级高**:
- [ ] 批量导入多个文件
- [ ] 导入进度显示
- [ ] 导入预览功能

**优先级中**:
- [ ] 导入历史记录
- [ ] 撤销导入功能
- [ ] 导入数据对比

**优先级低**:
- [ ] 导出统一格式
- [ ] 转换工具
- [ ] 格式验证器

### 兼容性说明

**向后兼容**:
- ✅ 所有现有导入功能继续工作
- ✅ API保持向后兼容
- ✅ 组件接口不变

**浏览器支持**:
- ✅ Chrome 80+
- ✅ Firefox 75+
- ✅ Safari 13.1+
- ✅ Edge 80+

**依赖**:
- Vue 3.3+
- Element Plus 2.4+
- Pinia 2.1+

### 开发者注意事项

**使用统一导入时**:
1. 确保所有相关store已初始化
2. 在Vue组件中使用时，确保在setup()中调用
3. 处理异步导入结果时，考虑错误边界

**扩展现有功能时**:
1. 统一导入器调用独立导入器，不要重复实现
2. 新增导入选项时，更新UnifiedImportOptions接口
3. 新增导入结果时，更新UnifiedImportResult接口

**性能考虑**:
1. 大文件导入时考虑分块处理（未来优化）
2. PNG解码可能耗时，建议显示进度
3. 批量导入建议串行处理，避免内存溢出

### 相关Issue

- #Issue_Number: 角色卡和世界书导入合并需求
- #Issue_Number: PNG导入失败问题修复
- #Issue_Number: 世界书冲突处理增强

### 贡献者

- 统一导入系统实现
- 世界书Store增强
- 文档编写
- 测试用例设计

---

**版本**: 1.0.0
**发布日期**: 2026-03-27
**维护者**: AI Novel Workshop Team
