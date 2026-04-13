# 向量检索系统文档

## 概述

向量检索系统为 AI 小说工坊提供 **Graph-Guided RAG**（图引导检索增强生成），专为长篇小说（100+ 章节）的连贯性维护而设计。

V5 架构采用单集合（`chapter_content`）向量检索，配合 Sandbox Entity/StateEvent 图谱进行引导，彻底替代了 V4 的 IndexedDB/ChromaDB 多集合方案。

## 核心概念：Graph-Guided RAG

传统的 RAG 系统对所有文档类型一视同仁地进行向量检索。Graph-Guided RAG 的关键区别在于：

1. **世界观和角色不再走向量索引** -- 它们通过 Sandbox 的 Entity/StateEvent 图直接注入上下文，保证设定信息 100% 命中。
2. **向量检索仅覆盖章节正文** -- 单一集合 `chapter_content`，简化索引管理。
3. **图引导重排** -- 检索结果根据当前活跃实体名称进行重排（Entity Name Boost + Time Decay），确保与当前写作场景高度相关。

## 技术架构

### 后端：Rust HNSW（instant-distance）

```
Tauri IPC
    |
    v
src-tauri/src/db/vector.rs
    |-- instant-distance HNSW 索引（内存中）
    |-- SQLite BLOB 持久化（索引序列化存储）
    |-- 段落级分块 (~400 chars + 50 char overlap)
```

**关键参数：**

| 参数 | 值 | 说明 |
|------|-----|------|
| 嵌入模型 | `bge-small-zh-v1.5` | 中文优化，512 维 |
| 索引算法 | HNSW | instant-distance Rust 实现 |
| 分块粒度 | ~400 字符 | 段落级 + 句子边界感知 |
| 重叠长度 | 50 字符 | 相邻块重叠保证连贯性 |
| 索引持久化 | SQLite BLOB | 与项目数据共存，无需额外服务 |

### 前端 API：useVectorStore

```typescript
// src/stores/vectorStore.ts
import { useVectorStore } from '@/stores/vectorStore'

const vectorStore = useVectorStore()

// 检索与当前章节相关的上下文
const context = await vectorStore.retrieveRelevantContext(
  currentChapter,   // 当前章节对象
  project,          // 项目对象
  activeEntityNames // 当前活跃实体名称列表，用于 Entity Name Boost
)
```

### 核心模块

#### 1. 向量后端 (`src-tauri/src/db/vector.rs`)

**功能**: HNSW 索引构建、向量检索、SQLite BLOB 持久化

**Tauri 命令接口：**
```rust
#[tauri::command]
async fn build_vector_index(project_id: String) -> Result<(), String>;

#[tauri::command]
async fn search_vectors(
    project_id: String,
    query_embedding: Vec<f32>,
    top_k: u32,
    min_score: f32
) -> Result<Vec<VectorSearchResult>, String>;

#[tauri::command]
async fn index_chapter_chunks(
    project_id: String,
    chapter_id: String,
    chunks: Vec<ChunkData>
) -> Result<(), String>;
```

#### 2. 向量 Store (`src/stores/vectorStore.ts`)

**功能**: 前端向量检索调度与结果缓存

**核心方法：**
- `buildIndex(projectId)`: 构建项目向量索引
- `indexChapter(projectId, chapterId, chunks)`: 索引单个章节
- `search(projectId, query, topK, minScore)`: 语义搜索
- `retrieveRelevantContext(currentChapter, project, activeEntityNames)`: Graph-Guided RAG 检索

**使用示例：**
```typescript
import { useVectorStore } from '@/stores/vectorStore'

const vectorStore = useVectorStore()

// 构建索引
await vectorStore.buildIndex('project-id')

// Graph-Guided RAG 检索
const context = await vectorStore.retrieveRelevantContext(
  currentChapter,
  project,
  ['林云', '苏婉儿', '青云宗']  // 活跃实体名称
)

// context 包含经过 Entity Name Boost 和 Time Decay 重排后的章节片段
```

#### 3. 上下文 Pipeline 中间件 (`src/utils/contextPipeline.ts`)

**功能**: 作为 Context Pipeline 的一个中间件，将向量检索结果注入生成上下文

```typescript
// VectorMiddleware 在 Pipeline 中的位置
const pipeline = new ContextPipeline()
  .use(new SystemPromptMiddleware())
  .use(new EntityMiddleware())       // Entity/StateEvent 图注入
  .use(new PlotAnchorMiddleware())   // 命运锚点预警
  .use(new VectorMiddleware())       // Graph-Guided RAG 向量检索
  .use(new SummaryMiddleware())
  .use(new RecentChapterMiddleware())
```

## 分块策略

### 段落级分块 + 句子边界感知

```typescript
interface ChunkConfig {
  maxChunkSize: 400     // 约 400 字符
  overlapSize: 50       // 50 字符重叠
  separators: ['\n\n', '\n', '。', '！', '？', '；']  // 句子边界
}
```

**分块逻辑：**
1. 按段落分隔符（`\n\n`）初步分段
2. 超过 400 字符的段落按句子边界（`。！？；`）二次切分
3. 相邻块保留 50 字符重叠，避免关键信息被截断
4. 每个块附带元数据：`chapterId`、`chapterNumber`、`position`

## 重排策略

