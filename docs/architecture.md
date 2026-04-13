# AI小说工坊 - 系统架构设计文档

## 一、系统概述

### 1.1 项目定位
AI小说工坊是一个支持100万字以上长篇小说智能生成的桌面应用程序，支持全自动和半自动两种创作模式，用户可随时干预调整。

### 1.2 核心特性
- 支持所有类型小说创作，用户自定义篇幅
- 分层AI模型策略（规划用高智商模型、写作用性价比模型，带故障转移容错）
- 批量生成和实时生成双模式
- 完整的设定系统（世界观、人物、大纲）
- 智能记忆系统（支持100万字+上下文，基于 Middleware Pipeline 构建）
- 质量检查与自动修复
- 模板系统（可导出分享）
- 纯桌面应用，基于原子化 API IPC 更新 SQLite，彻底消除 OOM 与吃书风险

---

## 二、系统架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              用户界面层 (UI Layer)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  项目管理    │  │  设定编辑器  │  │  写作工作台  │  │  模板中心    │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  大纲编辑器  │  │  章节预览    │  │  质量报告    │  │  设置中心    │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           业务逻辑层 (Service Layer)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        项目管理服务                                    │  │
│  │  - 项目创建/删除/导出  - 版本管理  - 模板应用                         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        设定管理服务                                    │  │
│  │  - 世界观管理  - 实体管理  - 物品/地点管理  - 关系图谱                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        大纲管理服务                                    │  │
│  │  - 结构规划  - 章节编排  - 情节线管理  - 伏笔追踪                     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        写作引擎服务                                    │  │
│  │  - 章节生成  - 续写/改写  - 风格控制  - 进度管理                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        记忆管理服务                                    │  │
│  │  - 上下文压缩  - 关键信息提取  - 向量检索  - 一致性检查               │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        质量检查服务                                    │  │
│  │  - 语法检查  - 逻辑一致性  - 风格一致性  - 自动修复                   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AI模型层 (AI Layer)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      模型调度器 (Model Router)                         │  │
│  │  - 模型选择策略  - 负载均衡  - 成本优化  - 故障转移                   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐                │
│  │   规划模型     │  │   写作模型     │  │   检查模型     │                │
│  │  (高智商模型)  │  │  (性价比模型)  │  │   (专用模型)   │                │
│  │  Claude Opus   │  │ Claude Sonnet  │  │ Claude Haiku   │                │
│  │  GPT-4         │  │ GPT-4o-mini    │  │ 本地模型       │                │
│  └────────────────┘  └────────────────┘  └────────────────┘                │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      提示词工程模块                                    │  │
│  │  - 模板管理  - 变量注入  - 上下文构建  - 输出解析                     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           数据持久层 (Data Layer)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      数据访问层 (Repository)                           │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐                │
│  │   SQLite DB    │  │   文件存储     │  │   instant-distance │                │
│  │  (结构化数据)  │  │  (小说内容)    │  │   (Rust HNSW)   │                │
│  └────────────────┘  └────────────────┘  └────────────────┘                │
│                                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐                │
│  │   配置存储     │  │   缓存系统     │  │   备份系统     │                │
│  └────────────────┘  └────────────────┘  └────────────────┘                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 三、模块划分

### 3.1 核心模块

#### 3.1.1 项目管理模块 (ProjectManager)
**职责：** 管理小说项目的生命周期

```
ProjectManager
├── ProjectService          # 项目CRUD操作
├── ProjectExporter         # 项目导出（JSON/ZIP/模板）
├── ProjectImporter         # 项目导入
├── VersionController       # 版本管理与回退
└── TemplateManager         # 模板应用与管理
```

**核心接口：**
```typescript
interface IProjectManager {
  createProject(config: ProjectConfig): Project;
  loadProject(id: string): Project;
  saveProject(project: Project): void;
  exportProject(id: string, format: ExportFormat): Buffer;
  importProject(data: Buffer): Project;
  createTemplate(id: string): Template;
  applyTemplate(projectId: string, templateId: string): void;
}
```

#### 3.1.2 实体与状态管理模块 (SandboxData)
**职责：** 管理长篇小说中人物、地点、物品等实体的历史状态（Entity/StateEvent架构）

```
SandboxData
├── EntityService           # 实体管理（替代旧角色卡/世界书）
├── StateEventService       # 历史状态流管理
├── TimelineService         # 状态与章节时间线关联
├── ThemeRegistry           # 全局UI主题隔离服务
├── AffinityService         # 实体关系动态好感度追踪
└── WorldGenWizard          # 对话式批量实体与关系草稿生成流
```

