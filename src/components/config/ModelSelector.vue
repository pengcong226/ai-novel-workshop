<template>
  <el-card class="config-card">
    <template #header>
      <div class="card-header">
        <span>AI模型选择</span>
      </div>
    </template>

    <el-form :model="config" label-width="150px">
      <el-form-item label="规划模型">
        <el-select v-model="configProxy.planningModel" placeholder="选择规划模型" :disabled="!hasEnabledProviders">
          <el-option v-for="model in getAvailableModels('planning')" :key="model.id" :label="`${model.providerName} - ${model.name}`" :value="model.id">
            <div style="display: flex; justify-content: space-between;">
              <span>{{ model.providerName }} - {{ model.name }}</span>
              <span style="color: #909399; font-size: 12px;">{{ model.maxTokens }}K tokens</span>
            </div>
          </el-option>
        </el-select>
        <div class="form-tip">用于世界观、人物、大纲等高层规划</div>
      </el-form-item>

      <el-form-item label="写作模型">
        <el-select v-model="configProxy.writingModel" placeholder="选择写作模型" :disabled="!hasEnabledProviders">
          <el-option v-for="model in getAvailableModels('writing')" :key="model.id" :label="`${model.providerName} - ${model.name}`" :value="model.id">
            <div style="display: flex; justify-content: space-between;">
              <span>{{ model.providerName }} - {{ model.name }}</span>
              <span style="color: #909399; font-size: 12px;">{{ model.maxTokens }}K tokens</span>
            </div>
          </el-option>
        </el-select>
        <div class="form-tip">用于章节内容的生成</div>
      </el-form-item>

      <el-form-item label="检查模型">
        <el-select v-model="configProxy.checkingModel" placeholder="选择检查模型" :disabled="!hasEnabledProviders">
          <el-option v-for="model in getAvailableModels('checking')" :key="model.id" :label="`${model.providerName} - ${model.name}`" :value="model.id">
            <div style="display: flex; justify-content: space-between;">
              <span>{{ model.providerName }} - {{ model.name }}</span>
              <span style="color: #909399; font-size: 12px;">{{ model.maxTokens }}K tokens</span>
            </div>
          </el-option>
        </el-select>
        <div class="form-tip">用于质量检查、一致性验证</div>
      </el-form-item>

      <el-form-item label="助手模型">
        <el-select v-model="configProxy.assistantModel" placeholder="选择助手模型" :disabled="!hasEnabledProviders">
          <el-option v-for="model in getAvailableModels('all')" :key="model.id" :label="`${model.providerName} - ${model.name}`" :value="model.id">
            <div style="display: flex; justify-content: space-between;">
              <span>{{ model.providerName }} - {{ model.name }}</span>
              <span style="color: #909399; font-size: 12px;">{{ model.maxTokens }}K tokens</span>
            </div>
          </el-option>
        </el-select>
        <div class="form-tip">用于AI助手对话，帮助作者创作</div>
      </el-form-item>

      <el-form-item label="表格记忆模型">
        <el-select v-model="configProxy.memoryModel" placeholder="选择表格记忆模型" :disabled="!hasEnabledProviders">
          <el-option v-for="model in getAvailableModels('all')" :key="model.id" :label="`${model.providerName} - ${model.name}`" :value="model.id">
            <div style="display: flex; justify-content: space-between;">
              <span>{{ model.providerName }} - {{ model.name }}</span>
              <span style="color: #909399; font-size: 12px;">{{ model.maxTokens }}K tokens</span>
            </div>
          </el-option>
        </el-select>
        <div class="form-tip">用于表格记忆的自动填写和更新</div>
      </el-form-item>

      <el-form-item label="导入识别模型">
        <el-select v-model="configProxy.importModel" placeholder="选择导入识别模型" :disabled="!hasEnabledProviders">
          <el-option v-for="model in getAvailableModels('all')" :key="model.id" :label="`${model.providerName} - ${model.name}`" :value="model.id">
            <div style="display: flex; justify-content: space-between;">
              <span>{{ model.providerName }} - {{ model.name }}</span>
              <span style="color: #909399; font-size: 12px;">{{ model.maxTokens }}K tokens</span>
            </div>
          </el-option>
        </el-select>
        <div class="form-tip">用于小说导入时的人物、世界观、大纲智能识别</div>
      </el-form-item>

      <el-alert v-if="!hasEnabledProviders" type="warning" :closable="false" show-icon>
        <template #title>请先配置模型提供商</template>
        <div>在上方"模型提供商"部分添加至少一个提供商后，才能选择模型</div>
      </el-alert>

      <el-alert v-else type="info" :closable="false" show-icon>
        <template #title>分层模型策略可节省约89%的成本</template>
        <div>规划模型用于高层决策，写作模型生成内容，检查模型验证质量，助手模型提供创作建议，表格记忆模型自动维护记忆表格</div>
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

function getAvailableModels(type: 'planning' | 'writing' | 'checking' | 'all') {
  const models: Array<ModelInfo & { providerId: string; providerName: string }> = []

  for (const provider of props.providers) {
    if (!provider.isEnabled) continue
    for (const model of provider.models) {
      if (!model.isEnabled) continue
      if (model.type === type || model.type === 'all') {
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
