<template>
  <div class="project-list">
    <!-- 头部工具栏 -->
    <div class="header">
      <div class="header-content">
        <h1>我的项目</h1>
        <p class="subtitle">管理你的小说创作项目</p>
      </div>
      <div class="header-actions">
        <el-button @click="showImportDialog = true">
          <el-icon><Upload /></el-icon> 导入项目
        </el-button>
        <el-button type="primary" @click="showCreateDialog = true">
          <el-icon><Plus /></el-icon> 新建项目
        </el-button>
      </div>
    </div>

    <!-- 项目列表内容 -->
    <div class="main" v-loading="projectStore.loading">
      <el-empty
        v-if="!projectStore.loading && projectStore.projects.length === 0"
        description="暂无项目，开始你的创作之旅吧！"
      >
        <el-button type="primary" @click="showCreateDialog = true">新建项目</el-button>
        <el-button @click="showTemplateCreateDialog = true" style="margin-left: 10px;">从模板创建</el-button>
      </el-empty>

      <div v-else class="project-grid">
        <el-card
          v-for="project in projectStore.projects"
          :key="project.id"
          class="project-card"
          shadow="hover"
          @click="openProject(project.id)"
        >
          <template #header>
            <div class="card-header">
              <span class="project-title" :title="project.title">{{ project.title }}</span>
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
          </template>

          <div class="project-content">
            <div class="info-row">
              <span class="label">类型：</span>
              <el-tag size="small" type="info">{{ project.genre || '未分类' }}</el-tag>
            </div>
            
            <div class="info-row status-row">
              <span class="label">状态：</span>
              <el-tag size="small" :type="getStatusType(project.status)">
                {{ getStatusText(project.status) }}
              </el-tag>
            </div>

            <div class="progress-section">
              <div class="progress-info">
                <span class="words">{{ formatNumber(project.currentWords) }} / {{ formatNumber(project.targetWords) }} 字</span>
                <span class="percent">{{ getProgress(project.currentWords, project.targetWords) }}%</span>
              </div>
              <el-progress 
                :percentage="getProgress(project.currentWords, project.targetWords)" 
                :show-text="false"
                :color="getProgressColor"
              />
            </div>

            <div class="project-footer">
              <span class="update-time">最后更新：{{ formatDate(project.updatedAt) }}</span>
            </div>
          </div>
        </el-card>
      </div>
    </div>

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
          <el-select v-model="createForm.genre" placeholder="请选择小说类型" style="width: 100%">
            <el-option label="玄幻修仙" value="玄幻" />
            <el-option label="科幻未来" value="科幻" />
            <el-option label="都市现实" value="都市" />
            <el-option label="奇幻魔法" value="奇幻" />
            <el-option label="武侠江湖" value="武侠" />
            <el-option label="历史军事" value="历史" />
            <el-option label="悬疑推理" value="悬疑" />
            <el-option label="游戏竞技" value="游戏" />
            <el-option label="轻小说" value="轻小说" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>

        <el-form-item label="目标字数" prop="targetWords">
          <el-input-number 
            v-model="createForm.targetWords" 
            :min="10000" 
            :max="10000000"
            :step="50000"
            style="width: 100%"
          />
          <div class="form-tip">建议长篇小说目标设定在 100 万字以上</div>
        </el-form-item>

        <el-form-item label="创作模板" prop="template">
          <el-select v-model="createForm.template" placeholder="选择初始结构模板" style="width: 100%">
            <el-option label="空白项目 (自定义设定)" value="blank" />
            <el-option label="标准网文 (包含常用设定和卷架构)" value="standard" />
            <el-option label="快速大纲 (AI辅助生成框架)" value="quick_outline" />
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive, defineAsyncComponent } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus, Edit, Download, Delete, MoreFilled, UploadFilled, Upload } from '@element-plus/icons-vue'
const TemplateLibrary = defineAsyncComponent(() => import('@/components/TemplateLibrary.vue'))
import type { NovelTemplate } from '@/types'

const router = useRouter()
const projectStore = useProjectStore()

// 对话框状态
const showCreateDialog = ref(false)
const showImportDialog = ref(false)
const showTemplateCreateDialog = ref(false)

// 表单相关
const createFormRef = ref<FormInstance>()
const creating = ref(false)

