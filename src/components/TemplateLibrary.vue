<template>
  <div class="template-library">
    <el-header class="header">
      <div class="header-content">
        <h2>模板库</h2>
        <p class="subtitle">选择模板快速开始创作</p>
      </div>
      <div class="header-actions">
        <el-input
          v-model="searchQuery"
          placeholder="搜索模板..."
          prefix-icon="Search"
          clearable
          style="width: 200px;"
        />
        <el-button type="success" @click="showAIGenerateDialog = true">
          <el-icon><MagicStick /></el-icon>
          AI生成流派模板
        </el-button>
        <el-button @click="handleImport">
          <el-icon><Upload /></el-icon>
          导入模板
        </el-button>
        <el-button @click="handleExportAll">
          <el-icon><Download /></el-icon>
          导出全部
        </el-button>
      </div>
    </el-header>

    <el-main class="main">
      <!-- 分类筛选 -->
      <div class="category-tabs">
        <el-radio-group v-model="selectedCategory" size="large">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button value="fantasy">玄幻</el-radio-button>
          <el-radio-button value="urban">都市</el-radio-button>
          <el-radio-button value="scifi">科幻</el-radio-button>
          <el-radio-button value="wuxia">武侠</el-radio-button>
          <el-radio-button value="other">其他</el-radio-button>
        </el-radio-group>
      </div>

      <!-- 模板网格 -->
      <div v-if="filteredTemplates.length === 0" class="empty">
        <el-empty description="没有找到匹配的模板">
          <el-button type="primary" @click="selectedCategory = ''; searchQuery = ''">
            清除筛选
          </el-button>
        </el-empty>
      </div>

      <div v-else class="template-grid">
        <el-card
          v-for="template in filteredTemplates"
          :key="template.meta.id"
          class="template-card"
          shadow="hover"
        >
          <template #header>
            <div class="card-header">
              <div class="title-row">
                <span class="title">{{ template.meta.name }}</span>
                <el-tag v-if="template.meta.author === 'System'" type="success" size="small">
                  内置
                </el-tag>
                <el-tag v-else type="info" size="small">
                  自定义
                </el-tag>
              </div>
              <div class="category-tag">
                <el-tag :type="getCategoryColor(template.meta.category)" size="small">
                  {{ getCategoryName(template.meta.category) }}
                </el-tag>
              </div>
            </div>
          </template>

          <div class="card-content">
            <p class="description">{{ template.meta.description }}</p>

            <div class="tags">
              <el-tag
                v-for="tag in template.meta.tags.slice(0, 3)"
                :key="tag"
                size="small"
                effect="plain"
              >
                {{ tag }}
              </el-tag>
            </div>

            <div class="stats">
              <div class="stat-item">
                <el-icon><Notebook /></el-icon>
                <span>{{ template.plotTemplate.totalChapters }} 章</span>
              </div>
              <div class="stat-item">
                <el-icon><User /></el-icon>
                <span>{{ template.characterTemplates.length }} 人物</span>
              </div>
              <div class="stat-item">
                <el-icon><Collection /></el-icon>
                <span>{{ template.plotTemplate.volumes.length }} 卷</span>
              </div>
            </div>

            <div class="style-info">
              <span class="label">风格：</span>
              <span>{{ template.styleTemplate.tone }} / {{ template.styleTemplate.narrativePerspective }}</span>
            </div>
          </div>

          <template #footer>
            <div class="card-footer">
              <el-button text @click="previewTemplate(template)">
                <el-icon><View /></el-icon>
                预览
              </el-button>
              <el-button type="primary" text @click="useTemplate(template)">
                <el-icon><Check /></el-icon>
                使用模板
              </el-button>
              <el-button
                v-if="template.meta.author !== 'System'"
                text
                type="danger"
                @click="confirmDelete(template)"
              >
                删除
              </el-button>
            </div>
          </template>
        </el-card>
      </div>
    </el-main>

    <!-- AI生成流派模板对话框 -->
    <el-dialog
      v-model="showAIGenerateDialog"
      title="AI 智能生成特定流派大纲模板"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form :model="aiGenForm" label-width="120px">
        <el-form-item label="流派/题材" required>
          <el-input v-model="aiGenForm.genre" placeholder="例如：凡人流修仙、赛博朋克黑客、克苏鲁悬疑..." />
          <div style="font-size: 12px; color: #909399; margin-top: 4px;">输入具体的流派标签，AI 将为您量身定制专属的大纲结构和世界观体系。</div>
        </el-form-item>
        <el-form-item label="预期总章数">
          <el-input-number v-model="aiGenForm.totalChapters" :min="10" :max="1000" :step="50" />
        </el-form-item>
        <el-form-item label="附加要求 (可选)">
          <el-input v-model="aiGenForm.extraPrompt" type="textarea" :rows="3" placeholder="例如：必须包含门派大比的情节，主角性格杀伐果断..." />
        </el-form-item>
      </el-form>

      <div v-if="aiGenerating" style="margin-top: 20px; text-align: center; color: #409eff;">
        <el-icon class="is-loading" style="margin-right: 8px;"><Loading /></el-icon>
        正在让大模型头脑风暴并构建模板，请稍候 (约需半分钟)...
      </div>

      <template #footer>
        <el-button @click="showAIGenerateDialog = false" :disabled="aiGenerating">取消</el-button>
        <el-button type="primary" @click="handleAIGenerate" :loading="aiGenerating">
          开始生成
        </el-button>
      </template>
    </el-dialog>

    <!-- 模板预览对话框 -->
    <el-dialog
      v-model="showPreviewDialog"
      :title="previewData?.meta.name || '模板预览'"
      width="800px"
      top="5vh"
    >
      <div v-if="previewData" class="preview-content">
        <el-tabs v-model="previewTab">
          <!-- 基本信息 -->
          <el-tab-pane label="基本信息" name="info">
            <el-descriptions :column="2" border>
              <el-descriptions-item label="模板名称">
                {{ previewData.meta.name }}
              </el-descriptions-item>
              <el-descriptions-item label="作者">
                {{ previewData.meta.author }}
              </el-descriptions-item>
              <el-descriptions-item label="版本">
                {{ previewData.meta.version }}
              </el-descriptions-item>
              <el-descriptions-item label="分类">
                {{ getCategoryName(previewData.meta.category) }}
              </el-descriptions-item>
              <el-descriptions-item label="标签" :span="2">
                <el-tag
                  v-for="tag in previewData.meta.tags"
                  :key="tag"
                  size="small"
                  style="margin-right: 5px;"
                >
                  {{ tag }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="描述" :span="2">
                {{ previewData.meta.description }}
              </el-descriptions-item>
            </el-descriptions>
          </el-tab-pane>

          <!-- 世界观设定 -->
          <el-tab-pane label="世界观" name="world">
            <el-descriptions :column="1" border>
              <el-descriptions-item label="世界名称">
                {{ previewData.worldTemplate.name || '未命名' }}
              </el-descriptions-item>
              <el-descriptions-item label="时代背景">
                {{ previewData.worldTemplate.era?.time || '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="科技水平">
                {{ previewData.worldTemplate.era?.techLevel || '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="社会形态">
                {{ previewData.worldTemplate.era?.socialForm || '-' }}
              </el-descriptions-item>
            </el-descriptions>

            <div v-if="previewData.worldTemplate.powerSystem" class="preview-section">
              <h4>力量体系：{{ previewData.worldTemplate.powerSystem.name }}</h4>
              <div class="power-levels">
                <el-tag
                  v-for="(level, index) in previewData.worldTemplate.powerSystem.levels"
                  :key="index"
                  type="primary"
                  effect="plain"
                  style="margin: 5px;"
                >
                  {{ level.name }}：{{ level.description }}
                </el-tag>
              </div>
            </div>

            <div v-if="previewData.worldTemplate.factions?.length" class="preview-section">
              <h4>势力设定</h4>
              <el-collapse>
                <el-collapse-item
                  v-for="faction in previewData.worldTemplate.factions"
                  :key="faction.id"
                  :title="faction.name"
                >
                  <p><strong>类型：</strong>{{ faction.type }}</p>
                  <p><strong>描述：</strong>{{ faction.description }}</p>
                </el-collapse-item>
              </el-collapse>
            </div>
          </el-tab-pane>

          <!-- 人物模板 -->
          <el-tab-pane label="人物模板" name="characters">
            <div class="characters-list">
              <el-card
                v-for="char in previewData.characterTemplates"
                :key="char.template.name"
                class="character-card"
              >
                <template #header>
                  <div class="char-header">
                    <span class="char-name">{{ char.template.name || '未命名' }}</span>
                    <el-tag :type="getRoleType(char.role)" size="small">
                      {{ getRoleName(char.role) }}
                    </el-tag>
                  </div>
                </template>
                <p class="char-desc">{{ char.description }}</p>
                <div class="char-details">
                  <p v-if="char.template.background">
                    <strong>背景：</strong>{{ char.template.background }}
                  </p>
                  <p v-if="char.template.motivation">
                    <strong>动机：</strong>{{ char.template.motivation }}
                  </p>
                  <p v-if="char.template.personality?.length">
                    <strong>性格：</strong>{{ char.template.personality.join('、') }}
                  </p>
                </div>
              </el-card>
            </div>
          </el-tab-pane>

          <!-- 大纲结构 -->
          <el-tab-pane label="大纲结构" name="outline">
            <div class="outline-info">
              <el-descriptions :column="2" border>
                <el-descriptions-item label="故事结构">
                  {{ previewData.plotTemplate.structure }}
                </el-descriptions-item>
                <el-descriptions-item label="总章节数">
                  {{ previewData.plotTemplate.totalChapters }} 章
                </el-descriptions-item>
                <el-descriptions-item label="故事简介" :span="2">
                  {{ previewData.plotTemplate.description }}
                </el-descriptions-item>
              </el-descriptions>

              <div class="volumes-section">
                <h4>卷结构</h4>
                <el-timeline>
                  <el-timeline-item
                    v-for="volume in previewData.plotTemplate.volumes"
                    :key="volume.number"
                    :timestamp="`第${volume.chapterRange.start}-${volume.chapterRange.end}章`"
                    placement="top"
                  >
                    <el-card>
                      <h5>{{ volume.title }}</h5>
                      <p class="volume-theme">主题：{{ volume.theme }}</p>
                      <div class="volume-events">
                        <strong>主要事件：</strong>
                        <ul>
                          <li v-for="(event, index) in volume.mainEvents" :key="index">
                            {{ event }}
                          </li>
                        </ul>
                      </div>
                    </el-card>
                  </el-timeline-item>
                </el-timeline>
              </div>
            </div>
          </el-tab-pane>

          <!-- 风格设置 -->
          <el-tab-pane label="风格设置" name="style">
            <el-descriptions :column="2" border>
              <el-descriptions-item label="基调">
                {{ previewData.styleTemplate.tone }}
              </el-descriptions-item>
              <el-descriptions-item label="叙事视角">
                {{ previewData.styleTemplate.narrativePerspective }}
              </el-descriptions-item>
              <el-descriptions-item label="对话风格">
                {{ previewData.styleTemplate.dialogueStyle }}
              </el-descriptions-item>
              <el-descriptions-item label="描写详细度">
                {{ previewData.styleTemplate.descriptionLevel }}
              </el-descriptions-item>
              <el-descriptions-item v-if="previewData.styleTemplate.writingStyle" label="自定义风格" :span="2">
                {{ previewData.styleTemplate.writingStyle }}
              </el-descriptions-item>
            </el-descriptions>
          </el-tab-pane>

          <!-- 示例章节 -->
          <el-tab-pane
            v-if="previewData.exampleChapters?.length"
            label="示例章节"
            name="examples"
          >
            <el-collapse>
              <el-collapse-item
                v-for="(chapter, index) in previewData.exampleChapters"
                :key="index"
                :title="chapter.title"
              >
                <div class="example-content">
                  {{ chapter.content }}
                </div>
              </el-collapse-item>
            </el-collapse>
          </el-tab-pane>
        </el-tabs>
      </div>

      <template #footer>
        <el-button @click="showPreviewDialog = false">关闭</el-button>
        <el-button type="primary" @click="useTemplate(previewData)">
          使用此模板
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Upload,
  Download,
  Notebook,
  User,
  Collection,
  View,
  Check,
  MagicStick,
  Loading
} from '@element-plus/icons-vue'
import { templateManager } from '@/utils/templateManager'
import type { NovelTemplate, TemplateCategory } from '@/types'
import { v4 as uuidv4 } from 'uuid'

const emit = defineEmits<{
  useTemplate: [template: NovelTemplate]
}>()

const templates = ref<NovelTemplate[]>([])
const selectedCategory = ref<TemplateCategory | ''>('')
const searchQuery = ref('')
const showPreviewDialog = ref(false)
const showAIGenerateDialog = ref(false)
const aiGenerating = ref(false)
const aiGenForm = ref({
  genre: '',
  totalChapters: 200,
  extraPrompt: ''
})
const previewData = ref<NovelTemplate | null>(null)
const previewTab = ref('info')

// 过滤模板
const filteredTemplates = computed(() => {
  let result = templates.value

  // 按分类过滤
  if (selectedCategory.value) {
    result = result.filter(t => t.meta.category === selectedCategory.value)
  }

  // 按搜索词过滤
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(t =>
      t.meta.name.toLowerCase().includes(query) ||
      t.meta.description.toLowerCase().includes(query) ||
      t.meta.tags.some(tag => tag.toLowerCase().includes(query))
    )
  }

  return result
})

// 加载模板
onMounted(() => {
  loadTemplates()
})

function loadTemplates() {
  templates.value = templateManager.getAllTemplates()
}

// 获取分类名称
function getCategoryName(category: TemplateCategory): string {
  const names: Record<TemplateCategory, string> = {
    fantasy: '玄幻',
    urban: '都市',
    scifi: '科幻',
    wuxia: '武侠',
    history: '历史',
    other: '其他'
  }
  return names[category] || category
}

// 获取分类颜色
function getCategoryColor(category: TemplateCategory): string {
  const colors: Record<TemplateCategory, string> = {
    fantasy: 'primary',
    urban: 'warning',
    scifi: 'info',
    wuxia: 'danger',
    history: 'success',
    other: ''
  }
  return colors[category] || ''
}

// 获取角色类型
function getRoleType(role: string): string {
  const types: Record<string, string> = {
    protagonist: 'primary',
    supporting: 'success',
    antagonist: 'danger'
  }
  return types[role] || 'info'
}

// 获取角色名称
function getRoleName(role: string): string {
  const names: Record<string, string> = {
    protagonist: '主角',
    supporting: '配角',
    antagonist: '反派'
  }
  return names[role] || role
}

async function handleAIGenerate() {
  if (!aiGenForm.value.genre.trim()) {
    ElMessage.warning('请输入流派/题材')
    return
  }

  aiGenerating.value = true
  try {
    const { useAIStore } = await import('@/stores/ai')
    const aiStore = useAIStore()
    if (!aiStore.checkInitialized()) {
      ElMessage.warning('请先配置AI模型提供商')
      return
    }

    const prompt = `你是一个网文领域的大师级主编和架构师。请为一个全新的小说流派【${aiGenForm.value.genre}】生成一个完整的大纲模板。
目标总章数：约 ${aiGenForm.value.totalChapters} 章。
${aiGenForm.value.extraPrompt ? '附加要求：' + aiGenForm.value.extraPrompt : ''}

你需要输出一个JSON对象，完全符合以下结构：
{
  "name": "模板名称，如：凡人流修仙经典模板",
  "description": "这个流派模板的特点和核心爽点说明",
  "tags": ["流派标签1", "流派标签2"],
  "worldTemplate": {
    "name": "典型世界名称",
    "era": { "time": "时代背景", "techLevel": "科技/生产力水平", "socialForm": "社会形态" },
    "powerSystem": {
      "name": "力量体系名称",
      "levels": [
        { "name": "等级1", "description": "描述" }
      ]
    },
    "factions": [
      { "name": "势力名称", "type": "类型", "description": "描述" }
    ]
  },
  "plotTemplate": {
    "structure": "故事结构说明",
    "description": "整体情节主线规划",
    "totalChapters": ${aiGenForm.value.totalChapters},
    "volumes": [
      {
        "number": 1,
        "title": "第一卷卷名",
        "theme": "本卷核心主题和目标",
        "chapterRange": { "start": 1, "end": 20 },
        "mainEvents": ["关键事件1（铺垫）", "关键事件2（冲突）", "关键事件3（高潮）"],
        "plotPoints": ["情节点1", "情节点2"]
      }
    ]
  },
  "characterTemplates": [
    {
      "role": "protagonist",
      "description": "主角的典型人设",
      "template": {
        "name": "男主/女主",
        "personality": ["性格1", "性格2"],
        "motivation": "核心驱动力"
      }
    }
  ],
  "styleTemplate": {
    "tone": "基调（如：轻松、严肃、黑暗）",
    "narrativePerspective": "视角（如：第三人称）",
    "dialogueStyle": "对话风格",
    "descriptionLevel": "描写详细度"
  }
}

请只返回一段纯净的 JSON 代码，不要添加任何额外的 Markdown 格式（如 \`\`\`json）或人类解释文字。`

    const response = await aiStore.chat(
      [{ role: 'user', content: prompt }], 
      { type: 'planning', complexity: 'high', priority: 'quality' }, 
      { maxTokens: 4000 }
    )

    let jsonStr = response.content.trim()
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonMatch) jsonStr = jsonMatch[1]
    
    // Fallback: remove markdown block if AI still generated it
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim()
    }

    const parsed = JSON.parse(jsonStr)

    const newTemplate: NovelTemplate = {
      meta: {
        id: uuidv4(),
        name: parsed.name || `${aiGenForm.value.genre} 模板`,
        version: '1.0.0',
        author: 'AI Generated',
        description: parsed.description || `由 AI 自动生成的 ${aiGenForm.value.genre} 流派模板`,
        tags: parsed.tags || [aiGenForm.value.genre],
        category: 'other',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      worldTemplate: parsed.worldTemplate || {},
      characterTemplates: parsed.characterTemplates || [],
      plotTemplate: parsed.plotTemplate || {
        structure: '自由结构',
        totalChapters: aiGenForm.value.totalChapters,
        description: '',
        volumes: []
      },
      styleTemplate: parsed.styleTemplate || {
        tone: '常规',
        narrativePerspective: '第三人称',
        dialogueStyle: '常规',
        descriptionLevel: '适中'
      },
      promptTemplates: {
        worldGeneration: '',
        characterGeneration: '',
        chapterGeneration: ''
      }
    }

    templateManager.saveTemplate(newTemplate)
    loadTemplates()
    
    ElMessage.success('AI 专属流派模板生成并保存成功！')
    showAIGenerateDialog.value = false
    aiGenForm.value.genre = ''
  } catch (error) {
    console.error('AI生成模板失败:', error)
    ElMessage.error('生成失败：' + (error as Error).message)
  } finally {
    aiGenerating.value = false
  }
}

// 预览模板
function previewTemplate(template: NovelTemplate) {
  previewData.value = template
  previewTab.value = 'info'
  showPreviewDialog.value = true
}

// 使用模板
function useTemplate(template: NovelTemplate) {
  showPreviewDialog.value = false
  emit('useTemplate', template)
}

// 删除模板
async function confirmDelete(template: NovelTemplate) {
  try {
    await ElMessageBox.confirm(
      `确定要删除模板"${template.meta.name}"吗？此操作不可恢复。`,
      '删除模板',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const success = templateManager.deleteTemplate(template.meta.id)
    if (success) {
      loadTemplates()
      ElMessage.success('删除成功')
    } else {
      ElMessage.warning('内置模板无法删除')
    }
  } catch {
    // 用户取消
  }
}

// 导入模板
async function handleImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'

  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const success = templateManager.importTemplate(text)
      if (success) {
        loadTemplates()
        ElMessage.success('导入成功')
      } else {
        ElMessage.error('导入失败，文件格式错误')
      }
    } catch (error) {
      ElMessage.error('导入失败：' + (error as Error).message)
    }
  }

  input.click()
}