**核心接口：**
```typescript
interface ISandboxData {
  // 实体操作
  createEntity(projectId: string, data: EntityData): Entity;
  updateEntity(id: string, data: Partial<EntityData>): Entity;
  
  // 状态流
  pushEvent(entityId: string, event: StateEventData): void;
  loadEvents(entityId: string, page: number): Promise<StateEvent[]>;
  
  // 动态图谱
  getDynamicRelations(chapterRange: [number, number]): RelationGraph;
}
```

#### 3.1.3 大纲管理模块 (OutlineManager)
**职责：** 管理小说大纲和章节结构

```
OutlineManager
├── OutlineService          # 大纲结构管理
├── ChapterService          # 章节管理
├── PlotLoomBoard           # 看板+时间线融合结构视图 (VolumeArc & PlotAnchor)
├── PlotAnchorMiddleware    # 命运锚点预警中间件拦截
└── OutlineGenerator        # AI大纲生成
```

**核心接口：**
```typescript
interface IOutlineManager {
  createOutline(projectId: string, config: OutlineConfig): Outline;
  generateOutline(projectId: string, prompt: string): Promise<Outline>;
  addChapter(outlineId: string, chapter: ChapterData): Chapter;
  reorderChapters(outlineId: string, order: string[]): void;
  trackForeshadow(outlineId: string, foreshadow: ForeshadowData): void;
  resolveForeshadow(foreshadowId: string, chapterId: string): void;
}
```

#### 3.1.4 写作引擎模块 (WritingEngine)
**职责：** 核心写作生成逻辑

```
WritingEngine
├── GenerationService       # 内容生成
├── RewriteService          # 改写服务
├── ContinuationService     # 续写服务
├── StyleController         # 风格控制
├── ProgressTracker         # 进度追踪
└── BatchProcessor          # 批量处理
```

**核心接口：**
```typescript
interface IWritingEngine {
  generateChapter(chapterId: string, context: GenContext): Promise<Chapter>;
  continueWriting(chapterId: string, length: number): Promise<string>;
  rewriteContent(content: string, instruction: string): Promise<string>;
  batchGenerate(chapterIds: string[], config: BatchConfig): Promise<BatchResult>;
  getProgress(projectId: string): Progress;
}
```

#### 3.1.5 记忆管理模块 (MemoryManager)
**职责：** 智能上下文管理，支持超长篇小说

```
MemoryManager
├── ContextCompressor       # 上下文压缩
├── KeyInfoExtractor        # 关键信息提取
├── VectorIndexer           # 向量索引
├── MemoryRetriever         # 记忆检索
├── ConsistencyChecker      # 一致性检查
└── SummaryGenerator        # 摘要生成
```

**核心接口：**
```typescript
interface IMemoryManager {
  addMemory(projectId: string, content: string, metadata: MemoryMeta): void;
  compressContext(context: Context): CompressedContext;
  retrieveRelevant(query: string, topK: number): Memory[];
  checkConsistency(newContent: string, context: Context): ConsistencyResult;
  generateSummary(chapterIds: string[]): Promise<Summary>;
}
```

#### 3.1.6 质量检查模块 (QualityChecker)
**职责：** 内容质量检查与修复

```
QualityChecker
├── SyntaxChecker           # 语法检查
├── LogicChecker            # 逻辑检查
├── StyleChecker            # 风格检查
├── ConsistencyChecker      # 一致性检查
└── AutoFixer               # 自动修复
```

**核心接口：**
```typescript
interface IQualityChecker {
  checkContent(content: string): CheckResult[];
  checkChapter(chapterId: string): Promise<ChapterReport>;
  checkProject(projectId: string): Promise<ProjectReport>;
  autoFix(content: string, issues: Issue[]): string;
}
```

### 3.2 AI模型模块

#### 3.2.1 模型调度器 (ModelRouter)
```
ModelRouter
├── FailoverManager         # 故障转移与容错 (候选队列降级机制)
├── ModelSelector           # 模型选择策略
├── LoadBalancer            # 负载均衡
├── CostOptimizer           # 成本优化
└── RateLimiter             # 速率限制
```

