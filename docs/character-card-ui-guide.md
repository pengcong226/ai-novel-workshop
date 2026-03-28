# 角色卡UI组件使用指南

## 组件清单

### 1. CharacterCardPanel.vue - 角色卡管理面板

**功能**：
- 显示角色卡基本信息
- 统计世界书、正则脚本、提示词数量
- 标签页查看/编辑详细内容
- 导入/导出角色卡

**使用**：
```vue
<template>
  <CharacterCardPanel @open-worldbook="handleOpenWorldbook" />
</template>

<script setup>
import CharacterCardPanel from '@/components/CharacterCardPanel.vue'

const handleOpenWorldbook = () => {
  // 打开世界书管理界面
}
</script>
```

**标签页内容**：
- 第一条消息 (first_mes)
- 消息示例 (mes_example)
- AI设置 (AI Settings)
- 世界书 (Worldbook)
- 正则脚本 (Regex Scripts)
- 提示词 (Prompts)

### 2. UnifiedImportDialog.vue - 统一导入对话框

**功能**：
- 拖拽上传PNG/JSON文件
- 选择性导入各部分数据
- 实时进度显示
- 导入结果展示

**使用**：
```vue
<template>
  <el-button @click="showImport = true">导入</el-button>

  <UnifiedImportDialog
    v-model:visible="showImport"
    @imported="handleImported"
  />
</template>

<script setup>
import { ref } from 'vue'
import UnifiedImportDialog from '@/components/UnifiedImportDialog.vue'

const showImport = ref(false)

const handleImported = (result) => {
  if (result.success) {
    console.log('导入成功', result)
  }
}
</script>
```

### 3. CharacterCardExportDialog.vue - 导出对话框

**功能**：
- 选择导出格式（SillyTavern/V3/V2/V1/PNG）
- 选择导出内容
- PNG图片选项设置
- 统计信息展示

**使用**：
```vue
<template>
  <CharacterCardExportDialog v-model:visible="showExport" />
</template>

<script setup>
import { ref } from 'vue'
import CharacterCardExportDialog from '@/components/CharacterCardExportDialog.vue'

const showExport = ref(false)
</script>
```

### 4. AISettingsPanel.vue - AI设置面板

**功能**：
- 调整Temperature、Top P、Top K等参数
- 设置惩罚参数
- 开关流式响应、函数调用
- 重置为默认值

**使用**：
```vue
<template>
  <AISettingsPanel />
</template>

<script setup>
import AISettingsPanel from '@/components/AISettingsPanel.vue'
</script>
```

**参数说明**：
- **Temperature**: 控制输出随机性（0-2）
- **Top P**: 核采样参数（0-1）
- **Top K**: 候选词数量限制
- **Frequency Penalty**: 频率惩罚（-2到2）
- **Presence Penalty**: 存在惩罚（-2到2）
- **Repetition Penalty**: 重复惩罚（1-2）

### 5. RegexScriptManager.vue - 正则脚本管理器

**功能**：
- 查看、添加、编辑、删除正则脚本
- 批量启用/禁用/删除
- 设置触发位置、深度限制
- 正则表达式验证

**使用**：
```vue
<template>
  <RegexScriptManager />
</template>

<script setup>
import RegexScriptManager from '@/components/RegexScriptManager.vue'
</script>
```

**触发位置**：
- 用户输入 (0)
- AI消息开始 (1)
- AI消息结束 (2)
- 斜杠命令 (3)
- 查找输出 (4)
- 推理输出 (5)

### 6. PromptEditor.vue - 提示词编辑器

**功能**：
- 管理58个提示词
- 设置位置、角色、深度
- 系统提示词标记
- 启用/禁用提示词

**使用**：
```vue
<template>
  <PromptEditor />
</template>

<script setup>
import PromptEditor from '@/components/PromptEditor.vue'
</script>
```

**提示词位置**：
- 角色前 (before_char)
- 角色后 (after_char)
- 示例前 (before_example)
- 示例后 (after_example)

**提示词角色**：
- system: 系统消息
- user: 用户消息
- assistant: 助手消息

## 完整使用示例

### 场景1：角色卡管理页面

```vue
<template>
  <div class="character-page">
    <el-tabs v-model="activeTab">
      <el-tab-pane label="角色卡" name="character">
        <CharacterCardPanel @open-worldbook="activeTab = 'worldbook'" />
      </el-tab-pane>

      <el-tab-pane label="世界书" name="worldbook">
        <WorldbookPanel />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import CharacterCardPanel from '@/components/CharacterCardPanel.vue'
import WorldbookPanel from '@/components/WorldbookPanel.vue'

const activeTab = ref('character')
</script>
```

