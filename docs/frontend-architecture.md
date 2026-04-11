# AI小说工坊 - 前端架构设计文档

## 1. 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Vue | 3.4+ | 核心框架 |
| Vite | 5.x | 构建工具 |
| TypeScript | 5.x | 类型支持 |
| Pinia | 2.x | 状态管理 |
| Vue Router | 4.x | 路由管理 |
| Element Plus | 2.x | UI组件库 |
| @vueuse/core | 10.x | 组合式工具函数 |
| @antv/g6 | 5.x | 关系图渲染 |
| vis-timeline | 7.x | 时间线编辑器 |
| vue-konva | 3.x | 世界观地图渲染 |
| ECharts | 5.x | 统计图表渲染 |
| Marked | 12.x | Markdown解析 |

## 2. 项目结构

```
ai-novel-workshop/
├── public/
│   └── favicon.ico
├── src/
│   ├── assets/              # 静态资源
│   │   ├── styles/          # 全局样式
│   │   └── icons/
│   ├── components/          # Vue组件 (40+)
│   │   ├── config/          # AI配置相关组件
│   │   │   ├── ModelSelector.vue
│   │   │   ├── ProviderManager.vue
│   │   │   └── StorytellerPanel.vue
│   │   ├── AIAssistant.vue  # AI对话与审查辅助
│   │   ├── Chapters.vue     # 核心编辑大盘(沉浸式章节面板)
│   │   ├── Characters.vue   # 实体集与详情管理
│   │   ├── CharacterStateTracker.vue # 实体状态实时追踪
│   │   ├── GlassContextPanel.vue     # 毛玻璃防抖上下文雷达
│   │   ├── GlobalMutator.vue         # 跨章节核弹级正则替换
│   │   ├── GlobalTaskObserver.vue    # 全局调度观察器
│   │   ├── MemoryTables.vue          # SQLite挂载的表格记忆
│   │   ├── NovelImportDialog.vue     # 智能小说解析导入器
│   │   ├── Outline.vue               # 树状细纲(卷/章/幕)
│   │   ├── ProjectConfig.vue         # 项目级别配置项
│   │   ├── QualityReport.vue         # 文本防吃书质量检测报告
│   │   ├── RelationshipGraph.vue     # AntV G6 关系图网络
│   │   ├── TimelineEditor.vue        # 故事时间轴
│   │   ├── UnifiedImportDialog.vue   # 统一设定导入向导
│   │   ├── WorldMap.vue              # 世界地图编辑器
│   │   ├── WorldSetting.vue          # 世界观架构编辑
│   │   └── WorldbookPanel.vue        # 兼容旧版世界书导入
│   ├── composables/         # Vue 3 组合式函数
│   │   ├── useAuditLog.ts   # 审查追踪器埋点
│   │   ├── useChapterExport.ts
│   │   └── useContextRadar.ts
│   ├── stores/              # Pinia全局状态管理
│   │   ├── index.ts
│   │   ├── ai.ts            # AI 服务状态调度
│   │   ├── character-card.ts# 兼容旧版角色卡服务
│   │   ├── knowledge.ts     # RAG知识库管理
│   │   ├── project.ts       # SQLite大纲正文同步
│   │   ├── storage.ts       # IPC通信层 (SQLite/IndexedDB路由)
│   │   ├── taskManager.ts   # 异步后台任务队列
│   │   └── worldbook.ts     # 兼容旧版动态词条注入挂载点
│   ├── router/              # Vue Router 配置
│   │   └── index.ts
│   ├── services/            # 核心业务服务层
│   │   ├── ai/              # 模型调用控制层
│   │   │   ├── ModelRouter.ts # 低成本路由拦截分发
│   │   │   └── index.ts
│   │   ├── conversation-trace-apply.ts # 对话应用层
│   │   ├── conversation-trace-conflict.ts # 冲突检测层
│   │   ├── conversation-trace-extractor.ts # 大模型提取层
│   │   ├── conversation-trace-parser.ts # 对话解析层
│   │   ├── generation-scheduler.ts # V4 核心：异步批量章节引擎
│   │   ├── memory-service.ts  # 表格记忆提取器
│   │   ├── state-updater.ts   # V4 核心：后台词条生成引擎
│   │   ├── unified-importer.ts # 综合导入管线
│   │   ├── vector-service.ts  # Chroma/本地 OP-RAG向量池
│   │   └── worldbook-*.ts     # 世界书解析等各子业务
│   ├── plugins/             # V1.0 可扩展插件管线
│   │   ├── builtin/         # 内置模型插件(OpenAI/Claude等)
│   │   ├── registries/      # 导入/导出/处理注册表
│   │   └── examples/        # ePub导出/内容净化插件
│   ├── types/               # 严格 TypeScript 类型定义
│   │   ├── ai.ts
│   │   ├── conversation-trace.ts
│   │   ├── entity.ts
│   │   ├── index.ts
│   │   └── worldbook.ts
│   ├── utils/               # 工具链
│   │   ├── llm/             # 本地/大模型推理工具
│   │   │   ├── antiRetconValidator.ts # V4 核心：防吃书十九项校验
│   │   │   ├── schemas.ts       # OpenAI Tool Calling Schemas
│   │   │   ├── tokenizer.ts     # Token 切片统计
│   │   │   └── ...
│   │   ├── contextBuilder.ts# Prompt沙漏构建（优先级拼装）
│   │   ├── conflictDetector.ts# V2时空碰撞校验器
│   │   ├── entityMigration.ts # 实体重构与对齐
│   │   └── safeParseAIJson.ts # 强力 JSON 提取纠错机
│   ├── App.vue
│   └── main.ts
│
├── src-tauri/             # Rust IPC 宿主容器
│   ├── src/
│   │   ├── lib.rs         # SQLite 数据库游标封装
│   │   ├── main.rs
│   │   └── vector.rs      # HNSW 离线向量构建
│   ├── tauri.conf.json
│   └── Cargo.toml
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

## 3. 架构理念：沉浸式工作台 (Immersive Layout)

V4架构彻底放弃了经典的中台Dashboard界面，转向真正的全栈生产力（类似 Notion / Ulysses 混合）：

```
┌────────────────────────────────────────────────────────────────────┐
│                          AppHeader (极简状态栏)                     │
│  [Logo]         [当前项目标题]          [后台调度进度] [设置] [返回] │
├──────────────┬──────────────────────────┬─────────────────────────┤
│              │                          │                         │
│   资源视图区  │        核心书写区        │       情报矩阵区          │
│   (左侧折叠)  │        (中央白板)        │       (右侧抽屉)          │
│              │                          │                         │
│  ┌─────────┐ │  ┌────────────────────┐  │  ┌───────────────────┐  │
│  │ 项目配置 │ │  │    编辑工具栏      │  │  │  GlassContextPanel│  │
│  │ 大纲视图 │ │  ├────────────────────┤  │  │  毛玻璃上下文雷达  │  │
│  │ 实体管理 │ │  │                    │  │  ├───────────────────┤  │
│  │ 关系图谱 │ │  │                    │  │  │  AIAssistant      │  │
│  │ 记忆表格 │ │  │    Chapters.vue    │  │  │  (审查日志与对话)  │  │
│  │ 质量报告 │ │  │    (虚拟长列表)    │  │  ├───────────────────┤  │
│  │ (切换式) │ │  │                    │  │  │  AI建议 / 检阅    │  │
│  │         │ │  │                    │  │  │                   │  │
│  └─────────┘ │  └────────────────────┘  │  └───────────────────┘  │
│              │                          │                         │
│   侧边栏自适应│      自适应宽度 + 聚焦   │     侧边栏抽屉式折叠      │
└──────────────┴──────────────────────────┴─────────────────────────┘
```

## 4. 核心状态流转 (Pinia 状态切片)

V4 重构中去除了大部分的响应式地狱，使用事件驱动+惰性加载。

### 4.1 Project Store (核心持久层映射)

```typescript
// stores/project.ts
interface ProjectState {
  // 当前挂载项目(由 SQLite 返回并序列化)
  currentProject: Project | null;
  // 加载与脏数据保护
  loading: boolean;
  saving: boolean;
  // 当前阅读的进度定位点
  activeChapterId: string | null;
}
```

### 4.2 Storage Store (IPC 路由通信网关)

```typescript
// stores/storage.ts
// 该 Store 根据平台动态决定是存入 IndexedDB 还是请求 Rust Tauri TauriStorage
interface StorageState {
  adapter: 'sqlite' | 'indexeddb';
  isReady: boolean;
}
// 暴露统一的增删改查方法，底层由适配器执行
```

### 4.3 TaskManager Store (异步队列管理器)

```typescript
// stores/taskManager.ts
// V4 引入，让"章节生成" -> "实体提取" -> "记忆更新"不阻塞UI线程
interface TaskState {
  activeTasks: Record<string, Task>;
  queue: Task[];
  // 日志观测台
  auditLogs: AuditEntry[]; 
}
```

### 4.4 AI Store (推理管线调度)

```typescript
// stores/ai.ts
interface AIState {
  // ModelRouter 初始化配置
  selectedModel: string;
  config: AIConfig;
  // 临时对话栈
  conversations: ChatMessage[];
  isGenerating: boolean;
}
```

## 5. UI 高频组件与性能设计

### 5.1 Chapters.vue (无限长列表渲染)

使用了 `@tanstack/vue-virtual` 彻底解决了百万字时的 DOM 卡顿：
- 渲染机制：虚拟长列表，只渲染当前视口上下各5章内容。
- 回调：与 `GlobalTaskObserver` 绑定，异步侦听单个章节的 `isGenerating` 状态。

### 5.2 抽屉系统 (GlassContextPanel.vue)

V5 的交互创新。任何对长篇文本的操作（如一键查阅实体详情、翻阅大纲），都通过 `<el-drawer>` 的形式覆盖在右侧，使用 `backdrop-filter: blur(12px)` 实现毛玻璃效果，不打断用户当下的创作流。

### 5.3 异步防抖保存

所有输入框（如 Markdown 编辑、表格更改）均通过 `lodash/debounce` 打包并在 Vue `onUnmounted` 生命周期主动挂起回收，彻底避免后台存盘时的脏写和内存泄漏。

## 6. V4 特化：强约束推理管线调用图

```
用户点击「批量生成」
    │
    ▼
 generation-scheduler.ts (挂载队列)
    │
    ▼ (1)
 ModelRouter.ts (根据配置选用 GPT-4 或 Claude)
    │
    ▼ (2)
 contextBuilder.ts (组装沙漏Prompt: 实体与状态事件 > 活跃角色 > RAG段落)
    │
    ▼ (3)
 llmCaller.ts (强制使用 JSON Schema / Tool Calling)
    │
    ▼ (4)
 safeParseAIJson.ts (接管并尝试提取/修复破损 JSON)
    │
    ▼ (5)
 antiRetconValidator.ts (运行 19 项防吃书一致性审查)
    ├─► 若未通过(吃书了) ─► 拦截 ─► consultPlanner() 规划师重新审查
    │
    ▼ (6)
 state-updater.ts (章节落库，后台进行实体状态更新并入库)
    │
    ▼
 更新 UI 并在 GlassContextPanel.vue 输出 Audit Log
```