**模型使用策略：**
```typescript
enum TaskType {
  OUTLINE_GENERATION = 'outline',      // 规划任务 -> 高智商模型
  CHAPTER_PLANNING = 'planning',       // 规划任务 -> 高智商模型
  CONTENT_WRITING = 'writing',         // 写作任务 -> 性价比模型
  CONTENT_REVIEW = 'review',           // 检查任务 -> 专用模型
  SUMMARY = 'summary',                 // 摘要任务 -> 性价比模型
  CONSISTENCY_CHECK = 'consistency',   // 检查任务 -> 专用模型
}

interface ModelStrategy {
  [TaskType.OUTLINE_GENERATION]: 'high-iq',      // Claude Opus / GPT-4
  [TaskType.CHAPTER_PLANNING]: 'high-iq',
  [TaskType.CONTENT_WRITING]: 'cost-effective',  // Claude Sonnet / GPT-4o-mini
  [TaskType.CONTENT_REVIEW]: 'specialized',      // Claude Haiku / 本地模型
  [TaskType.SUMMARY]: 'cost-effective',
  [TaskType.CONSISTENCY_CHECK]: 'specialized',
}
```

#### 3.2.2 提示词工程模块 (PromptEngineer)
```
PromptEngineer
├── TemplateManager         # 模板管理
├── VariableInjector        # 变量注入
├── ContextPipeline         # 基于 Middleware 的上下游流水线组装
├── StructuredOutput        # JSON Schema Tool Calling 强类型输出
└── PromptOptimizer         # 提示词优化
```

---

## 四、数据流设计

### 4.1 章节生成数据流

```
用户请求生成章节
        │
        ▼
┌───────────────────┐
│  1. 准备阶段      │
├───────────────────┤
│ - 获取章节大纲    │
│ - 加载相关设定    │
│ - 检索历史记忆    │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  2. 上下文构建    │
├───────────────────┤
│ - 压缩历史内容    │
│ - 提取关键信息    │
│ - 构建提示词      │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  3. AI生成        │
├───────────────────┤
│ - 选择模型        │
│ - 发送请求        │
│ - 接收响应        │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  4. 后处理        │
├───────────────────┤
│ - 解析输出        │
│ - 质量检查        │
│ - 更新记忆        │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  5. 存储返回      │
├───────────────────┤
│ - 保存章节        │
│ - 更新索引        │
│ - 返回结果        │
└───────────────────┘
```

### 4.2 记忆检索数据流

```
章节生成需要上下文
        │
        ▼
┌───────────────────┐
│  1. 向量检索      │
├───────────────────┤
│ - 查询编码        │
│ - 相似度计算      │
│ - Top-K召回       │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  2. 时间窗口      │
├───────────────────┤
│ - 最近N章全文     │
│ - 时间衰减权重    │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  3. 设定匹配      │
├───────────────────┤
│ - 出场人物        │
│ - 相关地点        │
│ - 涉及物品        │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  4. 上下文组装    │
├───────────────────┤
│ - 优先级排序      │
│ - Token限制       │
│ - 格式化输出      │
└───────────────────┘
```

### 4.3 批量生成数据流

```
用户选择批量生成
        │
        ▼
┌───────────────────┐
│  1. 任务规划      │
├───────────────────┤
│ - 章节排序        │
│ - 依赖分析        │
│ - 并行规划        │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  2. 队列调度      │
├───────────────────┤
│ - 任务入队        │
│ - 并发控制        │
│ - 进度追踪        │
└───────────────────┘
        │
        ▼
    ┌───────┐
    │  循环  │◄─────────────────┐
    └───────┘                   │
        │                       │
        ▼                       │
┌───────────────────┐           │
│  3. 生成单章      │           │
├───────────────────┤           │
│ - 获取上下文      │           │
│ - AI生成         │           │
│ - 保存结果       │           │
└───────────────────┘           │
        │                       │
        ▼                       │
┌───────────────────┐           │
│  4. 更新状态      │           │
├───────────────────┤           │
│ - 进度更新        │           │
│ - 记忆更新        │           │
│ - 通知UI         │           │
└───────────────────┘           │
        │                       │
        ▼                       │
   ┌──────────┐                 │
   │ 还有章节? │─── 是 ─────────┘
   └──────────┘
        │ 否
        ▼
┌───────────────────┐
│  5. 完成报告      │
├───────────────────┤
│ - 统计信息        │
│ - 质量报告        │
│ - 导出选项        │
└───────────────────┘
```

---

## 五、技术栈选择

### 5.1 前端技术栈

