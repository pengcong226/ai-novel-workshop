# 91Writing 深度技术分析报告

> **项目地址**: https://github.com/ponysb/91Writing
> **版本**: v0.7.0
> **技术栈**: Vue 3.3.8 + Element Plus 2.4.2 + Pinia 2.1.7 + Vite 4.5.0
> **架构**: 纯前端 SPA，无后端，数据全部存储在浏览器 localStorage
> **分析时间**: 2026年5月

---

## 一、项目概述

91写作（91Writing）是一款基于 Vue 3 的专业 AI 小说创作平台，核心特点是**纯前端架构**——所有数据保存在本地浏览器，AI API 由用户自行配置。这使其成为一个零服务器成本的创作工具，非常适合个人作者和小团队使用。

### 核心定位
- 中文网络小说创作辅助工具
- 集成多模型 AI（GPT、Claude、Gemini、DeepSeek 等）
- 从构思到成文的全流程支持
- 同时提供官方付费 API 和自定义 API 接入

---

## 二、系统架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────┐
│                  浏览器 (Vue 3 SPA)               │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Vue Router│  │ Pinia    │  │ localStorage │   │
│  │ (Hash模式)│  │ Store    │  │ (持久化存储)  │   │
│  └──────────┘  └──────────┘  └──────────────┘   │
│       │              │              │             │
│  ┌────────────────────────────────────────┐      │
│  │         视图层 (Views + Components)      │      │
│  │  Dashboard │ Writer │ Novel │ Prompts  │      │
│  │  Goals │ Billing │ Settings │ Tools    │      │
│  └────────────────────────────────────────┘      │
│       │                                           │
│  ┌──────────┐  ┌──────────┐                      │
│  │ APIService│  │ Billing  │                      │
│  │ (HTTP)   │  │ Service  │                      │
│  └──────────┘  └──────────┘                      │
│       │                                           │
└───────┼───────────────────────────────────────────┘
        │ (OpenAI 兼容 API)
        ▼
