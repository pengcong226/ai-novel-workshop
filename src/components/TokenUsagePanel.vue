<template>
  <div class="token-usage-panel">
    <el-card class="header-card">
      <div class="header">
        <div>
          <h2>Token 用量</h2>
          <p>按项目统计 AI 调用次数、Token 消耗、费用和近期请求。</p>
        </div>
        <div class="header-actions">
          <el-radio-group v-model="range" size="small">
            <el-radio-button value="today">今日</el-radio-button>
            <el-radio-button value="month">本月</el-radio-button>
            <el-radio-button value="all">全部</el-radio-button>
          </el-radio-group>
          <el-button @click="reloadUsage">刷新</el-button>
          <el-button @click="exportUsage" :disabled="projectRecords.length === 0">导出</el-button>
          <el-popconfirm title="确定清空当前项目的 Token 用量记录吗？" @confirm="clearUsage">
            <template #reference>
              <el-button type="danger" plain :disabled="projectRecords.length === 0">清空</el-button>
            </template>
          </el-popconfirm>
        </div>
      </div>
    </el-card>

    <el-empty v-if="projectRecords.length === 0" description="尚无 AI 调用记录。生成章节、运行审校或使用 AI 助手后会显示用量。" />

    <template v-else>
      <el-row :gutter="16" class="metric-row">
        <el-col :span="4">
          <el-card shadow="never"><el-statistic title="调用次数" :value="summary.requestCount" /></el-card>
        </el-col>
        <el-col :span="5">
          <el-card shadow="never"><el-statistic title="输入 Token" :value="formatTokenCount(summary.inputTokens)" /></el-card>
        </el-col>
        <el-col :span="5">
          <el-card shadow="never"><el-statistic title="输出 Token" :value="formatTokenCount(summary.outputTokens)" /></el-card>
        </el-col>
        <el-col :span="5">
          <el-card shadow="never"><el-statistic title="总 Token" :value="formatTokenCount(summary.totalTokens)" /></el-card>
        </el-col>
        <el-col :span="5">
          <el-card shadow="never"><el-statistic title="总费用" :value="`${formatCurrencyUSD(summary.totalUSD)} / ${formatCurrencyCNY(summary.totalCNY)}`" /></el-card>
        </el-col>
      </el-row>

      <el-row :gutter="16" class="metric-row">
        <el-col :span="12">
          <el-card shadow="never">
            <template #header>预算进度</template>
            <div class="budget-item">
              <span>今日 {{ formatCurrencyUSD(budgetUsage.today.spentUSD) }} / {{ formatCurrencyUSD(budgetUsage.today.limitUSD) }}</span>
              <el-progress :percentage="Math.round(budgetUsage.today.percent)" :status="getBudgetStatus(budgetUsage.today.percent)" />
            </div>
            <div class="budget-item">
              <span>本月 {{ formatCurrencyUSD(budgetUsage.month.spentUSD) }} / {{ formatCurrencyUSD(budgetUsage.month.limitUSD) }}</span>
              <el-progress :percentage="Math.round(budgetUsage.month.percent)" :status="getBudgetStatus(budgetUsage.month.percent)" />
            </div>
            <p class="hint">单章预算：{{ formatCurrencyUSD(budgetUsage.chapterLimitUSD) }}</p>
          </el-card>
        </el-col>
        <el-col :span="12">
          <el-card shadow="never">
            <template #header>平均表现</template>
            <div class="average-grid">
              <div><span>平均延迟</span><strong>{{ summary.averageLatency }} ms</strong></div>
              <div><span>平均 Token</span><strong>{{ averageTokens }}</strong></div>
              <div><span>平均费用</span><strong>{{ averageCost }}</strong></div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <el-row :gutter="16" class="table-row">
        <el-col :span="12">
          <el-card shadow="never">
            <template #header>按模型</template>
            <el-table :data="byModel" size="small">
              <el-table-column prop="key" label="模型" min-width="160" />
              <el-table-column prop="requestCount" label="次数" width="80" />
              <el-table-column label="Token" width="110">
                <template #default="{ row }">{{ formatTokenCount(row.totalTokens) }}</template>
              </el-table-column>
              <el-table-column label="费用" width="120">
                <template #default="{ row }">{{ formatCurrencyUSD(row.totalUSD) }}</template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>
        <el-col :span="12">
          <el-card shadow="never">
            <template #header>按任务</template>
            <el-table :data="byTaskType" size="small">
              <el-table-column label="任务" min-width="120">
                <template #default="{ row }">{{ getTaskTypeLabel(row.key) }}</template>
              </el-table-column>
              <el-table-column prop="requestCount" label="次数" width="80" />
              <el-table-column label="Token" width="110">
                <template #default="{ row }">{{ formatTokenCount(row.totalTokens) }}</template>
              </el-table-column>
              <el-table-column label="费用" width="120">
                <template #default="{ row }">{{ formatCurrencyUSD(row.totalUSD) }}</template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>
      </el-row>

      <el-card shadow="never" class="table-row">
        <template #header>近期请求</template>
        <el-table :data="recentRecords" size="small">
          <el-table-column label="时间" width="170">
            <template #default="{ row }">{{ formatTime(row.timestamp) }}</template>
          </el-table-column>
          <el-table-column label="任务" width="120">
            <template #default="{ row }"><el-tag size="small">{{ getTaskTypeLabel(row.taskType) }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="model" label="模型" min-width="180" />
          <el-table-column label="来源" width="110">
            <template #default="{ row }">{{ getSourceLabel(row.source) }}</template>
          </el-table-column>
          <el-table-column label="Token" width="110">
            <template #default="{ row }">{{ formatTokenCount(row.totalTokens) }}</template>
          </el-table-column>
          <el-table-column label="费用" width="120">
            <template #default="{ row }">{{ formatCurrencyUSD(row.totalUSD) }}</template>
          </el-table-column>
          <el-table-column label="延迟" width="100">
            <template #default="{ row }">{{ row.latency }} ms</template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useProjectStore } from '@/stores/project'
