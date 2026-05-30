<template>
  <div class="project-list">
    <section class="hero-section slide-up">
      <div class="hero-content">
        <p class="hero-kicker">AI 小说工坊</p>
        <h1 class="hero-title">创作工坊</h1>
        <p class="hero-subtitle">
          {{ projectStore.projects.length }} 部作品 · {{ totalWords }} 万字
        </p>
      </div>
      <div class="hero-actions">
        <el-button round @click="showImportDialog = true">
          <el-icon><Upload /></el-icon>
          导入
        </el-button>
        <el-button type="primary" round @click="showCreateDialog = true">
          <el-icon><Plus /></el-icon>
          新建项目
        </el-button>
      </div>
    </section>

    <main class="main" v-loading="projectStore.loading">
      <div
        v-if="!projectStore.loading && projectStore.projects.length === 0"
        class="empty-state glass-panel fade-in"
      >
        <div class="empty-icon"><el-icon :size="56" color="var(--ds-accent-text)"><EditPen /></el-icon></div>
        <h2>开始你的第一部作品</h2>
        <p>从空白项目或模板出发，把设定、章节和审校流程集中到一个创作空间。</p>
        <div class="empty-actions">
          <el-button type="primary" round @click="quickStartDemo" :loading="demoLoading">
            <el-icon><MagicStick /></el-icon>
            一键体验示例
          </el-button>
          <el-button round @click="showCreateDialog = true">新建项目</el-button>
          <el-button round @click="showTemplateCreateDialog = true">从模板创建</el-button>
        </div>
      </div>

      <div v-else class="project-grid">
        <article
          v-for="(project, idx) in projectStore.projects"
          :key="project.id"
          class="project-card fade-in"
          :style="{ animationDelay: `${idx * 60}ms` }"
          @click="openProject(project.id)"
        >
          <div class="card-accent" :style="{ background: getAccentGradient(project.genre) }"></div>
          <div class="card-body">
            <div class="card-header">
              <h3 class="card-title" :title="project.title">{{ project.title }}</h3>
              <el-dropdown @click.stop trigger="click" @command="(cmd: string) => handleCommand(cmd, project.id)">
                <el-icon class="more-btn"><MoreFilled /></el-icon>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="edit">
                      <el-icon><Edit /></el-icon>打开项目
                    </el-dropdown-item>
                    <el-dropdown-item command="export">
                      <el-icon><Download /></el-icon>导出备份
                    </el-dropdown-item>
                    <el-dropdown-item command="delete" divided type="danger" style="color: #f56c6c;">
                      <el-icon><Delete /></el-icon>删除项目
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>

            <div class="card-meta">
              <el-tag size="small">{{ project.genre || '未分类' }}</el-tag>
              <el-tag size="small" :type="getChapterStatusType(project.status)">
                {{ getChapterStatusText(project.status) }}
              </el-tag>
              <span class="card-date">{{ formatRelativeTime(project.updatedAt) }}</span>
            </div>

            <p v-if="project.description" class="card-description">
              {{ project.description }}
            </p>
            <p v-else class="card-description muted">
              尚未填写作品简介
            </p>

            <div class="card-progress">
              <div class="progress-header">
                <span class="progress-text">{{ formatNumber(project.currentWords) }} / {{ formatNumber(project.targetWords) }} 字</span>
                <span class="progress-percent">{{ getProgress(project.currentWords, project.targetWords) }}%</span>
              </div>
              <div class="progress-bar">
                <div
                  class="progress-fill"
                  :style="{ width: getProgress(project.currentWords, project.targetWords) + '%' }"
                ></div>
              </div>
            </div>
          </div>
        </article>
      </div>
    </main>

    <!-- 新建项目对话框 -->
    <el-dialog
      v-model="showCreateDialog"
      title="新建小说项目"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="createFormRef"
        :model="createForm"
        :rules="createRules"
        label-width="100px"
        status-icon
        @submit.prevent
      >
        <el-form-item label="项目名称" prop="title">
          <el-input 
            v-model="createForm.title" 
            placeholder="请输入小说名称（例如：赛博修仙传）"
            maxlength="50"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="小说类型" prop="genre">
          <el-select v-model="createForm.genre" placeholder="请选择小说类型" style="width: 100%" @click.stop>
            <el-option
              v-for="genre in availableGenres"
              :key="genre.id"
              :label="genre.name"
              :value="genre.id"
            >
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>{{ genre.name }}</span>
                <span style="color: var(--el-text-color-secondary); font-size: 12px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ genre.description }}</span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>

        <el-form-item label="目标字数" prop="targetWords">
          <el-input-number 
            v-model="createForm.targetWords" 
            :min="10000" 
            :max="10000000"
            :step="10000"
            style="width: 100%"
          />
          <div class="form-tip">建议中长篇小说目标设定在 20 万字左右</div>
        </el-form-item>

        <el-form-item label="创作模板" prop="template">
          <el-select v-model="createForm.template" placeholder="选择初始结构模板" style="width: 100%" @click.stop>
            <el-option label="空白项目 (自定义设定)" value="blank" />
            <el-option label="标准网文 (包含常用设定和卷架构)" value="standard" />
            <el-option label="快速大纲 (AI辅助生成框架)" value="quick_outline" />
            <el-option label="短篇小说 (5千-3万字单卷结构)" value="short_fiction" />
            <el-option label="同人创作 (支持Canon/AU/OOC/CP模式)" value="fanfic" />
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="showCreateDialog = false" :disabled="creating">取消</el-button>
          <el-button type="primary" @click="handleCreate" :loading="creating">
            {{ creating ? '创建中...' : '确认创建' }}
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 从模板创建对话框 -->
    <el-dialog
      v-model="showTemplateCreateDialog"
      title="从模板创建项目"
      width="800px"
      top="5vh"
    >
      <div v-if="selectedTemplate" class="template-create-form">
        <el-page-header @back="selectedTemplate = null" content="配置项目信息" class="mb-4" />
        
        <el-form label-width="120px" class="mt-4">
          <el-form-item label="项目名称">
            <el-input v-model="templateProjectName" placeholder="输入新项目名称" />
          </el-form-item>
          
          <el-form-item label="模板信息">
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="模板名称">{{ selectedTemplate.meta.name }}</el-descriptions-item>
              <el-descriptions-item label="描述">{{ selectedTemplate.meta.description }}</el-descriptions-item>
              <el-descriptions-item label="标签">
                <el-tag v-for="tag in selectedTemplate.meta.tags" :key="tag" size="small" class="mr-2">
                  {{ tag }}
                </el-tag>
              </el-descriptions-item>
            </el-descriptions>
          </el-form-item>
          
          <el-form-item label="导入内容">
            <el-checkbox-group v-model="templateImportOptions">
              <el-checkbox label="world">世界观设定 ({{ Object.keys(selectedTemplate.world).length }} 项)</el-checkbox>
              <el-checkbox label="characters">角色设定 ({{ selectedTemplate.characters?.length || 0 }} 名)</el-checkbox>
              <el-checkbox label="outline">故事大纲</el-checkbox>
            </el-checkbox-group>
          </el-form-item>
        </el-form>
      </div>
      
      <div v-else class="template-selector">
        <el-alert
          title="选择一个内置或自定义模板作为新项目的起点"
          type="info"
          :closable="false"
          class="mb-4"
        />
        <TemplateLibrary mode="select" @select="handleTemplateSelect" />
      </div>

      <template #footer v-if="selectedTemplate">
        <el-button @click="selectedTemplate = null">返回重选</el-button>
        <el-button type="primary" @click="createFromTemplate" :loading="creatingFromTemplate">
          创建项目
        </el-button>
      </template>
    </el-dialog>

    <!-- 导入项目对话框 -->
    <el-dialog
      v-model="showImportDialog"
      title="导入项目"
      width="400px"
    >
      <el-upload
        class="upload-demo"
        drag
        action="#"
        :auto-upload="false"
        :on-change="handleImport"
        accept=".json,.anproj,.anprojl"
        :show-file-list="false"
      >
        <el-icon class="el-icon--upload"><upload-filled /></el-icon>
        <div class="el-upload__text">
          拖拽项目文件到此处，或 <em>点击选择文件</em>
        </div>
        <template #tip>
          <div class="el-upload__tip text-center">
            支持 .anproj (JSON) 或 .anprojl (大型分行JSON) 格式
          </div>
        </template>
      </el-upload>
    </el-dialog>

    <!-- 同人创作对话框 -->
    <el-dialog
      v-model="showFanficDialog"
      title="同人创作"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form label-width="100px">
        <el-form-item label="原作名称" required>
          <el-input v-model="fanficForm.sourceMaterial" placeholder="请输入原作名称（如：斗破苍穹、三体）" />
        </el-form-item>
        <el-form-item label="同人模式" required>
          <el-radio-group v-model="fanficForm.mode">
            <el-radio-button value="canon">Canon（忠实原作）</el-radio-button>
            <el-radio-button value="au">AU（平行宇宙）</el-radio-button>
            <el-radio-button value="ooc">OOC（性格偏离）</el-radio-button>
            <el-radio-button value="cp">CP（配对为主）</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="主要角色" required>
          <el-input v-model="fanficForm.characters" placeholder="多个角色用逗号分隔（如：萧炎,萧薰儿,美杜莎）" />
        </el-form-item>
        <el-form-item v-if="fanficForm.mode === 'cp'" label="CP配对">
          <el-input v-model="fanficForm.cpPairing" placeholder="如：萧炎x萧薰儿" />
        </el-form-item>
        <el-form-item v-if="fanficForm.mode === 'au'" label="AU世界观">
          <el-input v-model="fanficForm.auDescription" type="textarea" :rows="3" placeholder="描述AU模式下的世界观设定" />
        </el-form-item>
        <el-form-item label="主题">
          <el-input v-model="fanficForm.theme" placeholder="可选，如：成长、救赎、复仇" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showFanficDialog = false">取消</el-button>
        <el-button type="primary" @click="handleFanficCreate" :loading="creating">
          创建同人项目
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive, defineAsyncComponent, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus, Edit, Download, Delete, EditPen, MoreFilled, UploadFilled, Upload, MagicStick } from '@element-plus/icons-vue'
import { templateManager } from '@/utils/templateManager'
import { useSandboxStore } from '@/stores/sandbox'
const TemplateLibrary = defineAsyncComponent(() => import('@/components/TemplateLibrary.vue'))
import type { NovelTemplate, Project, ProjectConfig } from '@/types'
import { getLogger } from '@/utils/logger'
import { getChapterStatusType, getChapterStatusText, formatNumber, formatDate, formatRelativeTime } from '@/utils/formatters'
import { getFriendlyMessage } from '@/utils/errorHandler'
import { GENRE_IDS, GENRE_LABELS, getAllGenreProfiles } from '@/types/genreProfile'
import { registerAllGenres } from '@/data/genres'
const logger = getLogger('views:ProjectList')

