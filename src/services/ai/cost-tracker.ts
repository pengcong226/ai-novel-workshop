/**
 * AI服务成本追踪器
 * @module services/ai/cost-tracker
 *
 * 提供AI调用成本的计算、记录、预算检查和使用统计功能
 */

import type {
  CostRecord,
  RemainingBudget,
  TokenUsage,
  CostBreakdown,
  ModelConfig,
} from './types';
import { USD_TO_CNY_RATE } from './types';
import type { TaskType, BudgetConfig, UsageStatistics, AIProvider } from '../../types/ai';
import { BudgetExceededError } from './errors';
import { getLogger } from '@/utils/logger';

const costTrackerLogger = getLogger('ai:service');

/**
 * 成本追踪器
 */
export class CostTracker {
  private records: CostRecord[] = [];
  private dailySpend: number = 0;
  private monthlySpend: number = 0;
  private lastDailyReset: Date = new Date();
  private lastMonthlyReset: Date = new Date();

  constructor(private budget?: BudgetConfig) {}

  setBudget(budget?: BudgetConfig): void {
    this.budget = budget;
  }

  private getNormalizedBudget(): Required<BudgetConfig> {
    return {
      chapterLimitUSD: this.budget?.chapterLimitUSD ?? 0,
      dailyLimitUSD: this.budget?.dailyLimitUSD ?? 0,
      monthlyLimitUSD: this.budget?.monthlyLimitUSD ?? 0,
      alertThreshold: this.budget?.alertThreshold ?? 0,
    };
  }

  private resetPeriodsIfNeeded(now: Date = new Date()): void {
    if (now.getDate() !== this.lastDailyReset.getDate() || now.getMonth() !== this.lastDailyReset.getMonth()) {
      this.dailySpend = 0;
      this.lastDailyReset = now;
    }

    if (now.getMonth() !== this.lastMonthlyReset.getMonth() || now.getFullYear() !== this.lastMonthlyReset.getFullYear()) {
      this.monthlySpend = 0;
      this.lastMonthlyReset = now;
    }
  }

