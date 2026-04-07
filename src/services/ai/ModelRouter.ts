/**
 * AI模型路由器
 * @module services/ai/ModelRouter
 *
 * 负责根据任务类型、复杂度、优先级等因素智能选择最优模型
 */

import type {
  TaskContext,
  TaskType,
  ModelConfig,
  ModelTier,
  Priority
} from '../../types/ai';

/**
 * 默认模型配置
 */
const DEFAULT_MODELS: Record<ModelTier, ModelConfig[]> = {
  planning: [
    {
      id: 'gpt-4-turbo',
      provider: 'openai',
      model: 'gpt-4-turbo-preview',
      tier: 'planning',
      costPerInputToken: 0.01,
      costPerOutputToken: 0.03,
      maxTokens: 128000,
      rpmLimit: 500,
      enabled: true,
    },
    {
      id: 'claude-3.5-sonnet',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      tier: 'planning',
      costPerInputToken: 0.003,
      costPerOutputToken: 0.015,
      maxTokens: 200000,
      rpmLimit: 1000,
      enabled: true,
    },
  ],
  writing: [
    {
      id: 'gpt-3.5-turbo',
      provider: 'openai',
      model: 'gpt-3.5-turbo-0125',
      tier: 'writing',
      costPerInputToken: 0.0005,
      costPerOutputToken: 0.0015,
      maxTokens: 16385,
      rpmLimit: 3500,
      enabled: true,
    },
    {
      id: 'claude-3-haiku',
      provider: 'anthropic',
      model: 'claude-3-haiku-20240307',
      tier: 'writing',
      costPerInputToken: 0.00025,
      costPerOutputToken: 0.00125,
      maxTokens: 200000,
      rpmLimit: 4000,
      enabled: true,
    },
  ],
  checking: [
    {
      id: 'gpt-3.5-turbo',
      provider: 'openai',
      model: 'gpt-3.5-turbo-0125',
      tier: 'checking',
      costPerInputToken: 0.0005,
      costPerOutputToken: 0.0015,
      maxTokens: 16385,
      rpmLimit: 3500,
      enabled: true,
    },
  ],
};

/**
 * 任务类型到层级的映射
 */
const TASK_TIER_MAP: Record<TaskType, ModelTier> = {
  worldbuilding: 'planning',
  character: 'planning',
  outline: 'planning',
  chapter: 'writing',
  check: 'checking',
  state_extraction: 'checking',   // 档案员 — 用便宜模型即可
  memory_update: 'checking',      // 表格管理员 — 用便宜模型即可
};

/**
 * 使用追踪器接口
 */
interface UsageTracker {
  getQuotaAvailability(modelId: string): number;
  recordUsage(modelId: string, tokens: number): void;
}

/**
 * 模型路由器
 * 智能选择最优模型处理任务
 */
export class ModelRouter {
  private models: Map<string, ModelConfig>;
  private tierModels: Map<ModelTier, ModelConfig[]>;
  private usageTracker: UsageTracker;
  private preferredModels: Partial<Record<TaskType, string>>;

  constructor(
    usageTracker: UsageTracker,
    options: {
      models?: Partial<Record<ModelTier, ModelConfig[]>>;
      costOptimization?: boolean;
      preferredModels?: Partial<Record<TaskType, string>>;
    } = {}
  ) {
    this.models = new Map();
    this.tierModels = new Map();
    this.usageTracker = usageTracker;
    this.preferredModels = options.preferredModels ?? {};

    // 初始化模型配置
    this.initializeModels(options.models);
  }

  /**
   * 初始化模型配置
   */
  private initializeModels(
    customModels?: Partial<Record<ModelTier, ModelConfig[]>>
  ): void {
    const tiers: ModelTier[] = ['planning', 'writing', 'checking'];

    for (const tier of tiers) {
      const models = customModels?.[tier] ?? DEFAULT_MODELS[tier];
      this.tierModels.set(tier, models);

      for (const model of models) {
        this.models.set(model.id, model);
      }
    }
  }

  /**
   * 选择最优模型
   * @param context 任务上下文
   * @returns 最优模型配置
   */
  selectModel(context: TaskContext): ModelConfig {
    // 1. 检查用户偏好模型
    if (context.preferredModel && this.models.has(context.preferredModel)) {
      const model = this.models.get(context.preferredModel)!;
      if (model.enabled && this.checkQuota(model)) {
        return model;
      }
    }

    // 2. 检查全局偏好模型
    if (this.preferredModels[context.type]) {
      const model = this.models.get(this.preferredModels[context.type]!);
      if (model?.enabled && this.checkQuota(model)) {
        return model;
      }
    }

    // 3. 确定模型层级
    const tier = this.determineTier(context);

    // 4. 获取该层级的可用模型
    const candidates = this.getAvailableModels(tier);

    if (candidates.length === 0) {
      // 降级到下一层级
      return this.getFallbackModel(tier);
    }

    // 5. 根据优先级和成本优化选择最优模型
    return this.optimizeSelection(candidates, context);
  }

  /**
   * 确定任务层级
   */
  private determineTier(context: TaskContext): ModelTier {
    return TASK_TIER_MAP[context.type];
  }

  /**
   * 获取层级内可用模型
   */
  private getAvailableModels(tier: ModelTier): ModelConfig[] {
    const models = this.tierModels.get(tier) ?? [];
    return models.filter(model => model.enabled && this.checkQuota(model));
  }

  /**
   * 检查模型配额
   */
  private checkQuota(model: ModelConfig): boolean {
    const availability = this.usageTracker.getQuotaAvailability(model.id);
    return availability > 0.1; // 保留至少10%配额
  }

