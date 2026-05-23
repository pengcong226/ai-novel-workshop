# 知识库系统集成文档

## 概述

基于TavernHelper API知识库参考，为AI小说工坊实现了完整的知识库系统。该系统完全兼容SillyTavern Character Book格式，并增加了知识库特有的功能。

## 核心特性

### 1. 知识库管理
- ✅ 导入SillyTavern格式的知识库（JSON）
- ✅ 自动分类检测
- ✅ 标签提取
- ✅ 智能搜索（内容、注释、标签、来源）
- ✅ 使用统计

### 2. 分类系统
```typescript
enum KnowledgeCategory {
  API_DOCUMENTATION = 'api_documentation',    // API文档
  TUTORIAL = 'tutorial',                      // 教程
  BEST_PRACTICE = 'best_practice',           // 最佳实践
  FAQ = 'faq',                                // 常见问题
  CODE_EXAMPLE = 'code_example',              // 代码示例
  SYSTEM_PROMPT = 'system_prompt',           // 系统提示
  TOOL_DOCUMENTATION = 'tool_documentation', // 工具文档
  CUSTOM = 'custom'                          // 自定义
}
```

### 3. 自动分类逻辑
```typescript
// 根据注释自动检测分类
if (comment.includes('API') || comment.includes('函数') || comment.includes('方法')) {
  return KnowledgeCategory.API_DOCUMENTATION
}
if (comment.includes('教程') || comment.includes('指南') || comment.includes('如何')) {
  return KnowledgeCategory.TUTORIAL
}
// ... 更多规则
```

## 使用示例

### 1. 导入知识库

```typescript
import { createKnowledgeBaseManager } from '@/services/knowledge-base'

const kbManager = createKnowledgeBaseManager()

// 从文件导入
const result = await kbManager.importKnowledgeBase(file, {
  autoCategorize: true,      // 自动分类
  extractTags: true,         // 提取标签
  setAsConstant: true,       // 设为常量条目
  defaultDisabled: true,     // 默认禁用
  cleanContent: true         // 清理内容
})

console.log('导入成功:', result.imported.length)
console.log('跳过:', result.skipped.length)
console.log('错误:', result.errors.length)
```

### 2. 搜索知识

```typescript
// 简单搜索
const results = kbManager.search(knowledgeBaseId, {
  query: '角色卡管理',
  scope: ['content', 'comment', 'tags'],
  enabledOnly: true,
  sortBy: 'relevance',
  limit: 10
})

// 高级搜索
const advancedResults = kbManager.search(knowledgeBaseId, {
  query: 'API',
  categories: [KnowledgeCategory.API_DOCUMENTATION],
  tags: ['character', 'worldbook'],
  enabledOnly: true,
  sortBy: 'usageCount',
  sortOrder: 'desc'
})
```

### 3. 使用统计

```typescript
const stats = kbManager.getStatistics(knowledgeBaseId)

console.log('总条目数:', stats.totalEntries)
console.log('已启用:', stats.enabledEntries)
console.log('常量条目:', stats.constantEntries)
console.log('各分类条目数:', stats.entriesByCategory)
console.log('最常用条目:', stats.mostUsedEntries)
```

### 4. 在Vue组件中使用

```vue
<template>
  <KnowledgeBasePanel />
</template>

<script setup>
import { KnowledgeBasePanel } from '@/components/KnowledgeBasePanel.vue'
</script>
```

### 5. 与世界书集成

知识库可以作为特殊的常量世界书条目：

```typescript
// 将知识库条目转换为世界书条目
const knowledgeEntry = kbManager.getEntry(knowledgeBaseId, uid)

const worldbookEntry: WorldbookEntry = {
  uid: knowledgeEntry.uid,
  key: [],                          // 空关键词
  content: knowledgeEntry.content,
  comment: knowledgeEntry.comment,
  constant: true,                   // 常量条目
  disable: knowledgeEntry.disable,  // 默认禁用
  position: 0,
  order: 0,
  depth: 4,
  // ... 其他字段
}
```

## 数据结构

### TavernHelper知识库格式

```json
{
  "entries": {
    "50316": {
      "uid": 50316,
      "comment": "19_角色卡管理",
      "disable": true,
      "constant": true,
      "key": [],
      "content": "【角色卡管理】\n来源: @types/function/character.d.ts\n用途: 创建、获取、修改、删除角色卡...",
      "order": 21,
      "position": 0,
      "depth": 4
    }
  }
}
```

### 转换为AI小说工坊格式