// 导出全部模板
function handleExportAll() {
  const userTemplates = templates.value.filter(t => t.meta.author !== 'System')
  if (userTemplates.length === 0) {
    ElMessage.warning('没有可导出的自定义模板')
    return
  }

  const data = JSON.stringify(userTemplates, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `templates-${Date.now()}.json`
  a.click()

  URL.revokeObjectURL(url)
  ElMessage.success('导出成功')
}
</script>

<style scoped>
.template-library {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: #f5f7fa;
}

.header {
  background: white;
  border-bottom: 1px solid #e4e7ed;
  padding: 20px 40px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.header-content h2 {
  margin: 0;
  font-size: 20px;
  color: #303133;
}

.header-content .subtitle {
  margin: 5px 0 0;
  font-size: 14px;
  color: #909399;
}

.header-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.main {
  flex: 1;
  padding: 20px 40px;
  overflow-y: auto;
}

.category-tabs {
  margin-bottom: 20px;
  display: flex;
  justify-content: center;
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 300px;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 20px;
}

.template-card {
  cursor: pointer;
  transition: all 0.3s;
}

.template-card:hover {
  transform: translateY(-5px);
}

.card-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title-row .title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.category-tag {
  display: flex;
  justify-content: flex-start;
}

.card-content {
  padding: 10px 0;
}

.description {
  color: #606266;
  font-size: 14px;
  line-height: 1.6;
  margin-bottom: 15px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 15px;
}

.stats {
  display: flex;
  gap: 20px;
  margin-bottom: 15px;
  padding: 10px;
  background: #f5f7fa;
  border-radius: 4px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
  color: #606266;
}

.style-info {
  font-size: 14px;
  color: #909399;
}

.style-info .label {
  color: #606266;
}

.card-footer {
  display: flex;
  justify-content: flex-end;
  gap: 5px;
}

/* 预览对话框样式 */
.preview-content {
  max-height: 60vh;
  overflow-y: auto;
}

.preview-section {
  margin-top: 20px;
}

.preview-section h4 {
  margin-bottom: 10px;
  color: #303133;
}

.power-levels {
  display: flex;
  flex-wrap: wrap;
}

.characters-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.character-card {
  margin-bottom: 0;
}

.char-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.char-name {
  font-weight: 600;
  font-size: 16px;
}

.char-desc {
  color: #606266;
  margin-bottom: 10px;
}

.char-details p {
  margin: 8px 0;
  font-size: 14px;
  color: #606266;
}

.outline-info {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.volumes-section h4 {
  margin-bottom: 15px;
}

.volume-theme {
  color: #909399;
  margin: 5px 0;
}

.volume-events {
  margin-top: 10px;
}

.volume-events ul {
  margin: 5px 0 0;
  padding-left: 20px;
}

.volume-events li {
  margin: 5px 0;
  color: #606266;
}

.example-content {
  white-space: pre-wrap;
  line-height: 1.8;
  color: #606266;
}
</style>