const router = useRouter()
const projectStore = useProjectStore()

// Register genre profiles for the genre selector
registerAllGenres()

const totalWords = computed(() => {
  const words = projectStore.projects.reduce((sum, project) => sum + (project.currentWords || 0), 0)
  return (words / 10000).toFixed(1)
})

const availableGenres = computed(() => {
  try {
    registerAllGenres()
  } catch { /* already registered */ }
  return getAllGenreProfiles()
})

// 对话框状态
const showCreateDialog = ref(false)
const showImportDialog = ref(false)
const showTemplateCreateDialog = ref(false)
const showFanficDialog = ref(false)

// 同人创作相关
const fanficForm = reactive({
  sourceMaterial: '',
  mode: 'canon' as 'canon' | 'au' | 'ooc' | 'cp',
  characters: '',
  cpPairing: '',
  auDescription: '',
  theme: '',
})

// 表单相关
const createFormRef = ref<FormInstance>()
const creating = ref(false)
const demoLoading = ref(false)

const createForm = reactive({
  title: '',
  genre: '',
  targetWords: 200000,
  template: 'blank'
})

const createRules = reactive<FormRules>({
  title: [
    { required: true, message: '请输入项目名称', trigger: 'blur' },
    { min: 1, max: 50, message: '长度在 1 到 50 个字符', trigger: 'blur' }
  ],
  genre: [
    { required: true, message: '请选择小说类型', trigger: 'change' }
  ],
  targetWords: [
    { required: true, message: '请设置目标字数', trigger: 'blur' }
  ]
})

