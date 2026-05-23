# AI小说工坊 - AI模型集成设计文档

## 一、分层模型策略架构

### 1.1 三层模型体系

```
┌─────────────────────────────────────────────────────────────┐
│                     模型路由器 (ModelRouter)                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  第一层      │  │  第二层      │  │  第三层      │       │
│  │  规划模型    │  │  写作模型    │  │  检查模型    │       │
│  │              │  │              │  │              │       │
│  │ GPT-4        │  │ GPT-3.5      │  │ 本地模型    │       │
│  │ Claude-3.5   │  │ Claude-Haiku │  │ 快速API     │       │
│  │              │  │              │  │              │       │
│  │ 高智商高成本 │  │ 性价比优先   │  │ 低成本快速  │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 各层职责划分

| 层级 | 任务类型 | 推荐模型 | 特点 | 成本估算 |
|------|---------|---------|------|---------|
| **规划层** | 世界观构建、人物设计、大纲生成 | GPT-4, Claude-3.5-Sonnet | 高推理能力、创意性强 | $0.03-0.06/1K tokens |
| **写作层** | 章节内容生成、场景描写 | GPT-3.5-Turbo, Claude-3-Haiku | 流畅输出、性价比高 | $0.001-0.003/1K tokens |
| **检查层** | 一致性检查、质量检查 | Llama-3-8B, Gemini-Flash | 快速响应、低成本 | $0.0001-0.001/1K tokens |

---

## 二、模型路由器设计

### 2.1 路由决策逻辑

```typescript
// src/services/ai/ModelRouter.ts

interface TaskContext {
  type: 'worldbuilding' | 'character' | 'outline' | 'chapter' | 'check';
  complexity: 'high' | 'medium' | 'low';
  priority: 'quality' | 'balanced' | 'speed';
  tokenBudget?: number;
}

interface ModelConfig {
  id: string;
  provider: 'openai' | 'anthropic' | 'local';
  model: string;
  tier: 'planning' | 'writing' | 'checking';
  costPerInputToken: number;
  costPerOutputToken: number;
  maxTokens: number;
  rpmLimit: number;
}

class ModelRouter {
  private models: Map<string, ModelConfig>;
  private usageTracker: UsageTracker;

  /**
   * 智能选择最优模型
   */
  selectModel(context: TaskContext): ModelConfig {
    // 1. 根据任务类型确定层级
    const tier = this.determineTier(context);

    // 2. 根据优先级选择具体模型
    const candidates = this.getTierModels(tier);

    // 3. 考虑成本、速度、配额
    return this.optimizeSelection(candidates, context);
  }

  private determineTier(context: TaskContext): string {
    const tierMap = {
      'worldbuilding': 'planning',
      'character': 'planning',
      'outline': 'planning',
      'chapter': 'writing',
      'check': 'checking'
    };
    return tierMap[context.type];
  }

  private optimizeSelection(models: ModelConfig[], ctx: TaskContext): ModelConfig {
    return models.reduce((best, model) => {
      const score = this.calculateScore(model, ctx);
      return score > best.score ? { ...model, score } : best;
    });
  }

  private calculateScore(model: ModelConfig, ctx: TaskContext): number {
    // 评分因子：成本、速度、质量、配额可用性
    const costScore = 1 - (model.costPerInputToken * 1000);
    const speedScore = model.tier === 'checking' ? 1 : 0.7;
    const qualityScore = model.tier === 'planning' ? 1 : 0.8;
    const quotaScore = this.usageTracker.getQuotaAvailability(model.id);

    return costScore * 0.3 + speedScore * 0.2 + qualityScore * 0.3 + quotaScore * 0.2;
  }
}
```

### 2.2 路由策略矩阵

```
任务类型 ──────────────────────────────────────────────
           │
           ▼
┌──────────────────────────────────────────────────────┐
│  世界观/人物/大纲  │    章节生成     │   一致性检查    │
│                   │                  │                │
│  复杂度判断        │    长度判断      │   检查类型      │
│  ├─ 高: GPT-4     │    ├─ 长: 3.5    │   ├─ 快速: 本地 │
│  └─ 中: Claude-3.5│    └─ 短: Haiku  │   └─ 深度: API  │
└──────────────────────────────────────────────────────┘
```

---

## 三、OpenAI兼容接口设计

### 3.1 统一API适配器

```typescript
// src/services/ai/AIAdapter.ts

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