const createForm = reactive({
  title: '',
  genre: '',
  targetWords: 1000000,
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

        // TODO: 处理模板逻辑（如果是标准网文，预置一些设定结构）
        if (createForm.template === 'standard') {
          // 初始化标准结构...
        }

        ElMessage.success('项目创建成功！')
        showCreateDialog.value = false
        
        // 重置表单
        createFormRef.value?.resetFields()
        
        // 跳转到项目详情页
        router.push(`/project/${project.id}`)
      } catch (error) {
        console.error('创建项目失败:', error)
        ElMessage.error('创建失败，请稍后重试')
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
    console.error('导入失败:', error)
    ElMessage.error(`导入失败: ${(error as Error).message}`)
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
        ElMessage.error('导出失败')
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
      console.error('删除项目失败:', error)
      ElMessage.error('删除失败')
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
      1000000 // 默认目标字数
    )

    // 2. 加载项目以进行修改
    await projectStore.openProject(project.id)
    
    // 3. 应用模板内容
    if (projectStore.currentProject) {
      const templateData = selectedTemplate.value
      const projectData = projectStore.currentProject

      if (templateImportOptions.value.includes('world')) {
        projectData.world = JSON.parse(JSON.stringify(templateData.world))
        // 更新所有实体的ID以避免冲突
        projectData.world.id = crypto.randomUUID()
      }

      if (templateImportOptions.value.includes('characters')) {
        projectData.characters = JSON.parse(JSON.stringify(templateData.characters)).map((c: any) => ({
          ...c,
          id: crypto.randomUUID()
        }))
      }

      if (templateImportOptions.value.includes('outline')) {
        projectData.outline = JSON.parse(JSON.stringify(templateData.outline))
        projectData.outline.id = crypto.randomUUID()
      }

      // 更新项目元数据
      if (projectStore.currentProject) {
        projectStore.currentProject.config = projectData.config
        projectStore.currentProject.description = selectedTemplate.value.meta.description
      }

      // 保存项目
      await projectStore.saveCurrentProject()
    }

    ElMessage.success(`已从模板"${selectedTemplate.value.meta.name}"创建作品`)
    showTemplateCreateDialog.value = false
    selectedTemplate.value = null

    // 打开项目
    router.push(`/project/${project.id}`)
  } catch (error) {
    console.error('[ProjectList] 从模板创建失败:', error)
    ElMessage.error('创建失败: ' + (error as Error).message)
  } finally {
    creatingFromTemplate.value = false
  }
}

// 辅助函数
function getStatusType(status: string) {
  const types: Record<string, any> = {
    draft: 'info',
    writing: 'warning',
    completed: 'success'
  }
  return types[status] || 'info'
}

function getStatusText(status: string) {
  const texts: Record<string, string> = {
    draft: '草稿',
    writing: '写作中',
    completed: '已完成'
  }
  return texts[status] || status
}

function formatNumber(num?: number | null) {
  if (num === undefined || num === null || isNaN(num)) return '0'
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + '万'
  }
  return num.toString()
}

function getProgress(current?: number | null, target?: number | null) {
  if (!current || !target) return 0
  return Math.min(100, Math.round((current / target) * 100))
}

function formatDate(date: Date | string) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const getProgressColor = (percentage: number) => {
  if (percentage < 30) return '#909399'
  if (percentage < 70) return '#e6a23c'
  return '#67c23a'
}
</script>

<style scoped>
.project-list {
  height: 100vh;
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

.header-content h1 {
  margin: 0;
  font-size: 24px;
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
}

.main {
  flex: 1;
  padding: 20px 40px;
  overflow-y: auto;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #909399;
}

.loading .el-icon {
  font-size: 32px;
  margin-bottom: 10px;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.project-card {
  cursor: pointer;
  transition: all 0.3s ease;
  border: 1px solid #e4e7ed;
}

.project-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
  border-color: #c0c4cc;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.project-title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.more-btn {
  font-size: 20px;
  color: #909399;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.more-btn:hover {
  background-color: #f0f2f5;
  color: #303133;
}

.project-content {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.info-row {
  display: flex;
  align-items: center;
  font-size: 14px;
}

.info-row .label {
  color: #909399;
  width: 60px;
}

.progress-section {
  background: #f8f9fa;
  padding: 12px;
  border-radius: 8px;
  margin-top: 5px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
}

.progress-info .words {
  color: #606266;
  font-family: monospace;
}

.progress-info .percent {
  color: #409eff;
  font-weight: 600;
}

.project-footer {
  margin-top: auto;
  padding-top: 15px;
  border-top: 1px solid #ebeef5;
  display: flex;
  justify-content: flex-end;
}

.update-time {
  font-size: 12px;
  color: #c0c4cc;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 5px;
  line-height: 1.4;
}

/* 响应式调整 */
@media (max-width: 768px) {
  .header {
    flex-direction: column;
    align-items: flex-start;
    gap: 15px;
    padding: 15px 20px;
  }
  
  .main {
    padding: 15px 20px;
  }
  
  .project-grid {
    grid-template-columns: 1fr;
  }
}

.template-create-form {
  padding: 0 20px;
}

.mr-2 {
  margin-right: 8px;
}

.mt-4 {
  margin-top: 16px;
}

.mb-4 {
  margin-bottom: 16px;
}
</style>