// 模板创建相关
const selectedTemplate = ref<NovelTemplate | null>(null)
const templateProjectName = ref('')
const templateImportOptions = ref(['world', 'characters', 'outline'])
const creatingFromTemplate = ref(false)

onMounted(async () => {
  await projectStore.loadProjects()
})

// 一键体验示例
async function quickStartDemo() {
  demoLoading.value = true
  try {
    const project = await projectStore.createProject('示例：幻灵大陆', '奇幻', 45000)
    await applyCreateTemplate(project, 'builtin-demo')
    ElMessage.success('示例项目已创建，开始探索吧！')
    router.push(`/project/${project.id}`)
  } catch (error) {
    logger.error('创建示例项目失败:', error)
    ElMessage.error(getFriendlyMessage('创建失败'))
  } finally {
    demoLoading.value = false
  }
}

const TEMPLATE_BY_CREATE_OPTION: Record<string, string> = {
  standard: 'builtin-fantasy',
  quick_outline: 'builtin-urban'
}

async function handleFanficCreate() {
  if (!fanficForm.sourceMaterial.trim()) {
    ElMessage.warning('请输入原作名称')
    return
  }
  if (!fanficForm.characters.trim()) {
    ElMessage.warning('请输入主要角色')
    return
  }
  if (fanficForm.mode === 'cp' && !fanficForm.cpPairing.trim()) {
    ElMessage.warning('CP模式下请输入CP配对')
    return
  }

  creating.value = true
  try {
    const { FanficService } = await import('@/services/FanficService')
    const fanficService = new FanficService()

    const characters = fanficForm.characters.split(/[,，、]/).map(s => s.trim()).filter(Boolean)

    const projectInit = await fanficService.initFanficProject({
      sourceMaterial: fanficForm.sourceMaterial,
      mode: fanficForm.mode,
      characters,
      cpPairing: fanficForm.cpPairing || undefined,
      auDescription: fanficForm.auDescription || undefined,
      theme: fanficForm.theme || undefined,
      language: 'zh',
    })

    const project = await projectStore.createProject(
      projectInit.title,
      projectInit.genre,
      200000
    )

    await projectStore.openProject(project.id)
    if (projectStore.currentProject) {
      if (!projectStore.currentProject.config) {
        projectStore.currentProject.config = {} as ProjectConfig
      }
      ;(projectStore.currentProject.config as Record<string, unknown>).fanfic = {
        sourceMaterial: fanficForm.sourceMaterial,
        mode: fanficForm.mode,
        characters,
        cpPairing: fanficForm.cpPairing || undefined,
      }
      projectStore.currentProject.description = projectInit.description
      await projectStore.saveCurrentProject()
    }

    ElMessage.success('同人创作项目已创建！')
    showFanficDialog.value = false
    showCreateDialog.value = false

    // 重置表单
    fanficForm.sourceMaterial = ''
    fanficForm.mode = 'canon'
    fanficForm.characters = ''
    fanficForm.cpPairing = ''
    fanficForm.auDescription = ''
    fanficForm.theme = ''

    router.push(`/project/${project.id}`)
  } catch (error) {
    logger.error('创建同人项目失败:', error)
    ElMessage.error(getFriendlyMessage('创建同人项目失败'))
  } finally {
    creating.value = false
  }
}

