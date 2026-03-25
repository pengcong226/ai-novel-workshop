# 向量检索系统文档

## 概述

向量检索系统为 AI 小说工坊提供了强大的语义搜索和智能上下文检索功能，特别适合长篇小说（100+ 章节）的创作。

## 核心功能

### 1. 语义搜索
- 基于向量相似度的语义搜索
- 支持本地模型和 OpenAI Embeddings API
- 混合搜索（向量 + 关键词）提升准确性

### 2. 智能上下文检索
- 自动检索与当前章节相关的历史内容
- 提取世界观、人物、剧情、章节等多种类型信息
- 根据相似度排序，返回最相关的上下文

### 3. 增量索引
- 支持单个章节的索引更新
- 自动同步到 IndexedDB 本地存储
- 无需重复索引已有内容

## 技术架构

### 文件结构

```
src/utils/
├── embeddings.ts       # 文本嵌入服务
├── vectorStore.ts      # 向量存储（IndexedDB + 内存索引）
├── vectorService.ts    # 向量服务（整合嵌入和存储）
├── contextBuilder.ts   # 上下文构建器（已集成向量检索）
└── test-vector.ts      # 测试文件
```

### 核心模块

#### 1. Embeddings Service (`embeddings.ts`)

**功能**: 文本向量化

**支持的模型**:
- **本地模型** (Transformers.js)
  - `Xenova/all-MiniLM-L6-v2` (384维，推荐)
  - `Xenova/all-mpnet-base-v2` (768维，更高质量)
  - `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (多语言支持)

- **OpenAI API**
  - `text-embedding-3-small` (1536维，性价比高)
  - `text-embedding-3-large` (3072维，最高质量)
  - `text-embedding-ada-002` (旧版本)

**使用示例**:
```typescript
import { createEmbeddingService } from '@/utils/embeddings'

// 本地模型
const localService = createEmbeddingService({
  provider: 'local',
  model: 'Xenova/all-MiniLM-L6-v2',
  dimension: 384
})

// OpenAI
const openaiService = createEmbeddingService({
  provider: 'openai',
  model: 'text-embedding-3-small',
  apiKey: 'your-api-key',
  dimension: 1536
})

// 生成嵌入向量
const embedding = await service.embed('这是一段测试文本')
console.log('向量维度:', embedding.length) // 384 或 1536
```

#### 2. Vector Store (`vectorStore.ts`)

**功能**: 向量索引和检索

**特性**:
- 基于 IndexedDB 的持久化存储
- 内存索引加速查询
- 支持元数据过滤
- 支持混合搜索（向量 + 关键词）

**使用示例**:
```typescript
import { createVectorStore } from '@/utils/vectorStore'

// 创建向量存储
const store = await createVectorStore('project-id', 384)

// 添加文档
await store.addDocument({
  id: 'doc-001',
  content: '这是一段文本内容',
  metadata: {
    type: 'chapter',
    projectId: 'project-id',
    chapterNumber: 1,
    timestamp: Date.now()
  },
  embedding: [0.1, 0.2, ...] // 384维向量
})

// 向量搜索
const results = await store.search(queryEmbedding, 10, { minScore: 0.6 })

// 混合搜索
const hybridResults = await store.hybridSearch(
  queryText,
  queryEmbedding,
  10,
  { vectorWeight: 0.7, minScore: 0.5 }
)
```

#### 3. Vector Service (`vectorService.ts`)

**功能**: 整合嵌入和存储，提供高级功能

**核心方法**:
- `indexProject(project)`: 索引整个项目（世界观、人物、大纲、章节）
- `indexChapter(chapter, projectId)`: 索引单个章节
- `search(query, topK, options)`: 语义搜索
- `retrieveRelevantContext(chapter, project, options)`: 智能上下文检索

**使用示例**:
```typescript
import { getVectorService } from '@/utils/vectorService'

