<template>
  <el-card class="config-card">
    <template #header>
      <div class="card-header">
        <span>写作风格</span>
        <el-button :loading="extracting" text @click="extractFromSample">AI 提取风格</el-button>
      </div>
    </template>

    <el-alert type="info" :closable="false" show-icon style="margin-bottom: 20px;">
      <template #title>项目级风格会注入每次章节生成</template>
      <div>选择预设后可继续微调；AI 提取会从样本文本生成当前项目的风格档案。</div>
    </el-alert>

    <el-form :model="styleProfile" label-width="130px">
      <el-form-item label="风格预设">
        <el-select v-model="selectedPresetId" placeholder="选择风格预设" @change="applyPreset" style="width: 100%;">
          <el-option
            v-for="preset in STYLE_PRESETS"
            :key="preset.id"
            :label="preset.name"
            :value="preset.id"
          >
            <span>{{ preset.name }}</span>
            <span class="preset-desc">{{ preset.description }}</span>
          </el-option>
        </el-select>
      </el-form-item>

      <el-form-item label="风格名称">
        <el-input v-model="styleProfile.name" @input="emitUpdate" />
      </el-form-item>

      <el-form-item label="风格说明">
        <el-input v-model="styleProfile.description" type="textarea" :rows="2" @input="emitUpdate" />
      </el-form-item>

      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="基调">
            <el-select v-model="styleProfile.tone" @change="emitUpdate" style="width: 100%;">
              <el-option label="轻松" value="轻松" />
              <el-option label="严肃" value="严肃" />
              <el-option label="幽默" value="幽默" />
              <el-option label="黑暗" value="黑暗" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="叙事视角">
            <el-select v-model="styleProfile.narrativePerspective" @change="emitUpdate" style="width: 100%;">
              <el-option label="第一人称" value="第一人称" />
              <el-option label="第三人称" value="第三人称" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="节奏">
            <el-select v-model="styleProfile.pacing" @change="emitUpdate" style="width: 100%;">
              <el-option label="舒缓" value="舒缓" />
              <el-option label="均衡" value="均衡" />
              <el-option label="紧凑" value="紧凑" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="词汇倾向">
            <el-select v-model="styleProfile.vocabulary" @change="emitUpdate" style="width: 100%;">
              <el-option label="通俗" value="通俗" />
              <el-option label="典雅" value="典雅" />
              <el-option label="专业" value="专业" />
              <el-option label="诗性" value="诗性" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="句式">
            <el-select v-model="styleProfile.sentenceStyle" @change="emitUpdate" style="width: 100%;">
              <el-option label="短句利落" value="短句利落" />
              <el-option label="长句铺陈" value="长句铺陈" />
              <el-option label="长短结合" value="长短结合" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="对话风格">
            <el-select v-model="styleProfile.dialogueStyle" @change="emitUpdate" style="width: 100%;">
              <el-option label="简洁" value="简洁" />
              <el-option label="华丽" value="华丽" />
              <el-option label="幽默" value="幽默" />
              <el-option label="严肃" value="严肃" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="描写密度">
        <el-radio-group v-model="styleProfile.descriptionLevel" @change="emitUpdate">
          <el-radio value="详细">详细</el-radio>
          <el-radio value="适中">适中</el-radio>
          <el-radio value="简洁">简洁</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="避免写法">
        <el-select
          v-model="styleProfile.avoidList"
          multiple
          filterable
          allow-create
          default-first-option
          placeholder="输入需要避免的写法"
          style="width: 100%;"
          @change="emitUpdate"
        />
      </el-form-item>

      <el-form-item label="示例表达">
        <el-select
          v-model="styleProfile.examplePhrases"
          multiple
          filterable
          allow-create
          default-first-option
          placeholder="输入代表性短句"
          style="width: 100%;"
          @change="emitUpdate"
        />
      </el-form-item>

      <el-form-item label="补充要求">
        <el-input v-model="styleProfile.customInstructions" type="textarea" :rows="3" @input="emitUpdate" />
      </el-form-item>

      <el-form-item label="样本文本">
        <el-input v-model="sampleText" type="textarea" :rows="5" placeholder="粘贴一段代表性正文，用于 AI 提取风格..." />
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { ProjectConfig, StyleProfile } from '@/types'
import { STYLE_PRESETS, createStyleProfileFromPreset, mergeStyleProfile } from '@/data/stylePresets'
import { extractStyleProfile } from '@/services/style-extractor'

const props = defineProps<{
  config: ProjectConfig
}>()

const emit = defineEmits<{
  'update:config': [value: ProjectConfig]
}>()

const styleProfile = ref<StyleProfile>(mergeStyleProfile(props.config.styleProfile))
const selectedPresetId = ref(styleProfile.value.metadata?.presetId ?? STYLE_PRESETS[0].id)
const sampleText = ref('')
const extracting = ref(false)

watch(() => props.config.styleProfile, (profile) => {
  styleProfile.value = mergeStyleProfile(profile)
  selectedPresetId.value = styleProfile.value.metadata?.presetId ?? STYLE_PRESETS[0].id
}, { deep: true })

function emitUpdate() {
  styleProfile.value = mergeStyleProfile({
    ...styleProfile.value,
    metadata: {
      ...styleProfile.value.metadata,
      source: styleProfile.value.metadata?.source === 'preset' ? 'preset' : 'custom',
      updatedAt: Date.now()
    }
  })
  emit('update:config', {
    ...props.config,
    styleProfile: styleProfile.value
  })
}

function applyPreset(presetId: string) {
  styleProfile.value = createStyleProfileFromPreset(presetId)
  emitUpdate()
}

async function extractFromSample() {
  if (!sampleText.value.trim()) {
    ElMessage.warning('请先粘贴样本文本')
    return
  }

  try {
    extracting.value = true
    const result = await extractStyleProfile({
      sampleText: sampleText.value,
      currentProfile: styleProfile.value,
      projectGenre: styleProfile.value.genre
    })
    styleProfile.value = result.profile
    selectedPresetId.value = styleProfile.value.metadata?.presetId ?? STYLE_PRESETS[0].id
    emitUpdate()
    ElMessage.success('风格提取完成')
  } catch (error) {
    ElMessage.error('风格提取失败：' + (error instanceof Error ? error.message : String(error)))
  } finally {
    extracting.value = false
  }
}
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.preset-desc {
  float: right;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  max-width: 520px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.el-radio-group) {
  display: flex;
  gap: 16px;
}
</style>