### Entity Name Boost（实体名称加权）

检索结果中包含当前活跃实体名称的片段获得 **1.5x** 分数加成。

```typescript
function applyEntityBoost(
  results: VectorSearchResult[],
  activeEntityNames: string[]
): VectorSearchResult[] {
  return results.map(r => {
    const hasEntity = activeEntityNames.some(name =>
      r.content.includes(name)
    )
    return {
      ...r,
      score: hasEntity ? r.score * 1.5 : r.score
    }
  })
}
```

### Time Decay（时间衰减）

- **未来章节**: 0.1 惩罚系数（尚未发生的内容几乎不参考）
- **过去章节**: 每距离当前章节 1 章，衰减 0.5%

```typescript
function applyTimeDecay(
  results: VectorSearchResult[],
  currentChapterNumber: number
): VectorSearchResult[] {
  return results.map(r => {
    const distance = currentChapterNumber - r.metadata.chapterNumber
    if (distance < 0) {
      // 未来章节
      return { ...r, score: r.score * 0.1 }
    }
    // 过去章节：每章衰减 0.5%
    const decayFactor = Math.pow(0.995, distance)
    return { ...r, score: r.score * decayFactor }
  })
}
```

## 单集合设计：chapter_content

V5 仅维护一个向量集合：

| 集合名 | 内容 | 分块策略 |
|--------|------|----------|
| `chapter_content` | 章节正文 | 段落级 (~400 chars + 50 overlap) |

**不再索引的类型：**
- ~~世界观设定~~ -- 改用 Entity 图直接注入
- ~~人物设定~~ -- 改用 Entity 图直接注入
- ~~大纲/剧情线~~ -- 改用 PlotAnchorMiddleware 注入
- ~~伏笔追踪~~ -- 改用 PlotAnchorMiddleware 注入

## Token 预算分配

```
TOTAL: 6000 tokens
  SYSTEM_PROMPT:       300
  AUTHORS_NOTE:        200
  ENTITY_GRAPH:        800   <-- Entity/StateEvent 直接注入（非向量）
  MEMORY_TABLES:       500
  PLOT_ANCHOR:         400   <-- 命运锚点预警（非向量）
  VECTOR_CONTEXT:      600   <-- Graph-Guided RAG 检索结果
  SUMMARY:             600
  RECENT_CHAPTERS:    2000
  RESERVE:             600
```

## 使用场景

### 场景 1：Graph-Guided 长篇连贯性维护

```typescript
// 写新章节时，自动检索相关历史内容并注入上下文
const context = await vectorStore.retrieveRelevantContext(
  currentChapter,
  project,
  activeEntityNames  // 从 Sandbox 图获取当前活跃实体
)
// context 包含：
// - 与当前活跃实体相关的历史章节片段（Entity Name Boost）
// - 按时间衰减排序（近处章节权重更高）
// - 不包含设定类信息（已由 Entity 图直接注入）
```

### 场景 2：伏笔和细节查询

```typescript
// 直接搜索章节正文
const results = await vectorStore.search(
  'project-id',
  '青云宗的秘密',
  10,
  0.5
)
// 返回所有相关章节片段
```

### 场景 3：章节索引更新

```typescript
// 章节编辑完成后，增量更新索引
await vectorStore.indexChapter(
  'project-id',
  'chapter-id',
  chapterChunks
)
```

## 与 V4 的差异

| 特性 | V4 (IndexedDB/ChromaDB) | V5 (Graph-Guided RAG) |
|------|------------------------|----------------------|
| 向量后端 | IndexedDB / ChromaDB | instant-distance (Rust HNSW) |
| 存储 | 浏览器 IndexedDB | SQLite BLOB |
| 集合数 | 多集合（worldview, character, plot, chapter） | 单集合（chapter_content） |
| 嵌入模型 | all-MiniLM-L6-v2 (384d) | bge-small-zh-v1.5 (512d) |
| 设定检索 | 向量检索 | Entity/StateEvent 图直接注入 |
| 重排 | 无 | Entity Name Boost + Time Decay |
| 前端 API | vectorService.ts | useVectorStore (Pinia) |

## 故障排除

### 问题 1: 索引构建失败

**原因**: 章节内容为空或分块参数异常

**解决方案**:
1. 检查章节内容是否已保存
2. 重建完整索引：`vectorStore.buildIndex(projectId)`
3. 查看 Tauri 后端日志

### 问题 2: 检索结果不相关

**原因**: 活跃实体名称未正确传递

**解决方案**:
1. 确认 Sandbox 图中实体已正确关联到当前章节
2. 检查 `activeEntityNames` 是否包含当前出场角色
3. 调整 `minScore` 阈值

### 问题 3: Token 超限

**原因**: 向量检索返回内容过多

**解决方案**:
1. 降低 `topK` 值
2. 提高 `minScore` 阈值
3. VectorMiddleware 会自动按 Token 预算截断

## 相关文件

- **Rust 向量后端**: `src-tauri/src/db/vector.rs`
- **Pinia Store**: `src/stores/vectorStore.ts`
- **上下文 Pipeline**: `src/utils/contextPipeline.ts`
- **Entity Store**: `src/stores/sandboxStore.ts`
- **类型定义**: `src/types/index.ts`

---

**最后更新:** 2026-04-13