async function applyCreateTemplate(project: Project, templateId: string): Promise<void> {
  await projectStore.openProject(project.id)
  if (!projectStore.currentProject) return

  const template = templateManager.getTemplate(templateId)
  const { projectFields, entities } = templateManager.applyTemplate(
    templateId,
    projectStore.currentProject.title,
    template?.meta.description || ''
  )

  if (projectFields.outline) {
    projectStore.currentProject.outline = projectFields.outline
  }
  if (projectFields.config) {
    projectStore.currentProject.config = projectFields.config
  }
  projectStore.currentProject.description = template?.meta.description || projectStore.currentProject.description

  const sandboxStore = useSandboxStore()
  await sandboxStore.batchAddEntities(entities.map(entity => ({ ...entity, projectId: project.id })))

  await projectStore.saveCurrentProject()
}

// 创建项目
const handleCreate = async () => {
  if (!createFormRef.value) return
  
  await createFormRef.value.validate(async (valid) => {
    if (valid) {
      try {
        creating.value = true
        
        const project = await projectStore.createProject(
          createForm.title,
          createForm.genre,
          createForm.targetWords
        )

        // Store genreId in project config for use by the auditor
        const { getGenreProfile } = await import('@/types/genreProfile')
        const genreProfile = getGenreProfile(createForm.genre)
        if (genreProfile) {
          await projectStore.openProject(project.id)
          if (projectStore.currentProject) {
            if (!projectStore.currentProject.config) {
              projectStore.currentProject.config = {} as ProjectConfig
            }
            ;(projectStore.currentProject.config as Record<string, unknown>).genreId = genreProfile.id
            await projectStore.saveCurrentProject()
          }
        }

        // 短篇小说模式：设置短篇配置
        if (createForm.template === 'short_fiction') {
          await projectStore.openProject(project.id)
          if (projectStore.currentProject) {
            if (!projectStore.currentProject.config) {
              projectStore.currentProject.config = {} as ProjectConfig
            }
            ;(projectStore.currentProject.config as Record<string, unknown>).projectType = 'short_fiction'
            projectStore.currentProject.config.advancedSettings = {
              ...projectStore.currentProject.config.advancedSettings,
              targetWordCount: Math.min(createForm.targetWords, 30000),
              targetChapters: 1,
            }
            await projectStore.saveCurrentProject()
          }
          creating.value = false
          showCreateDialog.value = false
          ElMessage.success('短篇小说项目创建成功！请在章节中直接开始写作。')
          openProject(project.id)
          return
        }

        // 同人创作模式：显示同人创作对话框
        if (createForm.template === 'fanfic') {
          creating.value = false
          showCreateDialog.value = false
          showFanficDialog.value = true
          return
        }

        const templateId = TEMPLATE_BY_CREATE_OPTION[createForm.template]
        if (templateId) {
          await applyCreateTemplate(project, templateId)
        }

        ElMessage.success('项目创建成功！')
        showCreateDialog.value = false
        
        // 重置表单
        createFormRef.value?.resetFields()
        
        // 跳转到项目详情页
        router.push(`/project/${project.id}`)
      } catch (error) {
        logger.error('创建项目失败:', error)
        ElMessage.error(getFriendlyMessage('创建失败'))
      } finally {
        creating.value = false
      }
    }
  })
}

