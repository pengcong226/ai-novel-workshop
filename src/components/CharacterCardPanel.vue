<template>
  <div class="character-card-panel">
    <!-- 工具栏 -->
    <div class="toolbar">
      <el-button type="primary" @click="showImportDialog = true">
        <el-icon><Upload /></el-icon>
        导入角色卡
      </el-button>
      <el-button @click="showExportDialog = true" :disabled="!characterCardStore.characterName">
        <el-icon><Download /></el-icon>
        导出角色卡
      </el-button>
    </div>

    <!-- 角色卡信息 -->
    <el-card v-if="characterCardStore.characterName" class="character-card-info">
      <template #header>
        <div class="card-header">
          <span>{{ characterCardStore.characterName }}</span>
          <div class="header-actions">
            <el-button size="small" type="danger" @click="handleClear">
              清空
            </el-button>
          </div>
        </div>
      </template>

      <!-- 基本信息 -->
      <el-descriptions :column="2" border>
        <el-descriptions-item label="角色名">
          {{ characterCardStore.character.name || '未设置' }}
        </el-descriptions-item>
        <el-descriptions-item label="创建者">
          {{ characterCardStore.character.creator || '未知' }}
        </el-descriptions-item>
        <el-descriptions-item label="描述" :span="2">
          <el-text line-clamp="3">
            {{ characterCardStore.character.description || '无描述' }}
          </el-text>
        </el-descriptions-item>
        <el-descriptions-item label="性格" :span="2">
          <el-text line-clamp="2">
            {{ characterCardStore.character.personality || '无' }}
          </el-text>
        </el-descriptions-item>
        <el-descriptions-item label="场景" :span="2">
          <el-text line-clamp="2">
            {{ characterCardStore.character.scenario || '无' }}
          </el-text>
        </el-descriptions-item>
      </el-descriptions>

      <!-- 统计信息 -->
      <el-divider>统计信息</el-divider>
      <el-row :gutter="16">
        <el-col :span="6">
          <el-statistic title="世界书条目" :value="characterCardStore.worldbookCount">
            <template #suffix>
              <el-text size="small" type="info">
                ({{ characterCardStore.enabledWorldbookCount }} 启用)
              </el-text>
            </template>
          </el-statistic>
        </el-col>
        <el-col :span="6">
          <el-statistic title="正则脚本" :value="characterCardStore.regexScriptCount">
            <template #suffix>
              <el-text size="small" type="info">
                ({{ characterCardStore.enabledRegexScriptCount }} 启用)
              </el-text>
            </template>
          </el-statistic>
        </el-col>
        <el-col :span="6">
          <el-statistic title="提示词" :value="characterCardStore.promptCount">
            <template #suffix>
              <el-text size="small" type="info">
                ({{ characterCardStore.enabledPromptCount }} 启用)
              </el-text>
            </template>
          </el-statistic>
        </el-col>
        <el-col :span="6">
          <el-statistic title="AI设置" :value="aiSettingsConfigured ? '已配置' : '未配置'" />
        </el-col>
      </el-row>

      <!-- 标签页 -->
      <el-divider>详细内容</el-divider>
      <el-tabs v-model="activeTab">
        <el-tab-pane label="第一条消息" name="first_mes">
          <el-input
            v-model="characterCardStore.character.first_mes"
            type="textarea"
            :rows="6"
            placeholder="角色的第一条消息"
            @change="handleUpdate"
          />
        </el-tab-pane>

        <el-tab-pane label="消息示例" name="mes_example">
          <el-input
            v-model="characterCardStore.character.mes_example"
            type="textarea"
            :rows="10"
            placeholder="对话示例"
            @change="handleUpdate"
          />
        </el-tab-pane>

        <el-tab-pane label="AI设置" name="aiSettings">
          <AISettingsPanel />
        </el-tab-pane>

        <el-tab-pane label="世界书" name="worldbook">
          <div class="worldbook-info">
            <el-alert
              :closable="false"
              type="info"
              show-icon
            >
              <template #title>
                世界书条目: {{ characterCardStore.worldbookCount }}
                (启用: {{ characterCardStore.enabledWorldbookCount }})
              </template>
            </el-alert>
            <el-button
              type="primary"
              class="mt-3"
              @click="$emit('open-worldbook')"
            >
              管理世界书
            </el-button>
          </div>
        </el-tab-pane>

        <el-tab-pane label="正则脚本" name="regexScripts">
          <RegexScriptManager />
        </el-tab-pane>

        <el-tab-pane label="提示词" name="prompts">
          <PromptEditor />
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 未加载角色卡时的提示 -->
    <el-empty
      v-else
      description="尚未加载角色卡"
    >
      <el-button type="primary" @click="showImportDialog = true">
        导入角色卡
      </el-button>
    </el-empty>

    <!-- 导入对话框 -->
    <UnifiedImportDialog
      v-model:visible="showImportDialog"
      @imported="handleImported"
    />

    <!-- 导出对话框 -->
    <CharacterCardExportDialog
      v-model:visible="showExportDialog"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload, Download } from '@element-plus/icons-vue'
import { useCharacterCardStore } from '@/stores/character-card'
import UnifiedImportDialog from './UnifiedImportDialog.vue'
import CharacterCardExportDialog from './CharacterCardExportDialog.vue'
import AISettingsPanel from './AISettingsPanel.vue'
import RegexScriptManager from './RegexScriptManager.vue'
import PromptEditor from './PromptEditor.vue'

defineEmits<{
  openWorldbook: []
}>()

const characterCardStore = useCharacterCardStore()

const showImportDialog = ref(false)
const showExportDialog = ref(false)
const activeTab = ref('first_mes')

// 检查AI设置是否已配置
const aiSettingsConfigured = computed(() => {
  const settings = characterCardStore.aiSettings
  return settings.temperature !== 1 ||
    settings.top_p !== 0.9 ||
    settings.top_k !== 500 ||
    settings.repetition_penalty !== 1
})

// 处理更新
const handleUpdate = () => {
  // 自动保存逻辑（如果有）
}

// 处理导入完成
const handleImported = (result: any) => {
  if (result.success) {
    let msg = '导入成功！'
    if (result.characterCard?.imported) {
      msg += `\n角色: ${result.characterCard.name}`
    }
    if (result.worldbook?.imported) {
      msg += `\n世界书: ${result.worldbook.entriesCount}条`
    }
    if (result.regexScripts?.imported) {
      msg += `\n正则脚本: ${result.regexScripts.count}个`
    }
    if (result.prompts?.imported) {
      msg += `\n提示词: ${result.prompts.count}个`
    }
    ElMessage.success(msg)
  } else {
    ElMessage.error(result.errors?.join('\n') || '导入失败')
  }
}

// 清空角色卡
const handleClear = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要清空角色卡数据吗？此操作不可恢复。',
      '确认清空',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    characterCardStore.clear()
    ElMessage.success('角色卡已清空')
  } catch {
    // 用户取消
  }
}
</script>

<style scoped>
.character-card-panel {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.worldbook-info {
  padding: 16px 0;
}

.mt-3 {
  margin-top: 16px;
}
</style>