| 层级 | 技术选型 | 选择理由 |
|------|---------|---------|
| 框架 | **Tauri 2.0** | 轻量级桌面应用，Rust后端性能优秀 |
| UI框架 | **Vue 3 + TypeScript** | 类型安全，响应式开发，生态丰富 |
| 状态管理 | **Pinia** | Vue 3官方推荐，轻量、支持持久化 |
| UI组件 | **Element Plus** | Vue 3原生支持，组件丰富，样式现代 |
| 编辑器 | **TipTap** | 强大的富文本编辑器 |
| 图表 | **vue-konva** | 关系图谱、世界地图可视化 |
| 数据可视化 | **ECharts** | 进度、统计图表 |

### 5.2 后端技术栈

| 层级 | 技术选型 | 选择理由 |
|------|---------|---------|
| 运行时 | **Rust (Tauri)** | 高性能、内存安全 |
| 数据库 | **SQLite + SQLite FTS5** | 本地存储、全文搜索 |
| 向量索引 | **instant-distance (HNSW)** | 高性能向量检索、Rust原生HNSW实现 |
| 向量存储 | **SQLite BLOB** | 向量数据持久化、与项目数据共存 |
| 缓存 | **moka** | Rust高性能内存缓存 |
| 文件处理 | **tokio + async-std** | 异步文件操作 |

### 5.3 AI集成

| 功能 | 技术选型 | 说明 |
|------|---------|------|
| 调试探针 | **Express + better-sqlite3** | 本地微服务 (`debug-server.js`) |
| API客户端 | **async-openai / fetch** | 支持OpenAI兼容API |
| Embedding | **text-embedding-3-small** | 性价比高，效果好 |
| 规划模型 | Claude Opus 4 / GPT-4 | 高智商模型 |
| 写作模型 | Claude Sonnet 4 / GPT-4o-mini | 性价比模型 |
| 检查模型 | Claude Haiku / 本地模型 | 快速检查 |

### 5.4 项目结构

```
ai-novel-workshop/
├── src-tauri/                # Rust后端
│   ├── src/
│   │   ├── commands/         # Tauri命令
│   │   ├── services/         # 业务服务
│   │   │   ├── project.rs
│   │   │   ├── setting.rs
│   │   │   ├── outline.rs
│   │   │   ├── writing.rs
│   │   │   ├── memory.rs
│   │   │   └── quality.rs
│   │   ├── ai/               # AI模块
│   │   │   ├── router.rs
│   │   │   ├── prompts.rs
│   │   │   └── models.rs
│   │   ├── db/               # 数据库
│   │   │   ├── sqlite.rs
│   │   │   └── vector.rs
│   │   └── models/           # 数据模型
│   └── Cargo.toml
│
├── src/                      # Vue 3 前端
│   ├── components/           # UI组件
│   │   ├── project/
│   │   ├── setting/
│   │   ├── outline/
│   │   ├── writing/
│   │   └── common/
│   ├── views/                  # 页面
│   ├── stores/               # 状态管理
│   ├── hooks/                # 自定义Hook
│   ├── services/             # 前端服务
│   ├── types/                # 类型定义
│   └── utils/                # 工具函数
│
├── docs/                     # 文档
├── tests/                    # 测试
└── assets/                   # 资源文件
```

---

## 六、核心数据结构

### 6.1 项目结构

```typescript
interface Project {
  id: string;
  name: string;
  genre: string;                    // 小说类型
  targetWordCount: number;          // 目标字数
  currentWordCount: number;         // 当前字数
  createdAt: Date;
  updatedAt: Date;

  // 关联数据
  worldView: WorldView;
  characters: Character[];
  outline: Outline;
  chapters: Chapter[];

  // 配置
  config: ProjectConfig;
  statistics: ProjectStatistics;
}

interface ProjectConfig {
  writingMode: 'auto' | 'semi-auto';      // 写作模式
  generationMode: 'batch' | 'realtime';   // 生成模式
  styleConfig: StyleConfig;               // 风格配置
  aiConfig: AIConfig;                     // AI配置
}

interface AIConfig {
  planningModel: string;           // 规划模型
  writingModel: string;            // 写作模型
  checkModel: string;              // 检查模型
  temperature: number;
  maxTokens: number;
}
```

### 6.2 设定结构

```typescript
interface Entity {
  id: string;
  projectId: string;
  name: string;
  type: EntityType; // character | location | item | faction | concept
  description: string;
  aliases: string[];
  relationships: EntityRelationship[];
  attributes: Record<string, any>;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

type EntityType = 'character' | 'location' | 'item' | 'faction' | 'concept';

interface EntityRelationship {
  targetId: string;
  type: string;
  description: string;
  attitude: number; // 动态好感度，-100 到 100
}

interface StateEvent {
  id: string;
  projectId: string;
  chapterId?: string;
  entityId?: string;
  type: EventType; // CREATED | UPDATED | STATUS_CHANGE | RELATION_UPDATE等
  description: string;
  timestamp: string;
  changes: Record<string, any>;
}
```