// 导入项目
const handleImport = async (file: any) => {
  try {
    const rawFile = file.raw
    if (!rawFile) return

    ElMessage.info({ message: '正在导入项目...', duration: 0 })
    
    await projectStore.importProject(rawFile)
    
    // 关闭所有可能的消息提示
    ElMessage.closeAll()
    ElMessage.success('导入成功')
    showImportDialog.value = false
    
    // 刷新列表
    await projectStore.loadProjects()
  } catch (error) {
    ElMessage.closeAll()
    logger.error('导入失败:', error)
    ElMessage.error('导入失败: ' + getFriendlyMessage((error as Error).message))
  }
}

// 操作菜单
const handleCommand = async (command: string, projectId: string) => {
  switch (command) {
    case 'edit':
      openProject(projectId)
      break
    case 'export':
      try {
        await projectStore.exportProject(projectId)
        ElMessage.success('导出准备中，即将开始下载')
      } catch (error) {
        ElMessage.error(getFriendlyMessage('导出失败'))
      }
      break
    case 'delete':
      deleteProject(projectId)
      break
  }
}

// 打开项目
const openProject = (projectId: string) => {
  router.push(`/project/${projectId}`)
}

// 删除项目
const deleteProject = (projectId: string) => {
  ElMessageBox.confirm(
    '确认要删除这个项目吗？所有数据将被永久删除，此操作不可恢复！',
    '警告',
    {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger'
    }
  ).then(async () => {
    try {
      await projectStore.deleteProject(projectId)
      ElMessage.success('项目已删除')
    } catch (error) {
      logger.error('删除项目失败:', error)
      ElMessage.error(getFriendlyMessage('删除失败'))
    }
  }).catch(() => {})
}

// 从模板创建项目
function handleTemplateSelect(template: NovelTemplate) {
  selectedTemplate.value = template
  templateProjectName.value = template.meta.name + ' - 新项目'
  templateImportOptions.value = ['world', 'characters', 'outline']
}

