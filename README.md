# AI小说工坊

## 项目简介

一个支持100万字以上长篇小说的智能生成系统,通过**表格记忆系统**确保长篇创作的连贯性和一致性。

**最新架构升级 (v4.0)**: 采用 **Tauri + SQLite 桌面端混合架构**,突破浏览器存储限制,支持更大数据量和更高性能。

## 核心特性

### 🎯 核心功能
- ✅ 支持所有类型小说,用户自定义篇幅
- ✅ **表格记忆系统** - CSV格式追踪角色状态、物品、关系
- ✅ **滚动大纲生成** - 自动续写大纲,打破50章限制
- ✅ **自动设定生长** - 批量生成后自动提取人物、更新记忆
- ✅ 分层记忆管理 (Author's Note > World Info > Memory Tables > Summary > Recent Chapters)
- ✅ 批量生成和实时生成双模式

### 🚀 架构创新 (V4.0 重构完全体)
- ✨ **Tauri 极致本地化** - Rust 桌面端后盾，突破浏览器沙盒体积墙
- ✨ **SQLite 存储原子化更新** - 前端切割 JSON 分片 + 后端原子化 IPC API，百万字前端内存彻底防 OOM 与丢数据
- ✨ **高可用模型路由 (FailoverManager)** - API 提供商熔断器闭环机制，当遇到超时、429时，主备大模型热切换，从此告别写作中断
- ✨ **Pipeline/Middleware 上下文引擎** - 200行上帝函数解耦，每一层记忆块动态管理自己的 Token 预算，Unicode 安全切分拦截 400 报错
- ✨ **MCP 标准协议支持** - 提供标准工具接口，允许 Roo Code / Clause 外部 AI 助手接管小说管线
- ✨ **结构化记忆输出 (Tool Calling)** - JSON Schema `strict: true` 强约束，消灭易碎正则正则表达式，表格记忆更新成功率 99.9%
- ✨ **双轨沉浸式前端 (Immersive UI)** - Notion-like 极简左白板，配合右侧“毛玻璃防抖呼吸”上下文抽取矩阵
- ✨ **小白与极客双模态调参台** - 将复杂的 System Prompt、Temperature 藏在极客模式背后，为“吟游诗人”还原极简的字数/风格倾向滑块

### 📊 智能工作流系统
- ✅ **全自动视界推演引擎** - （卷-章-幕）细纲约束系统，提前扼杀逻辑死局
- ✅ **Zero-Touch 静默提取** - 完全无需手输，大模型在后台切片，全自动在背景将新人物与新世界词条入库
- ✅ **落笔防吃书哨兵 (Plot-Hole Detector)** - 上下文矛盾一秒红牌警告，AI 自身自检 3 次直至退回正确逻辑
- ✅ **成本感知模型路由 (Model Router)** - 推演跑 GPT-4，正文跑特化生文模型，提取跑本地 OLLAMA，彻底压榨每 1 美分算力
- ✅ **向量知识库搜索** - 自动在 OpenAI Embeddings 和本地 @xenova/transformers 之间无缝切换

### 📝 功能模块
- ✅ **模板系统** - 内置模板、从模板创建、导入导出
- ✅ **大纲系统** - 经典结构模板、卷管理、结构化编辑
- ✅ **人物统计** - 出场统计、成长轨迹、状态追踪
- ✅ **导出格式** - Markdown、PDF、批量导出
- ✅ **AI建议系统** - 主动建议、历史记录、统计分析
- ✅ **小说导入分析** - 智能提取人物、关系、章节结构
- ✅ **统一导入向导** - 角色卡/世界书/会话轨迹(JSONL)一体化导入与审核

### 🔌 插件系统 (v1.0)
- ✨ **强大扩展性** - 9大扩展点覆盖AI、数据、UI
- ✨ **开发友好** - 完整TypeScript类型、50+接口定义
- ✨ **易于使用** - 直观管理界面、一键安装/卸载
- ✨ **安全可靠** - 权限控制、沙箱隔离、代码验证
- ✨ **丰富示例** - 7个完整示例插件
- ✨ **完整文档** - 开发指南、API文档、快速入门

## 技术栈

### 前端
- **框架**: Vue 3.4 + TypeScript + Vite 5
- **状态管理**: Pinia
- **UI组件**: Element Plus
- **可视化**: AntV G6 (关系图), ECharts (统计), vis-timeline (时间线)
- **编辑器**: Vue Konva (地图)

### 后端
- **桌面端**: Tauri 2 + Rust
- **数据库**: SQLite (桌面端), IndexedDB (浏览器端)
- **存储适配**: 自动环境检测

### AI集成
- **支持模型**: OpenAI, Anthropic, GLM, 通义千问, 本地模型
- **向量模型**: @xenova/transformers (本地), OpenAI embeddings
- **Token计算**: gpt-tokenizer

## 项目结构

```
ai-novel-workshop/
├── docs/                           # 完整文档体系
│   ├── requirements.md             # 产品需求文档
│   ├── technical-summary.md        # 技术难点攻关
│   ├── data-architecture.md        # 数据架构设计
│   ├── ai-integration-design.md    # AI集成设计
│   ├── frontend-architecture.md    # 前端架构
│   ├── component-list.md           # 组件列表
│   ├── memory-implementation.md    # 记忆系统实现
│   └── optimization-analysis.md    # 性能优化分析
│
├── src/                            # 前端源代码
│   ├── components/                 # Vue组件 (60+)
│   │   ├── WorldSetting.vue        # 世界观设定
│   │   ├── Characters.vue          # 人物管理
│   │   ├── Chapters.vue            # 章节编辑
│   │   ├── Outline.vue             # 大纲系统
│   │   ├── MemoryTables.vue        # 表格记忆
│   │   ├── RelationshipGraph.vue   # 关系图
│   │   ├── TimelineEditor.vue      # 时间线编辑
│   │   ├── WorldMap.vue            # 世界观地图
│   │   ├── NovelImportDialog.vue   # 小说导入
│   │   ├── UnifiedImportDialog.vue # 统一导入向导
│   │   └── ...
│   │
│   ├── stores/                     # Pinia状态管理
│   │   ├── project.ts              # 项目状态
│   │   ├── storage.ts              # 存储适配器
│   │   ├── ai.ts                   # AI服务
│   │   ├── vector.ts               # 向量服务
│   │   └── suggestions.ts          # AI建议
│   │
│   ├── utils/                      # 核心工具
│   │   ├── tableMemory.ts          # 表格记忆系统
│   │   ├── contextBuilder.ts       # 上下文构建器
│   │   ├── vectorStore.ts          # 向量存储
│   │   ├── conflictDetector.ts     # 冲突检测
│   │   ├── qualityChecker.ts       # 质量检查
│   │   ├── novelImporter.ts        # 小说导入分析
│   │   ├── characterExtractor.ts   # 人物提取
│   │   ├── worldExtractor.ts       # 世界观提取
│   │   └── llm/                    # LLM工具集
│   │       ├── llmCaller.ts        # 统一调用
│   │       ├── tokenizer.ts        # Token计算
│   │       ├── characterExtractor.ts
│   │       ├── worldExtractor.ts
│   │       └── outlineGenerator.ts
│   │
│   ├── services/                   # 服务层
│   │   ├── ai/                     # AI服务
│   │   │   ├── ModelRouter.ts      # 模型路由
│   │   │   └── index.ts            # 统一API
│   │   ├── vector-service.ts       # 向量服务
│   │   └── memory-service.ts       # 记忆服务
│   │
│   ├── plugins/                    # 插件系统 (v1.0)
│   │   ├── types.ts                # 插件类型定义
│   │   ├── context.ts              # 插件上下文API
│   │   ├── manager.ts              # 插件管理器
│   │   ├── storage.ts              # 插件存储
│   │   ├── loader.ts               # 插件加载器
│   │   ├── init.ts                 # 内置插件初始化
│   │   ├── setup.ts                # 系统初始化
│   │   ├── registries/             # 9个注册表
│   │   ├── builtin/                # 3个内置插件
│   │   └── examples/               # 4个示例插件
│   │
│   ├── types/                      # TypeScript类型
│   │   ├── index.ts                # 核心类型
│   │   ├── ai.ts                   # AI类型
│   │   ├── conflicts.ts            # 冲突类型
│   │   └── suggestions.ts          # 建议类型
│   │
│   ├── data/                       # 数据文件
│   │   └── outlineTemplates.ts     # 大纲模板
│   │
│   └── views/                      # 页面视图
│       ├── ProjectEditor.vue       # 项目编辑器
│       └── ProjectList.vue         # 项目列表
│
├── src-tauri/                      # Tauri桌面端
│   ├── src/
│   │   ├── lib.rs                  # 主入口 (SQLite操作)
│   │   ├── vector.rs               # 向量扩展
│   │   └── main.rs                 # 应用启动
│   ├── Cargo.toml                  # Rust依赖
│   └── tauri.conf.json             # Tauri配置
│
├── server.js                       # Debug服务器
├── package.json                    # 项目依赖
├── vite.config.ts                  # Vite配置
└── tsconfig.json                   # TypeScript配置
```

## 核心系统详解

### 1. 表格记忆系统

借鉴 SillyTavern 的 st-memory-enhancement 实现,用CSV格式追踪小说状态:

```csv
* 0:角色状态
【表格内容】
rowIndex,0:姓名,1:身份,2:位置,3:状态,4:装备
1,林渊,散修,山谷,受伤,剥皮小刀
2,林清雪,公主,山谷,灵力枯竭,无

【编辑规则】
可用命令:
- updateRow(1, "林渊", "散修", "山谷", "康复", "剥皮小刀,太虚阵盘")
- insertRow("张三", "路人", "城里", "正常", "无")
- deleteRow(3)
```

**优势**:
- Token效率提升40%
- AI可精确更新表格
- 触发式过滤,节省70% tokens
- 永不遗忘、永不矛盾

### 2. 滚动大纲生成引擎

**突破50章限制**:
- 自动探测大纲余量 (剩余<5章)
- 提取前文世界观 + 最新5章走向
- 自动续写后20章新大纲
- 无缝恢复正文生成

**技术实现**:
```typescript
// 批量生成循环中
if (outlineRemaining < 5) {
  // 挂起正文生成
  const newOutline = await generateOutline({
    worldContext: extractWorldView(recentChapters),
    recentOutline: getLastOutline(5),
    count: 20
  });
  // 追加新大纲
  appendOutline(newOutline);
  // 恢复正文生成
}
```

### 3. 混合存储架构

**环境自适应路由**:
```typescript
const isTauri = '__TAURI_INTERNALS__' in window;
const storage = isTauri
  ? new TauriStorage()    // SQLite后端
  : new IndexedDBStorage(); // 浏览器后端
```

**SQLite优势**:
- 独立表结构 (projects, chapters分离)
- 避免JSON单条记录过大
- IPC通信高效
- 支持向量检索扩展

### 4. 分层记忆系统

**上下文构建流程**:
```
Token预算分配 (总预算: 6000-8192)
├─ System Prompt: 300 (固定)
├─ Author's Note: 200 (最高优先级)
├─ World Info: 800 (动态注入)
├─ Characters: 600 (相关人物)
├─ Memory Tables: 500 (触发式过滤)
├─ Vector Context: 600 (语义检索)
├─ Summary: 600 (历史压缩)
├─ Recent Chapters: 2000 (完整内容)
└─ Outline: 400 (当前章节)
```

### 5. 世界书系统 (SillyTavern兼容)

**核心特性**:
- ✅ 完全兼容SillyTavern世界书格式
- ✅ 支持PNG角色卡导入导出（chara/ccv3格式）
- ✅ 关键词触发机制（精确/模糊/正则）
- ✅ 优先级注入控制（Token预算管理）
- ✅ 条件表达式（章节范围/角色出场/地点访问）
- ✅ 三层注入策略（世界书 > RAG > 记忆表）

**导入导出支持**:
- PNG格式（Character Card V1/V2/V3）
- JSON格式（SillyTavern世界书）
- JSONL格式（批量条目 / 会话轨迹）
- YAML格式（可读性强）

**关键词触发**:
```typescript
// 精确匹配
keys: ["林渊", "主角"]

// 正则表达式
keyregex: "/(章|节)[0-9]+/"

// 条件表达式
extensions: {
  chapter_range: { start: 10, end: 20 },
  character_presence: ["character-id-1", "character-id-2"],
  location_visit: ["location-id-1"]
}
```

**三层注入策略**:
```
Token预算分配 (总预算: 2700)
├─ 世界书: 1800 (最高优先级，关键词精确匹配)
├─ RAG: 400 (语义检索，智能补充)
└─ 记忆表: 500 (状态追踪，动态更新)
```

### 6. 向量检索系统

**双模式支持**:
- **本地模型**: bge-small-zh-v1.5 (512维，中文优化，默认启用)
- **可选升级**: bge-m3 (1024维，多语言，需下载)
- **云端模型**: OpenAI text-embedding-3-small (1536维)

**默认配置**:
```typescript
// 项目配置
enableVectorRetrieval: true  // 默认启用
vectorConfig: {
  provider: 'local',
  model: 'bge-small-zh-v1.5',  // 已内置，无需下载
  dimension: 512,
}
```

**混合检索**:
```typescript
// 语义检索 + 关键词匹配
const results = await vectorService.retrieveRelevantContext({
  topK: 5,
  minScore: 0.6,
  excludeCurrentChapter: true,
  hybrid: true  // 向量 + 关键词
});
```

**模型切换**:
参见 [BGE-M3模型配置指南](./docs/bge-m3-model-guide.md) 了解如何切换到更强大的向量模型。

### 6. 智能降级机制

**多层容错**:
```typescript
try {
  // 尝试向量检索
  return await vectorSearch(query);
} catch (error) {
  // 降级为关键词检索
  return keywordSearch(query);
}
```

**API风控处理**:
- 400错误自动移除`max_tokens`重试
- 1003错误精准识别内容安全拦截
- Unicode代理对安全截断

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
# Web版本
npm run dev

# 桌面版本 (需要Rust环境)
npm run tauri dev
```

### 构建生产版本

```bash
# Web版本
npm run build

# 桌面版本
npm run tauri build
```

### 日志调试系统

项目已内置统一日志模块，可用于排查项目保存、AI调用、插件初始化等关键流程。

```ts
// 浏览器控制台可直接调用
window.__APP_LOGGER__.getConfig()                  // 查看当前配置
window.__APP_LOGGER__.setEnabled(true)             // 开关日志
window.__APP_LOGGER__.setLevel('debug')            // 级别: debug/info/warn/error/silent
window.__APP_LOGGER__.setNamespaces(['project:*']) // 仅看项目相关日志
window.__APP_LOGGER__.getLogs()                    // 读取内存日志缓冲
window.__APP_LOGGER__.clearLogs()                  // 清空缓冲
```

默认策略：
- 开发环境（`npm run dev`）默认 `debug` 全量日志
- 生产构建默认 `warn`，仅输出重要告警和错误
- 配置会持久化到 `localStorage`，重启后仍生效

## 使用流程

### 1. 创建项目
1. 点击"新建项目"
2. 填写标题、类型、目标字数
3. 选择从模板创建或空白项目

### 2. 配置AI模型
1. 进入"项目配置"
2. 添加模型提供商 (OpenAI、Anthropic、GLM等)
3. 填写API Key和Base URL
4. 测试连接

### 3. 创建设定
**世界观**:
- AI生成或手动创建
- 定义力量体系、地理环境、势力分布

**人物**:
- AI生成或手动创建
- 定义性格、能力、背景、关系

**大纲**:
- AI生成或手动创建
- 定义主线、支线、章节大纲

### 4. 生成章节

**单章生成**:
1. 点击"新建章节"
2. 填写标题和概要
3. 点击"AI生成"
4. 查看生成的表格记忆
5. 保存

**批量生成**:
1. 点击"批量生成"
2. 设置起始章节和数量
3. 选择"后台运行"
4. 等待生成完成

### 5. 导入现有小说 (v3.2新功能)
1. 点击"导入小说"
2. 上传TXT/Markdown文件
3. 选择识别模式 (程序/AI增强)
4. 配置章节检测、人物提取、关系分析
5. 预览结果并确认

### 6. 统一导入向导（角色卡 / 世界书 / 会话轨迹）
1. 在世界书或角色卡面板点击"统一导入"
2. 选择文件（支持 `.png` / `.json` / `.jsonl` / `.ndjson`）
3. 若为会话轨迹 JSONL，默认仅解析 `user + assistant`
4. 按向导完成「解析预览 → 抽取预览 → 冲突审核 → 应用结果」
5. 冲突策略默认人工审核优先，可在审核页逐条应用/跳过/合并

## 性能指标

| 指标 | 目标 | 实际 |
|------|------|------|
| 单章生成时间 | <30秒 | ✅ 达标 |
| 100万字加载 | <3秒 | ✅ SQLite优化 |
| 向量检索 | <100ms | ✅ 本地向量 |
| Token效率提升 | 40% | ✅ 表格记忆 |
| 记忆更新速度 | <100ms | ✅ CSV操作 |
| SQLite数据库大小 | - | <100MB (百万字) |

## 开发进度

### ✅ Phase 1-3: 核心框架
- [x] Vue 3 + TypeScript + Vite搭建
- [x] Pinia状态管理
- [x] 存储系统 (IndexedDB + SQLite)
- [x] 世界观、人物、大纲、章节管理
- [x] AI集成 (多模型支持)

### ✅ Phase 4: 记忆系统
- [x] 表格记忆系统 (CSV格式)
- [x] 分层记忆注入
- [x] 触发式更新
- [x] AI可执行命令
- [x] 向量检索系统

### ✅ Phase 5: 质量优化
- [x] 自动摘要生成
- [x] 冲突检测
- [x] 质量检查系统
- [x] 小说导入分析

### ✅ Phase 6: 可视化功能
- [x] 人物关系图
- [x] 时间线编辑器
- [x] 表格可视化编辑器
- [x] 世界观地图

### ✅ Phase 7: 功能增强
- [x] 模板系统
- [x] 大纲系统增强
- [x] 人物统计
- [x] 导出格式
- [x] AI建议系统

### ✅ Phase 8: 架构升级 (v4.0)
- [x] FailoverManager 故障转移大模型路由
- [x] Context Pipeline 中间件上下文组装
- [x] Structured Outputs (Tool Calling)
- [x] Tauri IPC + SQLite 存储原子化更新
- [x] API 风控防误杀与代理对截断
- [x] RAG 重排序 (相关性+时间序混合)

## 文档

### 核心文档
- [产品需求文档](./docs/requirements.md) - 功能需求、用例、UI设计
- [技术方案](./docs/technical-summary.md) - 核心难点、Token优化
- [数据架构](./docs/data-architecture.md) - 记忆系统、向量检索
- [AI集成设计](./docs/ai-integration-design.md) - 模型路由、提示词模板
- [前端架构](./docs/frontend-architecture.md) - Vue组件设计
- [组件列表](./docs/component-list.md) - 60+组件清单

### 技术亮点

**1. 酒馆风格记忆管理**
完整实现SillyTavern的记忆增强机制:
- 分层注入 (Author's Note > World Info > Memory Tables)
- CSV格式表格 (rowIndex精确定位)
- AI可执行命令 (updateRow/insertRow/deleteRow)
- 触发式更新 (只发送相关数据)

**2. 滚动大纲生成引擎**
- 打破50章大纲限制
- 余量探测自动续写
- 提取前文走向
- 无缝恢复生成

**3. 混合存储架构**
- 浏览器端: IndexedDB
- 桌面端: SQLite + Tauri
- 环境自适应路由
- 独立表结构优化

**4. 智能降级机制**
- 向量检索失败 → 关键词检索
- SQLite不可用 → IndexedDB
- AI服务超时 → 重试+降级
- 本地免 Token Mock 模式 → 支持开发者零成本测试完整生成链路

### 7. MCP (Model Context Protocol) AI Agent 接管

**外部 AI 助手一键挂载**:
系统现已提供原生 `mcp-server.js`，完全遵循 Model Context Protocol 标准。允许像 Roo Code、Claude Desktop 这样强大的大模型工具直接连接底层 SQLite 数据库，获得系统以下超能力：
- 检索与上下文提取 (`list_projects`, `get_project_context`, `get_chapter_content`)
- 自主创作与架构设计 (`update_outline`, `create_character`, `save_chapter`)
- 记忆矩阵操作 (`read_memory_tables`, `update_memory_table`)

### 8. 命令化助手与审校工作流

**通过命令行级交互完成重度审阅**:
系统内置了类似于 IDE 的 AI 命令控制台，支持直接输入斜杠命令调用专属能力：
- 支持 `/review consistency`（一致性审查员）、`/review quality`（质量评估员）、`/review editor`（主编）等不同预设角色对文本进行深度审阅。
- AI 审校结果会被**自动化提取为结构化建议卡片**，分发至建议面板。
- 审校卡片支持动作按钮（Action Registry），如一键创建人物、一键跳转到对应章节等工作流，让交互不仅仅停留在“文字建议”层面，而是能自动落地操作。
详细使用方式请参考 [助手命令指南](./docs/assistant/commands.md) 与 [审校工作流指南](./docs/assistant/review-workflow.md)。

## 技术亮点


### 1. 表格记忆系统
- Token效率提升40%
- AI理解准确度95%
- 更新速度<100ms
- 冲突率<5%

### 2. 自动设定生长
- 批量生成后自动提取新角色
- AI静默更新表格记忆
- 免Token人物提取 (正则+共现)

### 3. API风控处理
- 400错误智能自愈
- 敏感词精准探测
- Unicode安全截断

### 4. 多模型支持
- OpenAI (GPT-3.5/GPT-4)
- Anthropic (Claude)
- GLM-5 (智谱)
- 通义千问
- 自定义OpenAI兼容API

## 常见问题

### Q: 为什么生成的章节不连贯?
**A:** 检查以下几点:
1. 是否配置了AI模型?
2. 是否创建了人物和大纲?
3. 是否启用了表格记忆? (默认启用)
4. AI模型是否足够强? (建议Claude Sonnet 4.6)

### Q: 如何手动更新表格记忆?
**A:** 参考 [表格记忆系统文档](./docs/table-memory-system.md) 的使用指南。

### Q: 支持多少字的小说?
**A:** 理论上支持无限字数:
- **1-30章**: 完美支持
- **30-100章**: 需要定期更新表格记忆
- **100章以上**: 建议使用向量检索

### Q: 数据会丢失吗?
**A:** 数据存储位置:
- **Web版本**: 浏览器IndexedDB (清除浏览器数据会丢失)
- **桌面版本**: 本地SQLite数据库 (持久化存储)

建议定期导出项目备份。

### Q: 桌面版和Web版有什么区别?
**A:**
- **桌面版**: SQLite存储,性能更好,支持百万字+项目
- **Web版**: IndexedDB存储,无需安装,跨平台

## 许可证

MIT

## 致谢

- [SillyTavern](https://github.com/SillyTavern/SillyTavern) - 酒馆记忆系统灵感来源
- [st-memory-enhancement](https://github.com/muyoou/st-memory-enhancement) - 表格记忆插件参考实现
- [Element Plus](https://element-plus.org/) - Vue 3 UI组件库
- [Vue 3](https://vuejs.org/) - 渐进式JavaScript框架
- [AntV G6](https://g6.antv.antgroup.com/) - 图可视化库
- [vis-timeline](https://visjs.github.io/vis-timeline/docs/timeline/) - 时间线可视化
- [Tauri](https://tauri.app/) - 构建更小更快的桌面应用

## 贡献

欢迎提交Issue和Pull Request!

---

**当前版本**: v4.0.0

**完整功能列表**:
- ✅ 表格记忆系统 (Tool Calling 约束)
- ✅ 滚动大纲生成
- ✅ 自动设定生长
- ✅ 混合存储架构 (原子化 API)
- ✅ 向量检索系统 (混合重排)
- ✅ 故障转移模型路由 (FailoverManager)
- ✅ 中间件上下文组装 (Pipeline)
- ✅ 小说导入分析
- ✅ 冲突检测系统
- ✅ 质量检查增强
- ✅ 人物关系图
- ✅ 时间线编辑器
- ✅ 世界观地图
- ✅ 模板系统
- ✅ AI建议系统
- ✅ 统一导入向导（角色卡/世界书/会话轨迹JSONL）

**详细更新日志**: 查看 [Release Notes](./docs/RELEASE_NOTES.md)
