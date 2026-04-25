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
│   ├── assets/              # 静态资源与全局视觉系统
│   │   ├── styles/          # 全局样式
│   │   │   └── design-system.css # --ds-* 设计令牌、Element Plus 变量桥接、暗/亮主题覆盖
│   │   └── icons/
│   ├── components/          # Vue组件 (60+)
│   │   ├── config/          # AI配置相关组件
│   │   │   ├── ModelSelector.vue
│   │   │   ├── ProviderManager.vue
│   │   │   └── StorytellerPanel.vue
│   │   ├── Sandbox/               # V5 多视图沙盒区
│   │   │   ├── SandboxLayout.vue  # 沙盒布局容器
│   │   │   ├── SandboxDocument.vue# 实体文档编辑器
│   │   │   ├── SandboxGraph.vue   # AntV G6 关系图谱
│   │   │   ├── SandboxTimeline.vue# 状态事件时间线
│   │   │   ├── SandboxMap.vue     # 世界地图编辑器
│   │   │   ├── WorldGenWizard.vue # 批量世界观生成向导
│   │   │   ├── PlotLoomBoard.vue  # 命运织布机(看板+时间线)
│   │   │   └── AutomatonChat.vue  # 自动机对话
│   │   ├── AIAssistant.vue  # AI对话与审查辅助
│   │   ├── Chapters.vue     # 核心编辑大盘(沉浸式章节面板)
│   │   ├── CharacterDevelopment.vue  # 实体发展与详情管理
│   │   ├── CharacterStateTracker.vue # 实体状态实时追踪
│   │   ├── CharacterStatistics.vue   # 实体统计图表
│   │   ├── GlassContextPanel.vue     # 毛玻璃防抖上下文雷达
│   │   ├── GlobalMutator.vue         # 跨章节核弹级正则替换
│   │   ├── GlobalTaskObserver.vue    # 全局调度观察器
│   │   ├── NovelImportDialog.vue     # 智能小说解析导入器
│   │   ├── Outline.vue               # 树状细纲(卷/章/幕)
│   │   ├── ProjectConfig.vue         # 项目级别配置项
│   │   ├── QualityReport.vue         # 文本防吃书质量检测报告
│   │   ├── RelationshipGraph.vue     # AntV G6 关系图网络
│   │   ├── TimelineEditor.vue        # 故事时间轴
│   │   └── UnifiedImportDialog.vue   # 统一设定导入向导
│   ├── composables/         # Vue 3 组合式函数
│   │   ├── useAuditLog.ts   # 审查追踪器埋点
│   │   ├── useChapterExport.ts
│   │   └── useContextRadar.ts
│   ├── stores/              # Pinia全局状态管理
│   │   ├── index.ts
│   │   ├── ai.ts            # AI 服务状态调度
│   │   ├── sandbox.ts       # V5 核心：Entity + StateEvent CRUD + activeEntitiesState reducer
│   │   ├── character-card.ts# V5 门面：桥接 sandbox 中 CHARACTER 实体
│   │   ├── knowledge.ts     # RAG知识库管理
│   │   ├── project.ts       # SQLite大纲正文同步
│   │   ├── storage.ts       # IPC通信层 (SQLite/IndexedDB路由)
│   │   ├── taskManager.ts   # 异步后台任务队列
│   │   └── worldbook.ts     # V5 门面：桥接 sandbox 中 LORE 实体
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
│   │   ├── generation-scheduler.ts # V5 核心：异步批量章节引擎
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
│   │   ├── index.ts           # @deprecated V1 类型 (Character, WorldSetting 等)
│   │   ├── sandbox.ts         # V5 Sandbox 类型定义
│   │   └── worldbook.ts
│   ├── utils/               # 工具链
│   │   ├── llm/             # 本地/大模型推理工具
│   │   │   ├── antiRetconValidator.ts # V5 核心：防吃书十九项校验
│   │   │   ├── schemas.ts       # OpenAI Tool Calling Schemas
│   │   │   ├── tokenizer.ts     # Token 切片统计
│   │   │   └── ...
│   │   ├── contextBuilder.ts# Prompt沙漏构建（优先级拼装）
│   │   ├── conflictDetector.ts# V2时空碰撞校验器
│   │   ├── v1ToV5Migration.ts # V1→V5 数据迁移工具
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

V5 前端已经收敛为暗色优先的现代创作工作台，视觉语言参考 Notion/Linear：项目首页使用 Hero + 项目卡片瀑布流，项目工作区使用 CSS Grid、玻璃态侧边栏、可折叠导航和插件侧栏。