### 6.3 大纲结构

```typescript
interface Outline {
  id: string;
  projectId: string;
  structure: OutlineStructure;     // 结构类型
  volumes: Volume[];               // 卷
  totalChapters: number;
  estimatedWords: number;

  plotLines: PlotLine[];           // 情节线
  foreshadows: Foreshadow[];       // 伏笔
}

interface Volume {
  id: string;
  name: string;
  description: string;
  chapters: ChapterOutline[];
  wordCount: number;
}

interface ChapterOutline {
  id: string;
  number: number;
  title: string;
  summary: string;                 // 章节概要
  plotPoints: PlotPoint[];         // 情节点
  characters: string[];            // 出场人物ID
  locations: string[];             // 地点ID
  foreshadows: {
    plant: string[];               // 埋下的伏笔
    resolve: string[];             // 回收的伏笔
  };
  estimatedWords: number;
  status: 'planned' | 'writing' | 'completed' | 'revised';
}

interface Foreshadow {
  id: string;
  name: string;
  description: string;
  plantChapter: string;            // 埋下章节
  resolveChapter?: string;         // 回收章节
  status: 'planted' | 'resolved' | 'abandoned';
  importance: 'major' | 'minor';
}
```

### 6.4 章节结构

```typescript
interface Chapter {
  id: string;
  projectId: string;
  volumeId: string;
  number: number;
  title: string;
  content: string;
  wordCount: number;

  // 严格结构化的 JSON 输出记忆
  summary: string;
  keywords: string[];
  characters: string[];
  locations: string[];

  // 状态
  status: ChapterStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;

  // 质量
  qualityScore?: number;
  issues: QualityIssue[];
}

type ChapterStatus =
  | 'planned'        // 已规划
  | 'generating'     // 生成中
  | 'draft'          // 初稿
  | 'revising'       // 修改中
  | 'completed'      // 已完成
  | 'exported';      // 已导出
```

### 6.5 记忆结构

```typescript
interface Memory {
  id: string;
  projectId: string;
  type: MemoryType;
  content: string;
  embedding?: number[];            // 向量嵌入
  metadata: {
    chapterId?: string;
    characterId?: string;
    locationId?: string;
    importance: number;            // 重要性 1-10
    timestamp: Date;
  };
}

type MemoryType =
  | 'event'          // 事件
  | 'character'      // 人物信息
  | 'relationship'   // 关系变化
  | 'setting'        // 设定信息
  | 'plot'           // 情节要点
  | 'summary';       // 摘要

interface CompressedContext {
  projectId: string;
  targetChapterId: string;
  totalTokens: number;

  // 分层压缩
  layers: {
    full: string;                  // 最近章节全文
    summary: string;               // 中期摘要
    highlights: string;            // 关键要点
    vector: Memory[];              // 向量检索结果
  };

  // 设定
  activeCharacters: Character[];
  relevantSettings: Setting[];
  worldView: WorldView;
}
```

---

## 七、接口定义

### 7.1 Tauri命令接口

```rust
// 项目管理
#[tauri::command]
async fn create_project(config: ProjectConfig) -> Result<Project, String>;

#[tauri::command]
async fn load_project(id: String) -> Result<Project, String>;

#[tauri::command]
async fn save_project(project: Project) -> Result<(), String>;

#[tauri::command]
async fn export_project(id: String, format: ExportFormat) -> Result<Vec<u8>, String>;

// 设定管理
#[tauri::command]
async fn create_entity(project_id: String, data: EntityData) -> Result<Entity, String>;

#[tauri::command]
async fn save_entity_atomic(project_id: String, data: String) -> Result<(), String>; // 避免大JSON解析 OOM

#[tauri::command]
async fn save_state_event_atomic(project_id: String, data: String) -> Result<(), String>;

#[tauri::command]
async fn update_entity(id: String, data: PartialEntityData) -> Result<Entity, String>;

#[tauri::command]
async fn get_entity_relations(id: String) -> Result<Vec<Relation>, String>;

// 大纲管理
#[tauri::command]
async fn generate_outline(project_id: String, prompt: String) -> Result<Outline, String>;

#[tauri::command]
async fn add_chapter(outline_id: String, chapter: ChapterData) -> Result<Chapter, String>;

// 写作
#[tauri::command]
async fn generate_chapter(chapter_id: String, context: GenContext) -> Result<Chapter, String>;

#[tauri::command]
async fn batch_generate(chapter_ids: Vec<String>, config: BatchConfig) -> Result<BatchResult, String>;

#[tauri::command]
async fn continue_writing(chapter_id: String, length: u32) -> Result<String, String>;

// 记忆管理
#[tauri::command]
async fn retrieve_memories(project_id: String, query: String, top_k: u32) -> Result<Vec<Memory>, String>;

#[tauri::command]
async fn check_consistency(project_id: String, content: String) -> Result<ConsistencyResult, String>;

// 质量检查
#[tauri::command]
async fn check_chapter_quality(chapter_id: String) -> Result<ChapterReport, String>;

#[tauri::command]
async fn auto_fix_issues(content: String, issues: Vec<Issue>) -> Result<String, String>;
```

