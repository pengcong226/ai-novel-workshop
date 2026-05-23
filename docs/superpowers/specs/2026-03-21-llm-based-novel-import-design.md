# LLM驱动的小说导入系统设计文档

**日期**: 2026-03-21
**版本**: 1.0
**状态**: 待实施

## 背景和目标

### 当前问题

现有小说导入系统存在三个核心问题：

1. **章节检测失败** - 847,259字的小说只识别出1章，正则表达式模式无法适配所有章节格式
2. **AI人物识别质量差** - 把"说道"、"点头"、"小女孩的"等非人物词汇识别为角色
3. **统计数据显示缺失** - 没有显示总字数、章节数、平均字数等统计信息

### 设计目标

构建一个完全基于LLM的小说导入系统，实现：

- **准确的章节检测** - 支持任意章节格式，无需预设正则表达式
- **精准的人物识别** - 只识别真正的角色人物，提供结构化信息
- **完整的统计显示** - 实时显示字数、章节数、成本等统计信息
- **灵活的分析模式** - 快速模式（采样）vs 完整模式（全量）
- **友好的修正机制** - 统一预览 + 标记修正 + 重新分析

## 整体架构

### 系统流程

```
文件上传
  ↓
用户选择分析模式（快速/完整）
  ↓
第一阶段：章节检测
  - 快速模式：LLM分析前5000字识别章节模式 + 全文验证
  - 完整模式：LLM全文扫描识别章节边界
  ↓
第二阶段：人物识别
  - 快速模式：LLM分析前20%章节
  - 完整模式：LLM分析所有章节
  ↓
第三阶段：世界观提取
  - LLM分析代表性章节（快速）或全部分析（完整）
  ↓
第四阶段：大纲生成
  - 基于章节内容生成大纲
  ↓
统一预览界面
  - 显示所有识别结果
  - 用户标记修正
  - "重新分析"按钮
  ↓
确认导入
```

### 核心设计决策

1. **完全放弃规则引擎** - 章节检测和人物识别全部使用LLM，不依赖正则表达式或停用词列表
2. **多轮对话策略** - 每个分析阶段使用多轮LLM对话，逐步细化和验证结果
3. **用户可控成本** - 提供快速/完整两种模式，显示实时成本预估
4. **修正优先** - 允许用户修正错误，支持重新分析特定部分

## 详细设计

### 1. 分析模式

#### 快速模式

**目标**: 快速预览大文件，低成本

**策略**:
```typescript
interface QuickModeSampling {
  chapterDetection: {
    // 分析开头和结尾识别模式
    start: 5000,      // 前5000字
    end: 2000,        // 最后2000字
    // 然后全文验证模式
    validation: "pattern-match-full-text"
  }
  characterExtraction: {
    // 分析前20%章节，最少10章，最多30章
    chapters: "first-20-percent",
    minChapters: 10,
    maxChapters: 30
  }
  worldExtraction: {
    // 分析开头5章、中间5章、结尾5章
    chapters: "first-5-middle-5-last-5"
  }
  outlineGeneration: {
    // 基于已分析的章节
    basis: "analyzed-chapters"
  }
}
```

**详细说明**:
- 章节检测：先分析开头5000字+结尾2000字识别章节模式，然后全文验证该模式
- 人物识别：分析前20%章节（最少10章，最多30章）
- 世界观：分析开头、中间、结尾各5章（共15章）
- 大纲：基于已分析的章节生成

**预估**:
- 时间: 2-5分钟
- Token: 输入约20万，输出约2万
- 成本: 约$5-10（Claude-3.5）

#### 完整模式

**目标**: 完整分析，最高准确性

**策略**:
- 章节检测：全文扫描
- 人物识别：分析所有章节
- 世界观：分析所有章节
- 大纲：基于全部内容

**预估**:
- 时间: 5-15分钟
- Token: 输入约100万，输出约5万
- 成本: 约$20-100（Claude-3.5）

### 2. LLM分析流程

#### 2.1 章节检测流程

**第一轮：识别章节模式**

```typescript
输入：小说前5000字 + 最后2000字（快速）或 全文（完整）

Prompt模板：
你是一位专业的小说编辑。请分析以下小说文本的章节结构。

文本：
{TEXT}

请识别章节标题的模式。要求：
1. 找出所有章节标题的示例
2. 描述章节标题的特征模式
3. 估算总章节数
4. 给出置信度（0-1）

请以JSON格式返回：
{
  "pattern": "章节标题的特征描述（例如：以'第'开头，后跟中文数字，再跟'章'，最后是标题）",
  "examples": ["第一章 开端", "第二章 初遇", ...],
  "estimatedTotal": 预估章节数（整数）,
  "confidence": 0.95
}

输出：{
  pattern: "章节标题的特征描述",
  examples: ["第一章 开端", "第二章 初遇", ...],
  estimatedTotal: 预估章节数,
  confidence: 0.95
}
```

