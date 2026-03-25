<template>
  <div class="chapters">
    <el-card class="header-card">
      <div class="header">
        <h2>章节管理</h2>
        <div class="actions">
          <el-button @click="validateChapters" :loading="validating">
            <el-icon><CircleCheck /></el-icon>
            验证章节
          </el-button>
          <el-dropdown @command="handleExportCommand" style="margin-right: 10px;">
            <el-button>
              <el-icon><Download /></el-icon>
              导出
              <el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="exportAllMarkdown">
                  导出全部 (Markdown)
                </el-dropdown-item>
                <el-dropdown-item command="exportAllPdf">
                  导出全部 (PDF)
                </el-dropdown-item>
                <el-dropdown-item command="exportAllJson">
                  导出全部 (JSON)
                </el-dropdown-item>
                <el-dropdown-item divided command="exportSettings">
                  导出设置...
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button type="primary" @click="startBatchGeneration">
            <el-icon><MagicStick /></el-icon>
            批量生成
          </el-button>
          <el-button @click="addChapter">
            <el-icon><Plus /></el-icon>
            新建章节
          </el-button>
        </div>
      </div>
    </el-card>

    <div class="content">
      <!-- 后台运行的迷你进度条 -->
      <div v-if="batchGenerating && isBatchBackground" style="margin-bottom: 20px; padding: 15px; background-color: #f0f9ff; border-radius: 8px; border: 1px solid #c6e2ff;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <span style="color: #409eff; font-weight: bold;">
            <el-icon class="is-loading" style="margin-right: 5px;"><Loading /></el-icon>
            批量生成后台运行中... (第 {{ batchCurrent }} / {{ batchForm.count }} 章)
          </span>
          <el-button size="small" type="danger" plain @click="cancelBatchGeneration">终止生成</el-button>
        </div>
        <el-progress :percentage="batchProgress" :format="() => `${batchProgress}%`" />
      </div>

      <el-empty v-if="chapters.length === 0" description="还没有章节">
        <el-button type="primary" @click="addChapter">创建第一章</el-button>
      </el-empty>

      <!-- 章节列表 -->
      <div v-else class="chapters-container">
        <div class="chapters-list">
          <el-card
            v-for="chapter in chapters"
            :key="chapter.id"
            class="chapter-card"
          >
            <div class="chapter-header">
              <div class="chapter-info">
                <span class="chapter-number">第{{ chapter.number }}章</span>
                <span class="chapter-title">{{ chapter.title }}</span>
                <el-tag :type="getStatusType(chapter.status)" size="small">
                  {{ getStatusText(chapter.status) }}
                </el-tag>
                <el-tag v-if="chapter.generatedBy === 'ai'" type="success" size="small">
                  AI生成
                </el-tag>
              </div>
              <div class="chapter-stats">
                <span class="stat">{{ chapter.wordCount }}字</span>
                <span class="stat">{{ formatDate(chapter.generationTime) }}</span>
              </div>
            </div>

            <el-divider />

            <div class="chapter-content">
              <div class="content-preview">
                {{ getContentPreview(chapter.content) }}
              </div>
            </div>

            <div class="chapter-actions">
              <el-button type="primary" size="small" @click="editChapter(chapter)">
                编辑
              </el-button>
              <el-dropdown size="small" @command="(cmd: string) => handleChapterExport(chapter, cmd)">
                <el-button size="small">
                  导出 <el-icon class="el-icon--right"><ArrowDown /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="markdown">Markdown</el-dropdown-item>
                    <el-dropdown-item command="pdf">PDF</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <el-button size="small" @click="regenerateChapter(chapter)">
                重新生成
              </el-button>
              <el-button size="small" @click="viewCheckpoints(chapter)">
                检查点
              </el-button>

              <!-- 插件工具栏按钮 -->
              <el-button
                v-for="button in pluginToolbarButtons"
                :key="button.id"
                size="small"
                @click="button.handler({ chapter, content: chapter.content })"
              >
                <el-icon v-if="button.icon">
                  <component :is="button.icon" />
                </el-icon>
                {{ button.label }}
              </el-button>

              <el-button type="danger" size="small" @click="confirmDeleteChapter(chapter)">
                删除
              </el-button>
            </div>

            <div v-if="chapter.qualityScore" class="quality-score">
              质量评分: {{ chapter.qualityScore }}/10
            </div>
          </el-card>
        </div>
      </div>
    </div>

    <!-- 章节编辑对话框 -->
    <el-dialog
      v-model="showEditDialog"
      :title="editingChapter ? `编辑第${editingChapter.number}章` : '新建章节'"
      width="80%"
      :close-on-click-modal="false"
      top="5vh"
    >
      <el-tabs v-model="editActiveTab">
        <el-tab-pane label="基本信息" name="basic">
          <el-form :model="chapterForm" label-width="100px">
            <el-form-item label="章节号">
              <el-input-number v-model="chapterForm.number" :min="1" />
            </el-form-item>

            <el-form-item label="章节标题">
              <el-input v-model="chapterForm.title" placeholder="章节标题" />
            </el-form-item>

            <el-form-item label="生成方式">
              <el-radio-group v-model="chapterForm.generatedBy">
                <el-radio value="ai">AI生成</el-radio>
                <el-radio value="manual">手动编写</el-radio>
                <el-radio value="hybrid">混合模式</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="章节内容" name="content">
          <div class="editor-section">
            <div class="editor-toolbar">
              <el-button @click="generateContent" :loading="generating">
                <el-icon><MagicStick /></el-icon>
                AI生成
              </el-button>
              <el-checkbox v-model="autoUpdateSettings" style="margin-right: 10px">生成后提取设定</el-checkbox>
              <span v-if="generating" style="color: #409eff; font-size: 13px;">{{ generationStatus }}</span>
              <el-button @click="optimizeContent">优化内容</el-button>
              <el-button @click="checkQuality">质量检查</el-button>
              <span class="word-count">字数: {{ chapterForm.content.length }}</span>
              <span class="word-count" :style="{ color: saveStatusColor }">{{ saveStatusText }}</span>
            </div>
            <el-input
              v-model="chapterForm.content"
              type="textarea"
              :rows="20"
              placeholder="章节内容"
              @keydown="handleEditorKeydown"
            />
          </div>
        </el-tab-pane>

        <el-tab-pane label="AI建议" name="suggestions">
          <div v-if="chapterForm.aiSuggestions && chapterForm.aiSuggestions.length > 0" class="suggestions-list">
            <el-card
              v-for="(suggestion, index) in chapterForm.aiSuggestions"
              :key="index"
              class="suggestion-item"
            >
              {{ suggestion }}
            </el-card>
          </div>
          <el-empty v-else description="还没有AI建议" />
        </el-tab-pane>
      </el-tabs>

      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button @click="saveCheckpoint" v-if="editingChapter">保存检查点</el-button>
        <el-button type="primary" @click="saveChapter" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 检查点对话框 -->
    <el-dialog
      v-model="showCheckpointsDialog"
      title="章节检查点"
      width="70%"
    >
      <div v-if="selectedChapter && selectedChapter.checkpoints.length > 0" class="checkpoints-list">
        <el-card
          v-for="(checkpoint, index) in selectedChapter.checkpoints"
          :key="checkpoint.id"
          class="checkpoint-item"
        >
          <div class="checkpoint-header">
            <span>检查点 {{ index + 1 }}</span>
            <span class="checkpoint-time">{{ formatDate(checkpoint.timestamp) }}</span>
            <span v-if="checkpoint.description" class="checkpoint-desc">{{ checkpoint.description }}</span>
          </div>
          <el-divider />
          <div class="checkpoint-content">
            {{ getContentPreview(checkpoint.content, 200) }}
          </div>
          <div class="checkpoint-actions">
            <el-button size="small" @click="restoreCheckpoint(checkpoint)">恢复到此版本</el-button>
            <el-button type="danger" size="small" @click="deleteCheckpoint(checkpoint)">删除</el-button>
          </div>
        </el-card>
      </div>
      <el-empty v-else description="还没有检查点" />
    </el-dialog>

    <!-- 质量报告对话框 -->
    <el-dialog
      v-model="showQualityDialog"
      title="质量检查报告"
      width="70%"
      top="5vh"
    >
      <div v-if="currentQualityReport" class="quality-report-dialog">
        <el-row :gutter="20">
          <el-col :span="8">
            <el-statistic title="总体评分" :value="currentQualityReport.overallScore" :precision="1">
              <template #suffix>/ 10</template>
            </el-statistic>
          </el-col>
          <el-col :span="8">
            <el-statistic title="问题数量" :value="getTotalIssues(currentQualityReport)" />
          </el-col>
          <el-col :span="8">
            <el-statistic title="改进建议" :value="currentQualityReport.improvements.length" />
          </el-col>
        </el-row>

        <el-divider />

        <el-tabs v-model="qualityReportTab">
          <el-tab-pane label="维度评分" name="dimensions">
            <el-row :gutter="20">
              <el-col
                v-for="dim in currentQualityReport.dimensions"
                :key="dim.name"
                :span="12"
              >
                <el-card class="quality-dimension-card" shadow="hover">
                  <div class="dimension-header">
                    <span class="dimension-name">{{ dim.name }}</span>
                    <el-progress
                      :percentage="dim.score * 10"
                      :color="getScoreColor(dim.score)"
                      :format="() => dim.score.toFixed(1)"
                    />
                  </div>

                  <div v-if="dim.issues.length > 0" class="dimension-issues">
                    <el-tag
                      v-for="(issue, idx) in dim.issues.slice(0, 3)"
                      :key="idx"
                      :type="issue.type === 'error' ? 'danger' : issue.type === 'warning' ? 'warning' : 'info'"
                      size="small"
                      style="margin-right: 4px; margin-bottom: 4px;"
                    >
                      {{ issue.message }}
                    </el-tag>
                  </div>
                </el-card>
              </el-col>
            </el-row>
          </el-tab-pane>

          <el-tab-pane label="问题详情" name="issues">
            <el-timeline>
              <el-timeline-item
                v-for="(dim, dimIdx) in currentQualityReport.dimensions"
                :key="dimIdx"
                :type="dim.score < 6 ? 'danger' : dim.score < 8 ? 'warning' : 'success'"
                :title="dim.name"
              >
                <div v-if="dim.issues.length > 0">
                  <h4>{{ dim.name }} ({{ dim.score.toFixed(1) }}/10)</h4>
                  <ul>
                    <li v-for="(issue, issueIdx) in dim.issues" :key="Number(issueIdx)">
                      <el-tag
                        :type="issue.type === 'error' ? 'danger' : issue.type === 'warning' ? 'warning' : 'info'"
                        size="small"
                      >
                        {{ issue.type === 'error' ? '错误' : issue.type === 'warning' ? '警告' : '提示' }}
                      </el-tag>
                      {{ issue.message }}
                    </li>
                  </ul>
                </div>
              </el-timeline-item>
            </el-timeline>
          </el-tab-pane>

          <el-tab-pane label="改进建议" name="improvements">
            <el-timeline>
              <el-timeline-item
                v-for="(improvement, idx) in currentQualityReport.improvements"
                :key="idx"
                :type="Number(idx) < 3 ? 'primary' : 'info'"
              >
                {{ improvement }}
              </el-timeline-item>
            </el-timeline>
          </el-tab-pane>
        </el-tabs>
      </div>

      <template #footer>
        <el-button @click="showQualityDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 批量生成对话框 -->
    <el-dialog
      v-model="showBatchDialog"
      title="批量生成章节"
      width="600px"
      :close-on-click-modal="false"
      :show-close="!batchGenerating"
    >
      <el-form :model="batchForm" label-width="120px">
        <el-form-item label="起始章节">
          <el-input-number v-model="batchForm.startChapter" :min="1" />
        </el-form-item>

        <el-form-item label="生成数量">
          <el-input-number v-model="batchForm.count" :min="1" :max="100" />
        </el-form-item>

        <el-form-item label="生成模式">
          <el-radio-group v-model="batchForm.mode">
            <el-radio value="realtime">实时生成</el-radio>
            <el-radio value="batch">批量生成</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="自动保存">
          <el-switch v-model="batchForm.autoSave" />
        </el-form-item>

        <el-form-item label="提取设定">
          <el-switch v-model="batchForm.autoUpdateSettings" />
          <span style="margin-left: 10px; font-size: 12px; color: #909399;">生成后自动更新人物/关系图/表格记忆</span>
        </el-form-item>
      </el-form>

      <div v-if="batchGenerating" class="batch-progress">
        <el-progress :percentage="batchProgress" :format="() => `${batchProgress}%`" />
        <div class="progress-text">
          正在生成第 {{ batchCurrent }} / {{ batchForm.count }} 章
        </div>
        <div class="progress-text" style="color: #409eff; font-size: 13px;">
          {{ batchStatusText }}
        </div>
      </div>

      <template #footer>
        <template v-if="!batchGenerating">
          <el-button @click="showBatchDialog = false">取消</el-button>
          <el-button type="primary" @click="executeBatchGeneration">
            开始生成
          </el-button>
        </template>
        <template v-else>
          <el-button type="danger" @click="cancelBatchGeneration">终止生成</el-button>
          <el-button type="primary" plain @click="runBatchInBackground">后台运行</el-button>
        </template>
      </template>
    </el-dialog>

    <!-- 导出设置对话框 -->
    <ExportSettings
      v-model="showExportSettings"
      :project="project"
      :chapters="chapters"
      :selected-chapter="exportChapter"
      :export-mode="exportMode"
      @exported="handleExportComplete"
    />

    <!-- 章节验证对话框 -->
    <el-dialog
      v-model="showValidationDialog"
      title="章节验证结果"
      width="600px"
    >
      <div v-if="validationIssues.length === 0" class="validation-success">
        <el-result
          icon="success"
          title="验证通过"
          sub-title="所有章节结构正常，未发现问题"
        />
      </div>

      <div v-else class="validation-issues">
        <el-alert
          type="warning"
          :closable="false"
          show-icon
          style="margin-bottom: 20px;"
        >
          <template #title>
            发现 {{ validationIssues.length }} 个问题
          </template>
        </el-alert>

        <el-card shadow="never" style="max-height: 400px; overflow-y: auto;">
          <div v-for="(issue, index) in validationIssues" :key="index" style="margin-bottom: 10px;">
            <el-tag type="warning" size="small">{{ index + 1 }}</el-tag>
            <span style="margin-left: 10px;">{{ issue }}</span>
          </div>
        </el-card>

        <div style="margin-top: 20px; color: #909399; font-size: 13px;">
          <el-icon><InfoFilled /></el-icon>
          这些问题通常不影响阅读，可在后续编辑中逐步修正
        </div>
      </div>

      <template #footer>
        <el-button @click="showValidationDialog = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import { useProjectStore } from '@/stores/project'