```typescript
{
  uid: 50316,
  comment: "19_角色卡管理",
  disable: true,
  constant: true,
  key: [],
  content: "【角色卡管理】...",
  order: 21,
  position: 0,
  depth: 4,

  // AI小说工坊扩展字段
  category: 'api_documentation',
  tags: ['角色卡', '管理', 'API'],
  source: '@types/function/character.d.ts',
  usageCount: 0,
  priority: 0,
  metadata: {
    createdAt: Date,
    updatedAt: Date,
    searchKeywords: ['角色卡', '管理', 'API', '创建', '获取']
  }
}
```

## 分类编号系统

TavernHelper知识库使用编号分类：

| 编号 | 分类 | 说明 |
|-----|------|------|
| 00 | 接口总览 | API接口概览 |
| 01-19 | API文档 | 各模块API详细文档 |
| 20+ | 专题 | MVU、EJS、测试标准等 |

自动分类逻辑会识别这些编号并提取主题标签：

```typescript
// "19_角色卡管理" -> 提取标签 ["角色卡管理"]
const tags = extractTags("19_角色卡管理", [])
```

## 性能优化

### 1. 搜索优化
- 关键词预提取
- 相关性评分
- 分页查询

### 2. 内存优化
- 懒加载内容
- 虚拟滚动（大数据量）
- 缓存热门条目

### 3. 存储优化
- 压缩存储
- 增量更新
- 索引优化

## 最佳实践

### 1. 知识库条目编写规范

```markdown
【标题】
来源: @types/xxx.d.ts
用途: 简要说明

═════════════════════════════════════════
一、主标题
═════════════════════════════════════════

主要内容...

═════════════════════════════════════════
二、子标题
═════════════════════════════════════════

详细说明...

示例:
\`\`\`typescript
// 代码示例
\`\`\`
```

### 2. 分类建议

- **API文档**: 函数说明、参数类型、返回值
- **教程**: 步骤说明、使用场景
- **最佳实践**: 性能优化、安全建议
- **FAQ**: 常见错误、解决方案

### 3. 标签规范

- 使用具体、描述性的标签
- 避免过于泛化的标签
- 保持标签一致性
- 中英文标签混用

## 与其他模块集成

### 1. 与世界书集成
```typescript
// 从知识库生成世界书
function generateWorldbookFromKnowledge(knowledgeBaseId: string): WorldbookEntry[] {
  const entries = kbManager.getKnowledgeBase(knowledgeBaseId).entries
  return entries.filter(e => !e.disable).map(e => ({
    uid: e.uid,
    key: e.key,
    content: e.content,
    constant: e.constant,
    // ... 转换其他字段
  }))
}
```

### 2. 与正则脚本集成
```typescript
// 知识库条目可包含正则脚本使用示例
const entry = kbManager.getEntry(knowledgeBaseId, uid)
if (entry.category === 'code_example' && entry.content.includes('findRegex')) {
  // 提取正则脚本
}
```

### 3. 与AI助手集成
```typescript
// 提供知识库上下文给AI
function getKnowledgeContext(query: string): string {
  const results = kbManager.search(knowledgeBaseId, { query, limit: 5 })
  return results.map(r => r.entry.content).join('\n\n---\n\n')
}
```

## 迁移指南

### 从SillyTavern知识库迁移

```typescript
// 导入TavernHelper知识库
const result = await kbManager.importKnowledgeBase('D:\\video\\写卡知识库.json', {
  autoCategorize: true,
  extractTags: true,
  setAsConstant: true,
  defaultDisabled: true
})

// 查看导入统计
const stats = kbManager.getStatistics(result.knowledgeBase.id)
console.log('分类分布:', stats.entriesByCategory)
```

### 从旧版世界书迁移

```typescript
// 将世界书条目转为知识库条目
const worldbookEntries = await worldbookStore.entries

for (const entry of worldbookEntries) {
  await kbManager.addEntry({
    ...entry,
    category: detectCategory(entry.comment),
    tags: extractTags(entry.comment, []),
    constant: true,
    disable: true
  })
}
```

## 总结

知识库系统提供了：
- ✅ 完整的SillyTavern兼容性
- ✅ 智能分类和标签系统
- ✅ 强大的搜索功能
- ✅ 使用统计和分析
- ✅ 与世界书、正则脚本的无缝集成
- ✅ TavernHelper知识库完整导入支持

可以立即使用TavernHelper的31个知识条目作为开发参考和AI助手知识库。