**第二轮：提取章节列表**

```typescript
输入：章节模式 + 全文（完整）或 快速模式的采样文本

Prompt模板：
你是一位专业的小说编辑。根据已识别的章节模式，列出所有章节的标题和位置。

章节模式：{PATTERN}
文本：
{TEXT}

请精确列出每个章节的：
1. 章节号
2. 标题（完整标题）
3. 在文本中的起止位置（字符索引）

请以JSON格式返回：
[
  {
    "number": 1,
    "title": "第一章 开端",
    "startPosition": 0,
    "endPosition": 3500
  },
  ...
]

重要：startPosition和endPosition必须是文本中的精确字符索引。

输出：[
  { number: 1, title: "第一章 开端", startPosition: 0, endPosition: 3500 },
  { number: 2, title: "第二章 初遇", startPosition: 3500, endPosition: 7200 },
  ...
]
```

**第三轮：验证和修正**

```typescript
输入：章节列表 + 可疑位置（空白章节、内容过短等）
Prompt：检查章节列表是否有遗漏或错误，修正问题
输出：修正后的完整章节列表
```

#### 2.2 人物识别流程

**第一轮：识别主要人物**

```typescript
输入：指定的章节内容
Prompt：分析这些章节，识别所有出现的人物。
要求：
1. 只返回真正的角色人物，不要返回"说道"、"点头"等动词或代词
2. 为每个人物提供：姓名、角色定位（主角/配角/反派/路人）、性格特征、首次出现章节
3. 按重要程度排序
输出：[
  {
    name: "张三",
    role: "protagonist",
    personality: ["勇敢", "正直"],
    firstAppearance: "第一章",
    description: "故事主角，一个年轻的修士"
  },
  ...
]
```

**第二轮：提取人物关系**

```typescript
输入：人物列表 + 章节内容
Prompt：分析这些人物之间的关系
输出：[
  { from: "张三", to: "李四", relation: "师徒", description: "李四是张三的师父" },
  ...
]
```

#### 2.3 世界观提取流程

```typescript
输入：代表性章节（开头、中间、结尾）
Prompt：分析小说的世界设定，提取：
- 世界类型（修仙、科幻、现代等）
- 时代背景
- 力量体系
- 主要势力
- 重要地点
输出：结构化的世界观设定
```

#### 2.4 大纲生成流程

```typescript
输入：章节列表 + 内容摘要
Prompt：生成小说大纲，包括主线、支线、关键事件
输出：{
  mainPlot: "主线剧情描述",
  subPlots: ["支线1", "支线2"],
  keyEvents: [
    { chapter: 1, event: "关键事件" }
  ]
}
```

### 3. 数据结构

#### 核心类型定义

```typescript
// 分析模式
type AnalysisMode = 'quick' | 'full'

// 分析进度
interface AnalysisProgress {
  stage: 'pattern' | 'chapters' | 'characters' | 'world' | 'outline' | 'complete'
  current: number
  total: number
  message: string
  estimatedCost?: number
}

// LLM识别的章节
interface LLMChapter {
  number: number
  title: string
  startPosition: number
  endPosition: number
  content?: string
  wordCount?: number
}

// LLM识别的人物
interface LLMCharacter {
  name: string
  role: 'protagonist' | 'supporting' | 'antagonist' | 'minor'
  personality: string[]
  firstAppearance: string
  description: string
  confidence: number
  verified: boolean
}

// LLM识别的人物关系
interface LLMRelationship {
  from: string
  to: string
  relation: string
  description: string
}

// LLM提取的世界观
interface LLMWorldSetting {
  worldType: string
  era: string
  powerSystem?: string
  majorFactions: string[]
  keyLocations: string[]
  description: string
}

// LLM生成的大纲
interface LLMOutline {
  mainPlot: string
  subPlots: string[]
  keyEvents: Array<{
    chapter: number
    event: string
  }>
}

// 分析结果
interface LLMAnalysisResult {
  mode: AnalysisMode

  chapters: LLMChapter[]
  chapterPattern: {
    pattern: string
    examples: string[]
    confidence: number
  }

  characters: LLMCharacter[]
  relationships: LLMRelationship[]

  worldSetting: LLMWorldSetting
  outline: LLMOutline

  stats: {
    totalWords: number
    totalChapters: number
    avgWordsPerChapter: number
    analysisTime: number
    tokenUsage: {
      input: number
      output: number
    }
  }

  errors: Array<{
    stage: string
    message: string
    retryable: boolean
  }>
}

// 用户修正标记
interface UserCorrection {
  type: 'delete' | 'edit' | 'add'
  target: 'chapter' | 'character' | 'relationship' | 'world' | 'outline'
  data: any
  reason?: string
}

// 重新分析请求
interface RerunAnalysisRequest {
  scope: 'chapters' | 'characters' | 'world' | 'all'
  corrections: UserCorrection[]
  focusHint?: string
}
```