import { usePluginStore } from '@/stores/plugin'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, MagicStick, Download, ArrowDown, CircleCheck } from '@element-plus/icons-vue'
import { v4 as uuidv4 } from 'uuid'
import type { Chapter, Checkpoint } from '@/types'
import ExportSettings from './ExportSettings.vue'
import {
  exportChapterToMarkdown,
  exportAllChaptersToMarkdown,
  DEFAULT_MD_OPTIONS,
} from '@/utils/markdownExporter'
import {
  exportChapterToPdf,
  exportAllChaptersToPdf,
  DEFAULT_PDF_OPTIONS,
} from '@/utils/pdfExporter'
import { saveAs } from 'file-saver'
import { extractCharactersFromChapters, convertToCharacters, analyzeRelationships } from '@/utils/characterExtractor'
import { importMemory, exportMemory, updateMemoryFromChapter } from '@/utils/tableMemory'
import { mergeSystemPrompts } from '@/utils/systemPrompts'
import type { ChatMessage } from '@/types/ai'

const projectStore = useProjectStore()
const pluginStore = usePluginStore()
const project = computed(() => projectStore.currentProject)
const chapters = computed(() => project.value?.chapters || [])

// 获取插件提供的工具栏按钮
const pluginToolbarButtons = computed(() => {
  return pluginStore.getToolbarButtons().filter(btn => btn.location === 'chapter-editor')
})