import { useTokenUsageStore } from '@/stores/tokenUsage'
import type { BudgetConfig } from '@/types/ai'
import type { TokenUsageRecord, TokenUsageTaskType } from '@/types/token-usage'
import {
  calculateBudgetUsage,
  filterTokenUsageRecords,
  formatCurrencyCNY,
  formatCurrencyUSD,
  formatTokenCount,
  summarizeTokenUsage,
  summarizeUsageByModel,
  summarizeUsageByTaskType,
} from '@/utils/tokenUsage'

const projectStore = useProjectStore()
const tokenUsageStore = useTokenUsageStore()
const range = ref<'today' | 'month' | 'all'>('month')

const projectId = computed(() => projectStore.currentProject?.id ?? '')
const projectRecords = computed(() => projectId.value ? tokenUsageStore.getProjectRecords(projectId.value) : [])
const filteredRecords = computed(() => filterTokenUsageRecords(projectRecords.value, getRangeFilters()))
const summary = computed(() => summarizeTokenUsage(filteredRecords.value))
const byModel = computed(() => summarizeUsageByModel(filteredRecords.value))
const byTaskType = computed(() => summarizeUsageByTaskType(filteredRecords.value))
const recentRecords = computed(() => [...filteredRecords.value].sort((left, right) => right.timestamp.localeCompare(left.timestamp)).slice(0, 50))
const budgetUsage = computed(() => calculateBudgetUsage(projectRecords.value, getBudgetConfig()))
const averageTokens = computed(() => summary.value.requestCount > 0 ? formatTokenCount(summary.value.totalTokens / summary.value.requestCount) : '0')
const averageCost = computed(() => summary.value.requestCount > 0 ? formatCurrencyUSD(summary.value.totalUSD / summary.value.requestCount) : '$0.0000')

onMounted(() => {
  reloadUsage()
})

function reloadUsage(): void {
  if (!projectId.value) return
  tokenUsageStore.loadProjectUsage(projectId.value)
}

function clearUsage(): void {
  if (!projectId.value) return
  tokenUsageStore.clearProjectUsage(projectId.value)
  ElMessage.success('Token 用量记录已清空')
}

function exportUsage(): void {
  if (!projectId.value) return
  const blob = new Blob([tokenUsageStore.exportProjectUsage(projectId.value)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${projectStore.currentProject?.title || 'project'}-token-usage.json`
  link.click()
  URL.revokeObjectURL(url)
}

function getRangeFilters() {
  const now = new Date()
  if (range.value === 'all') return { projectId: projectId.value }
  if (range.value === 'today') {
    return {
      projectId: projectId.value,
      startTime: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString(),
      endTime: now.toISOString(),
    }
  }
  return {
    projectId: projectId.value,
    startTime: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
    endTime: now.toISOString(),
  }
}

function getBudgetConfig(): BudgetConfig {
  const chapterLimitUSD = projectStore.currentProject?.config?.maxCostPerChapter || 0.15
  return {
    chapterLimitUSD,
    dailyLimitUSD: Math.max(chapterLimitUSD * 5, chapterLimitUSD),
    monthlyLimitUSD: Math.max(chapterLimitUSD * 100, 10),
    alertThreshold: 0.8,
  }
}

function getBudgetStatus(percent: number): 'success' | 'warning' | 'exception' | undefined {
  if (percent >= 100) return 'exception'
  if (percent >= 80) return 'warning'
  return 'success'
}

function getTaskTypeLabel(type: TokenUsageTaskType | string): string {
  const labels: Record<string, string> = {
    worldbuilding: '世界观',
    character: '人物',
    outline: '大纲',
    chapter: '章节生成',
    check: '审校/检查',
    state_extraction: '状态提取',
    memory_update: '记忆更新',
    assistant: 'AI 助手',
    unknown: '未知',
  }
  return labels[type] ?? type
}

function getSourceLabel(source: TokenUsageRecord['source']): string {
  const labels: Record<TokenUsageRecord['source'], string> = {
    chat: '普通调用',
    chatStream: '流式调用',
    mockChat: 'Mock 调用',
    mockStream: 'Mock 流式',
  }
  return labels[source]
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString('zh-CN')
}
</script>

<style scoped>
.token-usage-panel {
  max-width: 1280px;
  margin: 0 auto;
}

.header-card,
.metric-row,
.table-row {
  margin-bottom: 16px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.header h2 {
  margin: 0 0 8px;
}

.header p,
.hint {
  margin: 0;
  color: #909399;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.budget-item {
  margin-bottom: 16px;
}

.budget-item span {
  display: block;
  margin-bottom: 8px;
  color: #606266;
}

.average-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.average-grid div {
  padding: 16px;
  border-radius: 8px;
  background: #f5f7fa;
}

.average-grid span {
  display: block;
  margin-bottom: 8px;
  color: #909399;
  font-size: 13px;
}

.average-grid strong {
  color: #303133;
  font-size: 18px;
}
</style>