#### API函数签名

```typescript
// 主入口：执行LLM分析
async function analyzeNovelWithLLM(
  text: string,
  mode: AnalysisMode,
  config: AIAnalysisConfig,
  onProgress?: (progress: AnalysisProgress) => void
): Promise<LLMAnalysisResult>

// 章节检测
async function detectChaptersWithLLM(
  text: string,
  mode: AnalysisMode,
  config: AIAnalysisConfig,
  onProgress?: (progress: AnalysisProgress) => void
): Promise<{ chapters: LLMChapter[], pattern: any }>

// 人物识别
async function extractCharactersWithLLM(
  text: string,
  chapters: LLMChapter[],
  mode: AnalysisMode,
  config: AIAnalysisConfig,
  onProgress?: (progress: AnalysisProgress) => void
): Promise<{ characters: LLMCharacter[], relationships: LLMRelationship[] }>

// 世界观提取
async function extractWorldWithLLM(
  text: string,
  chapters: LLMChapter[],
  config: AIAnalysisConfig
): Promise<LLMWorldSetting>

// 大纲生成
async function generateOutlineWithLLM(
  chapters: LLMChapter[],
  config: AIAnalysisConfig
): Promise<LLMOutline>

// 重新分析（应用用户修正）
async function rerunAnalysisWithCorrections(
  text: string,
  request: RerunAnalysisRequest,
  config: AIAnalysisConfig,
  onProgress?: (progress: AnalysisProgress) => void
): Promise<LLMAnalysisResult>
```

### 4. UI设计

#### 步骤1：文件上传和模式选择

```
┌─────────────────────────────────────────┐
│  📁 选择小说文件                          │
│  [拖拽上传或点击选择]                      │
│                                          │
│  📝 小说标题：[自动填充]                   │
│  👤 作者：[可选]                          │
│                                          │
│  🔧 分析模式：                            │
│  ○ 快速模式（推荐）                       │
│    · 分析前20%章节 + 代表性章节           │
│    · 预估时间：2-5分钟                    │
│    · 预估成本：约$5-10                    │
│    · 适合：大文件预览、快速了解内容        │
│                                          │
│  ○ 完整模式                               │
│    · 分析全部内容                         │
│    · 预估时间：5-15分钟                   │
│    · 预估成本：约$20-100                  │
│    · 适合：最终导入、完整分析              │
│                                          │
│  💡 当前已配置模型：Claude-3.5-Sonnet     │
│                                          │
│  [取消] [下一步]                          │
└─────────────────────────────────────────┘
```

#### 步骤2：分析进度显示

```
┌─────────────────────────────────────────┐
│  ⏳ 正在分析小说...                       │
│                                          │
│  ████████░░░░░░░░ 45%                    │
│                                          │
│  当前阶段：识别人物（第15/56章）           │
│                                          │
│  ✓ 章节检测：已识别280章                  │
│  ✓ 章节验证：已确认280章                  │
│  ⟳ 人物识别：进行中...                    │
│  ○ 人物关系：等待中                       │
│  ○ 世界观提取：等待中                     │
│  ○ 大纲生成：等待中                       │
│                                          │
│  已用Token：52,000 输入 / 3,200 输出      │
│  预估成本：$4.50                          │
│                                          │
│  [取消分析]                               │
└─────────────────────────────────────────┘
```

#### 步骤3：预览和修正

```
┌─────────────────────────────────────────┐
│  📊 分析结果预览                          │
│                                          │
│  📈 统计信息                              │
│  ┌──────┬──────┬──────────┐             │
│  │总字数│章节数│平均章节字数│             │
│  ├──────┼──────┼──────────┤             │
│  │847,259│ 280  │  3,026   │             │
│  └──────┴──────┴──────────┘             │
│                                          │
│  📑 章节列表 [编辑] [重新检测]             │
│  ┌──────┬──────────────┬────────┐       │
│  │ 章节 │    标题      │ 字数   │       │
│  ├──────┼──────────────┼────────┤       │
│  │  1   │ 序章         │ 2,156  │ [×]   │
│  │  2   │ 第一章 初遇   │ 3,245  │ [×]   │
│  │  3   │ 第二章 修炼   │ 2,890  │ [×]   │
│  │ ...  │ ...         │ ...    │       │
│  └──────┴──────────────┴────────┘       │
│  [合并选中] [拆分章节] [添加章节]          │
│                                          │
│  👥 人物列表 [编辑] [重新识别]             │
│  ┌──────────┬──────┬────────┬──────┐   │
│  │   姓名   │ 角色 │ 出场章节│ 置信度│   │
│  ├──────────┼──────┼────────┼──────┤   │
│  │  张三    │ 主角 │ 第1章  │ 0.98 │ [×]│
│  │  李四    │ 配角 │ 第2章  │ 0.95 │ [×]│
│  │ 说道 ❌  │ 路人 │ -      │ 0.30 │ [×]│   │
│  │ ...     │ ...  │ ...    │ ...  │   │
│  └──────────┴──────┴────────┴──────┘   │
│  [删除选中] [添加人物] [标记错误]          │
│                                          │
│  🌍 世界观 [编辑]                         │
│  类型：修仙世界                           │
│  力量体系：炼气→筑基→金丹→元婴...         │
│  主要势力：天剑宗、万魔门、散修联盟        │
│                                          │
│  📝 大纲 [编辑]                           │
│  主线：少年张三踏上修仙之路...            │
│                                          │
│  [上一步] [重新分析选中部分] [确认导入]    │
└─────────────────────────────────────────┘
```

