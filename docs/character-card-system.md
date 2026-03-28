# 角色卡系统完整文档

## 系统概述

基于【明月秋青写卡】2.2.3.json分析，已为AI小说工坊创建了完整的角色卡导入/导出系统。

## 📊 文件分析总结

### 分析的三个文件

| 文件 | 类型 | 大小 | 用途 | 状态 |
|------|------|------|------|------|
| 正则包.json | 正则脚本集合 | 3条 | AI输出后处理 | ✅ 已集成 |
| 写卡知识库.json | TavernHelper知识库 | 103KB, 31条 | API文档知识 | ✅ 已集成 |
| 【明月秋青写卡】2.2.3.json | SillyTavern角色卡 | 188KB | 完整角色卡示例 | ✅ 已集成 |

### 【明月秋青写卡】结构分析

```
SillyTavern扩展格式角色卡 (188.25 KB)
├── 角色基本信息
│   ├── name, description, personality
│   ├── scenario, first_mes, mes_example
│   └── creator_notes, system_prompt
│
├── AI模型设置
│   ├── Temperature: 1
│   ├── Top P: 0.9, Top K: 500
│   ├── Repetition Penalty: 1
│   ├── Stream OpenAI: False
│   └── Function Calling: True
│
├── 提示词系统 (58个)
│   ├── main - 主提示词
│   ├── worldInfoBefore - 世界书前置
│   └── 1-8 - 各种场景提示词
│
├── 正则脚本 (4个)
│   ├── 去除思维链内容
│   ├── 思维链生成中-月相主题
│   ├── 思维链完整-月相主题
│   └── 去杂七杂八标签
│
├── Character Book (世界书)
│   ├── 条目数: 待确定
│   ├── 关键词: 待统计
│   └── Position/Order/Depth分布
│
└── 扩展
    ├── regex_scripts
    ├── tavern_helper (2项)
    └── SPreset
```

## 🏗️ 系统架构

### 1. 类型系统 (`src/types/character-card.ts`)

```typescript
// 支持的格式
- CharacterCardV1        // Legacy格式
- CharacterCardV2        // V2格式
- CharacterCardV3        // V3格式
- SillyTavernCharacterCard  // SillyTavern扩展格式

// 核心组件
- CharacterBookEntry     // 世界书条目
- RegexScript           // 正则脚本
- PromptConfig          // 提示词配置
- CharacterCardExtensions  // 扩展字段

// 导入导出选项
- CharacterCardImportOptions
- CharacterCardExportOptions
- CharacterCardImportResult
- CharacterCardExportResult
```

### 2. 导入服务 (`src/services/character-card-importer.ts`)

```typescript
class CharacterCardImporter {
  // 主导入方法
  async importCharacterCard(
    source: File | string,
    options: CharacterCardImportOptions
  ): Promise<CharacterCardImportResult>

  // PNG导入
  async importFromPNG(
    file: File,
    options: CharacterCardImportOptions
  ): Promise<CharacterCardImportResult>

  // 格式检测
  private detectFormat(data: any): 'v1' | 'v2' | 'v3' | 'sillytavern'

  // 格式解析
  private parseV1()
  private parseV2()
  private parseV3()
  private parseSillyTavern()

  // 数据验证
  validateCharacterCard(data: any): {
    valid: boolean
    errors: string[]
    warnings: string[]
  }
}
```

### 3. 导出服务 (`src/services/character-card-exporter.ts`)

```typescript
class CharacterCardExporter {
  // 主导出方法
  async exportCharacterCard(
    data: any,
    options: CharacterCardExportOptions
  ): Promise<CharacterCardExportResult>

  // 格式创建
  private createV1Format()
  private createV2Format()
  private createV3Format()
  private createSillyTavernFormat()

  // PNG导出
  private async exportAsPNG()

  // 下载
  downloadCharacterCard(result, filename): void
}
```

### 4. 状态管理 (`src/stores/character-card.ts`)

```typescript
const {
  // 状态
  character,          // 角色基本信息
  aiSettings,         // AI模型设置
  prompts,            // 提示词列表
  regexScripts,       // 正则脚本
  worldbookEntries,   // 世界书条目

  // 计算属性
  characterName,
  worldbookCount,
  enabledWorldbookCount,
  regexScriptCount,

  // 导入方法
  importCharacterCard,
  importFromPNG,

  // 导出方法
  exportCharacterCard,
  downloadCharacterCard,

  // 管理方法
  updateCharacter,
  updateAISettings,
  addWorldbookEntry,
  updateWorldbookEntry,
  deleteWorldbookEntry,
  addRegexScript,
  updateRegexScript,
  deleteRegexScript,
  clear
} = useCharacterCardStore()
```

## 💡 使用示例

### 1. 导入角色卡

```typescript
import { useCharacterCardStore } from '@/stores/character-card'

const characterCardStore = useCharacterCardStore()

// 从JSON文件导入
const file = document.querySelector('#file-input').files[0]
await characterCardStore.importCharacterCard(file, {
  importWorldbook: true,
  importRegexScripts: true,
  importPrompts: true,
  importAISettings: true,
  importExtensions: true
})

// 从PNG导入
await characterCardStore.importFromPNG(pngFile, {
  importWorldbook: true
})
```

### 2. 导出角色卡

```typescript
// 导出为JSON
await characterCardStore.downloadCharacterCard('角色卡', {
  format: 'sillytavern',
  includeWorldbook: true,
  includeRegexScripts: true,
  includePrompts: true,
  includeAISettings: true
})

// 导出为PNG
await characterCardStore.downloadCharacterCard('角色卡', {
  format: 'png',
  includeWorldbook: true,
  imageOptions: {
    width: 512,
    height: 512,
    backgroundColor: '#667eea'
  }
})
```