### 场景2：快速导入

```vue
<template>
  <div class="toolbar">
    <el-button type="primary" @click="showImport = true">
      导入角色卡
    </el-button>
  </div>

  <UnifiedImportDialog
    v-model:visible="showImport"
    @imported="handleImported"
  />
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import UnifiedImportDialog from '@/components/UnifiedImportDialog.vue'

const showImport = ref(false)

const handleImported = (result) => {
  if (result.success) {
    let msg = '导入成功！'
    if (result.characterCard?.imported) {
      msg += `\n角色: ${result.characterCard.name}`
    }
    if (result.worldbook?.imported) {
      msg += `\n世界书: ${result.worldbook.entriesCount}条`
    }
    if (result.regexScripts?.imported) {
      msg += `\n正则脚本: ${result.regexScripts.count}个`
    }
    ElMessage.success(msg)
  } else {
    ElMessage.error(result.errors?.join('\n') || '导入失败')
  }
}
</script>
```

### 场景3：编程式访问

```vue
<template>
  <div>
    <el-button @click="loadCharacter">加载角色卡</el-button>
    <el-button @click="saveCharacter">保存角色卡</el-button>
  </div>
</template>

<script setup>
import { useCharacterCardStore } from '@/stores/character-card'
import { importFromFile } from '@/services/unified-importer'

const characterCardStore = useCharacterCardStore()

// 从文件加载
const loadCharacter = async () => {
  // 文件选择逻辑
  const file = await selectFile()
  const result = await importFromFile(file)

  if (result.success) {
    console.log('角色:', characterCardStore.characterName)
    console.log('世界书:', characterCardStore.worldbookCount)
    console.log('正则:', characterCardStore.regexScriptCount)
  }
}

// 保存到文件
const saveCharacter = async () => {
  await characterCardStore.downloadCharacterCard(
    characterCardStore.characterName,
    {
      format: 'sillytavern',
      includeWorldbook: true,
      includeRegexScripts: true,
      includePrompts: true,
      includeAISettings: true
    }
  )
}
</script>
```

## 组件依赖关系

```
CharacterCardPanel
    ├─ UnifiedImportDialog (导入)
    ├─ CharacterCardExportDialog (导出)
    ├─ AISettingsPanel (AI设置)
    ├─ RegexScriptManager (正则脚本)
    └─ PromptEditor (提示词)

所有组件
    └─ characterCardStore (状态管理)
```

## 状态管理

```typescript
// 获取角色卡Store
const characterCardStore = useCharacterCardStore()

// 访问数据
characterCardStore.characterName          // 角色名
characterCardStore.character.description  // 描述
characterCardStore.aiSettings.temperature // AI设置
characterCardStore.worldbookCount         // 世界书条目数
characterCardStore.regexScriptCount       // 正则脚本数
characterCardStore.promptCount            // 提示词数

// 更新数据
characterCardStore.updateCharacter({ name: '新角色' })
characterCardStore.updateAISettings({ temperature: 0.8 })
characterCardStore.addWorldbookEntry({ key: ['关键词'], content: '内容' })
characterCardStore.addRegexScript({ scriptName: '脚本', findRegex: '/test/g' })

// 导入导出
await characterCardStore.importCharacterCard(file, options)
await characterCardStore.downloadCharacterCard(filename, options)

// 清空
characterCardStore.clear()
```

## 最佳实践

1. **导入前备份**: 导入新角色卡前，提醒用户备份现有数据
2. **导出多格式**: 支持导出多种格式，方便兼容不同平台
3. **实时验证**: 正则表达式输入时实时验证，避免保存无效脚本
4. **批量操作**: 提供批量启用/禁用/删除功能
5. **进度反馈**: 长时间操作显示进度条

## 常见问题

### Q: 如何只导入世界书？
A: 在UnifiedImportDialog中取消勾选"导入角色卡"，只勾选"导入世界书"。

### Q: 如何查看导入的角色卡AI设置？
A: 在CharacterCardPanel中切换到"AI设置"标签页。

### Q: 正则脚本不起作用？
A: 检查触发位置是否正确，正则表达式是否有效，脚本是否启用。

### Q: 如何批量导出多个角色卡？
A: 目前需要逐个导出，批量导出功能待开发。

## 后续开发

- [ ] 批量导入多个文件
- [ ] 导入预览功能
- [ ] 批量导出功能
- [ ] 角色卡对比功能
- [ ] 角色卡版本管理
