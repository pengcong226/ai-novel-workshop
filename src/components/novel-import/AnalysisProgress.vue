<template>
  <div class="analysis-progress">
    <el-card class="progress-card">
      <template #header>
        <div class="card-header">
          <span>分析进度</span>
          <el-tag v-if="status === 'running'" type="warning" effect="dark">
            <el-icon class="is-loading"><Loading /></el-icon>
            进行中
          </el-tag>
          <el-tag v-else-if="status === 'completed'" type="success">
            <el-icon><Select /></el-icon>
            已完成
          </el-tag>
          <el-tag v-else-if="status === 'error'" type="danger">
            <el-icon><Close /></el-icon>
            失败
          </el-tag>
          <el-tag v-else type="info">等待中</el-tag>
        </div>
      </template>

      <!-- 总体进度 -->
      <div class="overall-progress">
        <el-progress
          :percentage="overallPercentage"
          :status="progressStatus"
          :stroke-width="20"
        />
        <p class="progress-message">{{ currentMessage }}</p>
      </div>

      <!-- 阶段列表 -->
      <div class="stages-list">
        <div
          v-for="stage in stages"
          :key="stage.key"
          class="stage-item"
          :class="getStageClass(stage)"
        >
          <div class="stage-icon">
            <el-icon v-if="stage.status === 'completed'" color="#67C23A"><Select /></el-icon>
            <el-icon v-else-if="stage.status === 'running'" class="is-loading" color="#E6A23C"><Loading /></el-icon>
            <el-icon v-else-if="stage.status === 'error'" color="#F56C6C"><Close /></el-icon>
            <el-icon v-else color="#909399"><Clock /></el-icon>
          </div>
          <div class="stage-content">
            <div class="stage-name">{{ stage.name }}</div>
            <div class="stage-message">{{ stage.message || '等待中...' }}</div>
          </div>
          <div v-if="stage.status === 'running'" class="stage-progress">
            <el-progress
              :percentage="stage.percentage"
              :stroke-width="6"
              :show-text="false"
            />
          </div>
        </div>
      </div>

      <!-- Token使用和成本 -->
      <div v-if="tokenUsage.input > 0 || tokenUsage.output > 0" class="usage-info">
        <el-divider />
        <el-row :gutter="20">
          <el-col :span="12">
            <div class="usage-item">
              <div class="usage-label">输入Tokens</div>
              <div class="usage-value">{{ formatNumber(tokenUsage.input) }}</div>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="usage-item">
              <div class="usage-label">输出Tokens</div>
              <div class="usage-value">{{ formatNumber(tokenUsage.output) }}</div>
            </div>
          </el-col>
        </el-row>
        <el-row :gutter="20" style="margin-top: 10px;">
          <el-col :span="12">
            <div class="usage-item">
              <div class="usage-label">总Tokens</div>
              <div class="usage-value">{{ formatNumber(tokenUsage.input + tokenUsage.output) }}</div>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="usage-item">
              <div class="usage-label">预估成本</div>
              <div class="usage-value cost">${{ estimatedCost.toFixed(4) }}</div>
            </div>
          </el-col>
        </el-row>
      </div>

      <!-- 操作按钮 -->
      <div v-if="status === 'running'" class="actions">
        <el-button type="danger" @click="handleCancel">
          <el-icon><Close /></el-icon>
          取消分析
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Loading, Select, Close, Clock } from '@element-plus/icons-vue'
import type { AnalysisStage, AnalysisProgress } from '@/utils/llm/types'

interface Stage {
  key: AnalysisStage
  name: string
  status: 'pending' | 'running' | 'completed' | 'error'
  message?: string
  percentage: number
}

interface Props {
  progress?: AnalysisProgress
  status: 'idle' | 'running' | 'completed' | 'error'
  tokenUsage?: {
    input: number
    output: number
  }
  estimatedCost?: number
}

const props = withDefaults(defineProps<Props>(), {
  status: 'idle',
  tokenUsage: () => ({ input: 0, output: 0 }),
  estimatedCost: 0
})

const emit = defineEmits<{
  cancel: []
}>()

// 阶段配置
const stages = ref<Stage[]>([
  { key: 'pattern', name: '模式识别', status: 'pending', percentage: 0 },
  { key: 'chapters', name: '章节检测', status: 'pending', percentage: 0 },
  { key: 'characters', name: '人物识别', status: 'pending', percentage: 0 },
  { key: 'world', name: '世界观提取', status: 'pending', percentage: 0 },
  { key: 'outline', name: '大纲生成', status: 'pending', percentage: 0 },
  { key: 'complete', name: '完成', status: 'pending', percentage: 0 }
])