┌─────────────────────┐
│  AI 服务端            │
│  ┌─ 官方 API (91hub) │
│  └─ 自定义 API        │
└─────────────────────┘
```

### 2.2 路由结构

采用 `createWebHashHistory` 模式，所有路由嵌套在 `Dashboard` 组件下：

| 路由路径 | 组件 | 功能 |
|---------|------|------|
| `/` | HomePage | 首页仪表盘 |
| `/novels` | NovelManagement | 小说管理（CRUD） |
| `/writer` | Writer | **核心编辑器**（写作、人物、世界观、语料库、事件线） |
| `/chapters` | ChapterManagement | 章节管理 |
| `/prompts` | PromptsLibrary | 提示词库 |
| `/tools` | ToolsLibrary | 智能工具库（10个工具） |
| `/short-story` | ShortStory | 短篇小说创作 |
| `/book-analysis` | BookAnalysis | 拆书分析 |
| `/genres` | GenreManagement | 类型管理 |
| `/goals` | WritingGoals | 写作目标 |
| `/billing` | TokenBilling | Token 计费管理 |
| `/config` | ApiConfig | API 配置 |
| `/settings` | Settings | 系统设置 |

---

## 三、核心数据模型

### 3.1 小说项目模型 (Novel)

```javascript
// localStorage 中的 novels 数组结构
{
  id: Number,           // 时间戳ID
  title: String,        // 小说标题
  description: String,  // 简介
  genre: String,        // 类型（玄幻/都市/科幻/历史等）
  status: String,       // writing | completed | paused
  cover: String,        // 封面图片URL
  wordCount: Number,    // 总字数
  createdAt: String,    // ISO时间戳
  updatedAt: String,    // ISO时间戳
  chapterList: Array,   // 章节列表
  characters: Array,    // 人物设定
  worldSettings: Array, // 世界观设定
  events: Array,        // 事件时间线
}
```

### 3.2 章节模型 (Chapter)

```javascript
{
  id: Number,
  title: String,        // 章节标题
  content: String,      // 章节内容（HTML 格式，来自 WangEditor）
  description: String,  // 章节大纲描述
  wordCount: Number,    // 章节字数
  status: String,       // draft | completed | published
  order: Number,        // 排序序号
}
```

### 3.3 人物模型 (Character)

```javascript
{
  id: Number,
  name: String,         // 角色名
  age: String,          // 年龄
  gender: String,       // male | female | other
  role: String,         // protagonist | supporting | antagonist | minor
  personality: String,  // 性格描述
  appearance: String,   // 外貌描述
  background: String,   // 背景故事
  traits: Array,        // 特点标签数组
  skills: Array,        // 技能列表
  avatar: String,       // 头像URL
  tags: Array,          // 自定义标签
}
```

### 3.4 世界观设定模型 (WorldSetting)

```javascript
{
  id: Number,
  title: String,        // 设定名称
  description: String,  // 详细描述
  category: String,     // setting | magic | politics | geography | history
  overview: String,     // 概述
  rules: Array,         // 规则列表
  geography: String,    // 地理环境
  history: String,      // 历史背景
  features: Array,      // 特色元素
  generated: Boolean,   // 是否AI生成
  createdAt: String,
}
```

### 3.5 提示词模型 (Prompt)

```javascript
{
  id: Number,
  title: String,
  category: String,     // outline | content | polish | brainstorm | content-dialogue 等
  description: String,
  content: String,      // 提示词模板，支持 {变量} 占位符
  tags: Array,
  usageCount: Number,
}
```

### 3.6 事件时间线模型 (Event)

```javascript
{
  id: Number,
  title: String,
  description: String,
  timestamp: String,
  relatedCharacters: Array,
}
```

---

## 四、AI 集成架构

### 4.1 API 服务层 (`src/services/api.js`)

这是整个系统的核心服务类 `APIService`，采用单例模式导出。

#### API 配置管理

系统支持两种 API 配置模式：
- **官方模式** (`officialApiConfig`): 固定地址 `https://ai.91hub.vip/v1`，按次计费
- **自定义模式** (`customApiConfig`): 用户自行配置 OpenAI 兼容 API

```javascript
// 配置结构
{
  apiKey: String,
  baseURL: String,        // 官方模式固定为 https://ai.91hub.vip/v1
  selectedModel: String,  // 如 claude-4-sonnet, gpt-4o 等
  maxTokens: Number,      // 默认 2000000
  unlimitedTokens: Boolean,
  temperature: Number,    // 默认 0.7
}
```

配置通过 `localStorage` 持久化，支持 `officialApiConfig` / `customApiConfig` 两个键。

#### 核心 API 方法

| 方法 | 功能 | 流式支持 |
|------|------|---------|
| `generateText()` | 通用文本生成 | ❌ |
| `generateTextStream()` | 流式文本生成 | ✅ SSE |
| `generateOutline()` | 生成小说大纲 | ❌ |
| `generateOutlineStream()` | 流式大纲生成 | ✅ |
| `generateChapterContent()` | 生成章节正文 | ❌ |
| `generateChapterContentStream()` | 流式章节生成 | ✅ |
| `chatWithAI()` | AI 对话 | ❌ |
| `generateSummary()` | 文章摘要 | ✅ |
| `getWritingAdvice()` | 写作建议 | ✅ |
| `generateCharacter()` | AI 生成人物 | ✅ |
| `generateWorldSetting()` | AI 生成世界观 | ✅ |
| `analyzeArticle()` | 文章深度分析 | ❌ |
| `generatePersonalizedContent()` | 基于语料库生成 | ✅ |
| `generateGeneralContent()` | 通用内容生成 | ✅ |
| `validateAPIKey()` | API 密钥验证 | ❌ |

### 4.2 流式生成实现