#### 关键交互功能

1. **章节修正**
   - 点击章节可编辑标题
   - 勾选章节可合并或删除
   - "重新检测"按钮：指定章节范围，让LLM重新分析

2. **人物修正**
   - 点击"×"删除误识别人物
   - 点击人物可编辑角色、描述
   - "添加人物"：手动添加遗漏人物
   - "标记错误"：批量标记误识别，反馈给LLM重新分析

3. **重新分析**
   - 用户修正后，可点击"重新分析选中部分"
   - LLM根据用户的修正重新识别
   - 显示重新分析的成本预估

### 5. 技术实现

#### 5.0 LLM提供商集成

**支持的LLM提供商：**

```typescript
interface LLMProviderConfig {
  provider: "anthropic" | "openai" | "local" | "custom"
  model: string
  apiKey: string
  baseURL?: string

  // 模型配置
  maxTokens: number
  temperature: number

  // 定价（每1M tokens）
  pricing: {
    input: number  // 输入token价格
    output: number // 输出token价格
  }
}

// 预设模型配置
const SUPPORTED_MODELS = {
  'claude-3-5-sonnet-20241022': {
    provider: 'anthropic',
    maxTokens: 200000,
    temperature: 0.7,
    pricing: { input: 3, output: 15 }
  },
  'gpt-4-turbo': {
    provider: 'openai',
    maxTokens: 128000,
    temperature: 0.7,
    pricing: { input: 10, output: 30 }
  },
  // 可添加更多模型
}
```

**与现有AI配置集成：**

```typescript
// 使用项目现有的AIAnalysisConfig
function getLLMConfig(): LLMProviderConfig | null {
  const project = projectStore.currentProject
  const config = project?.config

  // 从项目配置中获取importModel
  const modelId = config?.importModel
  if (!modelId) return null

  // 查找对应的provider和模型
  for (const provider of config.providers || []) {
    const model = provider.models?.find(m => m.id === modelId && m.isEnabled)
    if (model && provider.isEnabled) {
      return {
        provider: provider.type,
        model: model.name,
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl,
        maxTokens: model.maxTokens || 4000,
        temperature: 0.7,
        pricing: {
          input: model.costPerInputToken || 5,
          output: model.costPerOutputToken || 15
        }
      }
    }
  }

  return null
}
```

#### 文本分块策略

```typescript
interface TextChunk {
  index: number
  text: string
  startPosition: number
  endPosition: number
  tokenCount: number
}

function splitTextForLLM(
  text: string,
  maxTokensPerChunk: number = 50000,
  overlap: number = 500
): TextChunk[]
```

智能分块：
- 优先在段落边界分割
- 保持重叠区域确保连续性
- 计算token数量（中文约1.5字/token）

**Tokenizer选择：**

```typescript
// 使用模型对应的tokenizer
import { encode } from 'gpt-tokenizer'  // OpenAI模型
// 或使用Anthropic的tokenizer（需安装@anthropic-ai/tokenizer）

function countTokens(text: string, provider: string): number {
  switch (provider) {
    case 'openai':
      return encode(text).length
    case 'anthropic':
      // Claude tokenizer近似：中文约1.5字符/token
      const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
      const otherChars = text.length - chineseChars
      return Math.ceil(chineseChars / 1.5 + otherChars / 4)
    default:
      // 通用估算
      return Math.ceil(text.length / 3)
  }
}
```

#### JSON验证和错误处理

**JSON Schema定义：**

```typescript
// 章节列表schema
const chapterListSchema = {
  type: "array",
  items: {
    type: "object",
    required: ["number", "title", "startPosition", "endPosition"],
    properties: {
      number: { type: "number", minimum: 1 },
      title: { type: "string", minLength: 1 },
      startPosition: { type: "number", minimum: 0 },
      endPosition: { type: "number", minimum: 0 }
    }
  }
}

// 人物列表schema
const characterListSchema = {
  type: "array",
  items: {
    type: "object",
    required: ["name", "role", "personality", "description"],
    properties: {
      name: { type: "string", minLength: 2, maxLength: 20 },
      role: { type: "string", enum: ["protagonist", "supporting", "antagonist", "minor"] },
      personality: { type: "array", items: { type: "string" } },
      firstAppearance: { type: "string" },
      description: { type: "string" },
      confidence: { type: "number", minimum: 0, maximum: 1 }
    }
  }
}
```

