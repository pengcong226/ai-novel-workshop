import type { ModelConfig, TaskContext } from '@/types/ai';
import { CircuitBreaker } from './CircuitBreaker';
import type { ModelRouter } from './ModelRouter';
import { getLogger } from '@/utils/logger';

const logger = getLogger('FailoverManager')

/**
 * 故障转移管理器
 * 封装高可用的大模型请求链路，结合熔断器实现多模型无缝切换
 */
export class FailoverManager {
  private breakers: Map<string, CircuitBreaker> = new Map();

  constructor(
    private modelRouter: ModelRouter,
    private config: { failureThreshold: number; resetTimeoutMs: number } = { failureThreshold: 3, resetTimeoutMs: 60000 }
  ) {}

  /**
   * 获取或初始化提供商的熔断器
   */
  getBreaker(providerId: string): CircuitBreaker {
    if (!this.breakers.has(providerId)) {
      this.breakers.set(providerId, new CircuitBreaker(providerId, this.config));
    }
    return this.breakers.get(providerId)!;
  }

  /**
   * 执行带有故障转移的高可用请求
   *
   * @param context 任务上下文 (决定模型偏好和优先级)
   * @param requestFn 发起请求的闭包函数
   * @param onSwitch 模型切换时的回调 (用于 UI 通知)
   */
  async executeWithFailover<T>(
    context: TaskContext,
    requestFn: (model: ModelConfig) => Promise<T>,
    onSwitch?: (fromModel: ModelConfig, toModel: ModelConfig) => void
  ): Promise<{ result: T; finalModel: ModelConfig }> {
    // 获取排序后的模型候选队列
    const candidates = this.modelRouter.getRankedCandidates(context);

    if (!candidates || candidates.length === 0) {
      throw new Error('没有可用的模型候选列表，请检查模型配置是否均已禁用。');
    }

    let lastError: Error | null = null;
    let initialModel = candidates[0];

    for (let i = 0; i < candidates.length; i++) {
      const model = candidates[i];
      const breaker = this.getBreaker(model.provider);

      // 1. 检查熔断状态
      if (!breaker.canRequest()) {
        logger.info(`${model.provider} 处于熔断状态，自动切换到备用模型...`);
        continue;
      }

      // 如果发生了模型切换，触发回调
      if (i > 0 && onSwitch) {
        onSwitch(initialModel, model);
        // 更新 initialModel 使得连续切换时能准确记录
        initialModel = model;
      }

      try {
        // 2. 发起请求
        const result = await requestFn(model);

        // 3. 成功则重置该提供商的熔断器
        breaker.onSuccess();
        return { result, finalModel: model };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // 4. 记录失败以驱动熔断器状态流转
        breaker.onFailure(error);

        logger.warn(`${model.provider} 请求失败 (${lastError.message})，准备切换下一顺位...`);
      }
    }

    // 当所有候选队列都尝试失败时，抛出错误
    throw new Error(`所有可用模型均已瘫痪，最后错误: ${lastError?.message}`);
  }
}
