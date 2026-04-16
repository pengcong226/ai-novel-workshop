<template>
  <el-dialog
    v-model="visible"
    title="全局全量抽象替换器 (Nuclear Mutator)"
    width="600px"
    class="mutator-dialog"
    :close-on-click-modal="false"
  >
    <el-alert
      type="warning"
      show-icon
      :closable="false"
      title="高危操作警告 (☢Nuclear)"
      description="此操作将并发修改当前项目内的所有章节正文、世界书设定、人物传记文本。它无视层级、横扫全域，不可撤销，请谨慎执行。"
      style="margin-bottom: 20px"
    />

    <el-form :model="form" label-width="100px" @submit.prevent>
      <el-form-item label="查找设定词:">
        <el-input 
          v-model="form.source" 
          placeholder="例如: 练气期 / 林枫" 
          clearable 
          @input="resetScan"
          @keyup.enter="scan"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
      </el-form-item>
      
      <el-form-item label="替换为新词:">
        <el-input 
          v-model="form.target" 
          placeholder="例如: 魔法学徒 / 亚瑟" 
          clearable 
          @input="resetScan"
        >
          <template #prefix>
            <el-icon><Edit /></el-icon>
          </template>
        </el-input>
      </el-form-item>
    </el-form>

    <div v-if="scanning" class="scan-area" v-loading="true" element-loading-text="正在以光速扫描千万字全域矩阵...">
      <div style="height: 100px;"></div>
    </div>

    <div v-else-if="hasScanned" class="scan-result-container">
      <div v-if="affectedCount > 0" class="scan-result fade-in">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-statistic :value="affectedCount" title="全域命中匹配(处)" value-style="color: #f56c6c; font-weight: bold; font-size: 28px;" />
          </el-col>
          <el-col :span="12">
            <ul class="match-details">
              <li v-if="matches.chapters > 0"><el-tag size="small" type="info">正文与大纲</el-tag> {{ matches.chapters }} 处</li>
              <li v-if="matches.characters > 0"><el-tag size="small" type="success">人物卡设定</el-tag> {{ matches.characters }} 处</li>
              <li v-if="matches.worldbook > 0"><el-tag size="small" type="warning">世界书词条</el-tag> {{ matches.worldbook }} 处</li>
            </ul>
          </el-col>
        </el-row>
      </div>
      <el-empty v-else description="这片宇宙中不存在该设定词..." :image-size="60" />
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="visible = false" :disabled="replacing" round>终止取消</el-button>
        <el-button 
          v-if="!hasScanned || affectedCount === 0" 
          type="primary" 
          @click="scan" 
          :loading="scanning" 
          :disabled="!form.source || !form.target"
          round
        >
          <el-icon><Aim /></el-icon> 锁定目标
        </el-button>
        <el-button 
          v-else 
          type="danger" 
          @click="executeReplace" 
          :loading="replacing"
          round
          class="pulse-btn"
        >
          <el-icon><WarnTriangleFilled /></el-icon> 授权引爆 (执行替换)
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useSandboxStore } from '@/stores/sandbox'
import { ElMessage } from 'element-plus'
import { Search, Edit, Aim, WarnTriangleFilled } from '@element-plus/icons-vue'
import { v4 as uuidv4 } from 'uuid'

const projectStore = useProjectStore()
const sandboxStore = useSandboxStore()
const project = computed(() => projectStore.currentProject)

const visible = ref(false)
const scanning = ref(false)
const replacing = ref(false)
const hasScanned = ref(false)

const form = reactive({
  source: '',
  target: ''
})

const matches = reactive({
  chapters: 0,
  characters: 0,
  worldbook: 0
})

const affectedCount = computed(() => matches.chapters + matches.characters + matches.worldbook)

// 暴露给父组件（ProjectEditor.vue 或全局 App.vue）使用
const open = () => {
  form.source = ''
  form.target = ''
  resetScan()
  visible.value = true
}

defineExpose({ open })

const resetScan = () => {
  hasScanned.value = false
  matches.chapters = 0
  matches.characters = 0
  matches.worldbook = 0
}