// 获取向量服务实例
const vectorService = await getVectorService('project-id', {
  provider: 'local',
  model: 'Xenova/all-MiniLM-L6-v2',
  dimension: 384
})

// 索引项目
await vectorService.indexProject(project)

// 语义搜索
const results = await vectorService.search('林云的修炼天赋', 5, {
  minScore: 0.6,
  filter: (metadata) => metadata.type === 'character' // 只搜索人物
})

// 智能上下文检索
const context = await vectorService.retrieveRelevantContext(
  currentChapter,
  project,
  {
    topK: 5,
    minScore: 0.6,
    excludeCurrentChapter: true
  }
)
```

#### 4. Context Builder (`contextBuilder.ts`)

**功能**: 构建完整的章节生成上下文

**集成向量检索**:
```typescript
import { buildChapterContext } from '@/utils/contextBuilder'

// 构建上下文（包含向量检索）
const context = await buildChapterContext(
  project,
  currentChapter,
  memorySystem, // 可选
  {
    provider: 'local',
    model: 'Xenova/all-MiniLM-L6-v2',
    dimension: 384,
    projectId: project.id
  }
)

// context.vectorContext 包含向量检索的相关内容
console.log('向量检索上下文:', context.vectorContext)
```

## 配置说明

### ProjectConfig.vue 配置项

在项目配置页面新增了"向量检索"配置卡片：

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| enabled | boolean | false | 是否启用向量检索 |
| provider | 'local' \| 'openai' | 'local' | 嵌入服务提供商 |
| model | string | 'Xenova/all-MiniLM-L6-v2' | 嵌入模型 |
| apiKey | string | - | OpenAI API Key（仅 OpenAI 需要） |
| topK | number | 5 | 检索数量 |
| minScore | number | 0.6 | 相似度阈值（0-1） |
| vectorWeight | number | 0.7 | 向量搜索权重（混合搜索） |

### Token 预算分配

```
TOTAL: 6000 tokens
├── SYSTEM_PROMPT: 300
├── AUTHORS_NOTE: 200
├── WORLD_INFO: 800
├── CHARACTERS: 600
├── MEMORY_TABLES: 500
├── VECTOR_CONTEXT: 600  ← 新增
├── SUMMARY: 600
├── RECENT_CHAPTERS: 2000
├── OUTLINE: 400
└── RESERVE: 400
```

## 性能优化

### 1. 批量嵌入
- 支持批量生成嵌入向量（每次最多 8 个文本）
- 减少网络请求和计算开销

### 2. 索引缓存
- 向量服务实例缓存（`getVectorService`）
- 避免重复初始化模型

### 3. 增量更新
- 支持单个章节的索引更新
- 无需重建整个索引

### 4. 本地存储
- 所有数据存储在 IndexedDB
- 首次使用后无需重新下载模型

## 使用场景

### 场景 1：长篇小说连贯性维护

**问题**: 100+ 章节后，AI 难以记住所有细节

**解决方案**:
1. 启用向量检索
2. 写新章节时，自动检索相关历史内容
3. 将相关内容注入上下文，确保连贯性

```typescript
// 自动注入相关上下文
const context = await buildChapterContext(project, newChapter, memory, vectorConfig)
// context.vectorContext 包含：
// - 相关的章节内容（场景、人物、事件）
// - 相关的人物设定
// - 相关的世界观设定
// - 相关的剧情线索
```

### 场景 2：伏笔和细节查询

**问题**: 需要确认某个伏笔是否已经埋下

**解决方案**:
```typescript
const results = await vectorService.search('青云宗的秘密', 10, {
  minScore: 0.5,
  filter: (meta) => meta.type === 'plot' || meta.type === 'chapter'
})
// 返回所有相关章节和剧情线
```

### 场景 3：人物关系追踪

**问题**: 人物关系复杂，需要查询特定人物的所有出场

**解决方案**:
```typescript
const results = await vectorService.search('苏婉儿', 20, {
  filter: (meta) => meta.type === 'chapter'
})
// 返回所有包含苏婉儿的章节
```

## 测试

### 运行测试

在浏览器控制台执行：

```javascript
// 导入测试函数
import { testVectorService } from '@/utils/test-vector'