async function createFromTemplate() {
  if (!selectedTemplate.value) return
  if (!templateProjectName.value.trim()) {
    ElMessage.warning('请输入项目名称')
    return
  }

  creatingFromTemplate.value = true
  try {
    // 1. 创建基础项目
    const project = await projectStore.createProject(
      templateProjectName.value,
      selectedTemplate.value.meta.tags?.[0] || '其他',
      200000 // 默认目标字数
    )

    // 2. 加载项目以进行修改
    await projectStore.openProject(project.id)
    
    // 3. 应用模板内容
    if (projectStore.currentProject) {
      const templateData = selectedTemplate.value
      const projectId = projectStore.currentProject.id

      // Use templateManager.applyTemplate which returns V5 Entity data
      const { projectFields, entities: templateEntities } = templateManager.applyTemplate(
        templateData.meta.id,
        projectStore.currentProject.title,
        templateData.meta.description
      )

      // Apply project fields (outline, config, description)
      if (templateImportOptions.value.includes('outline') && projectFields.outline) {
        projectStore.currentProject.outline = projectFields.outline
      }

      // Apply V5 entities to sandbox store
      const sandboxStore = useSandboxStore()
      for (const entity of templateEntities) {
        // Skip entities not selected by user
        if (entity.type === 'CHARACTER' && !templateImportOptions.value.includes('characters')) continue
        if (entity.type !== 'CHARACTER' && !templateImportOptions.value.includes('world')) continue

        entity.projectId = projectId
        await sandboxStore.addEntity(entity)
      }

      // Update project metadata
      if (projectFields.config) {
        projectStore.currentProject.config = projectFields.config as ProjectConfig
      }
      projectStore.currentProject.description = templateData.meta.description

      // Save project
      await projectStore.saveCurrentProject()
    }

    ElMessage.success(`已从模板"${selectedTemplate.value.meta.name}"创建作品`)
    showTemplateCreateDialog.value = false
    selectedTemplate.value = null

    // 打开项目
    router.push(`/project/${project.id}`)
  } catch (error) {
    logger.error('[ProjectList] 从模板创建失败:', error)
    ElMessage.error('创建失败: ' + getFriendlyMessage((error as Error).message))
  } finally {
    creatingFromTemplate.value = false
  }
}

// 辅助函数
function getProgress(current?: number | null, target?: number | null) {
  if (!current || !target) return 0
  return Math.min(100, Math.round((current / target) * 100))
}

function getAccentGradient(genre?: string) {
  const gradients: Record<string, string> = {
    '玄幻': 'linear-gradient(90deg, #6c5ce7, #a78bfa)',
    '都市': 'linear-gradient(90deg, #3b82f6, #60a5fa)',
    '科幻': 'linear-gradient(90deg, #06b6d4, #22d3ee)',
    '武侠': 'linear-gradient(90deg, #f59e0b, #fbbf24)',
    '历史': 'linear-gradient(90deg, #ef4444, #f87171)',
    '言情': 'linear-gradient(90deg, #ec4899, #f472b6)',
    '悬疑': 'linear-gradient(90deg, #8b5cf6, #c084fc)',
    '游戏': 'linear-gradient(90deg, #10b981, #34d399)',
    '奇幻': 'linear-gradient(90deg, #6366f1, #818cf8)',
    '轻小说': 'linear-gradient(90deg, #f97316, #fb923c)'
  }
  return gradients[genre || ''] || 'linear-gradient(90deg, var(--ds-accent), var(--ds-accent-hover))'
}
</script>

<style scoped>
.project-list {
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--ds-accent) 16%, transparent), transparent 34%),
    var(--ds-bg-primary);
  padding: var(--ds-space-8);
  color: var(--ds-text-primary);
  overflow-y: auto;
}

.hero-section {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: var(--ds-space-6);
  margin-bottom: var(--ds-space-10);
  padding-bottom: var(--ds-space-6);
  border-bottom: 1px solid var(--ds-surface-border);
}