**LLM输出验证：**

```typescript
import Ajv from 'ajv'

function validateLLMOutput(response: string, schema: any): {
  valid: boolean
  data?: any
  error?: string
} {
  try {
    // 尝试提取JSON
    const jsonMatch = response.match(/\[[\s\S]*\]|\{[\s\S]*\}/)
    if (!jsonMatch) {
      return {
        valid: false,
        error: "未找到JSON格式的数据"
      }
    }

    const data = JSON.parse(jsonMatch[0])

    // 验证schema
    const ajv = new Ajv()
    const validate = ajv.compile(schema)

    if (validate(data)) {
      return { valid: true, data }
    } else {
      return {
        valid: false,
        error: `JSON验证失败: ${ajv.errorsText(validate.errors)}`
      }
    }
  } catch (error) {
    return {
      valid: false,
      error: `JSON解析失败: ${error.message}`
    }
  }
}

// 重试策略
async function callLLMWithValidation(
  prompt: string,
  schema: any,
  config: LLMProviderConfig,
  maxRetries: number = 3
): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await callLLM(prompt, config)

    const validation = validateLLMOutput(response, schema)

    if (validation.valid) {
      return validation.data
    }

    // 验证失败，调整prompt重试
    if (attempt < maxRetries) {
      const correctedPrompt = `${prompt}\n\n上次返回的数据格式错误：${validation.error}\n请严格按照JSON格式返回数据。`

      await delay(1000 * attempt) // 指数退避

      const retryResponse = await callLLM(correctedPrompt, config)
      const retryValidation = validateLLMOutput(retryResponse, schema)

      if (retryValidation.valid) {
        return retryValidation.data
      }
    }
  }

  throw new Error(`LLM输出验证失败，已重试${maxRetries}次`)
}
```

#### LLM调用封装

```typescript
async function callLLMWithRetry(
  prompt: string,
  config: AIAnalysisConfig,
  options: {
    maxRetries: number
    temperature: number
    maxTokens: number
  }
): Promise<string>
```

重试策略：
- 网络错误：自动重试3次，指数退避
- Rate limit：等待后重试
- 输出格式错误：调整prompt重试
- Token超限：分割输入重试

#### Token计数和成本预估

```typescript
function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length
  const otherChars = text.length - chineseChars

  return Math.ceil(chineseChars / 1.5 + englishWords / 0.25 + otherChars * 0.3)
}

function estimateCost(inputTokens: number, outputTokens: number, model: string): number
```

#### 结果缓存和断点续传

**缓存存储策略：**

```typescript
interface AnalysisCache {
  fileId: string        // 文件hash（SHA-256）
  timestamp: number
  mode: AnalysisMode

  // 分阶段缓存
  chapterDetection?: any
  characterExtraction?: any
  worldExtraction?: any
  outlineGeneration?: any

  // 完整结果
  complete?: LLMAnalysisResult
}

class CacheManager {
  private dbName = 'novel-analysis-cache'
  private storeName = 'analysis'
  private maxAge = 7 * 24 * 60 * 60 * 1000  // 7天
  private maxSize = 500 * 1024 * 1024  // 500MB

  // 使用IndexedDB（浏览器）或文件系统（Electron）
  async saveStage(fileId: string, stage: string, result: any): Promise<void> {
    const cache = await this.loadCache(fileId) || {
      fileId,
      timestamp: Date.now(),
      mode: 'quick'
    }

    cache[stage] = {
      result,
      timestamp: Date.now()
    }

    await this.storeCache(cache)
  }

  async loadCache(fileId: string): Promise<AnalysisCache | null> {
    // 从IndexedDB或文件系统加载
    const cache = await this.getFromStorage(fileId)

    if (!cache) return null

    // 检查是否过期
    if (Date.now() - cache.timestamp > this.maxAge) {
      await this.deleteCache(fileId)
      return null
    }

    return cache
  }

  getLastStage(fileId: string): string | null {
    const cache = await this.loadCache(fileId)
    if (!cache) return null

    // 返回最后一个完成的阶段
    if (cache.complete) return 'complete'
    if (cache.outlineGeneration) return 'outline'
    if (cache.worldExtraction) return 'world'
    if (cache.characterExtraction) return 'characters'
    if (cache.chapterDetection) return 'chapters'
    return null
  }

  async resumeFromStage(
    fileId: string,
    stage: string,
    config: LLMProviderConfig,
    onProgress?: (progress: AnalysisProgress) => void
  ): Promise<LLMAnalysisResult> {
    const cache = await this.loadCache(fileId)
    if (!cache) {
      throw new Error('缓存不存在，无法续传')
    }

    // 从中断的阶段继续执行
    switch (stage) {
      case 'characters':
        // 从章节检测开始续传
        return await analyzeCharacters(cache.chapterDetection.result, config, onProgress)
      case 'world':
        // 从人物识别开始续传
        return await analyzeWorld(cache.characterExtraction.result, config, onProgress)
      // ... 其他阶段
    }
  }

  // 清理过期缓存
  async cleanup(): Promise<void> {
    const allCaches = await this.getAllCaches()

    for (const cache of allCaches) {
      if (Date.now() - cache.timestamp > this.maxAge) {
        await this.deleteCache(cache.fileId)
      }
    }
  }

  // 检查存储空间
  async checkStorageQuota(): Promise<boolean> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate()
      return (estimate.quota - estimate.usage) > this.maxSize
    }
    return true  // 无法检测，假设有空间
  }
}
```

