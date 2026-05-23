<template>
  <div class="statistics-panel">
    <el-row :gutter="16" class="stats-overview">
      <el-col :span="6">
        <el-statistic title="总建议数" :value="statistics.total" />
      </el-col>
      <el-col :span="6">
        <el-statistic title="未处理" :value="statistics.byStatus.unread" />
      </el-col>
      <el-col :span="6">
        <el-statistic title="已采纳" :value="statistics.byStatus.adopted" />
      </el-col>
      <el-col :span="6">
        <el-statistic title="采纳率" :value="statistics.adoptionRate" suffix="%" />
      </el-col>
    </el-row>

    <el-card class="stats-card" shadow="never">
      <template #header>
        <span>建议类型分布</span>
      </template>
      <div ref="typeChartRef" class="chart-container"></div>
    </el-card>

    <el-card class="stats-card" shadow="never">
      <template #header>
        <span>优先级分布</span>
      </template>
      <div ref="priorityChartRef" class="chart-container"></div>
    </el-card>

    <el-card class="stats-card" shadow="never">
      <template #header>
        <span>近7天采纳趋势</span>
      </template>
      <div ref="trendChartRef" class="chart-container"></div>
    </el-card>

    <el-card class="stats-card" shadow="never">
      <template #header>
        <span>高优先级建议</span>
      </template>
      <el-timeline>
        <el-timeline-item
          v-for="suggestion in highPrioritySuggestions"
          :key="suggestion.id"
          :type="suggestion.status === 'adopted' ? 'success' : suggestion.status === 'ignored' ? 'info' : 'danger'"
        >
          <div class="timeline-suggestion">
            <div class="timeline-title">{{ suggestion.title }}</div>
            <div class="timeline-message">{{ suggestion.message }}</div>
            <div class="timeline-time">{{ formatTime(suggestion.createdAt) }}</div>
          </div>
        </el-timeline-item>
      </el-timeline>
      <el-empty v-if="highPrioritySuggestions.length === 0" description="暂无高优先级建议" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { Suggestion, SuggestionStatistics } from '@/types/suggestions'

interface Props {
  statistics: SuggestionStatistics
  highPrioritySuggestions: Suggestion[]
  formatTime: (date: Date) => string
}

defineProps<Props>()

const typeChartRef = ref<HTMLElement | null>(null)
const priorityChartRef = ref<HTMLElement | null>(null)
const trendChartRef = ref<HTMLElement | null>(null)

defineExpose({
  typeChartRef,
  priorityChartRef,
  trendChartRef,
})
</script>

<style scoped>
.statistics-panel {
  height: 100%;
  overflow-y: auto;
  padding: 0 4px;
}

.stats-overview {
  margin-bottom: 20px;
}

.stats-card {
  margin-bottom: 16px;
}

.chart-container {
  height: 200px;
}

.timeline-suggestion {
  padding: 4px 0;
}

.timeline-title {
  font-weight: 600;
  margin-bottom: 4px;
}

.timeline-message {
  font-size: 13px;
  color: #606266;
  margin-bottom: 4px;
}

.timeline-time {
  font-size: 12px;
  color: #909399;
}
</style>