// 运行测试
await testVectorService()
```

### 测试内容

1. 创建测试项目和向量服务
2. 索引项目数据（世界观、人物、章节）
3. 执行语义搜索测试（5个查询）
4. 测试智能上下文检索
5. 测试上下文构建器集成
6. 清理测试数据

## 最佳实践

### 1. 选择合适的嵌入模型

| 场景 | 推荐模型 | 原因 |
|------|----------|------|
| 中文小说 | local + multilingual | 多语言支持，免费 |
| 英文小说 | local + all-MiniLM-L6-v2 | 质量好，速度快 |
| 高质量要求 | openai + text-embedding-3-large | 最高质量 |
| 成本敏感 | local + all-MiniLM-L6-v2 | 完全免费 |

### 2. 调整检索参数

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| topK | 5-10 | 太少遗漏信息，太多噪音增加 |
| minScore | 0.5-0.7 | 低于 0.5 相关性较差 |
| vectorWeight | 0.7 | 向量搜索权重略高于关键词 |

### 3. 索引时机

- **首次启用**: 建立完整索引（可能需要几分钟）
- **新增章节**: 索引新章节（增量更新）
- **修改内容**: 重新索引该章节
- **大量修改**: 重建整个索引

### 4. 存储管理

- 每个 100 章节的项目约需 10-20MB 存储空间
- IndexedDB 有浏览器限制（通常 50MB-500MB）
- 定期清理不需要的项目索引

## 故障排除

### 问题 1: 模型下载失败

**原因**: 网络问题或浏览器限制

**解决方案**:
1. 检查网络连接
2. 清除浏览器缓存后重试
3. 使用 OpenAI API 作为替代方案

### 问题 2: 索引速度慢

**原因**: 内容较多或模型计算量大

**解决方案**:
1. 使用更小/更快的模型（all-MiniLM-L6-v2）
2. 分批索引（不要一次性索引所有内容）
3. 使用 OpenAI API（云端计算，更快）

### 问题 3: 检索结果不相关

**原因**: 相似度阈值设置不当或模型不匹配

**解决方案**:
1. 提高 `minScore` 阈值（如 0.7）
2. 尝试不同的嵌入模型
3. 使用混合搜索（调整 `vectorWeight`）

### 问题 4: Token 超限

**原因**: 向量检索返回内容过多

**解决方案**:
1. 降低 `topK` 值
2. 提高 `minScore` 阈值
3. 使用 `filter` 过滤文档类型

## 未来优化

### 短期优化（已规划）
- [ ] 支持自定义嵌入模型
- [ ] 添加索引状态监控
- [ ] 优化大批量索引性能
- [ ] 支持索引导出/导入

### 长期优化（计划中）
- [ ] 集成 LanceDB（更强大的向量数据库）
- [ ] 支持多模态检索（图片、音频）
- [ ] 自动更新索引（章节修改时）
- [ ] 跨项目检索（查找相似剧情）

## 相关文件

- **类型定义**: `src/types/index.ts` (VectorServiceConfig, VectorDocumentMetadata, VectorSearchResult)
- **嵌入服务**: `src/utils/embeddings.ts`
- **向量存储**: `src/utils/vectorStore.ts`
- **向量服务**: `src/utils/vectorService.ts`
- **上下文构建**: `src/utils/contextBuilder.ts`
- **UI 配置**: `src/components/ProjectConfig.vue`
- **测试文件**: `src/utils/test-vector.ts`

## 贡献

欢迎提交 Issue 和 Pull Request！

### 开发指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/vector-improvement`)
3. 提交更改 (`git commit -m 'Add vector improvement'`)
4. 推送到分支 (`git push origin feature/vector-improvement`)
5. 创建 Pull Request

## 许可证

MIT License