  /**
   * 计算成本
   */
  calculateCost(
    inputTokens: number,
    outputTokens: number,
    model: ModelConfig
  ): CostBreakdown {
    const inputCostUSD = (inputTokens / 1000) * model.costPerInputToken;
    const outputCostUSD = (outputTokens / 1000) * model.costPerOutputToken;
    const totalUSD = inputCostUSD + outputCostUSD;

    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      inputCostUSD,
      outputCostUSD,
      totalUSD,
      totalCNY: totalUSD * USD_TO_CNY_RATE,
      model: model.id,
    };
  }

  /**
   * 记录成本
   */
  recordCost(record: CostRecord): void {
    this.records.push(record);
    // 防止 records 无限增长，超过 10000 条时保留最近 5000 条
    if (this.records.length > 10000) {
      this.records = this.records.slice(-5000);
    }
    this.updateSpend(record.cost.totalUSD);
    this.checkBudget();
  }

  /**
   * 更新支出
   */
  private updateSpend(amount: number): void {
    const now = new Date();
    this.resetPeriodsIfNeeded(now);
    this.dailySpend += amount;
    this.monthlySpend += amount;
  }

  /**
   * 检查预算
   */
  private checkBudget(): void {
    const budget = this.getNormalizedBudget();

    if (budget.dailyLimitUSD > 0 && this.dailySpend > budget.dailyLimitUSD) {
      throw new BudgetExceededError(this.dailySpend, budget.dailyLimitUSD, 'daily');
    }

    if (budget.monthlyLimitUSD > 0 && this.monthlySpend > budget.monthlyLimitUSD) {
      throw new BudgetExceededError(this.monthlySpend, budget.monthlyLimitUSD, 'monthly');
    }

    if (budget.alertThreshold > 0) {
      if (budget.dailyLimitUSD > 0) {
        const dailyRatio = this.dailySpend / budget.dailyLimitUSD;
        if (dailyRatio >= budget.alertThreshold) {
          costTrackerLogger.warn('Daily budget warning', {
            usedPercent: Number((dailyRatio * 100).toFixed(1)),
            spendUSD: this.dailySpend,
            limitUSD: budget.dailyLimitUSD
          });
        }
      }

      if (budget.monthlyLimitUSD > 0) {
        const monthlyRatio = this.monthlySpend / budget.monthlyLimitUSD;
        if (monthlyRatio >= budget.alertThreshold) {
          costTrackerLogger.warn('Monthly budget warning', {
            usedPercent: Number((monthlyRatio * 100).toFixed(1)),
            spendUSD: this.monthlySpend,
            limitUSD: budget.monthlyLimitUSD
          });
        }
      }
    }
  }

  /**
   * 获取使用统计
   */
  getStatistics(period?: { start: Date; end: Date }): UsageStatistics {
    let filteredRecords = this.records;

    if (period) {
      filteredRecords = this.records.filter(
        r => r.timestamp >= period.start && r.timestamp <= period.end
      );
    }

    const totalTokens = {
      input: 0,
      output: 0,
    };
    let totalCostUSD = 0;
    const byModel = new Map<string, { calls: number; tokens: TokenUsage; cost: CostBreakdown }>();
    const byTaskType = new Map<TaskType, { calls: number; tokens: TokenUsage; cost: CostBreakdown }>();

    for (const record of filteredRecords) {
      totalTokens.input += record.tokens.inputTokens;
      totalTokens.output += record.tokens.outputTokens;
      totalCostUSD += record.cost.totalUSD;

      const modelStats = byModel.get(record.model) || {
        calls: 0,
        tokens: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        cost: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          inputCostUSD: 0,
          outputCostUSD: 0,
          totalUSD: 0,
          totalCNY: 0,
          model: record.model,
        },
      };
      modelStats.calls++;
      modelStats.tokens.inputTokens += record.tokens.inputTokens;
      modelStats.tokens.outputTokens += record.tokens.outputTokens;
      modelStats.tokens.totalTokens += record.tokens.totalTokens;
      modelStats.cost.totalUSD += record.cost.totalUSD;
      byModel.set(record.model, modelStats);

      if (record.taskType) {
        const taskStats = byTaskType.get(record.taskType) || {
          calls: 0,
          tokens: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          cost: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            inputCostUSD: 0,
            outputCostUSD: 0,
            totalUSD: 0,
            totalCNY: 0,
            model: record.model,
          },
        };
        taskStats.calls++;
        taskStats.tokens.inputTokens += record.tokens.inputTokens;
        taskStats.tokens.outputTokens += record.tokens.outputTokens;
        taskStats.tokens.totalTokens += record.tokens.totalTokens;
        taskStats.cost.totalUSD += record.cost.totalUSD;
        byTaskType.set(record.taskType, taskStats);
      }
    }

    return {
      period: period || {
        start: this.lastMonthlyReset,
        end: new Date(),
      },
      totalCalls: filteredRecords.length,
      totalTokens,
      totalCost: {
        usd: totalCostUSD,
        cny: totalCostUSD * USD_TO_CNY_RATE,
      },
      byModel: Array.from(byModel.entries()).map(([model, stats]) => ({
        model,
        calls: stats.calls,
        tokens: stats.tokens,
        cost: stats.cost,
      })),
      byTaskType: Array.from(byTaskType.entries()).map(([type, stats]) => ({
        type,
        calls: stats.calls,
        tokens: stats.tokens,
        cost: stats.cost,
      })),
    };
  }

  getRemainingBudget(): RemainingBudget {
    this.resetPeriodsIfNeeded();
    const budget = this.getNormalizedBudget();

    return {
      chapterLimitUSD: budget.chapterLimitUSD,
      dailyRemainingUSD: budget.dailyLimitUSD > 0 ? Math.max(budget.dailyLimitUSD - this.dailySpend, 0) : Number.POSITIVE_INFINITY,
      monthlyRemainingUSD: budget.monthlyLimitUSD > 0 ? Math.max(budget.monthlyLimitUSD - this.monthlySpend, 0) : Number.POSITIVE_INFINITY,
    };
  }

  /**
   * 检查是否超过预算
   */
  isOverBudget(projectedCostUSD: number = 0): { chapter: boolean; daily: boolean; monthly: boolean } {
    this.resetPeriodsIfNeeded();
    const budget = this.getNormalizedBudget();

    return {
      chapter: budget.chapterLimitUSD > 0 && projectedCostUSD > budget.chapterLimitUSD,
      daily: budget.dailyLimitUSD > 0 && this.dailySpend + projectedCostUSD > budget.dailyLimitUSD,
      monthly: budget.monthlyLimitUSD > 0 && this.monthlySpend + projectedCostUSD > budget.monthlyLimitUSD,
    };
  }
}