  /**
   * 最优模型选择
   */
  private optimizeSelection(
    candidates: ModelConfig[],
    context: TaskContext
  ): ModelConfig {
    // 计算每个模型的综合得分
    const scoredCandidates = candidates.map(model => ({
      model,
      score: this.calculateScore(model, context),
    }));

    // 按得分降序排序
    scoredCandidates.sort((a, b) => b.score - a.score);

    return scoredCandidates[0].model;
  }

  /**
   * 计算模型得分
   * 得分范围: 0-1，越高越好
   */
  private calculateScore(model: ModelConfig, context: TaskContext): number {
    // 质量得分 (层级决定)
    const qualityScore = this.getQualityScore(model.tier, context);

    // 成本得分 (越便宜越好)
    const costScore = this.getCostScore(model);

    // 速度得分 (根据RPM限制)
    const speedScore = this.getSpeedScore(model);

    // 配额可用性得分
    const quotaScore = this.usageTracker.getQuotaAvailability(model.id);

    // 根据优先级调整权重
    const weights = this.getWeights(context.priority);

    return (
      qualityScore * weights.quality +
      costScore * weights.cost +
      speedScore * weights.speed +
      quotaScore * weights.quota
    );
  }

  /**
   * 获取质量得分
   */
  private getQualityScore(tier: ModelTier, context: TaskContext): number {
    // 规划任务需要高质量模型
    if (context.type === 'worldbuilding' || context.type === 'character') {
      if (context.complexity === 'high') {
        return tier === 'planning' ? 1.0 : tier === 'writing' ? 0.6 : 0.3;
      }
      return tier === 'planning' ? 0.9 : tier === 'writing' ? 0.8 : 0.4;
    }

    // 写作任务需要中等质量
    if (context.type === 'chapter') {
      return tier === 'writing' ? 0.9 : tier === 'planning' ? 0.7 : 0.5;
    }

    // 检查任务质量要求较低
    if (context.type === 'check') {
      return tier === 'checking' ? 0.9 : 0.6;
    }

    return 0.7;
  }

  /**
   * 获取成本得分 (0-1, 越便宜得分越高)
   */
  private getCostScore(model: ModelConfig): number {
    // 本地模型免费，得分最高
    if (model.provider === 'local') {
      return 1.0;
    }

    // 计算相对成本
    const avgCost = 0.01; // 平均每1K token成本
    const modelCost = (model.costPerInputToken + model.costPerOutputToken) / 2;

    // 成本越低得分越高
    const score = 1 - Math.min(modelCost / avgCost, 1);
    return Math.max(score, 0.1); // 最低0.1分
  }

  /**
   * 获取速度得分 (0-1)
   */
  private getSpeedScore(model: ModelConfig): number {
    // RPM限制越高，速度越快
    const normalizedRpm = Math.log10(model.rpmLimit) / 5; // 归一化
    return Math.min(normalizedRpm, 1);
  }

  /**
   * 根据优先级获取权重
   */
  private getWeights(priority: Priority): {
    quality: number;
    cost: number;
    speed: number;
    quota: number;
  } {
    switch (priority) {
      case 'quality':
        return { quality: 0.5, cost: 0.15, speed: 0.15, quota: 0.2 };
      case 'speed':
        return { quality: 0.2, cost: 0.15, speed: 0.5, quota: 0.15 };
      case 'balanced':
      default:
        return { quality: 0.3, cost: 0.3, speed: 0.2, quota: 0.2 };
    }
  }

  /**
   * 获取降级模型
   */
  private getFallbackModel(tier: ModelTier): ModelConfig {
    // 如果当前层级没有可用模型，尝试降级
    const tierOrder: ModelTier[] = ['planning', 'writing', 'checking'];
    const currentIndex = tierOrder.indexOf(tier);

    // 尝试降级到更低成本的层级
    for (let i = currentIndex + 1; i < tierOrder.length; i++) {
      const models = this.tierModels.get(tierOrder[i]) ?? [];
      const available = models.find(m => m.enabled);
      if (available) {
        console.warn(
          `No available models in tier "${tier}", falling back to ${available.id}`
        );
        return available;
      }
    }

    // 如果所有层级都没有可用模型，返回默认模型
    const defaultModel = DEFAULT_MODELS.writing[0];
    console.error('No available models, using default fallback');
    return defaultModel;
  }

  /**
   * 获取模型配置
   */
  getModel(modelId: string): ModelConfig | undefined {
    return this.models.get(modelId);
  }

  /**
   * 获取所有可用模型
   */
  getAvailableModelsList(): ModelConfig[] {
    return Array.from(this.models.values()).filter(m => m.enabled);
  }

  /**
   * 更新模型配置
   */
  updateModelConfig(modelId: string, updates: Partial<ModelConfig>): boolean {
    const model = this.models.get(modelId);
    if (!model) {
      return false;
    }

    Object.assign(model, updates);
    return true;
  }

  /**
   * 启用/禁用模型
   */
  setModelEnabled(modelId: string, enabled: boolean): boolean {
    return this.updateModelConfig(modelId, { enabled });
  }
}

/**
 * 简单的使用追踪器实现
 */
export class SimpleUsageTracker implements UsageTracker {
  private usage: Map<string, { current: number; limit: number }> = new Map();

  constructor(models: ModelConfig[]) {
    for (const model of models) {
      this.usage.set(model.id, { current: 0, limit: model.rpmLimit });
    }
  }

  getQuotaAvailability(modelId: string): number {
    const usage = this.usage.get(modelId);
    if (!usage) return 0;
    return Math.max(0, 1 - usage.current / usage.limit);
  }

  recordUsage(modelId: string, _tokens: number): void {
    const usage = this.usage.get(modelId);
    if (usage) {
      usage.current += 1; // 简化：按调用次数计
    }
  }

  reset(): void {
    for (const usage of this.usage.values()) {
      usage.current = 0;
    }
  }
}