**断点续传流程：**

```typescript
async function analyzeNovelWithLLM(
  text: string,
  mode: AnalysisMode,
  config: LLMProviderConfig,
  onProgress?: (progress: AnalysisProgress) => void
): Promise<LLMAnalysisResult> {
  const fileId = await hashText(text)  // SHA-256
  const cacheManager = new CacheManager()

  // 检查是否有中断的分析
  const lastStage = cacheManager.getLastStage(fileId)
  if (lastStage && lastStage !== 'complete') {
    const shouldResume = await askUser('检测到未完成的分析，是否继续？')
    if (shouldResume) {
      return await cacheManager.resumeFromStage(fileId, lastStage, config, onProgress)
    }
  }

  // 检查存储空间
  if (!await cacheManager.checkStorageQuota()) {
    console.warn('存储空间不足，可能无法缓存结果')
  }

  try {
    // 第一阶段：章节检测
    onProgress?.({ stage: 'chapters', current: 0, total: 100, message: '检测章节...' })
    const chapters = await detectChaptersWithLLM(text, mode, config)
    await cacheManager.saveStage(fileId, 'chapterDetection', chapters)

    // 第二阶段：人物识别
    onProgress?.({ stage: 'characters', current: 20, total: 100, message: '识别人物...' })
    const characters = await extractCharactersWithLLM(text, chapters, mode, config)
    await cacheManager.saveStage(fileId, 'characterExtraction', characters)

    // 第三阶段：世界观提取
    onProgress?.({ stage: 'world', current: 60, total: 100, message: '提取世界观...' })
    const world = await extractWorldWithLLM(text, chapters, config)
    await cacheManager.saveStage(fileId, 'worldExtraction', world)

    // 第四阶段：大纲生成
    onProgress?.({ stage: 'outline', current: 80, total: 100, message: '生成大纲...' })
    const outline = await generateOutlineWithLLM(chapters, config)
    await cacheManager.saveStage(fileId, 'outlineGeneration', outline)

    // 完整结果
    const result: LLMAnalysisResult = {
      mode,
      chapters: chapters.chapters,
      chapterPattern: chapters.pattern,
      characters: characters.characters,
      relationships: characters.relationships,
      worldSetting: world,
      outline,
      stats: calculateStats(chapters, characters),
      errors: []
    }

    await cacheManager.saveStage(fileId, 'complete', result)

    onProgress?.({ stage: 'complete', current: 100, total: 100, message: '分析完成' })
    return result

  } catch (error) {
    // 错误时保存已完成的阶段
    console.error('分析失败:', error)
    throw error
  }
}
```

**错误恢复协议：**

```typescript
interface ErrorRecovery {
  type: AnalysisErrorType
  stage: string
  savedProgress: any
  recoveryStrategy: () => Promise<void>
}

async function handleAnalysisError(
  error: AnalysisError,
  fileId: string,
  cacheManager: CacheManager
): Promise<void> {
  const lastStage = cacheManager.getLastStage(fileId)

  switch (error.type) {
    case AnalysisErrorType.NETWORK_ERROR:
      // 网络错误：自动重试，无需用户介入
      console.log('网络错误，将自动重试...')
      await delay(5000)
      // 调用恢复策略
      break

    case AnalysisErrorType.RATE_LIMIT:
      // Rate limit：等待后重试
      console.log('API调用频率限制，等待60秒后重试...')
      await delay(60000)
      break

    case AnalysisErrorType.TOKEN_LIMIT:
      // Token超限：自动调整策略
      console.log('内容过长，切换到更保守的分块策略...')
      // 重新配置分块参数
      break

    case AnalysisErrorType.USER_CANCEL:
      // 用户取消：保存进度
      console.log('用户取消分析，进度已保存')
      console.log(`下次可以从"${lastStage}"阶段继续`)
      return  // 不重试

    default:
      // 未知错误：通知用户
      await notifyUser({
        type: 'error',
        title: '分析失败',
        message: error.message,
        action: lastStage ? '是否从上次中断处继续？' : '请重新开始分析'
      })
  }
}

// 用户通知策略
async function notifyUser(options: {
  type: 'error' | 'warning' | 'info'
  title: string
  message: string
  action?: string
}): Promise<void> {
  // 使用Element Plus的ElNotification
  ElNotification({
    title: options.title,
    message: options.message,
    type: options.type,
    duration: 0  // 不自动关闭
  })
}
```