### 7.2 AI服务接口

```typescript
interface AIService {
  // 模型调用
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  stream(request: CompletionRequest): AsyncIterable<CompletionChunk>;

  // Embedding
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

interface CompletionRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  stream?: boolean;
}

interface CompletionResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
}
```

---

## 八、关键技术难点与解决方案

### 8.1 超长上下文支持（100万字+）

**问题：** LLM有Token限制，无法直接处理超长小说上下文

**解决方案：**
1. **Pipeline & Middleware 组装器**
   - 彻底取代旧的拼接方法，使得上下文组装模块化。各中间件自行处理 Token 截断（采用严格 Unicode 截取），规避因 Token 断裂引起的 API 400 错误。

2. **智能检索与混合重排**
   - Embedding + instant-distance (Rust HNSW) 检索相关历史
   - 设定类（角色/世界观）按相关度降序，剧情类按时间序拼接。
   - **自动滚动大纲**：大纲余量不足5章时，自动提取前文触发AI续写20章，确保剧情无限延伸而不脱轨。

3. **渐进式摘要**
   - 每5章生成一次阶段性摘要
   - 章节生成后自动投喂轻量级模型，通过 **Tool Calling** (Structured Outputs) 更新表格状态，消灭正则提取的不稳定性。

### 8.2 一致性保证

**问题：** 长篇小说容易出现前后矛盾

**解决方案：**
1. **设定强制约束**
   - 生成前注入相关设定到提示词
   - 人物性格、能力等硬性约束

2. **实时一致性检查**
   - 生成后自动检查人物、地点、时间等一致性
   - 发现问题自动标记或修复

3. **关系图谱追踪**
   - 维护人物关系图谱
   - 自动更新关系变化

### 8.3 成本优化

**问题：** 大量AI调用成本高

**解决方案：**
1. **分层模型策略**
   - 规划任务（大纲、章节规划）用高智商模型
   - 写作任务用性价比模型
   - 简单检查用轻量模型

2. **智能缓存**
   - 相似请求缓存结果
   - 设定信息复用

3. **批量优化**
   - 合并相似请求
   - 异步并行处理

### 8.4 写作质量

**问题：** AI生成内容质量不稳定

**解决方案：**
1. **多轮优化**
   - 初稿 → 检查 → 修改 → 润色

2. **风格控制**
   - 风格模板系统
   - 参考文本学习

3. **人机协作**
   - 半自动模式支持实时干预
   - 版本对比和回退

---

## 九、开发计划

### 9.1 MVP阶段（4周）

**Week 1-2: 基础架构**
- 项目结构搭建
- 数据库设计实现
- 基础UI框架

**Week 3-4: 核心功能**
- 项目管理
- 设定管理
- 基础写作功能

### 9.2 完善阶段（4周）

**Week 5-6: 高级功能**
- 大纲系统
- 记忆系统
- 质量检查

**Week 7-8: 优化打磨**
- 批量生成
- 模板系统
- 性能优化

### 9.3 发布阶段（2周）

**Week 9-10: 测试发布**
- 全面测试
- 文档完善
- 打包发布

---

## 十、风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| AI成本过高 | 高 | 分层模型、智能缓存、本地模型备选 |
| 上下文丢失 | 高 | 多层记忆、向量检索、摘要系统 |
| 质量不稳定 | 中 | 多轮优化、风格模板、人工干预 |
| 性能问题 | 中 | 异步处理、缓存优化、增量更新 |
| 数据安全 | 高 | 本地存储、加密、备份机制 |

---

**文档版本：** v1.0
**创建日期：** 2026-03-20
**作者：** AI小说工坊架构组