const showEditDialog = ref(false)
const editingChapter = ref<Chapter | null>(null)
const saving = ref(false)
const generating = ref(false)
const generationStatus = ref('')
const autoUpdateSettings = ref(true)
const editActiveTab = ref('basic')
const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

const chapterForm = ref<Chapter>({
  id: '',
  number: 1,
  title: '',
  content: '',
  wordCount: 0,
  outline: {
    chapterId: '',
    title: '',
    scenes: [],
    characters: [],
    location: '',
    goals: [],
    conflicts: [],
    resolutions: [],
    foreshadowingToPlant: [],
    foreshadowingToResolve: [],
    status: 'planned'
  },
  status: 'draft',
  generatedBy: 'ai',
  generationTime: new Date(),
  checkpoints: [],
  aiSuggestions: []
})

const showCheckpointsDialog = ref(false)
const selectedChapter = ref<Chapter | null>(null)

const showBatchDialog = ref(false)
const batchGenerating = ref(false)
const batchProgress = ref(0)
const batchCurrent = ref(0)
const batchStatusText = ref('')
const isBatchBackground = ref(false)
const isBatchCancelled = ref(false)
const batchForm = ref({
  startChapter: 1,
  count: 10,
  mode: 'realtime',
  autoSave: true,
  autoUpdateSettings: true
})

let extractionQueue = Promise.resolve()

function runExtractionInBackground(chapter: Chapter) {
  extractionQueue = extractionQueue.then(async () => {
    try {
      await updateProjectSettings(chapter)
      await projectStore.saveCurrentProject() // 保存提取后的设定
      ElMessage({
        message: `第${chapter.number}章 设定自动提取完成`,
        type: 'success',
        duration: 3000
      })
    } catch (err) {
      ElMessage({
        message: `第${chapter.number}章 设定提取失败`,
        type: 'error',
        duration: 3000
      })
    }
  })
}

async function updateProjectSettings(chapter: Chapter) {
  if (!project.value) return;

  try {
    // 1. 提取人物并合并 (完全免费且秒级的本地正则提取)
    const charResult = await extractCharactersFromChapters([{ content: chapter.content, title: chapter.title }]);
    if (charResult && charResult.characters.length > 0) {
      const newChars = convertToCharacters(charResult.characters);
      newChars.forEach(nc => {
        const existing = project.value!.characters.find(c => c.name === nc.name);
        if (!existing) {
          project.value!.characters.push({
            id: uuidv4(),
            ...nc,
            aiGenerated: true
          } as any);
        }
      });
      
      // 增量分析并更新关系图
      const allText = project.value.chapters.map(c => c.content).join('\n\n');
      const extChars = project.value.characters.map(c => ({ name: c.name } as any));
      const relations = analyzeRelationships(allText, extChars);
      
      relations.forEach(rel => {
        const sourceChar = project.value!.characters.find(c => c.name === rel.from);
        const targetChar = project.value!.characters.find(c => c.name === rel.to);
        if (sourceChar && targetChar) {
          const existingRel = sourceChar.relationships.find(r => r.targetId === targetChar.id);
          if (!existingRel) {
            sourceChar.relationships.push({
              targetId: targetChar.id,
              type: 'other',
              description: '共现关系',
              evolution: []
            });
          }
        }
      });
    }

    // 2. 提取表格记忆指令并更新
    if (project.value.memory) {
      let memorySystem = importMemory(project.value.memory);
      
      const aiExtractFunction = async (content: string, memory: any) => {
        const { useAIStore } = await import('@/stores/ai');
        const aiStore = useAIStore();
        if (!aiStore.checkInitialized()) return [];
        
        const prompts = mergeSystemPrompts(project.value!.config?.systemPrompts);
        
        // 构建当前激活表的提示词
        const tablesText = memory.sheets.filter((s: any) => s.enable && s.tochat).map((s: any) => {
          return `表名: ${s.name}\n列: ${s.hashSheet[0].map((id: string) => s.cells.get(id)?.value || '').join(',')}`;
        }).join('\n\n');
        
        if (!tablesText) return [];

        const prompt = `分析以下小说章节内容，如果有需要更新到表格的状态变化、新物品、新人物等，请输出更新命令。

【严格输出格式】
每行必须是一条独立的命令，且必须以 "表名:" 开头！不要输出任何其他废话和Markdown标记！
正确示例：
角色状态:updateRow(1, "林风", "剑修", "山洞", "重伤", "铁剑")
物品列表:insertRow("生锈铁剑", "普通", "在山洞中捡到")

当前存在的表格结构：
${tablesText}

章节内容：
${content}`;
        
        const messages: ChatMessage[] = [
          { role: 'system', content: prompts.memory },
          { role: 'user', content: prompt }
        ];
        
        try {
          const res = await aiStore.chat(messages, { type: 'check', complexity: 'low', priority: 'speed' }, { maxTokens: 1000 });
          return res.content.split('\n').filter(line => line.trim().length > 0);
        } catch (err) {
          console.warn('提取记忆表更新命令失败', err);
          return [];
        }
      };

      memorySystem = await updateMemoryFromChapter(memorySystem, chapter, aiExtractFunction);
      project.value.memory = exportMemory(memorySystem);
    }
  } catch (error) {
    console.error('自动更新设定失败:', error);
  }
}

