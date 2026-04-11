# 统一导入系统 - 快速开始

## 1分钟快速上手

### 在组件中使用

```vue
<template>
  <div>
    <el-button @click="showImport = true">导入文件</el-button>

    <UnifiedImportDialog
      v-model:visible="showImport"
      @imported="handleImported"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import UnifiedImportDialog from '@/components/UnifiedImportDialog.vue'

const showImport = ref(false)

const handleImported = (result) => {
  if (result.success) {
    console.log('导入成功！', result)
  }
}
</script>
```

### 编程式使用

```typescript
import { importFromFile } from '@/services/unified-importer'

// 上传文件后处理
async function handleFileUpload(file: File) {
  const result = await importFromFile(file, {
    importCharacterCard: true,
    importWorldbook: true,
    importRegexScripts: true,
    importPrompts: true,
    importAISettings: true,
    conversationTraceOptions: {
      includeRoles: ['user', 'assistant'], // 默认仅解析 user+assistant
      useRegexPreprocess: false,
      applyReviewed: false,
      autoApplyNoConflict: false
    }
  })

  if (!result.success) {
    console.error('导入失败:', result.errors)
    return
  }

  if (result.characterCard?.imported) {
    console.log(`角色卡: ${result.characterCard.name}`)
  }

  if (result.worldbook?.imported) {
    console.log(`世界书: ${result.worldbook.entriesCount} 条`)
  }

  if (result.conversationTrace?.analyzed) {
    console.log(`会话轨迹解析: ${result.conversationTrace.parsedMessages}`)
    console.log(`抽取候选: ${result.conversationTrace.extractedArtifacts}`)
    console.log(`审核项: ${result.conversationTrace.reviewItems}`)
  }
}
```

## 常见场景

### 场景1: 导入SillyTavern角色卡PNG

用户上传了一个SillyTavern角色卡PNG图片，可能包含：
- 角色信息（name, description, personality等）
- 世界书条目（character_book）
- 正则脚本（extensions.regex_scripts）
- 提示词（prompts）
- AI设置（temperature, top_p等）

**解决方案**:

```typescript
// 一键导入所有数据
const result = await importFromFile(pngFile, {
  importCharacterCard: true,
  importWorldbook: true,
  importRegexScripts: true,
  importPrompts: true,
  importAISettings: true
})

// 自动分发到对应的store:
// - 角色信息 → characterCardStore.character
// - 世界书 → worldbookStore.entries
// - 正则脚本 → regexScriptManager
// - 提示词 → characterCardStore.prompts
// - AI设置 → characterCardStore.aiSettings
```

### 场景2: 仅导入世界书

用户想从文件中只提取世界书数据，忽略其他部分。

**解决方案**:

```typescript
const result = await importFromFile(file, {
  importCharacterCard: false,  // 不导入角色卡
  importWorldbook: true,       // 只导入世界书
  importRegexScripts: false,
  importPrompts: false,
  importAISettings: false,
  worldbookOptions: {
    conflictResolution: 'keep_both',  // 冲突时保留两者
    deduplicate: true,                // 去重
    enableAllEntries: false           // 保持原有启用状态
  }
})
```

### 场景3: 导入时覆盖现有数据

用户想用导入的文件完全替换现有数据。

**解决方案**:

```typescript
const result = await importFromFile(file, {
  importCharacterCard: true,
  importWorldbook: true,
  worldbookOptions: {
    conflictResolution: 'overwrite',  // 覆盖冲突条目
    deduplicate: false,               // 不去重
    enableAllEntries: true            // 启用所有导入的条目
  }
})
```

### 场景4: 导入会话轨迹 JSONL 并进入审核

当上传 `.jsonl/.ndjson` 会话轨迹时，统一导入会走解析-抽取-审核流程。

**解决方案**:

