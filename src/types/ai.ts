/**
 * AI模型集成 - 类型定义
 * @module types/ai
 */

// ============================================================================
// 模型配置相关
// ============================================================================

/**
 * AI服务提供商
 */
export type AIProvider = 'openai' | 'anthropic' | 'local' | 'custom';

/**
 * 自定义Provider配置
 */
export interface CustomProviderConfig {
  /** Provider ID */
  id: string;
  /** Provider名称 */
  name: string;
  /** Provider类型 */
  providerType: string;
  /** API密钥 */
  apiKey?: string;
  /** 基础URL */
  baseURL?: string;
  /** 默认模型 */
  model: string;
  /** 最大token数 */
  maxTokens?: number;
  /** 温度参数 */
  temperature?: number;
  /** 是否支持流式 */
  supportsStreaming?: boolean;
  /** 额外配置 */
  [key: string]: any;
}

/**
 * 自定义Provider实例接口
 */
export interface CustomProviderInstance {
  /** 发送聊天请求 */
  chat(request: ChatRequest): Promise<ChatResponse>;
  /** 发送流式聊天请求 */
  chatStream?(request: ChatRequest): AsyncGenerator<string>;
  /** 验证配置 */
  validateConfig(): Promise<boolean>;
  /** 获取支持的模型列表 */
  getModels(): Promise<ModelConfig[]>;
  /** 估算成本 */
  estimateCost(request: ChatRequest): CostBreakdown;
}

/**
 * 模型层级
 */
export type ModelTier = 'planning' | 'writing' | 'checking';

/**
 * 模型配置
 */
export interface ModelConfig {
  /** 模型唯一标识 */
  id: string;
  /** 服务提供商 */
  provider: AIProvider;
  /** 模型名称 */
  model: string;
  /** 模型层级 */
  tier: ModelTier;
  /** 输入token价格 (USD/1K tokens) */
  costPerInputToken: number;
  /** 输出token价格 (USD/1K tokens) */
  costPerOutputToken: number;
  /** 最大token数 */
  maxTokens: number;
  /** 每分钟请求限制 */
  rpmLimit: number;
  /** 是否启用 */
  enabled: boolean;
}

/**
 * 模型配置集合
 */
export interface ModelsConfig {
  planning: ModelConfig[];
  writing: ModelConfig[];
  checking: ModelConfig[];
}

// ============================================================================
// 任务上下文相关
// ============================================================================

/**
 * 任务类型
 */
export type TaskType =
  | 'worldbuilding'        // 世界观构建
  | 'character'            // 人物设计
  | 'outline'              // 大纲生成
  | 'chapter'              // 章节生成
  | 'check'                // 一致性检查（哨兵模型）
  | 'state_extraction'     // 状态提取（档案员）
  | 'memory_update'         // 记忆表更新（表格管理员）
  | 'assistant';            // 通用助手对话

/**
 * 任务复杂度
 */
export type Complexity = 'high' | 'medium' | 'low';

/**
 * 任务优先级
 */
export type Priority = 'quality' | 'balanced' | 'speed';

/**
 * 任务上下文 - 用于模型路由决策
 */
