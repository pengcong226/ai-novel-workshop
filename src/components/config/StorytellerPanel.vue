<template>
  <div class="storyteller-dashboard">
    <el-card class="dashboard-card">
      <template #header>
        <div class="card-header">
          <span class="header-title">创作偏好指南针 (小白模式)</span>
          <el-tag effect="dark" type="success" round>无需懂模型，专注创作</el-tag>
        </div>
      </template>

      <div class="dashboard-content">
        <el-row :gutter="40">
          <el-col :span="12">
            <div class="setting-block">
              <h3>🎨 文笔与想象力释放</h3>
              <p class="desc">控制AI生成内容的跳跃度与生动感 (Temperature)</p>
              <el-slider
                v-model="temperatureProxy"
                :min="0"
                :max="100"
                :marks="tempMarks"
                :format-tooltip="formatTempTooltip"
              />
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-block">
              <h3>📐 大纲推演深度</h3>
              <p class="desc">决定AI构思情节时的发散层级</p>
              <el-radio-group v-model="planningProxy" size="large" class="custom-radio">
                <el-radio-button value="light">轻快直白</el-radio-button>
                <el-radio-button value="medium">均衡标准</el-radio-button>
                <el-radio-button value="deep">深渊网状</el-radio-button>
              </el-radio-group>
            </div>
          </el-col>
        </el-row>

        <el-divider border-style="dashed" />

        <el-row :gutter="40">
          <el-col :span="12">
            <div class="setting-block">
              <h3>📜 单章字数预期</h3>
              <p class="desc">期望单章生成的大致文字量 (目标引导)</p>
              <el-slider
                v-model="targetWordsProxy"
                :min="500"
                :max="5000"
                :step="500"
                show-stops
              />
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-block">
              <h3>🛡️ 逻辑严谨度保护</h3>
              <p class="desc">质量检查与吃书检测严格程度</p>
              <el-switch
                v-model="qualityProxy"
                inline-prompt
                active-text="严格查杀"
                inactive-text="宽松放任"
                style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
              />
            </div>
          </el-col>
        </el-row>
      </div>
    </el-card>

    <el-alert
      title="极客提示：所有底层算力与模型调度已由系统自动接管。若需强制指定 Claude 3.5 或 GPT-4，请切换至【极客老炮】模式。"
      type="info"
      show-icon
      class="info-alert"
      :closable="false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PropType } from 'vue'

interface StorytellerConfig {
  preset?: string
  plannerModel?: string
  writerModel?: string
  sentinelModel?: string
  planningDepth?: string
  enableQualityCheck?: boolean
  [key: string]: unknown
}

interface AdvancedConfig {
  planningDepth?: string
  writingDepth?: string
  enableQualityCheck?: boolean
  temperature?: number
  targetWordCount?: number
  [key: string]: unknown
}

const props = defineProps({
  config: {
    type: Object as PropType<StorytellerConfig>,
    required: true
  },
  advanced: {
    type: Object as PropType<AdvancedConfig>,
    required: true
  }
})

const emit = defineEmits(['update:config', 'update:advanced'])

// 温度系数代理 (0-100 映射到 0.0 - 2.0)
const temperatureProxy = computed({
  get: () => Math.round((props.advanced.temperature || 0.8) * 50),
  set: (val) => {
    emit('update:advanced', { ...props.advanced, temperature: val / 50 })
  }
})

const tempMarks = {
  0: '绝对干瘪',
  40: '写实',
  80: '极具网文感',
  100: '彻底发疯'
}
const formatTempTooltip = (val: number) => {
  if (val < 20) return '像机器说明书'
  if (val < 50) return '逻辑严谨无感情'
  if (val < 80) return '生动且跳跃'
  return '非常发散'
}

const planningProxy = computed({
  get: () => props.config.planningDepth || 'medium',
  set: (val) => {
    emit('update:config', { ...props.config, planningDepth: val })
  }
})

const targetWordsProxy = computed({
  get: () => props.advanced.targetWordCount || 2000,
  set: (val) => {
    emit('update:advanced', { ...props.advanced, targetWordCount: val })
  }
})

const qualityProxy = computed({
  get: () => props.config.enableQualityCheck !== false,
  set: (val) => {
    emit('update:config', { ...props.config, enableQualityCheck: val })
  }
})
</script>

<style scoped>
.storyteller-dashboard {
  animation: slideIn 0.4s ease-out;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.dashboard-card {
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.05);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-title {
  font-size: 1.2rem;
  font-weight: bold;
  background: linear-gradient(45deg, #409eff, #8a2be2);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.dashboard-content {
  padding: 10px 20px;
}

.setting-block {
  margin-bottom: 30px;
}

.setting-block h3 {
  margin: 0 0 5px 0;
  font-size: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.desc {
  font-size: 12px;
  color: #909399;
  margin: 0 0 20px 0;
}

.custom-radio {
  display: flex;
  width: 100%;
}
.custom-radio :deep(.el-radio-button__inner) {
  flex: 1;
}

.info-alert {
  margin-top: 20px;
  border-radius: 12px;
}
</style>