#### 错误处理

```typescript
enum AnalysisErrorType {
  NETWORK_ERROR = 'network',
  RATE_LIMIT = 'rate_limit',
  TOKEN_LIMIT = 'token_limit',
  INVALID_OUTPUT = 'invalid_output',
  USER_CANCEL = 'user_cancel',
  UNKNOWN = 'unknown'
}

interface AnalysisError {
  type: AnalysisErrorType
  stage: string
  message: string
  retryable: boolean
  recoveryHint?: string
}
```

错误恢复策略：
- 网络错误：重试3次，指数退避
- Rate limit：等待1分钟后重试
- Token超限：自动分割输入
- 输出格式错误：调整prompt重试
- 用户取消：保存进度

#### 并发控制

```typescript
class ConcurrencyController {
  constructor(maxConcurrent: number = 3)

  async add<T>(task: () => Promise<T>): Promise<T>
}
```

性能优化：
- 章节检测：跳过大部分内容，只发送章节候选位置
- 人物识别：并行处理多个章节块
- 世界观提取：只分析代表性章节
- 缓存LLM响应：相同输入不重复调用

## 文件组织

### 新增文件

```
src/utils/
├── llmAnalyzer.ts           # LLM分析主入口
├── llmChapterDetector.ts    # LLM章节检测
├── llmCharacterExtractor.ts # LLM人物提取
├── llmWorldExtractor.ts     # LLM世界观提取
├── llmOutlineGenerator.ts   # LLM大纲生成
├── llmTypes.ts              # LLM分析相关类型定义
├── textChunker.ts           # 文本分块工具
├── cacheManager.ts          # 结果缓存管理

src/components/
├── ChapterPreview.vue       # 章节预览组件
├── CharacterPreview.vue     # 人物预览组件
├── AnalysisProgress.vue     # 分析进度组件

src/stores/
└── analysisStore.ts         # 分析状态管理
```

### 修改文件

1. **novelImporter.ts**
   - 集成LLM分析流程
   - 添加模式选择参数
   - 移除旧的规则引擎调用

2. **NovelImportDialog.vue**
   - 添加模式选择UI
   - 添加实时进度显示
   - 重构预览界面
   - 添加修正功能

3. **types/index.ts**
   - 添加LLM分析相关类型

### 废弃文件

- 规则引擎的章节检测和人物识别逻辑将被LLM替代
- 保留文件用于参考，但不再使用

## 实施计划

### 阶段1：基础设施（3-4天）

**任务清单：**
- [ ] 创建类型定义文件（llmTypes.ts）
- [ ] 实现文本分块工具（textChunker.ts）
  - 智能段落边界检测
  - Token计数（支持多种tokenizer）
  - 重叠区域管理
- [ ] 实现缓存管理器（cacheManager.ts）
  - IndexedDB存储
  - 过期清理机制
  - 存储空间检查
- [ ] 实现LLM调用封装（llmCaller.ts）
  - 多提供商支持（Anthropic、OpenAI、本地模型）
  - 重试机制（网络错误、Rate limit）
  - 超时处理
  - Token计数和成本预估
- [ ] 实现JSON验证器（jsonValidator.ts）
  - JSON Schema定义
  - Ajv验证
  - 错误提示生成

**工作量估算：**
- 类型定义：0.5天
- 文本分块：1天
- 缓存管理：1天
- LLM调用：1天
- JSON验证：0.5天
- **总计：3-4天**

### 阶段2：LLM分析核心（4-5天）

**任务清单：**
- [ ] 实现章节检测模块（llmChapterDetector.ts）
  - Prompt模板编写和优化
  - 3轮对话流程
  - 快速/完整模式采样
  - 结果验证和修正
- [ ] 实现人物识别模块（llmCharacterExtractor.ts）
  - Prompt模板编写和优化
  - 2轮对话流程
  - 置信度计算
  - 后处理过滤
- [ ] 实现世界观提取模块（llmWorldExtractor.ts）
  - Prompt模板编写
  - 代表性章节选择
- [ ] 实现大纲生成模块（llmOutlineGenerator.ts）
  - Prompt模板编写
  - 章节内容摘要
- [ ] 实现主入口函数（llmAnalyzer.ts）
  - 协调各模块
  - 进度回调
  - 错误处理和恢复
  - 断点续传
- [ ] 添加并发控制和性能优化
  - ConcurrencyController实现
  - 并行处理章节
  - 结果合并

**工作量估算：**
- 章节检测：1.5天
- 人物识别：1.5天
- 世界观+大纲：1天
- 主入口+并发：1天
- **总计：4-5天**

