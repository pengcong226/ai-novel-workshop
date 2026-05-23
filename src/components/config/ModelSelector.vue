<template>
  <el-card class="config-card">
    <template #header>
      <div class="card-header">
        <span>AI 模型分配</span>
      </div>
    </template>

    <el-form :model="config" label-width="150px">
      <el-form-item label="大纲规划师 (Planner)">
        <el-select v-model="configProxy.plannerModel" placeholder="选择规划模型" :disabled="!hasEnabledProviders">
          <el-option v-for="model in getAvailableModels('all')" :key="model.id" :label="`${model.providerName} - ${model.name}`" :value="model.id">
            <div style="display: flex; justify-content: space-between;">
              <span>{{ model.providerName }} - {{ model.name }}</span>
              <span style="color: #909399; font-size: 12px;">{{ model.maxTokens }}K tokens</span>
            </div>
          </el-option>
        </el-select>
        <div class="form-tip">负责推演大纲节点、预测状态变更（建议使用高推理模型，如 GPT-4 或 Claude-Opus）</div>
      </el-form-item>

      <el-form-item label="正文写手 (Writer)">
        <el-select v-model="configProxy.writerModel" placeholder="选择写作模型" :disabled="!hasEnabledProviders">
          <el-option v-for="model in getAvailableModels('all')" :key="model.id" :label="`${model.providerName} - ${model.name}`" :value="model.id">
            <div style="display: flex; justify-content: space-between;">
              <span>{{ model.providerName }} - {{ model.name }}</span>
              <span style="color: #909399; font-size: 12px;">{{ model.maxTokens }}K tokens</span>
            </div>
          </el-option>
        </el-select>
        <div class="form-tip">负责根据上下文撰写小说正文（建议使用文笔好的模型，如 Claude-Sonnet）</div>
      </el-form-item>

      <el-form-item label="防吃书审查 (Sentinel)">
        <el-select v-model="configProxy.sentinelModel" placeholder="选择审查模型" :disabled="!hasEnabledProviders">
          <el-option v-for="model in getAvailableModels('all')" :key="model.id" :label="`${model.providerName} - ${model.name}`" :value="model.id">
            <div style="display: flex; justify-content: space-between;">
              <span>{{ model.providerName }} - {{ model.name }}</span>
              <span style="color: #909399; font-size: 12px;">{{ model.maxTokens }}K tokens</span>
            </div>
          </el-option>
        </el-select>
        <div class="form-tip">负责在每次生成后校验一致性（建议使用高速响应模型，如 Claude-Haiku 或 GPT-4o-mini）</div>
      </el-form-item>

      <el-form-item label="沙盘提取 (Extractor)">
        <el-select v-model="configProxy.extractorModel" placeholder="选择沙盘提取模型" :disabled="!hasEnabledProviders">
          <el-option v-for="model in getAvailableModels('all')" :key="model.id" :label="`${model.providerName} - ${model.name}`" :value="model.id">
            <div style="display: flex; justify-content: space-between;">
              <span>{{ model.providerName }} - {{ model.name }}</span>
              <span style="color: #909399; font-size: 12px;">{{ model.maxTokens }}K tokens</span>
            </div>
          </el-option>
        </el-select>
        <div class="form-tip">执行 Tool Calling 输出规范 JSON 以更新底层沙盘数据</div>
      </el-form-item>

      <el-alert v-if="!hasEnabledProviders" type="warning" :closable="false" show-icon>
        <template #title>请先配置模型提供商</template>
        <div>在上方"模型提供商"部分添加至少一个提供商后，才能选择模型</div>
      </el-alert>

      <el-alert v-else type="info" :closable="false" show-icon>
        <template #title>V5 沙盘分层模型策略</template>
        <div>规划师用于高层决策和状态预测，写手生成正文内容，审查员验证防吃书质量，提取引擎则负责更新图谱状态。</div>
      </el-alert>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ProjectConfig, ModelProvider, ModelInfo } from '@/types'

const props = defineProps<{
  config: ProjectConfig
  providers: ModelProvider[]
}>()

const emit = defineEmits(['update:config'])

const configProxy = computed({
  get: () => props.config,
  set: (val) => emit('update:config', val)
})

const hasEnabledProviders = computed(() => {
  return props.providers.some(p => p.isEnabled && p.models.some(m => m.isEnabled))
})

function getAvailableModels(type: string) {
  const models: Array<ModelInfo & { providerId: string; providerName: string }> = []

  for (const provider of props.providers) {
    if (!provider.isEnabled) continue
    for (const model of provider.models) {
      if (!model.isEnabled) continue
      if (type === 'all' || model.type === type || model.type === 'all') {
        models.push({ ...model, providerId: provider.id, providerName: provider.name })
      }
    }
  }

  return models
}
</script>

<style scoped>
.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
</style>
