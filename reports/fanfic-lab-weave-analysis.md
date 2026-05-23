# FanFic Lab 技术深度分析报告

> 项目地址: https://github.com/ChanMeng666/fanfic-lab
> 分析日期: 2026-05-11

---

## 一、项目概览

FanFic Lab 是一个**AI 驱动的同人小说创作平台**，专注于崩坏：星穹铁道（Honkai: Star Rail）IP。它采用 Next.js 16 + LangGraph.js 1.0 双进程架构，通过 AI Agent 工作流实现从用户需求解析到完整故事交付的全自动创作流水线。

### 核心技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| 前端框架 | Next.js 16 (App Router) + React 19 + TailwindCSS 4 | SSR/客户端渲染 |
| AI Agent | LangGraph.js 1.0 | 多节点有向图工作流 |
| LLM | OpenAI GPT-4o / GPT-4o-mini | 故事生成与质量检测 |
| 数据库 | Prisma 7 + Neon PostgreSQL (pgvector) | ORM + 向量检索 |
| 缓存 | Redis (ioredis) | Tavily 搜索结果缓存 |
| 认证 | Stack Auth | 用户管理 |
| 存储 | Cloudinary | 图片上传 |
| 搜索 | Tavily API | Fandom 研究 |
| 部署 | DigitalOcean VPS + Coolify (Docker Compose) | 生产环境 |

---

## 二、LangGraph Agent 工作流架构（核心亮点）

### 2.1 整体流程：六节点有向图

FanFic Lab 的核心是一个 **LangGraph.js StateGraph**，定义在 `src/agent/dreamwriter/graph.ts`：

```
START → intent_parser_node → story_architect_node → writer_node → quality_guard_node
                                                                    ↓ (条件路由)
                                                              ┌─ writer_node (修改，最多2次)
                                                              └─ summarize_node → delivery_node → END
```

**六个节点**：

1. **intent_parser_node** — 意图解析：用 GPT-4o-mini (temperature=0.3) 从用户自然语言中提取结构化信息（CP、设定、基调、约束、语言）
2. **story_architect_node** — 故事架构师：用 GPT-4o (temperature=0.8) 结合知识库生成故事大纲（JSON 格式：标题、场景、情感曲线）
3. **writer_node** — 写作者：用 GPT-4o (temperature=0.9) 根据大纲 + RAG 检索的原著参考段落生成完整故事正文
4. **quality_guard_node** — 质量守卫：用 GPT-4o-mini (temperature=0.3) 检测 OOC（角色崩坏）、一致性问题、文笔问题，给出 1-10 分
5. **revision_counter_node** — 修订计数器：当质量分 < 7 且修订次数 < 2 时，将质量反馈注入 writer_node 重写
6. **summarize_node / delivery_node** — 摘要与交付：生成简介和推荐创意

### 2.2 状态定义（State Annotation）

```typescript
DreamWriterStateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,     // 消息历史
  stage: DreamWriterStage,        // 阶段标识
  parsedCP: string[],             // 解析的 CP
  parsedSetting: string,          // 设定（原著向/现代AU等）
  parsedTone: string,             // 基调（甜/虐等）
  parsedConstraints: Record,      // 约束（HE/BE、G/T/M）
  detectedLanguage: "zh" | "en",  // 语言检测
  outline: StoryOutline | null,   // 故事大纲
  storyDraft: string,             // 故事草稿
  ragContext: string[],           // RAG 检索结果
  qualityReport: QualityReport,   // 质量报告
  revisionCount: number,          // 修订计数
  summary: string,                // 简介
  result: StoryResult | null,     // 最终结果
  logs: {message, done}[],        // 进度日志
})
```

每个节点通过返回 `Partial<DreamWriterState>` 来更新状态，使用 `reducer: (_, update) => update` 的覆盖式更新策略。

### 2.3 条件路由逻辑

`quality_guard_node` 之后的关键路由：

```typescript
function routeAfterQualityCheck(state) {
  if (!report) return "summarize_node";           // 无报告则跳过
  if (!report.passesThreshold && revisionCount < MAX_REVISIONS)
    return "writer_node";                          // 质量不达标→重写
  return "summarize_node";                         // 达标→继续
}
```

这实现了 **自动质量修订循环**（最多2次），是该系统最有价值的设计之一。

---

## 三、CopilotKit 集成与 HITL 模式

### 3.1 架构决策：专用节点替代 Tool