### 阶段3：UI组件（2-3天）

**任务清单：**
- [ ] 实现分析进度组件（AnalysisProgress.vue）
  - 实时进度显示
  - 阶段状态展示
  - Token使用和成本显示
  - 取消分析按钮
- [ ] 实现章节预览组件（ChapterPreview.vue）
  - 章节列表表格
  - 编辑、删除、合并功能
  - 批量操作
  - 重新检测按钮
- [ ] 实现人物预览组件（CharacterPreview.vue）
  - 人物列表表格
  - 角色定位编辑
  - 删除误识别
  - 添加遗漏人物
  - 批量标记错误
- [ ] 重构导入对话框（NovelImportDialog.vue）
  - 模式选择UI
  - 成本预估显示
  - 实时进度集成
  - 预览界面重构

**工作量估算：**
- 进度组件：0.5天
- 章节预览：1天
- 人物预览：1天
- 对话框重构：0.5天
- **总计：2-3天**

### 阶段4：集成和修正功能（2-3天）

**任务清单：**
- [ ] 集成LLM分析到导入流程
  - novelImporter.ts重构
  - 移除旧规则引擎
  - 集成LLM分析流程
  - 模式选择参数传递
- [ ] 实现用户修正功能
  - 标记错误
  - 重新分析选中部分
  - 修正结果合并
- [ ] 实现断点续传
  - 缓存检查
  - 进度恢复
  - 用户确认提示
- [ ] 错误处理和用户通知
  - 各类错误提示
  - 恢复建议
  - 日志记录

**工作量估算：**
- 集成重构：1天
- 修正功能：1天
- 断点续传：0.5天
- 错误处理：0.5天
- **总计：2-3天**

### 阶段5：测试和优化（2-3天）

**任务清单：**
- [ ] 单元测试
  - LLM调用封装测试
  - 文本分块测试
  - JSON验证测试
  - Token计数测试
- [ ] 集成测试
  - 快速模式测试
  - 完整模式测试
  - 断点续传测试
  - 错误恢复测试
- [ ] 性能测试
  - 小文件测试（<100k字）
  - 中等文件测试（100k-500k字）
  - 大文件测试（>500k字）
  - 并发性能测试
- [ ] 边缘案例测试
  - 无章节标题的小说
  - 特殊章节格式
  - 多语言混合
  - 格式错误文件
- [ ] 用户体验优化
  - 错误提示优化
  - 进度反馈优化
  - 成本预估准确性

**工作量估算：**
- 单元测试：0.5天
- 集成测试：1天
- 性能测试：0.5天
- 边缘案例：0.5天
- UX优化：0.5天
- **总计：2-3天**

### 总体时间估算

**保守估算（理想情况）：**
- 基础设施：3天
- LLM核心：4天
- UI组件：2天
- 集成修正：2天
- 测试优化：2天
- **总计：13天**

**实际估算（包含迭代）：**
- 基础设施：3-4天（Prompt工程可能需要多次迭代）
- LLM核心：4-5天（多轮对话调试耗时）
- UI组件：2-3天（UI交互细节调整）
- 集成修正：2-3天（边缘情况处理）
- 测试优化：2-3天（真实小说测试）
- **总计：13-18天**

**风险缓冲：**
- Prompt工程可能需要额外2-3天迭代
- 不同LLM提供商的API差异处理：1-2天
- 边缘情况处理：1-2天
- **包含缓冲：16-23天（约3-4周）**

## 风险和缓解

### 风险1：LLM API成本过高

**缓解措施**：
- 提供快速模式，采样分析
- 显示实时成本预估
- 缓存结果避免重复调用
- 允许用户取消分析

### 风险2：LLM输出格式不稳定

**缓解措施**：
- 使用结构化prompt
- 多轮对话验证结果
- 后处理过滤异常值
- 允许用户手动修正

### 风险3：大文件处理超时

**缓解措施**：
- 智能分块避免token超限
- 断点续传支持中断恢复
- 显示进度让用户了解状态
- 并发处理提升速度

### 风险4：用户不满意LLM结果

**缓解措施**：
- 提供修正界面
- 支持重新分析特定部分
- 用户反馈改进prompt
- 允许手动编辑所有结果

## 成功标准

1. **章节检测准确率** > 95%
   - 测试10本不同格式的小说
   - 能够正确识别各种章节标题格式

2. **人物识别准确率** > 90%
   - 不误识别动词、代词为人物
   - 主要人物全部识别
   - 角色定位准确

3. **统计显示完整**
   - 正确显示总字数、章节数、平均字数
   - 实时显示分析进度和成本

4. **用户体验良好**
   - 快速模式完成时间 < 5分钟
   - 提供清晰的进度反馈
   - 修正功能易于使用

5. **成本可控**
   - 快速模式成本 < $10
   - 显示实时成本预估
   - 允许用户随时取消