全局视觉基底集中在 `src/assets/styles/design-system.css`：
- `--ds-*` 设计令牌统一背景、文字、间距、圆角、阴影、玻璃态和侧边栏宽度。
- Element Plus 变量映射到 Design System，避免各组件重复硬编码主题色。
- `html.dark` / `html.light` 作为根主题类，由 `stores/theme.ts` 在主题切换时同步维护。
- 字体采用本地/系统 fallback，不依赖外链字体，保证桌面端与离线场景稳定。

```
┌────────────────────────────────────────────────────────────────────┐
│                       ProjectEditor CSS Grid Shell                  │
├──────────────┬──────────────────────────────────────┬──────────────┤
│  玻璃侧边栏   │              主创作面板               │ 插件/情报侧栏 │
│  可折叠导航   │ Dashboard / Chapters / Sandbox / ... │ 动态组件注入 │
│  项目统计     │ 章节、沙盒、统计、配置等面板切换       │ 玻璃态容器   │
└──────────────┴──────────────────────────────────────┴──────────────┘
```

Zen Mode 会隐藏侧边栏并让主内容占满；普通折叠只收起文字标签，保留图标导航和可访问的 `aria-label`。

## 4. 核心状态流转 (Pinia 状态切片)

V5 重构中去除了大部分的响应式地狱，使用事件驱动+惰性加载。

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

### 4.3 Sandbox Store (V5 核心实体层)

```typescript
// stores/sandbox.ts
// V5 核心：Entity + StateEvent CRUD，通过 reducer 生成 activeEntitiesState
// character-card.ts 和 worldbook.ts 均为门面 Store，桥接至 sandbox
interface SandboxState {
  entities: Entity[];
  stateEvents: StateEvent[];
  pendingStateEvents: StateEvent[];          // World Gen Wizard 草稿事件
  activeEntitiesState: Record<string, ResolvedEntity>; // reducer 产出
  currentChapter: number;                    // Reducer 当前章节锚点
  draftEntities: Entity[];                   // World Gen Wizard 草稿实体
  draftRelations: { sourceId: string; relation: EntityRelation }[];
  isLoading: boolean;
  isLoaded: boolean;
  isWizardMode: boolean;
}
```

### 4.4 TaskManager Store (异步队列管理器)

```typescript
// stores/taskManager.ts
// V5 引入，让"章节生成" -> "实体提取" -> "状态事件更新"不阻塞UI线程
interface TaskState {
  activeTasks: Record<string, Task>;
  queue: Task[];
  // 日志观测台
  auditLogs: AuditEntry[];
}
```

### 4.5 AI Store (推理管线调度)

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

### 5.1 设计系统与主题边界

`design-system.css` 是所有页面视觉的单一入口：ProjectList、ProjectEditor、Chapters、ChapterEditorDialog、AIAssistant、WritingDashboard、AgentConsole、TokenUsagePanel 都通过 `--ds-*` 令牌共享表面层级、强调色、阴影和动画。主题插件只负责注入变量和 mode；组件不再直接依赖某个内置主题的硬编码颜色。

### 5.2 Chapters.vue (无限长列表渲染)

使用了 `@tanstack/vue-virtual` 彻底解决了百万字时的 DOM 卡顿：
- 渲染机制：虚拟长列表，只渲染当前视口上下各5章内容。
- 回调：与 `GlobalTaskObserver` 绑定，异步侦听单个章节的 `isGenerating` 状态。
- 视觉：章节卡片使用 Design System surface，状态竖线区分 draft/completed/generating，编辑器对话框保持纯文本持久化路径。

### 5.3 抽屉系统 (GlassContextPanel.vue / AIAssistant.vue)

V5 的交互创新。任何对长篇文本的操作（如一键查阅实体详情、翻阅大纲），都通过 `<el-drawer>` 的形式覆盖在右侧，使用 `backdrop-filter: blur(12px)` 实现毛玻璃效果，不打断用户当下的创作流。

### 5.4 异步防抖保存

所有输入框（如 Markdown 编辑、表格更改）均通过 `lodash/debounce` 打包并在 Vue `onUnmounted` 生命周期主动挂起回收，彻底避免后台存盘时的脏写和内存泄漏。

## 6. V5 特化：强约束推理管线调用图

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
 sandbox.ts (章节落库，通过 sandbox store 更新 Entity/StateEvent 并持久化)
    │
    ▼
 更新 UI 并在 GlassContextPanel.vue 输出 Audit Log
```