// 质量检查相关
const showQualityDialog = ref(false)
const currentQualityReport = ref<any>(null)
const qualityReportTab = ref('dimensions')

// 导出相关
const showExportSettings = ref(false)
const exportMode = ref<'single' | 'all'>('all')
const exportChapter = ref<Chapter | null>(null)
const exporting = ref(false)

// 章节验证相关
const validating = ref(false)
const showValidationDialog = ref(false)
const validationIssues = ref<string[]>([])

// 验证章节
async function validateChapters() {
  if (!project.value || chapters.value.length === 0) {
    ElMessage.warning('没有章节可验证')
    return
  }

  validating.value = true
  validationIssues.value = []

  try {
    // 检查章节号连续性
    for (let i = 1; i < chapters.value.length; i++) {
      if (chapters.value[i].number !== chapters.value[i - 1].number + 1) {
        validationIssues.value.push(
          `章节号不连续：第${chapters.value[i - 1].number}章之后是第${chapters.value[i].number}章`
        )
      }
    }

    // 检查内容连续性
    for (const chapter of chapters.value) {
      if (chapter.content.length < 100) {
        validationIssues.value.push(`第${chapter.number}章内容过短（少于100字符）`)
      }
    }

    // 检查标题重复
    const titles = chapters.value.map(ch => ch.title)
    const duplicates = titles.filter((title, index) => titles.indexOf(title) !== index)
    if (duplicates.length > 0) {
      validationIssues.value.push(`发现重复的章节标题：${[...new Set(duplicates)].join('、')}`)
    }

    showValidationDialog.value = true

    if (validationIssues.value.length === 0) {
      ElMessage.success('章节验证通过，未发现问题')
    } else {
      ElMessage.warning(`发现${validationIssues.value.length}个问题`)
    }
  } catch (error) {
    ElMessage.error('验证失败：' + (error as Error).message)
  } finally {
    validating.value = false
  }
}

// 监听project加载
watch(project, (newProject) => {
  if (newProject) {
    console.log('[Chapters] 项目加载完成')
  }
}, { immediate: true })

const saveStatusText = computed(() => {
  switch (saveStatus.value) {
    case 'saving':
      return '保存中...'
    case 'saved':
      return '已自动保存'
    case 'error':
      return '保存失败'
    default:
      return '未保存'
  }
})

const saveStatusColor = computed(() => {
  switch (saveStatus.value) {
    case 'saving':
      return '#409eff'
    case 'saved':
      return '#67c23a'
    case 'error':
      return '#f56c6c'
    default:
      return '#909399'
  }
})

function clearAutoSaveTimer() {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }
}

function syncChapterDraftToProject() {
  if (!project.value || !showEditDialog.value) {
    return
  }

  const draftData = JSON.parse(JSON.stringify(chapterForm.value))
  draftData.id = draftData.id || uuidv4()
  draftData.wordCount = draftData.content.length
  chapterForm.value.id = draftData.id

  const existingIndex = project.value.chapters.findIndex(c => c.id === draftData.id)
  if (existingIndex >= 0) {
    project.value.chapters[existingIndex] = draftData
  } else {
    project.value.chapters.push(draftData)
  }

  project.value.currentWords = project.value.chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0)
}

function scheduleAutoSave() {
  if (!showEditDialog.value || saving.value || generating.value) {
    return
  }

  if (!project.value || (!chapterForm.value.title.trim() && !chapterForm.value.content.trim())) {
    return
  }

  clearAutoSaveTimer()
  saveStatus.value = 'saving'
  autoSaveTimer = setTimeout(async () => {
    try {
      syncChapterDraftToProject()
      await projectStore.debouncedSaveCurrentProject()
      saveStatus.value = 'saved'
    } catch (error) {
      console.error('自动保存失败:', error)
      saveStatus.value = 'error'
    }
  }, 3000)
}

function handleEditorKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    saveChapter()
  }
}

watch(
  () => [showEditDialog.value, chapterForm.value.title, chapterForm.value.content, chapterForm.value.number],
  ([visible]) => {
    if (!visible) {
      clearAutoSaveTimer()
      return
    }

    saveStatus.value = 'idle'
    scheduleAutoSave()
  }
)

onMounted(() => {
  window.addEventListener('keydown', handleEditorKeydown)
})

onUnmounted(() => {
  clearAutoSaveTimer()
  window.removeEventListener('keydown', handleEditorKeydown)
})

function resetForm() {
  chapterForm.value = {
    id: uuidv4(),
    number: chapters.value.length + 1,
    title: '',
    content: '',
    wordCount: 0,
    outline: {
      chapterId: '',
      title: '',
      scenes: [],
      characters: [],
      location: '',
      goals: [],
      conflicts: [],
      resolutions: [],
      foreshadowingToPlant: [],
      foreshadowingToResolve: [],
      status: 'planned'
    },
    status: 'draft',
    generatedBy: 'ai',
    generationTime: new Date(),
    checkpoints: [],
    aiSuggestions: []
  }
  editingChapter.value = null
  editActiveTab.value = 'basic'
}

function addChapter() {
  resetForm()
  showEditDialog.value = true
}

function editChapter(chapter: Chapter) {
  editingChapter.value = chapter
  chapterForm.value = JSON.parse(JSON.stringify(chapter))
  showEditDialog.value = true
}