const scan = async () => {
  if (!form.source || !project.value) return
  
  scanning.value = true
  resetScan()
  
  // 模拟光速检索延迟以提供安全感和反馈
  await new Promise(resolve => setTimeout(resolve, 600))
  
  const src = form.source
  const regex = new RegExp(escapeRegExp(src), 'g')
  
  const countOccurrences = (str: string | undefined) => {
    if (!str) return 0
    return (str.match(regex) || []).length
  }

  // 1. 扫描正文与章节
  project.value.chapters.forEach(c => {
    matches.chapters += countOccurrences(c.title)
    matches.chapters += countOccurrences(c.content)
    matches.chapters += countOccurrences(c.summaryData?.summary)
    matches.chapters += countOccurrences(c.summary)
  })

  // 2. 扫描人物卡 (V5: from sandbox CHARACTER entities)
  const charEntities = sandboxStore.entities.filter(e => e.type === 'CHARACTER' && !e.isArchived)
  const resolvedState = sandboxStore.activeEntitiesState
  charEntities.forEach(entity => {
    matches.characters += countOccurrences(entity.name)
    matches.characters += countOccurrences(entity.systemPrompt)
    const resolved = resolvedState[entity.id]
    if (resolved?.properties?.['appearance']) {
      matches.characters += countOccurrences(resolved.properties['appearance'])
    }
    entity.aliases.forEach(a => { matches.characters += countOccurrences(a) })
  })

  // 3. 扫描世界书 (V5: from sandbox LORE entities)
  const loreEntities = sandboxStore.entities.filter(e => e.type === 'LORE' && !e.isArchived)
  loreEntities.forEach(entity => {
    matches.worldbook += countOccurrences(entity.systemPrompt)
    entity.aliases.forEach(a => { matches.worldbook += countOccurrences(a) })
  })

  scanning.value = false
  hasScanned.value = true
}

const executeReplace = async () => {
  if (!project.value || affectedCount.value === 0) return
  
  replacing.value = true
  
  try {
    const srcRegex = new RegExp(escapeRegExp(form.source), 'g')
    const target = form.target
    
    // 执行真正的核弹级替换
    const p = project.value

    p.chapters.forEach(c => {
      if (c.title) c.title = c.title.replace(srcRegex, target)
      if (c.content) c.content = c.content.replace(srcRegex, target)
      if (c.summaryData?.summary) c.summaryData.summary = c.summaryData.summary.replace(srcRegex, target)
      if (c.summary) c.summary = c.summary.replace(srcRegex, target)
    })

    // V5: Replace in sandbox CHARACTER entities
    const charEntities = sandboxStore.entities.filter(e => e.type === 'CHARACTER' && !e.isArchived)
    const resolvedState = sandboxStore.activeEntitiesState
    for (const entity of charEntities) {
      const updates: Record<string, any> = {}
      const newName = entity.name.replace(srcRegex, target)
      if (newName !== entity.name) updates.name = newName
      const newPrompt = entity.systemPrompt.replace(srcRegex, target)
      if (newPrompt !== entity.systemPrompt) updates.systemPrompt = newPrompt
      const newAliases = entity.aliases.map(a => a.replace(srcRegex, target))
      if (JSON.stringify(newAliases) !== JSON.stringify(entity.aliases)) updates.aliases = newAliases
      // Also update appearance via StateEvent if it matches
      const resolved = resolvedState[entity.id]
      if (resolved?.properties?.['appearance']?.match(srcRegex)) {
        const newAppearance = resolved.properties['appearance'].replace(srcRegex, target)
        await sandboxStore.addStateEvent({
          id: uuidv4(),
          projectId: entity.projectId,
          chapterNumber: 0,
          entityId: entity.id,
          eventType: 'PROPERTY_UPDATE',
          payload: { key: 'appearance', value: newAppearance },
          source: 'MANUAL'
        })
      }
      if (Object.keys(updates).length > 0) {
        await sandboxStore.updateEntity(entity.id, updates)
      }
    }

    // V5: Replace in sandbox LORE entities
    const loreEntities = sandboxStore.entities.filter(e => e.type === 'LORE' && !e.isArchived)
    for (const entity of loreEntities) {
      const updates: Record<string, any> = {}
      const newName = entity.name.replace(srcRegex, target)
      if (newName !== entity.name) updates.name = newName
      const newPrompt = entity.systemPrompt.replace(srcRegex, target)
      if (newPrompt !== entity.systemPrompt) updates.systemPrompt = newPrompt
      const newAliases = entity.aliases.map(a => a.replace(srcRegex, target))
      if (JSON.stringify(newAliases) !== JSON.stringify(entity.aliases)) updates.aliases = newAliases
      if (Object.keys(updates).length > 0) {
        await sandboxStore.updateEntity(entity.id, updates)
      }
    }

    // 更新到存储层
    await projectStore.saveCurrentProject()
    
    ElMessage.success(`核弹执行完毕！全域成功替换 ${affectedCount.value} 处设定词。`)
    visible.value = false
  } catch (err: any) {
    ElMessage.error(`替换遭遇异常阻力: ${err.message}`)
  } finally {
    replacing.value = false
  }
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
</script>

<style scoped>
.scan-result-container {
  min-height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  padding: 15px;
}

.match-details {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.match-details li {
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.fade-in {
  animation: fadeIn 0.4s ease-out;
  width: 100%;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}

.pulse-btn {
  animation: pulse-danger 2s infinite;
}

@keyframes pulse-danger {
  0% { box-shadow: 0 0 0 0 rgba(245, 108, 108, 0.4); }
  70% { box-shadow: 0 0 0 8px rgba(245, 108, 108, 0); }
  100% { box-shadow: 0 0 0 0 rgba(245, 108, 108, 0); }
}
</style>