export interface TaskContext {
  /** 任务类型 */
  type: TaskType;
  /** 复杂度 */
  complexity: Complexity;
  /** 优先级 */
  priority: Priority;
  /** Token预算限制 */
  tokenBudget?: number;
  /** 用户偏好模型 */
  preferredModel?: string;
  /** 额外参数 */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// 聊天消息相关
// ============================================================================

/**
 * 消息角色
 */
export type MessageRole = 'system' | 'user' | 'assistant';

/**
 * 聊天消息
 */
export interface ChatMessage {
  /** 消息角色 */
  role: MessageRole;
  /** 消息内容 */
  content: string;
  /** 消息名称（可选，用于多角色场景） */
  name?: string;
}

/**
 * 聊天请求
 */
export interface ChatRequest {
  /** 消息列表 */
  messages: ChatMessage[];
  /** 指定模型 */
  model?: string;
  /** 温度参数 (0-2) */
  temperature?: number;
  /** 最大输出token数 */
  maxTokens?: number;
  /** 停止序列 */
  stopSequences?: string[];
  /** 是否流式输出 */
  stream?: boolean;
  /** 额外参数 */
  metadata?: Record<string, unknown>;
  /** 结构化输出（JSON Schema） */
  response_format?: {
    type: 'json_schema' | 'json_object'
    json_schema?: { name: string; description?: string; strict?: boolean; schema?: Record<string, unknown>; [key: string]: unknown }
  };
  /** Tool calling schemas */
  tools?: Array<{ name: string; description?: string; strict?: boolean; parameters: Record<string, unknown> }>;
  /** Tool choice mode */
  toolChoice?: { type: 'auto' | 'function'; function?: { name: string } };
}

/**
 * Token使用统计
 */
export interface TokenUsage {
  /** 输入token数 */
  inputTokens: number;
  /** 输出token数 */
  outputTokens: number;
  /** 总token数 */
  totalTokens: number;
}

/**
 * 成本明细
 */
export interface CostBreakdown extends TokenUsage {
  /** 输入成本 (USD) */
  inputCostUSD: number;
  /** 输出成本 (USD) */
  outputCostUSD: number;
  /** 总成本 (USD) */
  totalUSD: number;
  /** 总成本 (CNY) */
  totalCNY: number;
  /** 使用的模型 */
  model: string;
}

/**
 * 聊天响应
 */
export interface ChatResponse {
  /** 响应内容 */
  content: string;
  /** 使用的模型 */
  model: string;
  /** Token使用统计 */
  usage: TokenUsage;
  /** 成本明细 */
  cost: CostBreakdown;
  /** 响应延迟 (ms) */
  latency: number;
  /** 完成原因 */
  finishReason: 'stop' | 'length' | 'content_filter' | 'error';
  /** 额外信息 */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// 生成参数相关
// ============================================================================

/**
 * 世界观生成参数
 */
export interface WorldBuildingParams {
  /** 小说类型 */
  genre: string;
  /** 核心主题 */
  theme?: string;
  /** 写作风格 */
  style?: string;
  /** 关键元素 */
  keyElements?: string[];
  /** 复杂度 */
  complexity: Complexity;
  /** 优先级 */
  priority: Priority;
  /** 额外要求 */
  requirements?: string;
}

/**
 * 人物生成参数
 */
export interface CharacterParams {
  /** 人物名称 */
  name: string;
  /** 人物定位 */
  role: 'protagonist' | 'antagonist' | 'supporting' | 'minor';
  /** 性格特点 */
  personality?: string;
  /** 世界观信息 */
  worldInfo: WorldBuilding;
  /** 复杂度 */
  complexity: Complexity;
  /** 优先级 */
  priority: Priority;
  /** 额外要求 */
  requirements?: string;
}

/**
 * 大纲生成参数
 */
export interface OutlineParams {
  /** 世界观信息 */
  worldInfo: WorldBuilding;
  /** 主要人物 */
  characters: AICharacter[];
  /** 小说长度 */
  totalChapters: number;
  /** 故事类型 */
  storyType?: string;
  /** 复杂度 */
  complexity: Complexity;
  /** 优先级 */
  priority: Priority;
}

/**
 * 章节生成参数
 */
export interface ChapterParams {
  /** 章节号 */
  chapterNumber: number;
  /** 章节标题 */
  chapterTitle: string;
  /** 本章大纲 */
  outline: string;
  /** 前文摘要 */
  previousContext?: string;
  /** 出场人物 */
  characters: AICharacter[];
  /** 世界观信息 */
  worldInfo: WorldBuilding;
  /** 写作风格配置 */
  style?: ChapterStyle;
  /** 优先级 */
  priority: Priority;
}

/**
 * 章节风格配置
 */
export interface ChapterStyle {
  /** 字数要求 */
  wordCount?: number;
  /** 场景描写风格 */
  sceneDescription?: 'detailed' | 'moderate' | 'concise';
  /** 对话风格 */
  dialogStyle?: 'natural' | 'formal' | 'casual';
  /** 节奏把控 */
  pacing?: 'slow' | 'moderate' | 'fast';
  /** 情感基调 */
  emotion?: string;
}

/**
 * 检查参数
 */
export interface CheckParams {
  /** 检查类型 */
  type: 'consistency' | 'quality' | 'grammar' | 'plot';
  /** 待检查内容 */
  content: string;
  /** 参考信息 */
  reference?: {
    worldInfo?: WorldBuilding;
    characters?: AICharacter[];
    previousContent?: string;
  };
}

// ============================================================================
// 生成结果相关
// ============================================================================

/**
 * 世界观设定
 */
export interface WorldBuilding {
  /** 世界名称 */
  name: string;
  /** 世界背景 */
  background: {
    history: string;
    geography: string;
    era: string;
  };
  /** 力量体系 */
  powerSystem: {
    source: string;
    levels: PowerLevel[];
    types: string[];
  };
  /** 社会结构 */
  society: {
    organizations: Organization[];
    hierarchy: string;
    economy: string;
  };
  /** 规则法则 */
  rules: {
    fundamentalLaws: string[];
    taboos: string[];
    costs: string[];
  };
  /** 特色元素 */
  specialElements: string[];
  /** 原始AI响应 */
  rawContent?: string;
  /** 生成元数据 */
  metadata?: GenerationMetadata;
}

/**
 * 能力等级
 */
export interface PowerLevel {
  name: string;
  description: string;
  abilities: string[];
}

/**
 * 组织势力
 */
export interface Organization {
  name: string;
  type: string;
  description: string;
  influence: string;
}

/**
 * 人物设定
 */
export interface AICharacter {
  /** 人物名称 */
  name: string;
  /** 基本信息 */
  basicInfo: {
    age: number | string;
    gender: string;
    appearance: string;
    identity: string;
    status: string;
  };
  /** 性格特征 */
  personality: {
    traits: string[];
    speakingStyle: string;
    behaviors: string[];
    weaknesses: string[];
    fears: string[];
  };
  /** 能力设定 */
  abilities: {
    level: string;
    mainAbilities: string[];
    potential: string;
  };
  /** 关系网络 */
  relationships: {
    family?: string;
    mentor?: string;
    friends: string[];
    enemies: string[];
    romantic?: string;
  };
  /** 成长弧线 */
  growthArc: {
    initialState: string;
    turningPoint: string;
    goal: string;
  };
  /** 人物魅力点 */
  charm: {
    uniqueness: string;
    relatability: string;
    memorable: string;
  };
  /** 角色定位 */
  role: 'protagonist' | 'antagonist' | 'supporting' | 'minor';
  /** 原始AI响应 */
  rawContent?: string;
  /** 生成元数据 */
  metadata?: GenerationMetadata;
}

/**
 * 大纲章节
 */
export interface OutlineChapter {
  /** 章节号 */
  number: number;
  /** 章节标题 */
  title: string;
  /** 章节摘要 */
  summary: string;
  /** 主要事件 */
  events: string[];
  /** 出场人物 */
  characters: string[];
  /** 场景设置 */
  scenes: string[];
  /** 伏笔/悬念 */
  foreshadowing?: string[];
  /** 情感基调 */
  emotion?: string;
}

/**
 * 大纲
 */
export interface AIOutline {
  /** 故事主线 */
  mainPlot: string;
  /** 主题 */
  themes: string[];
  /** 章节列表 */
  chapters: OutlineChapter[];
  /** 故事弧线 */
  storyArc: {
    setup: string;
    rising: string;
    climax: string;
    falling: string;
    resolution: string;
  };
  /** 伏笔设计 */
  foreshadowing: {
    item: string;
    plantedIn: number;
    revealedIn: number;
  }[];
  /** 原始AI响应 */
  rawContent?: string;
  /** 生成元数据 */
  metadata?: GenerationMetadata;
}

/**
 * 章节内容
 */
export interface ChapterContent {
  /** 章节号 */
  chapterNumber: number;
  /** 章节标题 */
  title: string;
  /** 段落列表 */
  paragraphs: string[];
  /** 完整内容 */
  content: string;
  /** 字数 */
  wordCount: number;
  /** 场景列表 */
  scenes: {
    start: number;
    end: number;
    location: string;
  }[];
  /** 生成元数据 */
  metadata?: GenerationMetadata;
}

/**
 * 检查结果
 */
export interface CheckResult {
  /** 检查类型 */
  type: 'consistency' | 'quality' | 'grammar' | 'plot';
  /** 是否通过 */
  passed: boolean;
  /** 问题列表 */
  issues: {
    severity: 'error' | 'warning' | 'suggestion';
    description: string;
    location?: string;
    suggestion?: string;
  }[];
  /** 总体评分 */
  score?: number;
  /** 详细说明 */
  details?: string;
  /** 检查元数据 */
  metadata: GenerationMetadata;
}

/**
 * 生成元数据
 */
export interface GenerationMetadata {
  /** 使用的模型 */
  model: string;
  /** 生成时间 */
  timestamp: Date;
  /** Token使用 */
  usage: TokenUsage;
  /** 成本 */
  cost: CostBreakdown;
  /** 响应延迟 */
  latency: number;
  /** 生成参数 */
  params?: Record<string, unknown>;
}

// ============================================================================
// 使用统计相关
// ============================================================================

/**
 * 使用统计
 */
export interface UsageStatistics {
  /** 时间范围 */
  period: {
    start: Date;
    end: Date;
  };
  /** 总调用次数 */
  totalCalls: number;
  /** 总token使用 */
  totalTokens: {
    input: number;
    output: number;
  };
  /** 总成本 */
  totalCost: {
    usd: number;
    cny: number;
  };
  /** 按模型统计 */
  byModel: {
    model: string;
    calls: number;
    tokens: TokenUsage;
    cost: CostBreakdown;
  }[];
  /** 按任务类型统计 */
  byTaskType: {
    type: TaskType;
    calls: number;
    tokens: TokenUsage;
    cost: CostBreakdown;
  }[];
}

/**
 * 项目成本预估
 */
export interface ProjectCostEstimate {
  /** 成本明细 */
  breakdown: TaskCost[];
  /** 总成本 (USD) */
  totalUSD: number;
  /** 总成本 (CNY) */
  totalCNY: number;
  /** 优化建议 */
  recommendations: string[];
}

/**
 * 任务成本
 */
export interface TaskCost {
  /** 任务类型 */
  type: TaskType;
  /** 任务数量 */
  count: number;
  /** 平均token数 */
  avgTokens: number;
  /** 使用模型 */
  model: string;
  /** 成本 (USD) */
  costUSD: number;
  /** 成本 (CNY) */
  costCNY: number;
}

// ============================================================================
// AI服务配置
// ============================================================================

/**
 * 预算配置
 */
export interface BudgetConfig {
  /** 单章预算上限 */
  chapterLimitUSD?: number;
  /** 日预算上限 */
  dailyLimitUSD?: number;
  /** 月预算上限 */
  monthlyLimitUSD?: number;
  /** 预算预警阈值 */
  alertThreshold?: number;
}

/**
 * 速率限制配置
 */
export interface RateLimitSettings {
  /** 每分钟请求数 */
  requestsPerMinute?: number;
  /** 每分钟Token数 */
  tokensPerMinute?: number;
  /** 最大并发请求数 */
  concurrentRequests?: number;
  /** 队列最大等待时长（毫秒），超时后直接失败以避免内存堆积 */
  queueTimeoutMs?: number;
}

/**
 * AI服务配置
 */
export interface AIServiceConfig {
  /** 提供商配置 */
  providers: {
    openai?: {
      apiKey: string;
      baseUrl?: string;
    };
    anthropic?: {
      apiKey: string;
      baseUrl?: string;
    };
    local?: {
      baseUrl: string;
      model?: string;
    };
    /** 自定义Provider配置 */
    custom?: Record<string, CustomProviderConfig>;
  };
  /** 预算配置 */
  budget?: BudgetConfig;
  /** 限流配置 */
  rateLimit?: {
    default?: RateLimitSettings;
    byProvider?: Partial<Record<AIProvider, RateLimitSettings>>;
    byModel?: Record<string, RateLimitSettings>;
  };
  /** 路由配置 */
  router?: {
    defaultPriority?: Priority;
    costOptimization?: boolean;
    preferredModels?: Partial<Record<TaskType, string>>;
  };
  /** 缓存配置 */
  cache?: {
    enabled?: boolean;
    ttl?: number;
  };
  /** 日志配置 */
  logging?: {
    enabled?: boolean;
    level?: 'debug' | 'info' | 'warn' | 'error';
  };
  /** 重试配置 */
  retry?: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
    /** 抖动比例（0-1），用于避免重试惊群 */
    jitterRatio?: number;
  };
}

/**
 * AI服务响应包装
 */
export interface AIServiceResponse<T> {
  /** 是否成功 */
  success: boolean;
  /** 响应数据 */
  data?: T;
  /** 错误信息 */
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  /** 元数据 */
  metadata: GenerationMetadata;
}

// ============================================================================
// 流式响应相关
// ============================================================================

/**
 * 流式响应事件
 */
export interface StreamEvent {
  /** 事件类型 */
  type: 'chunk' | 'done' | 'error';
  /** 内容块 (type=chunk时) */
  chunk?: string;
  /** 完整响应 (type=done时) */
  response?: ChatResponse;
  /** 错误信息 (type=error时) */
  error?: {
    code: string;
    message: string;
  };
}

/**
 * 流式响应回调
 */
export type StreamCallback = (event: StreamEvent) => void;