// 当前消息
const currentMessage = computed(() => {
  return props.progress?.message || '准备开始分析...'
})

// 总体进度
const overallPercentage = computed(() => {
  if (props.status === 'completed') return 100
  if (!props.progress) return 0

  const stageWeights: Record<AnalysisStage, number> = {
    pattern: 10,
    chapters: 25,
    characters: 25,
    world: 20,
    outline: 15,
    complete: 5
  }

  let completed = 0
  for (const stage of stages.value) {
    if (stage.status === 'completed') {
      completed += stageWeights[stage.key]
    } else if (stage.status === 'running') {
      completed += (stageWeights[stage.key] * stage.percentage) / 100
    }
  }

  return Math.round(completed)
})

// 进度条状态
const progressStatus = computed(() => {
  if (props.status === 'completed') return 'success'
  if (props.status === 'error') return 'exception'
  return undefined
})

// 更新阶段状态
function updateStage(stageKey: AnalysisStage, status: Stage['status'], message?: string, percentage?: number) {
  const stage = stages.value.find(s => s.key === stageKey)
  if (stage) {
    stage.status = status
    if (message) stage.message = message
    if (percentage !== undefined) stage.percentage = percentage
  }
}

// 监听progress变化
watch(() => props.progress, (newProgress) => {
  if (!newProgress) return

  // 更新对应阶段
  updateStage(
    newProgress.stage,
    'running',
    newProgress.message,
    newProgress.total > 0 ? Math.round((newProgress.current / newProgress.total) * 100) : 0
  )

  // 标记之前阶段为完成
  const stageOrder: AnalysisStage[] = ['pattern', 'chapters', 'characters', 'world', 'outline', 'complete']
  const currentIndex = stageOrder.indexOf(newProgress.stage)
  for (let i = 0; i < currentIndex; i++) {
    updateStage(stageOrder[i], 'completed')
  }
}, { immediate: true })

// 监听status变化
watch(() => props.status, (newStatus) => {
  if (newStatus === 'completed') {
    stages.value.forEach(stage => {
      stage.status = 'completed'
      stage.percentage = 100
    })
  } else if (newStatus === 'error') {
    // 标记运行中的阶段为error
    stages.value.forEach(stage => {
      if (stage.status === 'running') {
        stage.status = 'error'
      }
    })
  }
})

// 获取阶段样式
function getStageClass(stage: Stage): Record<string, boolean> {
  return {
    'stage-completed': stage.status === 'completed',
    'stage-running': stage.status === 'running',
    'stage-error': stage.status === 'error',
    'stage-pending': stage.status === 'pending'
  }
}

// 格式化数字
function formatNumber(num: number): string {
  return num.toLocaleString()
}

// 取消分析
function handleCancel() {
  emit('cancel')
}
</script>

<style scoped>
.analysis-progress {
  width: 100%;
}

.progress-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.overall-progress {
  margin-bottom: 30px;
}

.progress-message {
  text-align: center;
  margin-top: 10px;
  font-size: 14px;
  color: #606266;
}

.stages-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stage-item {
  display: flex;
  align-items: flex-start;
  padding: 12px;
  border-radius: 8px;
  background-color: #f5f7fa;
  transition: all 0.3s;
}

.stage-item.stage-completed {
  background-color: #f0f9ff;
}

.stage-item.stage-running {
  background-color: #fdf6ec;
}

.stage-item.stage-error {
  background-color: #fef0f0;
}

.stage-icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
  font-size: 20px;
}

.stage-content {
  flex: 1;
}

.stage-name {
  font-size: 15px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 4px;
}

.stage-message {
  font-size: 13px;
  color: #909399;
}

.stage-progress {
  flex-shrink: 0;
  width: 150px;
  margin-left: 12px;
  margin-top: 8px;
}

.usage-info {
  margin-top: 20px;
}

.usage-item {
  text-align: center;
}

.usage-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}

.usage-value {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.usage-value.cost {
  color: #E6A23C;
}

.actions {
  margin-top: 20px;
  text-align: center;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.is-loading {
  animation: rotate 1s linear infinite;
}
</style>