```typescript
const result = await importFromFile(traceFile, {
  conversationTraceOptions: {
    includeRoles: ['user', 'assistant'], // 默认角色
    useRegexPreprocess: false,
    applyReviewed: false,                // 先分析，不自动应用
    autoApplyNoConflict: false
  }
})

if (result.success && result.conversationTrace?.analyzed) {
  console.log(`已解析消息: ${result.conversationTrace.parsedMessages}`)
  console.log(`抽取候选: ${result.conversationTrace.extractedArtifacts}`)
  console.log(`审核项: ${result.conversationTrace.reviewItems}`)
  // UI 中编辑 result.reviewItems 后再提交 applyReviewed
}
```

## 导入后的数据访问

导入后，数据自动保存在各自的store中：

```typescript
import { useCharacterCardStore } from '@/stores/character-card'
import { useWorldbookStore } from '@/stores/worldbook'
import { createRegexScriptManager } from '@/services/regex-script'

// 访问角色卡数据
const characterCardStore = useCharacterCardStore()
console.log(characterCardStore.characterName)        // 角色名
console.log(characterCardStore.character.description) // 描述
console.log(characterCardStore.aiSettings.temperature) // AI设置

// 访问世界书数据
const worldbookStore = useWorldbookStore()
console.log(worldbookStore.entryCount)        // 条目数
console.log(worldbookStore.enabledEntryCount) // 启用的条目数

// 访问正则脚本
const regexManager = createRegexScriptManager()
const scripts = regexManager.getAllScripts()
console.log(`共有 ${scripts.length} 个正则脚本`)
```

## 支持的文件格式

### PNG图片
- ✅ SillyTavern角色卡（带chara元数据）
- ✅ SillyTavern世界书（带ccv3元数据）
- ✅ TavernAI角色卡

### JSON文件
- ✅ Character Card V1 (Legacy)
- ✅ Character Card V2
- ✅ Character Card V3
- ✅ SillyTavern扩展格式
- ✅ SillyTavern世界书
- ✅ TavernAI世界书

### JSONL / NDJSON 文件
- ✅ 会话轨迹导入（默认仅解析 `user + assistant`）
- ✅ 解析预览 → 抽取预览 → 冲突审核 → 应用结果
- ✅ 支持 `conversationTraceOptions.includeRoles` 扩展解析角色

## 故障排除

### Q: 导入PNG时提示"PNG文件不包含角色卡或世界书数据"
**A**: 该PNG文件没有嵌入元数据。可能是一个普通图片文件。请确认文件是否为SillyTavern导出的角色卡。

### Q: 导入后看不到角色卡数据
**A**: 检查导入选项中 `importCharacterCard` 是否为 `true`，并检查文件是否包含角色卡格式。

### Q: 世界书条目冲突怎么办？
**A**: 使用 `conflictResolution` 选项：
- `'keep_both'` - 保留两者（默认）
- `'overwrite'` - 覆盖现有条目
- `'skip'` - 跳过冲突条目
- `'merge'` - 合并内容
- `'rename'` - 重命名新条目

### Q: 如何查看导入了什么？
**A**: 检查返回的 `UnifiedImportResult` 对象：

```typescript
const result = await importFromFile(file, options)

console.log('角色卡:', result.characterCard?.imported)
console.log('世界书:', result.worldbook?.imported)
console.log('会话轨迹分析:', result.conversationTrace?.analyzed)
console.log('解析消息数:', result.conversationTrace?.parsedMessages)
console.log('抽取候选数:', result.conversationTrace?.extractedArtifacts)
console.log('审核项:', result.conversationTrace?.reviewItems)
console.log('正则脚本:', result.regexScripts?.imported)
console.log('提示词:', result.prompts?.imported)
console.log('AI设置:', result.aiSettings?.imported)
console.log('warnings:', result.warnings)
```

## 下一步

- 查看[完整文档](./unified-import-system.md)了解更多细节
- 查看[角色卡系统文档](./character-card-system.md)
- 查看[世界书系统文档](./worldbook-system.md)