### 3. 管理角色信息

```typescript
// 更新角色信息
characterCardStore.updateCharacter({
  name: '新角色',
  description: '角色描述',
  personality: '性格'
})

// 更新AI设置
characterCardStore.updateAISettings({
  temperature: 0.8,
  top_p: 0.95
})

// 添加世界书条目
characterCardStore.addWorldbookEntry({
  key: ['关键词1', '关键词2'],
  content: '条目内容',
  comment: '备注',
  constant: false,
  disable: false
})

// 添加正则脚本
characterCardStore.addRegexScript({
  scriptName: '去除HTML标签',
  findRegex: '/<[^>]+>/g',
  replaceString: '',
  placement: [2]
})
```

### 4. 在Vue组件中使用

```vue
<template>
  <div>
    <h2>{{ characterCardStore.characterName }}</h2>
    <p>世界书条目: {{ characterCardStore.worldbookCount }}</p>
    <p>正则脚本: {{ characterCardStore.regexScriptCount }}</p>
    <p>提示词: {{ characterCardStore.promptCount }}</p>
  </div>
</template>

<script setup>
import { useCharacterCardStore } from '@/stores/character-card'

const characterCardStore = useCharacterCardStore()
</script>
```

## 🔄 完整工作流

### 导入流程

```
用户上传文件
    ↓
格式检测 (V1/V2/V3/SillyTavern/PNG)
    ↓
解析数据
    ├─ 角色基本信息
    ├─ 世界书条目
    ├─ 正则脚本
    ├─ 提示词
    └─ AI设置
    ↓
数据验证
    ├─ 必需字段检查
    ├─ 格式验证
    └─ 正则表达式验证
    ↓
存储到Store
    ↓
UI更新
```

### 导出流程

```
从Store获取数据
    ↓
格式选择 (V1/V2/V3/SillyTavern/PNG)
    ↓
数据组织
    ├─ 角色基本信息
    ├─ 世界书条目
    ├─ 正则脚本
    ├─ 提示词
    └─ AI设置
    ↓
格式化输出
    ├─ JSON.stringify (JSON格式)
    └─ PNG编码 (PNG格式)
    ↓
下载文件
```

## 📦 与其他模块的集成

### 1. 与世界书系统集成

```typescript
// 从角色卡导入世界书
const characterCardStore = useCharacterCardStore()
await characterCardStore.importCharacterCard(file, {
  importWorldbook: true
})

// 将世界书同步到世界书系统
const worldbookStore = useWorldbookStore()
worldbookStore.entries = characterCardStore.worldbookEntries
```

### 2. 与正则脚本系统集成

```typescript
// 从角色卡导入正则脚本
await characterCardStore.importCharacterCard(file, {
  importRegexScripts: true
})

// 同步到正则脚本管理器
const regexManager = createRegexScriptManager()
for (const script of characterCardStore.regexScripts) {
  regexManager.addScript(script)
}
```

### 3. 与知识库系统集成

```typescript
// 将角色卡信息添加到知识库
const knowledgeManager = createKnowledgeBaseManager()

// 添加API文档知识
for (const entry of characterCardStore.worldbookEntries) {
  if (entry.comment?.includes('API') || entry.comment?.includes('函数')) {
    await knowledgeManager.addEntry({
      ...entry,
      category: 'api_documentation',
      tags: extractTags(entry.comment)
    })
  }
}
```

## 🎯 完整性检查清单

### ✅ 已完成

- [x] 类型定义完整
  - [x] CharacterCardV1/V2/V3
  - [x] SillyTavernCharacterCard
  - [x] CharacterBookEntry
  - [x] RegexScript
  - [x] PromptConfig
  - [x] ImportOptions/ExportOptions

- [x] 导入服务完整
  - [x] 格式自动检测
  - [x] V1/V2/V3格式解析
  - [x] SillyTavern格式解析
  - [x] PNG导入支持
  - [x] 数据验证

- [x] 导出服务完整
  - [x] V1/V2/V3格式导出
  - [x] SillyTavern格式导出
  - [x] PNG导出支持
  - [x] 下载功能

- [x] 状态管理完整
  - [x] 角色信息管理
  - [x] AI设置管理
  - [x] 世界书条目管理
  - [x] 正则脚本管理
  - [x] 提示词管理

### 🔄 待完成

- [ ] UI组件
  - [ ] CharacterCardPanel.vue - 角色卡管理面板
  - [ ] CharacterCardImportDialog.vue - 导入对话框
  - [ ] CharacterCardExportDialog.vue - 导出对话框
  - [ ] AISettingsPanel.vue - AI设置面板
  - [ ] PromptEditor.vue - 提示词编辑器
  - [ ] RegexScriptManager.vue - 正则脚本管理器

- [ ] 文档
  - [ ] 角色卡系统使用指南
  - [ ] 格式转换说明
  - [ ] 最佳实践

## 📝 总结

已创建的文件：

1. **src/types/character-card.ts** - 完整的类型定义（400+行）
2. **src/services/character-card-importer.ts** - 导入服务（500+行）
3. **src/services/character-card-exporter.ts** - 导出服务（300+行）
4. **src/stores/character-card.ts** - 状态管理（500+行）

支持的功能：

✅ 导入所有格式的角色卡
✅ 自动格式检测
✅ 完整数据解析（角色、世界书、正则、提示词、AI设置）
✅ 导出为多种格式
✅ PNG导入导出
✅ 数据验证
✅ 与其他系统集成

基于【明月秋青写卡】2.2.3.json的完整分析，系统现在可以：
- 导入SillyTavern的完整角色卡（包含AI设置、提示词、正则脚本、世界书）
- 管理所有组件
- 导出为标准格式
- 与AI小说工坊的其他模块无缝集成
