<template>
  <div class="ai-settings-panel">
    <el-form :model="settings" label-width="140px" label-position="left">
      <!-- 基础参数 -->
      <el-divider>基础参数</el-divider>

      <el-form-item label="Temperature">
        <el-slider
          v-model="settings.temperature"
          :min="0"
          :max="2"
          :step="0.1"
          show-input
          @change="handleUpdate"
        />
        <el-text size="small" type="info">
          控制输出的随机性。值越高，输出越随机；值越低，输出越确定。
        </el-text>
      </el-form-item>

      <el-form-item label="Top P">
        <el-slider
          v-model="settings.top_p"
          :min="0"
          :max="1"
          :step="0.05"
          show-input
          @change="handleUpdate"
        />
        <el-text size="small" type="info">
          核采样参数。控制候选词的概率累积阈值。
        </el-text>
      </el-form-item>

      <el-form-item label="Top K">
        <el-input-number
          v-model="settings.top_k"
          :min="0"
          :max="1000"
          :step="10"
          @change="handleUpdate"
        />
        <el-text size="small" type="info">
          限制候选词的数量。0表示不限制。
        </el-text>
      </el-form-item>

      <!-- 惩罚参数 -->
      <el-divider>惩罚参数</el-divider>

      <el-form-item label="Frequency Penalty">
        <el-slider
          v-model="settings.frequency_penalty"
          :min="-2"
          :max="2"
          :step="0.1"
          show-input
          @change="handleUpdate"
        />
        <el-text size="small" type="info">
          频率惩罚。正值降低重复词的概率。
        </el-text>
      </el-form-item>

      <el-form-item label="Presence Penalty">
        <el-slider
          v-model="settings.presence_penalty"
          :min="-2"
          :max="2"
          :step="0.1"
          show-input
          @change="handleUpdate"
        />
        <el-text size="small" type="info">
          存在惩罚。正值鼓励谈论新话题。
        </el-text>
      </el-form-item>

      <el-form-item label="Repetition Penalty">
        <el-input-number
          v-model="settings.repetition_penalty"
          :min="1"
          :max="2"
          :step="0.05"
          :precision="2"
          @change="handleUpdate"
        />
        <el-text size="small" type="info">
          重复惩罚。大于1时降低重复内容的概率。
        </el-text>
      </el-form-item>

      <!-- 高级参数 -->
      <el-divider>高级参数</el-divider>

      <el-form-item label="Top A">
        <el-slider
          v-model="settings.top_a"
          :min="0"
          :max="1"
          :step="0.01"
          show-input
          @change="handleUpdate"
        />
        <el-text size="small" type="info">
          移除概率低于最高概率词的top_a倍的词。
        </el-text>
      </el-form-item>

      <el-form-item label="Min P">
        <el-slider
          v-model="settings.min_p"
          :min="0"
          :max="1"
          :step="0.01"
          show-input
          @change="handleUpdate"
        />
        <el-text size="small" type="info">
          最小概率阈值。概率低于此值的词会被过滤。
        </el-text>
      </el-form-item>

      <!-- 功能开关 -->
      <el-divider>功能开关</el-divider>

      <el-form-item label="Stream Response">
        <el-switch
          v-model="settings.stream_openai"
          @change="handleUpdate"
        />
        <el-text size="small" type="info">
          启用流式响应。
        </el-text>
      </el-form-item>

      <el-form-item label="Function Calling">
        <el-switch
          v-model="settings.function_calling"
          @change="handleUpdate"
        />
        <el-text size="small" type="info">
          启用函数调用功能。
        </el-text>
      </el-form-item>

      <!-- 重置按钮 -->
      <el-divider />
      <el-form-item>
        <el-button @click="handleReset">重置为默认值</el-button>
        <el-button type="primary" @click="handleSave">保存设置</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useCharacterCardStore } from '@/stores/character-card'

const characterCardStore = useCharacterCardStore()

const settings = reactive({
  temperature: 1,
  frequency_penalty: 0,
  presence_penalty: 0,
  top_p: 0.9,
  top_k: 500,
  top_a: 0,
  min_p: 0,
  repetition_penalty: 1,
  stream_openai: false,
  function_calling: true
})

// 初始化
onMounted(() => {
  Object.assign(settings, characterCardStore.aiSettings)
})

// 更新设置
const handleUpdate = () => {
  characterCardStore.updateAISettings(settings)
}

// 保存设置
const handleSave = () => {
  characterCardStore.updateAISettings(settings)
  ElMessage.success('AI设置已保存')
}

// 重置设置
const handleReset = () => {
  Object.assign(settings, {
    temperature: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    top_p: 0.9,
    top_k: 500,
    top_a: 0,
    min_p: 0,
    repetition_penalty: 1,
    stream_openai: false,
    function_calling: true
  })
  handleUpdate()
  ElMessage.success('已重置为默认值')
}
</script>

<style scoped>
.ai-settings-panel {
  padding: 16px 0;
}

:deep(.el-slider) {
  margin-right: 16px;
}

:deep(.el-text) {
  display: block;
  margin-top: 4px;
}
</style>