interface ChatResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  cost: number;
  latency: number;
}

abstract class AIAdapter {
  abstract chat(request: ChatRequest): Promise<ChatResponse>;
  abstract stream(request: ChatRequest): AsyncIterator<string>;
  abstract countTokens(text: string): number;
  abstract estimateCost(tokens: number, model: string): number;
}

// OpenAI 适配器
class OpenAIAdapter extends AIAdapter {
  private client: OpenAI;

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const start = Date.now();
    const response = await this.client.chat.completions.create({
      model: request.model || 'gpt-4',
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens,
    });

    return {
      content: response.choices[0].message.content,
      model: response.model,
      usage: {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      },
      cost: this.estimateCost(response.usage.total_tokens, response.model),
      latency: Date.now() - start,
    };
  }

  async *stream(request: ChatRequest): AsyncIterator<string> {
    const stream = await this.client.chat.completions.create({
      model: request.model || 'gpt-4',
      messages: request.messages,
      stream: true,
    });

    for await (const chunk of stream) {
      yield chunk.choices[0]?.delta?.content || '';
    }
  }
}

// Anthropic 适配器 (OpenAI兼容格式)
class AnthropicAdapter extends AIAdapter {
  private client: Anthropic;

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const start = Date.now();
    const response = await this.client.messages.create({
      model: request.model || 'claude-3-5-sonnet-20241022',
      messages: this.convertMessages(request.messages),
      max_tokens: request.maxTokens || 4096,
    });

    return {
      content: response.content[0].text,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      cost: this.estimateCost(
        response.usage.input_tokens + response.usage.output_tokens,
        response.model
      ),
      latency: Date.now() - start,
    };
  }
}

// 本地模型适配器 (Ollama/OpenAI兼容)
class LocalModelAdapter extends AIAdapter {
  private baseUrl: string;

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model || 'llama3',
        messages: request.messages,
        stream: false,
      }),
    });

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      model: data.model,
      usage: data.usage,
      cost: 0, // 本地模型免费
      latency: 0,
    };
  }
}
```

### 3.2 统一服务接口

```typescript
// src/services/ai/AIService.ts

class AIService {
  private router: ModelRouter;
  private adapters: Map<string, AIAdapter>;
  private templateManager: TemplateManager;
  private responseParser: ResponseParser;

  /**
   * 生成世界观
   */
  async generateWorldBuilding(params: WorldBuildingParams): Promise<WorldBuilding> {
    const model = this.router.selectModel({
      type: 'worldbuilding',
      complexity: params.complexity,
      priority: params.priority,
    });

    const prompt = await this.templateManager.render('worldbuilding', params);
    const response = await this.adapters.get(model.provider).chat({
      messages: [
        { role: 'system', content: WORLD_BUILDING_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      model: model.model,
    });

    return this.responseParser.parseWorldBuilding(response.content);
  }

  /**
   * 生成章节
   */
  async generateChapter(params: ChapterParams): Promise<ChapterContent> {
    const model = this.router.selectModel({
      type: 'chapter',
      complexity: 'medium',
      priority: params.priority,
    });

    const prompt = await this.templateManager.render('chapter', params);
    const adapter = this.adapters.get(model.provider);

    // 流式生成
    const chunks: string[] = [];
    for await (const chunk of adapter.stream({
      messages: [
        { role: 'system', content: CHAPTER_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      model: model.model,
    })) {
      chunks.push(chunk);
      // 实时显示进度
      this.emit('chunk', chunk);
    }

    return {
      content: chunks.join(''),
      model: model.model,
    };
  }
}
```

---

## 四、提示词模板系统

### 4.1 模板管理器设计

```typescript
// src/services/ai/TemplateManager.ts

interface Template {
  id: string;
  name: string;
  category: 'worldbuilding' | 'character' | 'outline' | 'chapter' | 'check';
  version: string;
  variables: TemplateVariable[];
  content: string;
  examples?: TemplateExample[];
}

interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'array' | 'object';
  required: boolean;
  default?: any;
  description: string;
}

class TemplateManager {
  private templates: Map<string, Template>;
  private customTemplates: Map<string, Template>;

  /**
   * 渲染模板
   */
  async render(templateId: string, params: Record<string, any>): Promise<string> {
    const template = this.getTemplate(templateId);

    // 验证必需参数
    this.validateParams(template, params);

    // 渲染模板
    let content = template.content;
    for (const [key, value] of Object.entries(params)) {
      content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), this.stringify(value));
    }

    // 注入示例 (Few-shot)
    if (template.examples?.length > 0) {
      content = this.injectExamples(content, template.examples);
    }

    return content;
  }

  /**
   * 创建自定义模板
   */
  async createCustomTemplate(template: Template): Promise<void> {
    await this.validateTemplate(template);
    this.customTemplates.set(template.id, template);
    await this.saveTemplate(template);
  }
}
```

### 4.2 核心提示词模板

```yaml
# templates/worldbuilding.yaml

id: worldbuilding
name: 世界观构建
category: worldbuilding
version: 1.0.0

variables:
  - name: genre
    type: string
    required: true
    description: 小说类型（玄幻、科幻、都市等）