流式生成基于 **Server-Sent Events (SSE)** 协议，使用 `fetch` + `ReadableStream`：

```javascript
// 核心流式处理逻辑
async generateTextStream(prompt, options, onChunk) {
  const response = await fetch(url, {
    method: 'POST',
    headers: this.buildHeaders(),
    body: JSON.stringify({ ..., stream: true }),
    signal: AbortSignal.timeout(300000)  // 5分钟超时
  });
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  while (!streamFinished) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();  // 保留不完整行
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') { streamFinished = true; break; }
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content || '';
        if (content) {
          fullContent += content;
          onChunk?.(content, fullContent);
        }
      }
    }
  }
}
```

### 4.3 上下文构建策略

**智能续写的上下文构建**（`generateChapterContent`）：

```
输入上下文 = 章节标题 + 章节大纲 + 小说基本信息 + 写作风格模板 
           + 前文内容（最近500字） + 人物设定 + 世界观设定
```

**关键设计**：
- 前文内容截取：`previousContent.slice(-500)`，只取最近 500 字符作为上下文
- 人物信息格式化：每个角色输出 `名字：描述 (特点：特征1、特征2)`
- 世界观信息格式化：每个设定输出 `标题：描述`
- 小说元信息：标题、类型、主题、简介

### 4.4 Token 计费系统 (`src/services/billing.js`)

独立的计费服务，与 API 调用联动：

- **Token 估算**：中文字符 × 1.5 + 英文单词 × 1.3 + 其他字符 × 0.5
- **模型定价**：按每 1000 token 计费（人民币），覆盖 GPT-4/3.5、Claude-3 系列
- **账单记录**：存储在 localStorage，保留最近 1000 条
- **统计功能**：今日统计、使用趋势（最近 7 天）、总费用

---

## 五、世界观构建系统

### 5.1 设计思路

91Writing 的世界观系统采用**分类模板管理**模式：

```
世界观设定
├── 世界设定 (setting)    - 核心世界观框架
├── 魔法体系 (magic)      - 超自然能力系统
├── 政治势力 (politics)   - 势力分布和权力结构
├── 地理环境 (geography)  - 地图和地点描述
└── 历史背景 (history)    - 世界历史事件
```

### 5.2 世界观面板 (`WriterWorldviewPanel.vue`)

- **CRUD 操作**：新增、编辑、复制、删除世界观设定
- **AI 生成**：调用 `generateWorldSetting()` 自动生成设定
- **分类展示**：不同类别使用不同颜色标签
- **一致性检查**：AI 驱动的世界观验证

### 5.3 AI 世界观生成提示词

```javascript
const prompt = `请根据主题"${theme}"生成一个小说世界观设定

要求：
1. 设定的名称和概述
2. 详细的背景描述
3. 重要的规则或法则
4. 地理环境或空间结构
5. 历史背景或重要事件
6. 与主题相关的特色元素

请以JSON格式返回：{
  "title": "设定名称",
  "overview": "概述",
  "description": "详细描述",
  "rules": ["规则1", "规则2"],
  "geography": "地理环境",
  "history": "历史背景",
  "features": ["特色1", "特色2"]
}`
```

---

## 六、智能续写系统

### 6.1 续写对话框设计

续写采用**左右分栏布局**（`Writer.vue` 中的续写对话框）：

```
┌─────────────────────────────────────────┐
│           AI 智能续写                     │
├───────────────────┬─────────────────────┤
│   ⚙️ 续写配置      │   ✍️ 续写结果         │
│                   │                     │
│  续写方向:         │   (流式输出区域)       │
│  [textarea]       │                     │
│                   │   续写字数: XXX      │
│  续写字数:         │   总字数: XXXX       │
│  [200-5000 滑块]   │                     │
│                   │   [复制] [追加到文章]  │
│  当前内容预览:     │                     │
│  (可滚动查看)      │                     │
│                   │                     │
│  [开始续写]        │                     │
└───────────────────┴─────────────────────┘
```