.hero-kicker {
  margin: 0 0 var(--ds-space-2);
  color: var(--ds-accent-text);
  font-size: var(--ds-text-xs);
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.hero-title {
  margin: 0;
  font-size: var(--ds-text-3xl);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.1;
  background: linear-gradient(135deg, var(--ds-text-primary), var(--ds-accent-text));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-subtitle {
  margin: var(--ds-space-2) 0 0;
  color: var(--ds-text-tertiary);
  font-size: var(--ds-text-md);
}

.hero-actions,
.empty-actions {
  display: flex;
  gap: var(--ds-space-3);
  flex-wrap: wrap;
}

.main {
  min-height: 320px;
}

.empty-state {
  max-width: 560px;
  margin: var(--ds-space-12) auto;
  padding: var(--ds-space-10);
  text-align: center;
}

.empty-icon {
  margin-bottom: var(--ds-space-4);
  opacity: 0.6;
}

.empty-state h2 {
  margin: 0;
  font-size: var(--ds-text-2xl);
  background: linear-gradient(135deg, var(--ds-text-primary), var(--ds-accent-text));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.empty-state p {
  margin: var(--ds-space-3) auto var(--ds-space-6);
  max-width: 420px;
  color: var(--ds-text-secondary);
}

.empty-actions {
  justify-content: center;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--ds-space-5);
}

.project-card {
  background: var(--ds-surface);
  border: 1px solid var(--ds-surface-border);
  border-radius: var(--ds-radius-lg);
  overflow: hidden;
  cursor: pointer;
  transition: all var(--ds-transition-normal);
  opacity: 0;
}

.project-card:hover {
  border-color: var(--ds-accent);
  transform: translateY(-3px);
  box-shadow: var(--ds-shadow-lg), var(--ds-shadow-glow);
}

.card-accent {
  height: 4px;
}

.card-body {
  padding: var(--ds-space-5);
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ds-space-3);
}

.card-title {
  min-width: 0;
  margin: 0;
  color: var(--ds-text-primary);
  font-size: var(--ds-text-lg);
  font-weight: 600;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.more-btn {
  color: var(--ds-text-tertiary);
  cursor: pointer;
  padding: var(--ds-space-1);
  border-radius: var(--ds-radius-sm);
  transition: all var(--ds-transition-fast);
}

.more-btn:hover {
  background: var(--ds-bg-hover);
  color: var(--ds-text-primary);
}

.card-meta {
  display: flex;
  align-items: center;
  gap: var(--ds-space-2);
  margin-top: var(--ds-space-3);
  color: var(--ds-text-tertiary);
  font-size: var(--ds-text-sm);
  flex-wrap: wrap;
}

.card-date {
  margin-left: auto;
}

.card-description {
  min-height: 44px;
  margin: var(--ds-space-4) 0 0;
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-sm);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-description.muted {
  color: var(--ds-text-tertiary);
}

.card-progress {
  margin-top: var(--ds-space-5);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  gap: var(--ds-space-3);
  margin-bottom: var(--ds-space-2);
  font-size: var(--ds-text-xs);
}

.progress-text {
  color: var(--ds-text-tertiary);
  font-family: var(--ds-font-mono);
}

.progress-percent {
  color: var(--ds-accent-text);
  font-weight: 600;
}

.progress-bar {
  height: 4px;
  background: var(--ds-bg-tertiary);
  border-radius: var(--ds-radius-full);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--ds-accent), var(--ds-accent-hover));
  border-radius: var(--ds-radius-full);
  transition: width var(--ds-transition-slow);
}

.form-tip {
  font-size: var(--ds-text-xs);
  color: var(--ds-text-tertiary);
  margin-top: var(--ds-space-1);
  line-height: 1.4;
}

.template-create-form {
  padding: 0 var(--ds-space-5);
}

.mr-2 {
  margin-right: var(--ds-space-2);
}

.mt-4 {
  margin-top: var(--ds-space-4);
}

.mb-4 {
  margin-bottom: var(--ds-space-4);
}

/* breakpoint: md (768px) */
@media (max-width: 768px) {
  .project-list {
    padding: var(--ds-space-5);
  }

  .hero-section {
    flex-direction: column;
    align-items: flex-start;
  }

  .hero-title {
    font-size: var(--ds-text-2xl);
  }

  .project-grid {
    grid-template-columns: 1fr;
  }

  .hero-actions {
    width: 100%;
  }
}
</style>