  - name: theme
    type: string
    required: false
    default: ""
    description: 核心主题

  - name: style
    type: string
    required: false
    default: "中国传统仙侠风格"
    description: 写作风格

  - name: keyElements
    type: array
    required: false
    default: []
    description: 关键元素（魔法体系、科技水平等）

content: |
  请为以下小说创建详细的世界观设定：

  【小说类型】{{genre}}
  {{#if theme}}【核心主题】{{theme}}{{/if}}
  【写作风格】{{style}}

  请从以下维度构建世界观：

  1. **世界背景**
     - 历史脉络：世界起源、重大事件、当前时代
     - 地理环境：主要区域、特殊地点、世界边界

  2. **力量体系**
     - 能量来源：力量如何产生、如何修炼/获取
     - 等级划分：从低到高的境界/等级体系
     - 能力类型：不同类型的能力及其特点

  3. **社会结构**
     - 组织势力：主要门派/组织/势力
     - 等级制度：社会阶层、权力结构
     - 经济体系：货币、交易、资源分配

  4. **规则法则**
     - 核心规则：世界的根本法则
     - 禁忌限制：不可触碰的禁忌
     - 代价机制：获得力量需要付出的代价

  5. **特色元素**
     {{#each keyElements}}
     - {{this}}
     {{/each}}

  请确保世界观具有：
  - 内在一致性：所有设定相互呼应、不矛盾
  - 扩展潜力：留有足够的创作空间
  - 戏剧张力：蕴含冲突和矛盾的可能

examples:
  - input:
      genre: "玄幻修仙"
      style: "中国传统仙侠风格"
    output: |
      # 世界观设定：苍穹界

      ## 世界背景
      **历史脉络**：苍穹界由上古神魔大战后的碎片凝聚而成，历经三次天地大劫...

---

# templates/character.yaml

id: character
name: 人物设计
category: character
version: 1.0.0

variables:
  - name: name
    type: string
    required: true
    description: 人物名称

  - name: role
    type: string
    required: true
    description: 人物定位（主角、反派、配角等）

  - name: worldInfo
    type: object
    required: true
    description: 世界观信息

  - name: personality
    type: string
    required: false
    description: 性格特点

content: |
  请设计一个小说人物：

  【姓名】{{name}}
  【定位】{{role}}
  {{#if personality}}【性格特点】{{personality}}{{/if}}

  【世界观背景】
  {{json worldInfo}}

  请创建详细的人物档案：

  1. **基本信息**
     - 年龄、性别、外貌描述
     - 身份背景、社会地位

  2. **性格特征**
     - 核心性格（3-5个关键词）
     - 说话风格、行为习惯
     - 弱点和恐惧

  3. **能力设定**
     - 当前实力等级
     - 主要能力/技能
     - 潜力方向

  4. **关系网络**
     - 家庭/师承
     - 朋友/敌人
     - 情感纠葛

  5. **成长弧线**
     - 初始状态
     - 转折事件
     - 目标/追求

  6. **人物魅力点**
     - 独特之处
     - 读者代入点
     - 记忆点

---

# templates/chapter.yaml

id: chapter
name: 章节生成
category: chapter
version: 1.0.0

variables:
  - name: chapterNumber
    type: number
    required: true

  - name: chapterTitle
    type: string
    required: true

  - name: outline
    type: string
    required: true
    description: 本章大纲

  - name: previousContext
    type: string
    required: false
    description: 前文摘要

  - name: characters
    type: array
    required: true
    description: 出场人物

  - name: worldInfo
    type: object
    required: true

  - name: style
    type: object
    required: false
    default: {}
    description: 写作风格配置

content: |
  请撰写小说第{{chapterNumber}}章：{{chapterTitle}}

  【本章大纲】
  {{outline}}

  {{#if previousContext}}
  【前文提要】
  {{previousContext}}
  {{/if}}

  【出场人物】
  {{#each characters}}
  - {{this.name}}：{{this.role}} - {{this.brief}}
  {{/each}}

  【世界观参考】
  {{json worldInfo}}

  【写作要求】
  - 字数要求：{{style.wordCount}}字左右
  - 场景描写：{{style.sceneDescription}}
  - 对话风格：{{style.dialogStyle}}
  - 节奏把控：{{style.pacing}}
  - 情感基调：{{style.emotion}}

  请按照大纲创作本章内容，注意：
  1. 与前文保持连贯
  2. 人物行为符合性格设定
  3. 场景描写生动具体
  4. 对话自然流畅
  5. 设置适当的悬念和冲突
  6. 章节结尾要有吸引力

  直接输出章节正文内容，不要添加额外的说明或标记。
```

---

## 五、响应解析器设计

### 5.1 结构化解析器

```typescript
// src/services/ai/ResponseParser.ts

class ResponseParser {
  /**
   * 解析世界观响应
   */
  parseWorldBuilding(content: string): WorldBuilding {
    // 尝试JSON解析
    if (this.isJSON(content)) {
      return JSON.parse(content);
    }

    // Markdown结构解析
    return this.parseMarkdown(content, {
      sections: ['世界背景', '力量体系', '社会结构', '规则法则', '特色元素'],
      parseMode: 'structured',
    });
  }

  /**
   * 解析人物响应
   */
  parseCharacter(content: string): Character {
    const sections = this.extractSections(content);

    return {
      basicInfo: this.parseBasicInfo(sections['基本信息']),
      personality: this.parsePersonality(sections['性格特征']),
      abilities: this.parseAbilities(sections['能力设定']),
      relationships: this.parseRelationships(sections['关系网络']),
      growthArc: this.parseGrowthArc(sections['成长弧线']),
      charm: this.parseCharm(sections['人物魅力点']),
    };
  }

  /**
   * 解析章节内容
   */
  parseChapter(content: string): ChapterContent {
    // 清理可能的标记
    content = content
      .replace(/^```.*\n/, '')
      .replace(/\n```$/, '')
      .replace(/^#+\s*第\d+章.*\n/, '');

    // 分段处理
    const paragraphs = content
      .split(/\n\n+/)
      .filter(p => p.trim())
      .map(p => p.trim());

    return {
      paragraphs,
      wordCount: this.countWords(content),
      scenes: this.detectScenes(content),
    };
  }

  /**
   * Markdown结构提取
   */
  private extractSections(content: string): Record<string, string> {
    const sections: Record<string, string> = {};
    const lines = content.split('\n');

    let currentSection = '';
    let currentContent: string[] = [];

    for (const line of lines) {
      const match = line.match(/^#+\s*(.+)$/);
      if (match) {
        if (currentSection) {
          sections[currentSection] = currentContent.join('\n').trim();
        }
        currentSection = match[1];
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }

    if (currentSection) {
      sections[currentSection] = currentContent.join('\n').trim();
    }

    return sections;
  }
}
```

### 5.2 结构化输出指令

```typescript
// 确保AI输出结构化数据的系统提示词

const STRUCTURED_OUTPUT_INSTRUCTION = `
你的输出将被程序解析，请严格遵守以下格式要求：

1. 使用Markdown标题划分章节
2. 每个章节使用二级标题(##)
3. 小节使用三级标题(###)
4. 列表使用 - 符号
5. 重要概念使用 **粗体**

示例格式：
## 章节标题

### 小节标题

- 项目1
- 项目2
  - 子项目

**重要概念**：说明内容

请确保：
- 标题层级清晰
- 格式统一规范
- 不要使用特殊符号或表情
`;
```

---

## 六、成本计算与显示

### 6.1 成本计算器

```typescript
// src/services/ai/CostCalculator.ts

interface ModelPricing {
  input: number;  // 每1K tokens价格(USD)
  output: number; // 每1K tokens价格(USD)
}

const PRICING: Record<string, ModelPricing> = {
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-3.5-turbo': { input: 0.0015, output: 0.002 },
  'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
  'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
  'local': { input: 0, output: 0 },
};

class CostCalculator {
  private exchangeRate: number = 7.2; // USD to CNY

  /**
   * 计算单次调用成本
   */
  calculate(model: string, inputTokens: number, outputTokens: number): CostBreakdown {
    const pricing = PRICING[model] || PRICING['gpt-3.5-turbo'];

    const inputCost = (inputTokens / 1000) * pricing.input;
    const outputCost = (outputTokens / 1000) * pricing.output;
    const totalUSD = inputCost + outputCost;
    const totalCNY = totalUSD * this.exchangeRate;

    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      inputCostUSD: inputCost,
      outputCostUSD: outputCost,
      totalUSD,
      totalCNY,
      model,
    };
  }

  /**
   * 估算项目总成本
   */
  estimateProjectCost(project: ProjectSpec): ProjectCostEstimate {
    const tasks = [
      { type: 'worldbuilding', count: 1, avgTokens: 5000 },
      { type: 'character', count: project.characterCount, avgTokens: 2000 },
      { type: 'outline', count: 1, avgTokens: 10000 },
      { type: 'chapter', count: project.chapterCount, avgTokens: 8000 },
      { type: 'check', count: project.chapterCount, avgTokens: 3000 },
    ];

    let totalCost = 0;
    const breakdown: TaskCost[] = [];

    for (const task of tasks) {
      const model = this.selectModelForTask(task.type);
      const pricing = PRICING[model];

      const cost = task.count * (task.avgTokens / 1000) * (pricing.input + pricing.output * 0.5);
      totalCost += cost;

      breakdown.push({
        type: task.type,
        count: task.count,
        avgTokens: task.avgTokens,
        model,
        costUSD: cost,
        costCNY: cost * this.exchangeRate,
      });
    }

    return {
      breakdown,
      totalUSD: totalCost,
      totalCNY: totalCost * this.exchangeRate,
      recommendations: this.generateCostOptimizations(breakdown),
    };
  }

  /**
   * 生成成本优化建议
   */
  private generateCostOptimizations(breakdown: TaskCost[]): string[] {
    const recommendations: string[] = [];

    // 分析哪些任务可以降级模型
    const expensiveTasks = breakdown.filter(t => t.costUSD > 0.5);
    for (const task of expensiveTasks) {
      if (task.type === 'chapter') {
        recommendations.push(`考虑使用更经济的写作模型（如Claude Haiku）生成章节，可节省约70%成本`);
      }
    }

    // 检查模型使用情况
    const gpt4Usage = breakdown.filter(t => t.model === 'gpt-4');
    if (gpt4Usage.length > 2) {
      recommendations.push(`部分规划任务可改用Claude-3.5-Sonnet，在保持质量的同时降低成本`);
    }

    return recommendations;
  }
}
```

### 6.2 成本显示组件

```typescript
// src/components/CostDisplay.tsx

interface CostDisplayProps {
  cost: CostBreakdown;
  showDetails?: boolean;
}

function CostDisplay({ cost, showDetails = false }: CostDisplayProps) {
  return (
    <div className="cost-display">
      <div className="cost-header">
        <span className="cost-label">本次消耗</span>
        <span className="cost-value">
          ¥{cost.totalCNY.toFixed(4)}
          <span className="cost-usd">(${cost.totalUSD.toFixed(4)})</span>
        </span>
      </div>

      {showDetails && (
        <div className="cost-details">
          <div className="cost-row">
            <span>模型</span>
            <span>{cost.model}</span>
          </div>
          <div className="cost-row">
            <span>输入</span>
            <span>{cost.inputTokens} tokens</span>
          </div>
          <div className="cost-row">
            <span>输出</span>
            <span>{cost.outputTokens} tokens</span>
          </div>
          <div className="cost-row">
            <span>总计</span>
            <span>{cost.totalTokens} tokens</span>
          </div>
        </div>
      )}
    </div>
  );
}

// 项目成本估算显示
function ProjectCostEstimate({ estimate }: { estimate: ProjectCostEstimate }) {
  return (
    <div className="project-cost-estimate">
      <h3>项目成本预估</h3>

      <table>
        <thead>
          <tr>
            <th>任务类型</th>
            <th>数量</th>
            <th>模型</th>
            <th>预估成本</th>
          </tr>
        </thead>
        <tbody>
          {estimate.breakdown.map((item, i) => (
            <tr key={i}>
              <td>{item.type}</td>
              <td>{item.count}</td>
              <td>{item.model}</td>
              <td>¥{item.costCNY.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>总计</td>
            <td>¥{estimate.totalCNY.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      {estimate.recommendations.length > 0 && (
        <div className="recommendations">
          <h4>成本优化建议</h4>
          <ul>
            {estimate.recommendations.map((rec, i) => (
              <li key={i}>{rec}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

---

## 七、完整服务集成示例

### 7.1 使用示例

```typescript
// 创建AI服务实例
const aiService = new AIService({
  providers: {
    openai: { apiKey: process.env.OPENAI_API_KEY },
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
    local: { baseUrl: 'http://localhost:11434' },
  },
  router: {
    defaultPriority: 'balanced',
    costOptimization: true,
  },
});

// 生成世界观
const worldBuilding = await aiService.generateWorldBuilding({
  genre: '玄幻修仙',
  style: '中国传统仙侠风格',
  theme: '逆天改命',
  complexity: 'high',
  priority: 'quality',
});

// 显示成本
console.log(`世界观生成完成，消耗：¥${worldBuilding.cost.totalCNY.toFixed(4)}`);

// 生成章节（流式）
const chapterStream = await aiService.streamChapter({
  chapterNumber: 1,
  chapterTitle: '天才陨落',
  outline: '...',
  characters: [mainCharacter],
  worldInfo: worldBuilding,
});

for await (const chunk of chapterStream) {
  process.stdout.write(chunk);
}
```

### 7.2 API接口设计

```typescript
// API路由设计

// POST /api/ai/generate/worldbuilding
router.post('/generate/worldbuilding', async (req, res) => {
  const result = await aiService.generateWorldBuilding(req.body);
  res.json({
    success: true,
    data: result.data,
    cost: result.cost,
    model: result.model,
  });
});

// POST /api/ai/generate/chapter
router.post('/generate/chapter', async (req, res) => {
  // 流式响应
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');

  const stream = await aiService.streamChapter(req.body);
  for await (const chunk of stream) {
    res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.end();
});

// POST /api/ai/estimate
router.post('/estimate', async (req, res) => {
  const estimate = costCalculator.estimateProjectCost(req.body);
  res.json(estimate);
});

// GET /api/ai/usage
router.get('/usage', async (req, res) => {
  const usage = await usageTracker.getUsage(req.query.userId);
  res.json(usage);
});
```

---

## 八、最佳实践建议

### 8.1 模型选择策略

| 场景 | 推荐模型 | 理由 |
|------|---------|------|
| 世界观/人物 | Claude-3.5-Sonnet | 创意性强、逻辑连贯 |
| 详细大纲 | GPT-4-Turbo | 结构化能力强 |
| 章节生成 | Claude-3-Haiku | 性价比高、速度快 |
| 快速检查 | Llama-3-8B本地 | 免费、私密 |

### 8.2 成本控制策略

1. **批量处理**：合并小任务减少API调用
2. **缓存复用**：相同提示词缓存结果
3. **模型降级**：非核心任务用便宜模型
4. **本地优先**：检查类任务用本地模型
5. **Token优化**：精简提示词、控制输出长度

### 8.3 质量保障策略

1. **提示词工程**：持续优化模板
2. **Few-shot学习**：提供优质示例
3. **多轮迭代**：允许用户调整反馈
4. **一致性检查**：用检查层验证输出
5. **人工审核**：关键内容人工确认

---

## 九、下一步实现计划

1. **第一阶段**：核心服务
   - [ ] 实现ModelRouter
   - [ ] 实现OpenAIAdapter和AnthropicAdapter
   - [ ] 实现基础提示词模板

2. **第二阶段**：模板系统
   - [ ] 实现TemplateManager
   - [ ] 创建核心模板文件
   - [ ] 实现模板编辑器

3. **第三阶段**：解析与成本
   - [ ] 实现ResponseParser
   - [ ] 实现CostCalculator
   - [ ] 实现成本显示组件

4. **第四阶段**：集成测试
   - [ ] 端到端测试
   - [ ] 性能优化
   - [ ] 用户体验优化

---

**文档版本**: v1.0
**创建日期**: 2026-03-20
**作者**: AI集成专家