async function saveChapter() {
  if (!chapterForm.value.title.trim()) {
    ElMessage.warning('请输入章节标题')
    return
  }

  saving.value = true
  saveStatus.value = 'saving'
  try {
    if (!project.value) return

    // 将 reactive 对象转换为普通对象
    const chapterData = JSON.parse(JSON.stringify(chapterForm.value))
    chapterData.wordCount = chapterData.content.length

    if (editingChapter.value) {
      const index = project.value.chapters.findIndex(c => c.id === chapterData.id)
      if (index !== -1) {
        project.value.chapters[index] = chapterData
      }
    } else {
      chapterData.id = chapterData.id || uuidv4()
      project.value.chapters.push(chapterData)
    }

    // 更新当前字数
    project.value.currentWords = project.value.chapters.reduce((sum, c) => sum + c.wordCount, 0)

    await projectStore.saveCurrentProject()
    ElMessage.success('保存成功')
    saveStatus.value = 'saved'
    showEditDialog.value = false
    resetForm()

    // 后台运行设定提取
    if (autoUpdateSettings.value) {
      runExtractionInBackground(chapterData)
    }

    // 触发章节保存事件（用于AI建议系统）
    const chapterSaveEvent = new CustomEvent('chapter-save', {
      detail: { chapter: chapterData }
    })
    window.dispatchEvent(chapterSaveEvent)
  } catch (error) {
    saveStatus.value = 'error'
    ElMessage.error(`保存失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    saving.value = false
  }
}

async function confirmDeleteChapter(chapter: Chapter) {
  try {
    await ElMessageBox.confirm(
      `确定要删除第${chapter.number}章"${chapter.title}"吗？`,
      '删除章节',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    if (!project.value) return
    project.value.chapters = project.value.chapters.filter(c => c.id !== chapter.id)
    project.value.currentWords = project.value.chapters.reduce((sum, c) => sum + c.wordCount, 0)
    await projectStore.saveCurrentProject()
    ElMessage.success('删除成功')
  } catch {
    // 用户取消
  }
}

function buildGenerationOptions(advancedSettings?: {
  maxTokens?: number
  temperature?: number
  stopSequences?: string[]
}) {
  const maxTokens = advancedSettings?.maxTokens ?? 4000
  const temperature = advancedSettings?.temperature ?? 0.7
  const stopSequences = (advancedSettings?.stopSequences || []).filter(Boolean)

  return {
    maxTokens,
    temperature,
    ...(stopSequences.length > 0 ? { stopSequences } : {})
  }
}

async function runQualityCheckSilently(targetChapter: Chapter, notify: boolean = true) {
  if (!project.value || !project.value.config?.enableQualityCheck) {
    return
  }

  try {
    const { createQualityChecker } = await import('@/utils/qualityChecker')
    const checker = createQualityChecker(
      project.value.world,
      project.value.characters,
      project.value.outline,
      project.value.config
    )

    const report = await checker.checkChapter(targetChapter)
    targetChapter.qualityScore = report.overallScore

    const mergedSuggestions = [
      ...(targetChapter.aiSuggestions || []),
      ...report.improvements
    ]
    targetChapter.aiSuggestions = [...new Set(mergedSuggestions)]

    const threshold = project.value.config.qualityThreshold || 7
    if (notify && report.overallScore < threshold) {
      ElMessage.warning(`自动质量检查：${report.overallScore.toFixed(1)}/10，低于阈值 ${threshold}`)
    }
  } catch (error) {
    console.warn('自动质量检查失败:', error)
  }
}

async function generateContent() {
  generating.value = true
  generationStatus.value = '正在准备生成环境...'
  try {
    const { useAIStore } = await import('@/stores/ai')
    const aiStore = useAIStore()

    if (aiStore.checkInitialized()) {
      generationStatus.value = '正在加载项目数据...'
      const projectStore = await import('@/stores/project').then(m => m.useProjectStore())
      const project = projectStore.currentProject

      if (!project) {
        ElMessage.warning('请先打开或创建项目')
        return
      }

      // 使用酒馆风格的上下文构建器
      generationStatus.value = '正在构建AI记忆与上下文...'
      const { buildChapterContext, contextToPrompt } = await import('@/utils/contextBuilder')

      console.log('[章节生成] 使用上下文构建器构建记忆...')

      // 构建上下文
      const context = await buildChapterContext(project, chapterForm.value)

      console.log('[章节生成] 上下文构建完成:')
      console.log(`  - 总Token数: ${context.totalTokens}`)
      console.log(`  - 警告: ${context.warnings.length > 0 ? context.warnings.join(', ') : '无'}`)
      console.log(`  - Author Note 长度: ${context.authorsNote.length}`)
      console.log(`  - 最近章节: ${context.recentChapters ? '有' : '无'}`)

      // 转换为prompt
      generationStatus.value = '正在组合提示词...'
      const targetWords = project.config?.advancedSettings?.targetWordCount || 2000
      const prompt = contextToPrompt(context, chapterForm.value.title || '未命名章节', targetWords)

      if (context.warnings.length > 0) {
        ElMessage.warning(`上下文提示: ${context.warnings[0]}`)
      }

      const messages: ChatMessage[] = [{ role: 'user', content: prompt }]
      const aiContext = { type: 'chapter' as const, complexity: 'high' as const, priority: 'quality' as const }

      console.log('[章节生成] 开始调用AI服务...')
      generationStatus.value = `前文长度 ${context.totalTokens} Tokens。正在请求AI...`
      const generationOptions = buildGenerationOptions(project.config?.advancedSettings)
      
      // 改为流式输出，大幅提升 UX
      chapterForm.value.content = ''

      let response
      try {
        response = await aiStore.chatStream(
          messages,
          (event) => {
            if (event.type === 'chunk' && event.chunk) {
              chapterForm.value.content += event.chunk
              // 实时更新字数状态
              generationStatus.value = `正在生成中... (${chapterForm.value.content.length}字)`
            }
          },
          aiContext,
          generationOptions
        )
      } catch (streamError) {
        console.warn('[章节生成] 流式生成失败，回退普通模式:', streamError)
        generationStatus.value = '流式中断，正在切换普通模式重试...'
        response = await aiStore.chat(messages, aiContext, generationOptions)
      }
      
      console.log('[章节生成] AI响应完成长度:', response.content.length)

      generationStatus.value = '正在解析返回数据...'
      chapterForm.value.content = response.content.trim()
      chapterForm.value.generatedBy = 'ai'

      // 执行 post-generation 插件管道
      const { usePluginStore } = await import('@/stores/plugin')
      const pluginStore = usePluginStore()
      const processorRegistry = pluginStore.getRegistries().processor
      generationStatus.value = '执行生成后处理...'
      try {
        const postResult = await processorRegistry.processPipeline(
          'post-generation',
          { chapter: chapterForm.value, project },
          { project, chapter: chapterForm.value, config: project.config }
        )
        if (postResult && postResult.chapter && postResult.chapter.content) {
          chapterForm.value.content = postResult.chapter.content
        }
      } catch (err) {
        console.error('执行 post-generation 管道失败:', err)
      }

      chapterForm.value.wordCount = chapterForm.value.content.length
      const generatedChapter = JSON.parse(JSON.stringify(chapterForm.value)) as Chapter
      await runQualityCheckSilently(generatedChapter)
      chapterForm.value.qualityScore = generatedChapter.qualityScore
      chapterForm.value.aiSuggestions = generatedChapter.aiSuggestions

      ElMessage.success('AI生成章节成功！')
    } else {
      generationStatus.value = 'AI服务未配置，生成示例内容...'
      await generateDefaultContent()
    }
  } catch (error) {
    console.error('[章节生成] 失败:', error)
    ElMessage.error('生成失败：' + (error as Error).message)
    await generateDefaultContent()
  } finally {
    generating.value = false
    generationStatus.value = ''
  }
}

async function generateDefaultContent() {
  chapterForm.value.content = `这是示例章节内容。

主角站在山顶，望着远方的云海。风吹过他的脸庞，带来一丝凉意。

"终于到了这一步。"他喃喃自语。

身后的老者缓缓开口："修行之路漫长，这只是开始。"

主角转过身，眼神坚定："我知道，但我已经准备好了。"

老者点点头，露出欣慰的笑容："那就去吧，不要让我们失望。"

主角深吸一口气，纵身一跃，向着云海深处飞去...

---
这是示例内容。要使用AI生成，请在配置中添加API密钥。`

  chapterForm.value.generatedBy = 'manual'
  ElMessage.success('已生成示例章节内容。要使用AI生成，请在配置中添加API密钥。')
}

function optimizeContent() {
  ElMessage.info('内容优化功能开发中...')
}

async function checkQuality() {
  if (!chapterForm.value.content || chapterForm.value.content.trim().length === 0) {
    ElMessage.warning('请先生成章节内容')
    return
  }

  if (!project.value) {
    ElMessage.warning('项目未加载')
    return
  }

  try {
    ElMessage.info('正在进行质量检查...')

    // 1. 传统质量检查
    const { createQualityChecker } = await import('@/utils/qualityChecker')

    const checker = createQualityChecker(
      project.value.world,
      project.value.characters,
      project.value.outline,
      project.value.config
    )

    // 创建临时章节对象
    const tempChapter = {
      ...chapterForm.value,
      number: chapterForm.value.number || chapters.value.length + 1
    } as Chapter

    const report = await checker.checkChapter(tempChapter)

    // 2. 冲突检测（针对当前章节）
    const { ConflictDetector } = await import('@/utils/conflictDetector')
    const detector = new ConflictDetector(project.value)
    const conflictResult = await detector.detect()

    // 筛选与当前章节相关的冲突
    const relevantConflicts = conflictResult.conflicts.filter(c =>
      !c.relatedChapters || c.relatedChapters.includes(chapterForm.value.number)
    )

    // 3. 综合评分（质量分 - 冲突扣分）
    const conflictPenalty = relevantConflicts.reduce((sum, c) => {
      return sum + (c.severity === 'critical' ? 1.0 : c.severity === 'warning' ? 0.5 : 0.2)
    }, 0)
    const finalScore = Math.max(0, Math.min(10, report.overallScore - conflictPenalty))
    chapterForm.value.qualityScore = finalScore

    // 4. 生成综合建议
    const allSuggestions: string[] = []

    // 添加质量检查建议
    report.improvements.forEach(improvement => {
      allSuggestions.push(improvement)
    })

    // 添加冲突修复建议
    relevantConflicts.forEach(conflict => {
      allSuggestions.push(`[冲突] ${conflict.title}: ${conflict.suggestions.map(s => s.description).join('; ')}`)
    })

    // 去重
    chapterForm.value.aiSuggestions = [...new Set(allSuggestions)]

    // 5. 显示结果
    const issuesCount = report.dimensions.reduce((sum, dim) => sum + dim.issues.length, 0)
    const conflictsCount = relevantConflicts.length

    ElMessage.success(
      `质量检查完成！评分：${finalScore.toFixed(1)}/10，发现 ${issuesCount} 个质量问题，${conflictsCount} 个冲突`
    )

    // 显示详细报告
    showQualityReportDialog(report)
  } catch (error) {
    console.error('质量检查失败:', error)
    ElMessage.error('质量检查失败：' + (error as Error).message)
  }
}

// 质量报告对话框

function showQualityReportDialog(report: any) {
  currentQualityReport.value = report
  showQualityDialog.value = true
}

function saveCheckpoint() {
  if (!editingChapter.value) return

  const checkpoint: Checkpoint = {
    id: uuidv4(),
    timestamp: new Date(),
    content: chapterForm.value.content,
    description: '手动保存'
  }

  chapterForm.value.checkpoints.push(checkpoint)
  ElMessage.success('检查点已保存')
}

function viewCheckpoints(chapter: Chapter) {
  selectedChapter.value = chapter
  showCheckpointsDialog.value = true
}

function restoreCheckpoint(checkpoint: Checkpoint) {
  if (!selectedChapter.value) return

  chapterForm.value = JSON.parse(JSON.stringify(selectedChapter.value))
  chapterForm.value.content = checkpoint.content
  showCheckpointsDialog.value = false
  showEditDialog.value = true
}

async function deleteCheckpoint(checkpoint: Checkpoint) {
  if (!selectedChapter.value) return

  selectedChapter.value.checkpoints = selectedChapter.value.checkpoints.filter(
    c => c.id !== checkpoint.id
  )
  await projectStore.saveCurrentProject()
  ElMessage.success('检查点已删除')
}

function startBatchGeneration() {
  batchForm.value.startChapter = chapters.value.length + 1
  showBatchDialog.value = true
}

function cancelBatchGeneration() {
  isBatchCancelled.value = true
  batchStatusText.value = '正在取消...'
}

function runBatchInBackground() {
  isBatchBackground.value = true
  showBatchDialog.value = false
  ElMessage.success('批量生成已转入后台运行')
}

async function executeBatchGeneration() {
  if (!project.value) {
    ElMessage.warning('请先打开或创建项目')
    return
  }

  isBatchCancelled.value = false
  isBatchBackground.value = false
  batchGenerating.value = true
  batchProgress.value = 0
  batchCurrent.value = 0
  batchStatusText.value = '正在准备批量生成环境...'

  try {
    const { useAIStore } = await import('@/stores/ai')
    const aiStore = useAIStore()

    if (!aiStore.checkInitialized()) {
      ElMessage.warning('请先配置AI模型')
      showBatchDialog.value = false
      return
    }

    const projectStore = await import('@/stores/project').then(m => m.useProjectStore())
    const currentProject = projectStore.currentProject

    if (!currentProject) {
      ElMessage.warning('项目未加载')
      return
    }

    // 导入上下文构建器
    const { buildChapterContext, contextToPrompt } = await import('@/utils/contextBuilder')

    // 导入大纲扩展函数
    const { extendOutlineWithLLM } = await import('@/utils/llm/outlineGenerator')

    for (let i = 0; i < batchForm.value.count; i++) {
      if (isBatchCancelled.value) {
        ElMessage.warning('批量生成已手动取消')
        break
      }

      batchCurrent.value = i + 1
      const chapterNumber = batchForm.value.startChapter + i

      // ================= 滚动大纲生成检测 =================
      const currentOutlineLength = project.value.outline.chapters.length
      // 当剩余大纲不足5章时，自动续写后面20章大纲
      if (currentOutlineLength > 0 && chapterNumber >= currentOutlineLength - 4) {
        batchStatusText.value = `⚠️ 现有大纲即将耗尽，正在自动由AI续写第 ${currentOutlineLength + 1} 到 ${currentOutlineLength + 20} 章大纲...`
        console.log(`[批量生成] 触发滚动大纲，续写第 ${currentOutlineLength + 1} 章之后的内容`)
        
        try {
          const newOutlines = await extendOutlineWithLLM(project.value, currentOutlineLength + 1, 20)
          if (newOutlines && newOutlines.length > 0) {
            project.value.outline.chapters.push(...newOutlines)
            
            // 更新最后卷的 endChapter 或者新建卷
            const lastVolume = project.value.outline.volumes[project.value.outline.volumes.length - 1]
            if (lastVolume) {
              lastVolume.endChapter += newOutlines.length
            }
            
            await projectStore.saveCurrentProject()
            ElMessage.success(`成功续写了 ${newOutlines.length} 章大纲！`)
          }
        } catch (err) {
          console.error('[批量生成] 大纲续写失败，可能会影响后续生成质量:', err)
          ElMessage.warning('大纲续写失败，将强制按空大纲继续生成本章')
        }
      }
      // ===================================================

      console.log(`[批量生成] 开始生成第 ${chapterNumber} 章 (${i + 1}/${batchForm.value.count})`)
      batchStatusText.value = `初始化第 ${chapterNumber} 章数据...`

      try {
        // 检查章节是否已存在
        let existingChapter = chapters.value.find(c => c.number === chapterNumber)

        // 准备章节数据
        const chapterData: Chapter = existingChapter ? {
          ...existingChapter,
          content: '',
          wordCount: 0,
          generatedBy: 'ai' as const,
          generationTime: new Date()
        } : {
          id: uuidv4(),
          number: chapterNumber,
          title: `第${chapterNumber}章`,
          content: '',
          wordCount: 0,
          summary: '',
          outline: {
            chapterId: uuidv4(),
            title: `第${chapterNumber}章`,
            scenes: [],
            characters: [],
            location: '',
            goals: [],
            conflicts: [],
            resolutions: [],
            foreshadowingToPlant: [],
            foreshadowingToResolve: [],
            status: 'planned'
          },
          status: 'draft',
          generatedBy: 'ai' as const,
          generationTime: new Date(),
          checkpoints: [],
          aiSuggestions: []
        }

        // 使用酒馆风格的上下文构建器
        console.log(`[批量生成] 构建第 ${chapterNumber} 章上下文...`)
        batchStatusText.value = `正在构建第 ${chapterNumber} 章记忆与设定上下文...`

        // 重新读取项目数据，确保看到之前生成的章节
        const freshProject = projectStore.currentProject
        if (!freshProject) {
          throw new Error('项目数据丢失')
        }

        const context = await buildChapterContext(freshProject, chapterData)

        console.log(`[批量生成] 第 ${chapterNumber} 章上下文:`)
        console.log(`  - 总Token数: ${context.totalTokens}`)
        console.log(`  - 警告: ${context.warnings.length > 0 ? context.warnings.join(', ') : '无'}`)
        console.log(`  - 最近章节: ${context.recentChapters ? '有' : '无'}`)

        // 转换为prompt
        const targetWords = currentProject.config?.advancedSettings?.targetWordCount || 2000
        const prompt = contextToPrompt(context, chapterData.title, targetWords)

        if (context.warnings.length > 0) {
          ElMessage.warning(`第 ${chapterNumber} 章提示: ${context.warnings[0]}`)
        }

        const messages: ChatMessage[] = [{ role: 'user', content: prompt }]
        const aiContext = { type: 'chapter' as const, complexity: 'high' as const, priority: 'quality' as const }

        batchStatusText.value = `[前文长度 ${context.totalTokens} Tokens] 正在请求 AI 生成正文...`
        const generationOptions = buildGenerationOptions(currentProject.config?.advancedSettings)
        
        chapterData.content = ''

        let response
        try {
          response = await aiStore.chatStream(
            messages,
            (event) => {
              if (event.type === 'chunk' && event.chunk) {
                chapterData.content += event.chunk
                batchStatusText.value = `正在生成第 ${chapterNumber} 章... 已生成 ${chapterData.content.length} 字`
              }
            },
            aiContext,
            generationOptions
          )
        } catch (streamError) {
          console.warn(`[批量生成] 第 ${chapterNumber} 章流式失败，回退普通模式:`, streamError)
          batchStatusText.value = `第 ${chapterNumber} 章流式中断，正在切换普通模式重试...`
          response = await aiStore.chat(messages, aiContext, generationOptions)
        }
        
        console.log(`[批量生成] 第 ${chapterNumber} 章生成完成，内容长度:`, response.content.length)

        batchStatusText.value = `正在处理并保存第 ${chapterNumber} 章...`
        chapterData.content = response.content.trim()
        chapterData.wordCount = chapterData.content.length

        // 执行 post-generation 插件管道
        const { usePluginStore } = await import('@/stores/plugin')
        const pluginStore = usePluginStore()
        const processorRegistry = pluginStore.getRegistries().processor
        try {
          const postResult = await processorRegistry.processPipeline(
            'post-generation',
            { chapter: chapterData, project: currentProject },
            { project: currentProject, chapter: chapterData, config: currentProject.config }
          )
          if (postResult && postResult.chapter && postResult.chapter.content) {
            chapterData.content = postResult.chapter.content
            chapterData.wordCount = chapterData.content.length
          }
        } catch (err) {
          console.error('执行 post-generation 管道失败:', err)
        }

        await runQualityCheckSilently(chapterData, false)

        // 保存或更新章节
        if (existingChapter) {
          const index = project.value.chapters.findIndex(c => c.id === existingChapter.id)
          if (index !== -1) {
            project.value.chapters[index] = chapterData
          }
        } else {
          project.value.chapters.push(chapterData)
        }

        // 自动保存当前章节
        if (batchForm.value.autoSave) {
          await projectStore.saveCurrentProject()
          console.log(`[批量生成] 第 ${chapterNumber} 章已保存`)
        }

        // 后台自动提取更新
        if (batchForm.value.autoUpdateSettings) {
          runExtractionInBackground(chapterData)
        }

        // 更新进度
        batchProgress.value = Math.round(((i + 1) / batchForm.value.count) * 100)

        // 短暂延迟，避免API请求过快
        if (i < batchForm.value.count - 1) {
          batchStatusText.value = `第 ${chapterNumber} 章完成，准备生成下一章...`
          await new Promise(resolve => setTimeout(resolve, 500))
        }

      } catch (error) {
        console.error(`[批量生成] 第 ${chapterNumber} 章生成失败:`, error)
        ElMessage.error(`第 ${chapterNumber} 章生成失败: ${(error as Error).message}`)
        // 继续生成下一章
      }
    }

    batchStatusText.value = '批量生成任务全部完成！'
    ElMessage.success(`批量生成完成！成功生成 ${batchForm.value.count} 章`)
    showBatchDialog.value = false
  } catch (error) {
    console.error('[批量生成] 失败:', error)
    ElMessage.error('批量生成失败：' + (error as Error).message)
  } finally {
    batchGenerating.value = false
    batchStatusText.value = ''
  }
}

function regenerateChapter(_chapter: Chapter) {
  ElMessage.info('重新生成功能开发中...')
}

function getStatusType(status: string) {
  const types: Record<string, any> = {
    draft: 'info',
    revised: 'warning',
    final: 'success'
  }
  return types[status] || 'info'
}

function getStatusText(status: string) {
  const texts: Record<string, string> = {
    draft: '草稿',
    revised: '已修订',
    final: '定稿'
  }
  return texts[status] || status
}

function getContentPreview(content: string, maxLength: number = 100) {
  if (!content) return '暂无内容'
  if (content.length <= maxLength) return content
  return content.substring(0, maxLength) + '...'
}

function formatDate(date: Date | string) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function getTotalIssues(report: any) {
  return report.dimensions.reduce((sum: number, dim: any) => sum + dim.issues.length, 0)
}

function getScoreColor(score: number) {
  if (score >= 8) return '#67c23a'
  if (score >= 6) return '#e6a23c'
  return '#f56c6c'
}

// 导出处理
function handleExportCommand(command: string) {
  if (!project.value) {
    ElMessage.warning('请先打开项目')
    return
  }

  switch (command) {
    case 'exportAllMarkdown':
      handleExportAllMarkdown()
      break
    case 'exportAllPdf':
      handleExportAllPdf()
      break
    case 'exportAllJson':
      handleExportAllJson()
      break
    case 'exportSettings':
      exportMode.value = 'all'
      exportChapter.value = null
      showExportSettings.value = true
      break
  }
}

// 导出单个章节
function handleExportSingleChapter(chapter: Chapter, format: 'markdown' | 'pdf') {
  if (!project.value) return

  if (format === 'markdown') {
    exportChapterToMarkdown(chapter, project.value.title, DEFAULT_MD_OPTIONS)
    ElMessage.success(`已导出第${chapter.number}章为 Markdown`)
  } else {
    exportChapterToPdf(chapter, project.value, DEFAULT_PDF_OPTIONS)
    ElMessage.success(`已导出第${chapter.number}章为 PDF`)
  }
}

// 导出全部为 Markdown
async function handleExportAllMarkdown() {
  if (!project.value || chapters.value.length === 0) {
    ElMessage.warning('没有可导出的章节')
    return
  }

  exporting.value = true
  try {
    ElMessage.info('正在导出 Markdown 文件...')

    exportAllChaptersToMarkdown(
      chapters.value,
      project.value.title,
      DEFAULT_MD_OPTIONS,
      (current, total) => {
        console.log(`导出进度: ${current}/${total}`)
      }
    )

    ElMessage.success('导出成功！')
  } catch (error) {
    console.error('导出失败:', error)
    ElMessage.error('导出失败：' + (error as Error).message)
  } finally {
    exporting.value = false
  }
}

// 导出全部为 PDF
async function handleExportAllPdf() {
  if (!project.value || chapters.value.length === 0) {
    ElMessage.warning('没有可导出的章节')
    return
  }

  exporting.value = true
  try {
    ElMessage.info('正在生成 PDF，请稍候...')

    exportAllChaptersToPdf(
      chapters.value,
      project.value,
      DEFAULT_PDF_OPTIONS,
      (current, total) => {
        console.log(`导出进度: ${current}/${total}`)
      }
    )

    ElMessage.success('请在打印对话框中选择"保存为PDF"')
  } catch (error) {
    console.error('导出失败:', error)
    ElMessage.error('导出失败：' + (error as Error).message)
  } finally {
    exporting.value = false
  }
}

// 导出全部为 JSON
async function handleExportAllJson() {
  if (!project.value || chapters.value.length === 0) {
    ElMessage.warning('没有可导出的章节')
    return
  }

  try {
    const data = JSON.stringify({
      title: project.value.title,
      exportTime: new Date().toISOString(),
      chapters: chapters.value
    }, null, 2)

    const blob = new Blob([data], { type: 'application/json' })
    const filename = `${project.value.title}_章节_${new Date().toISOString().split('T')[0]}.json`
    saveAs(blob, filename)

    ElMessage.success('导出成功！')
  } catch (error) {
    console.error('导出失败:', error)
    ElMessage.error('导出失败：' + (error as Error).message)
  }
}

// 单个章节导出处理
function handleChapterExport(chapter: Chapter, format: string) {
  if (!project.value) return

  if (format === 'markdown') {
    handleExportSingleChapter(chapter, 'markdown')
  } else if (format === 'pdf') {
    handleExportSingleChapter(chapter, 'pdf')
  }
}

// 导出完成回调
function handleExportComplete() {
  ElMessage.success('导出完成！')
}
</script>

<style scoped>
.chapters {
  max-width: 1200px;
  margin: 0 auto;
}

.header-card {
  margin-bottom: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header h2 {
  margin: 0;
  font-size: 20px;
}

.actions {
  display: flex;
  gap: 10px;
}

.content {
  min-height: 400px;
}

/* 虚拟滚动容器 */
.chapters-virtual-container {
  max-height: calc(100vh - 300px);
  overflow-y: auto;
  will-change: transform; /* 性能优化：提示浏览器该元素会变化 */
}

.chapters-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.chapter-card {
  margin-bottom: 0;
}

.chapter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.chapter-info {
  display: flex;
  align-items: center;
  gap: 15px;
}

.chapter-number {
  font-size: 18px;
  font-weight: 600;
  color: #409eff;
}

.chapter-title {
  font-size: 18px;
  font-weight: 600;
}

.chapter-stats {
  display: flex;
  gap: 20px;
  color: #909399;
  font-size: 14px;
}

.chapter-content {
  margin-bottom: 15px;
}

.content-preview {
  color: #606266;
  line-height: 1.6;
}

.chapter-actions {
  display: flex;
  gap: 10px;
  padding-top: 15px;
  border-top: 1px solid #e4e7ed;
}

.quality-score {
  margin-top: 10px;
  padding: 8px 12px;
  background: #f0f9ff;
  border-radius: 4px;
  font-size: 14px;
  color: #409eff;
}

.editor-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: #f5f7fa;
  border-radius: 4px;
}

.word-count {
  margin-left: auto;
  color: #909399;
  font-size: 14px;
}

.suggestions-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.suggestion-item {
  margin-bottom: 0;
}

.checkpoints-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.checkpoint-item {
  margin-bottom: 0;
}

.checkpoint-header {
  display: flex;
  align-items: center;
  gap: 15px;
  font-weight: 600;
}

.checkpoint-time {
  color: #909399;
  font-size: 14px;
}

.checkpoint-desc {
  color: #606266;
  font-size: 14px;
}

.checkpoint-content {
  margin: 15px 0;
  color: #606266;
  line-height: 1.6;
}

.checkpoint-actions {
  display: flex;
  gap: 10px;
}

.batch-progress {
  margin-top: 20px;
}

.progress-text {
  margin-top: 10px;
  text-align: center;
  color: #909399;
}

.quality-report-dialog {
  min-height: 400px;
}

.quality-dimension-card {
  margin-bottom: 15px;
}

.quality-dimension-card .dimension-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.quality-dimension-card .dimension-name {
  font-weight: 600;
  font-size: 14px;
}

.quality-dimension-card .dimension-issues {
  margin-top: 10px;
}

.dimension-issues {
  margin-top: 10px;
}
</style>