项目文档 `docs/COPILOTKIT_LANGGRAPH_HITL_GUIDE.md` 记录了关键架构决策：由于 CopilotKit 与 LangGraph.js 之间存在 **ToolMessage 格式不兼容**（`tool_call_id` vs `toolCallId`，snake_case vs camelCase），团队放弃了传统的 tool-based HITL，转而采用 **专用图节点**：

- HITL 操作不使用 `ToolMessage`，而是通过 `copilotkitEmitState()` 将 `pendingContent` 推送到前端
- 前端通过 `useCoAgentStateRender()` 检测 `pendingContent` 并渲染审批卡片
- 审批后通过 `respond({ data })` 将用户决策传回 Agent

### 3.2 实际数据流

```
用户输入 → Next.js API Route (/api/create)
  → 创建 LangGraph Thread → 启动 Run Stream
  → SSE 流式转发给前端 (text/event-stream)
  → useStoryCreation() Hook 解析 SSE 事件
  → CreationProgress 组件显示进度
  → StoryResult 组件展示结果 + 自动保存到数据库
```

---

## 四、同人知识库系统（Knowledge Pack）

### 4.1 知识库架构

FanFic Lab 采用**结构化知识库 + RAG 向量检索**的双层设计：

**静态知识层** (`src/knowledge/hsr/`)：
- `characters.ts` — 角色档案（5个核心角色，含性格、说话方式、情感触发点、人际关系、时间线状态）
- `relationships.ts` — CP 关系动态（4对核心 CP，含关系描述、关键时刻、常见同人套路）
- `world.ts` — 世界观规则（5大类：命途体系、星神阵营、地点、核心概念、时间轮回）
- `tropes.ts` — 同人套路模板（5种：现代AU、ABO、Hurt/Comfort、甜饼、前世今生）

**动态检索层** (`src/knowledge/base/rag.ts`)：
- 使用 `text-embedding-3-small` 生成 1536 维向量
- 通过 pgvector 的余弦距离检索最相关的知识片段
- 存储在 `KnowledgeChunk` 表中，按 fandom 索引

### 4.2 角色档案示例（砂金）

```typescript
{
  name: '砂金',
  aliases: ['Sunday', '星期日', '约书亚·韦尔德'],
  personality: [
    '优雅克制，举止如贵族',
    '控制欲强，习惯掌控一切以保护所爱之人',
    '内心极度孤独，将自己的情感藏于礼仪与秩序之下',
    ...
  ],
  speechPatterns: '语气平静而带压迫感，常以第一人称"我"配合书面措辞...',
  emotionalTriggers: ['黑天鹅受到威胁', '提及失去翅膀的往事', ...],
  relationships: { 黑天鹅: '妹妹，生命中最重要的人', ... },
  timelineStates: { 珀内科尼事件前: '掌控珀内科尼家族...', ... }
}
```

### 4.3 知识注入方式

`hsrKnowledge.toSystemPrompt()` 将所有知识格式化为结构化文本，直接注入到每个 LLM 调用的 System Prompt 中。同时 writer_node 还会通过 RAG 检索相关的原著参考段落（`buildRAGContext()`），实现"角色档案 + 原著参考"的双重知识注入。

---

## 五、前端架构

### 5.1 设计系统："Literary Atelier"

- **配色**：Teal（主色）+ Amber（AI 强调色）+ 暖色背景
- **字体**：Cormorant Garamond（标题）+ Source Sans 3（UI）+ Lora（正文）
- **图标**：仅使用 Lucide，禁止 emoji
- **动画**：`animate-fade-slide-in`、`animate-ai-reveal`、`ai-glow` 等

### 5.2 核心页面

| 路由 | 组件 | 功能 |
|------|------|------|
| `/create` | `CreatePage` | AI 创作入口，含 DreamInput + CreationProgress + StoryResult |
| `/feed` | `FeedPage` | 故事发现流，无限滚动 |
| `/story/[id]` | `StoryPage` | 故事阅读器 |
| `/story/[id]/edit` | `EditPage` | 故事编辑器 |

### 5.3 关键 Hook

- `useStoryCreation()` — 管理创作流程的完整生命周期（SSE 流读取、阶段状态、自动保存）
- `useStory()` — 故事数据获取
- `useReadingPrefs()` — 阅读偏好（字体大小等）
- `useReadingProgress()` — 阅读进度追踪
- `useInfiniteScroll()` — 无限滚动