### 6.2 续写上下文管理

**自动关联策略**（v0.5.0 更新后）：
- 默认自动关联前两章内容
- 支持手动选择多章作为上下文
- 上下文通过 `previousContent.slice(-500)` 截取

### 6.3 续写提示词构建

```javascript
const prompt = `请根据以下信息续写小说内容：

续写方向：${direction}
当前已有内容：${currentContent}
章节标题：${chapterTitle}
章节大纲：${chapterOutline}
前文内容参考：${previousContent.slice(-500)}
人物设定：${charactersInfo}
世界观设定：${worldInfo}

要求：
1. 字数控制在${wordCount}字左右
2. 内容要符合续写方向
3. 保持与前文的连贯性
4. 充分利用人物设定和世界观
5. 确保人物行为符合性格特点

请直接输出续写内容：`
```

---

## 七、章节管理系统

### 7.1 章节状态三态模型

```
草稿 (draft) ──→ 完成 (completed) ──→ 发表 (published)
  [橙色]           [绿色]              [蓝色]
```

### 7.2 章节操作

- **手动创建**：空白章节
- **AI 生成单章**：基于大纲 AI 生成
- **AI 批量生成**：批量生成多章
- **根据大纲生成**：选中章节后一键生成
- **智能续写**：基于已有内容续写
- **内容优化**：AI 润色选中内容

### 7.3 编辑器组件 (`WriterEditor.vue`)

使用 **WangEditor 5** 富文本编辑器：
- 工具栏 + 编辑区上下布局
- 实时字数统计
- 自动保存指示器
- 三态状态切换（下拉菜单）

---

## 八、提示词管理系统

### 8.1 分类体系

```
提示词分类
├── 大纲生成 (outline)
├── 正文创作 (content)
│   ├── 基础正文 (content-basic)
│   ├── 对话生成 (content-dialogue)
│   ├── 场景描写 (content-scene)
│   ├── 动作情节 (content-action)
│   └── 心理描写 (content-psychology)
├── 润色优化 (polish)
│   ├── 语法润色
│   ├── 文风优化
│   ├── 情感增强
│   └── 逻辑梳理
├── 头脑风暴 (brainstorm)
└── 短篇小说 (short-story)
```

### 8.2 变量系统

提示词支持 `{变量名}` 占位符，运行时自动替换：

```json
{
  "content": "请为{小说类型}类型的小说创作一个{主角姓名}的冒险大纲...\n设定：{世界设定}"
}
```

变量来源：
- 小说元信息（标题、类型、主题）
- 人物设定
- 世界观设定
- 用户自定义输入

### 8.3 内置提示词示例

```json
[
  {
    "title": "玄幻修真大纲生成器",
    "category": "outline",
    "content": "请为我创作一个玄幻修真小说的大纲，设定如下：..."
  },
  {
    "title": "古风言情告白场景",
    "category": "content-dialogue",
    "content": "创作一个古风言情小说中的告白场景：..."
  }
]
```

---

## 九、智能工具库

### 9.1 十大专业工具

| 工具 | 功能 | 模板选择 |
|------|------|---------|
| 细纲生成器 | AI 辅助生成详细章节大纲 | ✅ |
| 角色生成器 | 1-15 个角色批量生成 | ✅ |
| 脑洞生成器 | 批量创意点子（3/5/8/10个） | ✅ |
| 爆款书名生成器 | 5-20 个书名批量生成 | ✅ |
| 爆款题材生成器 | 热门创作方向发现 | ✅ |
| 宏大世界观生成器 | 完整世界框架构建 | ✅ |
| 金手指生成器 | 角色能力系统设计 | ✅ |
| 黄金开篇生成器 | 各题材引人入胜的开头 | ✅ |
| 简介生成器 | 作品简介生成 | ✅ |
| 冲突生成器 | 戏剧性冲突点设计 | ✅ |

---

## 十、AI 内容润色系统