### 5.4 创作界面

`DreamInput` 组件提供自然语言输入 + 快捷标签（如"砂金×星期日"、"现代AU"、"虐转甜HE"）。`CreationProgress` 组件实时展示四阶段进度：理解需求 → 构思结构 → 执笔写作 → 质量检查。

---

## 六、数据库设计

Prisma Schema 定义了完整的社交 + 创作数据模型：

- **User** — 用户（含 Stack Auth ID、偏好设置、积分）
- **Story** — 故事（fandom、ships、tags、rating、status、embedding 向量）
- **Chapter** — 章节（story 关联、编号、内容）
- **Character** — 角色档案（性格特征、说话方式、是否原创）
- **Draft** — 草稿（含 AI 上下文 `aiContext` JSON 字段）
- **Generation** — 生成记录（请求/计划/交付物 JSON、token 用量、积分消耗）
- **KnowledgeChunk** — RAG 知识块（fandom、content、embedding 向量）
- **SourceResearchCache** — Tavily 研究缓存（30天 TTL）
- **社交**：Like、Comment（支持嵌套回复 + 评论点赞）、Follow、Notification

---

## 七、API 与数据流

### 创作流程 API 调用链

```
1. POST /api/create → 创建 LangGraph Thread → 启动 Run Stream
2. SSE Stream → 逐节点解析更新 → 转发给前端
3. 前端 useStoryCreation() → 状态机管理
4. 完成后 POST /api/stories → 自动保存到数据库
```

### LangGraph Agent 部署

Agent 独立运行在 `http://agent-dreamwriter:8123`（Docker 内部网络），通过 `langgraph.json` 配置：

```json
{
  "graphs": {
    "dreamwriter": { "path": "./dreamwriter/graph.ts:graph" }
  }
}
```

使用 `langgraphjs dev` 命令启动，提供 REST API（`/threads`、`/threads/{id}/runs/stream`）。

---

## 八、关键设计模式与经验总结

### 8.1 值得借鉴的设计

1. **六节点流水线** — 将复杂创作任务拆解为：意图解析 → 故事架构 → 写作 → 质量检测 → 修订 → 交付，每个节点职责单一
2. **自动质量修订循环** — quality_guard 检测不达标时自动触发 writer_node 重写，最多2次，实现"自我改进"
3. **双层知识注入** — 静态角色/世界观知识 + 动态 RAG 检索的原著参考段落
4. **OOC 检测** — quality_guard 专门检测角色崩坏，给出具体的修改建议
5. **SSE 流式进度** — 前端实时展示每个阶段的进展，用户体验好
6. **专用节点替代 Tool** — 绕过 CopilotKit/LangGraph.js 的 ToolMessage 格式不兼容问题

### 8.2 已知问题与局限

1. **CopilotKit 兼容性** — ToolMessage 的 snake_case/camelCase 不兼容是已知 bug，需用专用节点绕过
2. **中文优先** — 知识库、提示词全部为中文，国际化需额外工作
3. **单 Fandom** — 目前只实现了崩坏：星穹铁道的知识库，扩展其他 Fandom 需要新建 knowledge pack
4. **无分支创作** — 故事是线性生成，不支持用户选择不同情节走向（这正是 Weave 的强项）

---

## 九、对 AI FanFic Workshop 的启示

### 可直接复用的组件

1. **知识库类型系统** (`types.ts`) — `CharacterProfile`、`RelationshipDynamic`、`WorldRule`、`TropeTemplate` 的接口定义非常通用
2. **LangGraph 工作流模式** — 六节点流水线 + 条件路由 + 质量修订循环
3. **RAG 检索架构** — pgvector + OpenAI embedding 的向量检索方案
4. **SSE 流式进度** — 前端实时进度展示的完整实现
5. **HITL 设计文档** — CopilotKit + LangGraph 集成的完整踩坑记录

### 需要改进的方向

1. **分支创作** — 引入 Weave 的树形结构，支持用户选择不同情节走向
2. **更多 Fandom 支持** — 设计可插拔的知识库架构
3. **角色一致性** — 可以增加更精细的角色状态追踪
4. **用户偏好学习** — 数据库已有 `preferredCPs`、`preferredTropes` 等字段，但算法未实现

---

*报告基于对 FanFic Lab 源代码的完整分析，覆盖所有核心模块。*