### 10.1 润色类型

- **语法润色**：修正语法错误
- **文风优化**：调整写作风格
- **情感增强**：加强情感表达
- **逻辑梳理**：理顺逻辑关系

### 10.2 润色流程

```
选中内容 → 选择润色类型 → 选择提示词模板 → 输入自定义要求 
→ 流式润色 → 预览效果 → 替换原文/放弃
```

### 10.3 智能检测

- 自动检测是否有选中内容
- 有选中：替换选中部分
- 无选中：整文润色模式

---

## 十一、数据管理

### 11.1 数据持久化

所有数据通过 `localStorage` 存储：
- `novels` - 小说列表
- `apiConfig` / `officialApiConfig` / `customApiConfig` - API 配置
- `prompts` - 提示词库
- `genres` - 类型管理
- `billing_records` - 计费记录
- `token_usage_stats` - 使用统计
- `writing_goals` - 写作目标

### 11.2 导入导出

支持分类导出：
- 小说数据（含章节、人物、世界观）
- 提示词库
- 类型设置
- API 配置
- 计费数据（JSON/CSV）

---

## 十二、与 Fanfic 平台的借鉴价值

### 12.1 可直接复用的设计

| 设计点 | 91Writing 实现 | 借鉴价值 |
|--------|---------------|---------|
| 纯前端架构 | localStorage 持久化 | ✅ 可快速原型 |
| API 服务单例 | `APIService` 类 | ✅ 高度复用 |
| 流式 SSE 实现 | fetch + ReadableStream | ✅ 直接复用 |
| 章节三态模型 | draft/completed/published | ✅ 直接复用 |
| 世界观分类 | 5类标签系统 | ✅ 直接复用 |
| 提示词变量系统 | `{变量}` 占位符 | ✅ 直接复用 |
| 人物角色模型 | role/gender/traits | ✅ 直接复用 |

### 12.2 需要改进的方面

| 方面 | 91Writing 现状 | 建议改进 |
|------|---------------|---------|
| 后端存储 | 纯 localStorage | PostgreSQL 持久化 |
| 上下文管理 | `slice(-500)` 简单截取 | 智能上下文窗口管理 |
| 世界观一致性 | 无自动检查 | 引入一致性验证引擎 |
| 角色深度 | 扁平字段 | Wound/Want/Need/Lie 框架 |
| 版本控制 | 无 | Git-like 章节版本 |
| 多用户协作 | 无 | WebSocket 实时协作 |
| Token 预算 | 估算而非精确 | 使用 tiktoken 精确计算 |

### 12.3 架构升级建议

```
91Writing 架构          →    Fanfic 平台架构
─────────────────────────────────────────
localStorage            →    PostgreSQL + Redis
前端直接调 API           →    FastAPI 后端代理
简单 slice(-500)        →    语义检索 + 滑动窗口
无世界观验证            →    规则引擎 + 一致性检查
扁平角色模型            →    结构化角色图谱
单用户本地              →    多用户 + 作品管理系统
无审核机制              →    内容审核 + 社区功能
```

---

## 十三、总结

91Writing 是一个**功能完备的前端 AI 写作工具**，其核心优势在于：
1. 零服务器成本的纯前端架构
2. 完善的提示词管理和变量系统
3. 多模型 API 兼容（OpenAI 格式）
4. 从构思到成文的全流程工具链
5. 世界观、人物、章节的结构化管理

但其局限也很明显：
1. 无后端，数据安全性依赖浏览器
2. 上下文管理过于简单（`slice(-500)`）
3. 无 AI 一致性检查机制
4. 角色模型不够深度（缺少心理框架）
5. 无自动评估和反馈循环

对于我们的 Fanfic 平台，91Writing 的**前端架构和 UI 设计**是最有价值的参考，但其**AI 集成深度**和**世界观一致性管理**需要大幅增强，这正是 autonovel 和 BookWorld 的长处所在。
