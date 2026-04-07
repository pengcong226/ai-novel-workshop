<template>
  <div class="timeline-editor">
    <el-card class="header-card">
      <div class="header">
        <h2>时间线编辑器</h2>
        <div class="actions">
          <el-button @click="extractFromProject">
            <el-icon><Refresh /></el-icon>
            提取事件
          </el-button>
          <el-button @click="addCustomEvent">
            <el-icon><Plus /></el-icon>
            添加事件
          </el-button>
          <el-button @click="checkConflicts" type="warning">
            <el-icon><Warning /></el-icon>
            检测冲突
          </el-button>
          <el-button @click="exportTimeline" type="success">
            <el-icon><Download /></el-icon>
            导出图片
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 工具栏 -->
    <el-card class="toolbar-card">
      <div class="toolbar">
        <div class="toolbar-group">
          <span class="label">显示轨道:</span>
          <el-checkbox-group v-model="visibleGroups">
            <el-checkbox value="main">主线</el-checkbox>
            <el-checkbox value="chapters">章节</el-checkbox>
            <el-checkbox value="events">主要事件</el-checkbox>
            <el-checkbox value="goals">目标</el-checkbox>
            <el-checkbox value="conflicts">冲突</el-checkbox>
            <el-checkbox value="foreshadowing">伏笔</el-checkbox>
            <el-checkbox value="scenes">场景</el-checkbox>
          </el-checkbox-group>
        </div>

        <div class="toolbar-group">
          <span class="label">事件类型:</span>
          <el-checkbox-group v-model="visibleTypes">
            <el-checkbox value="main">主线</el-checkbox>
            <el-checkbox value="subplot">支线</el-checkbox>
            <el-checkbox value="character">人物</el-checkbox>
            <el-checkbox value="foreshadowing">伏笔</el-checkbox>
            <el-checkbox value="custom">自定义</el-checkbox>
          </el-checkbox-group>
        </div>

        <div class="toolbar-group">
          <span class="label">视图:</span>
          <el-radio-group v-model="viewMode" @change="handleViewModeChange">
            <el-radio-button value="day">日视图</el-radio-button>
            <el-radio-button value="week">周视图</el-radio-button>
            <el-radio-button value="month">月视图</el-radio-button>
          </el-radio-group>
        </div>
      </div>
    </el-card>

    <!-- 冲突提示 -->
    <el-alert
      v-if="conflicts.length > 0"
      :title="`检测到 ${conflicts.length} 个时间线冲突`"
      type="warning"
      show-icon
      closable
      class="conflict-alert"
    >
      <div class="conflict-list">
        <div v-for="(conflict, index) in conflicts" :key="index" class="conflict-item">
          <el-tag :type="conflict.severity === 'error' ? 'danger' : 'warning'" size="small">
            {{ conflict.type === 'overlap' ? '重叠' : conflict.type === 'gap' ? '未完成' : '矛盾' }}
          </el-tag>
          <span>{{ conflict.description }}</span>
        </div>
      </div>
    </el-alert>

    <!-- 时间线容器 -->
    <el-card class="timeline-card">
      <div ref="timelineContainer" class="timeline-container"></div>
    </el-card>

    <!-- 事件编辑对话框 -->
    <el-dialog
      v-model="showEventDialog"
      :title="editingEvent ? '编辑事件' : '添加事件'"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form :model="eventForm" label-width="100px">
        <el-form-item label="事件内容">
          <el-input v-model="eventForm.content" placeholder="事件描述" />
        </el-form-item>

        <el-form-item label="起始章节">
          <el-input-number v-model="eventForm.start" :min="1" />
        </el-form-item>

        <el-form-item label="结束章节">
          <el-input-number v-model="eventForm.end" :min="eventForm.start" placeholder="留空表示单点事件" />
        </el-form-item>

        <el-form-item label="事件类型">
          <el-select v-model="eventForm.type">
            <el-option label="主线" value="main" />
            <el-option label="支线" value="subplot" />
            <el-option label="人物" value="character" />
            <el-option label="伏笔" value="foreshadowing" />
            <el-option label="自定义" value="custom" />
          </el-select>
        </el-form-item>

        <el-form-item label="所属轨道">
          <el-input v-model="eventForm.group" placeholder="轨道名称" />
        </el-form-item>

        <el-form-item label="事件标题">
          <el-input v-model="eventForm.title" placeholder="可选" />
        </el-form-item>

        <el-form-item label="详细描述">
          <el-input
            v-model="eventForm.description"
            type="textarea"
            :rows="3"
            placeholder="可选"
          />
        </el-form-item>

        <el-form-item label="相关人物">
          <el-select
            v-model="eventForm.characterIds"
            multiple
            placeholder="选择相关人物"
          >
            <el-option
              v-for="char in characters"
              :key="char.id"
              :label="char.name"
              :value="char.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="标签">
          <el-select
            v-model="eventForm.tags"
            multiple
            filterable
            allow-create
            placeholder="添加标签"
          >
            <el-option v-for="tag in availableTags" :key="tag" :label="tag" :value="tag" />
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showEventDialog = false">取消</el-button>
        <el-button v-if="editingEvent" type="danger" @click="deleteEvent">删除</el-button>
        <el-button type="primary" @click="saveEvent">保存</el-button>
      </template>
    </el-dialog>

    <!-- 事件详情对话框 -->
    <el-dialog
      v-model="showDetailDialog"
      title="事件详情"
      width="500px"
    >
      <div v-if="selectedEvent" class="event-detail">
        <div class="detail-item">
          <span class="label">内容:</span>
          <span>{{ selectedEvent.content }}</span>
        </div>
        <div class="detail-item">
          <span class="label">章节:</span>
          <span>第 {{ selectedEvent.start }} 章</span>
          <span v-if="selectedEvent.end"> 至 第 {{ selectedEvent.end }} 章</span>
        </div>
        <div class="detail-item">
          <span class="label">类型:</span>
          <el-tag :type="getEventTypeTag(selectedEvent.type)">
            {{ getEventTypeLabel(selectedEvent.type) }}
          </el-tag>
        </div>
        <div v-if="selectedEvent.group" class="detail-item">
          <span class="label">轨道:</span>
          <span>{{ selectedEvent.group }}</span>
        </div>
        <div v-if="selectedEvent.title" class="detail-item">
          <span class="label">标题:</span>
          <span>{{ selectedEvent.title }}</span>
        </div>
        <div v-if="selectedEvent.description" class="detail-item">
          <span class="label">描述:</span>
          <p>{{ selectedEvent.description }}</p>
        </div>
        <div v-if="selectedEvent.characterIds && selectedEvent.characterIds.length > 0" class="detail-item">
          <span class="label">相关人物:</span>
          <div class="character-list">
            <el-tag
              v-for="charId in selectedEvent.characterIds"
              :key="charId"
              size="small"
              style="margin-right: 5px;"
            >
              {{ getCharacterName(charId) }}
            </el-tag>
          </div>
        </div>
        <div v-if="selectedEvent.tags && selectedEvent.tags.length > 0" class="detail-item">
          <span class="label">标签:</span>
          <div class="tag-list">
            <el-tag
              v-for="tag in selectedEvent.tags"
              :key="tag"
              size="small"
              type="info"
              style="margin-right: 5px;"
            >
              {{ tag }}
            </el-tag>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useProjectStore } from '@/stores/project'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh, Warning, Download } from '@element-plus/icons-vue'
import { v4 as uuidv4 } from 'uuid'
import type { TimelineEvent, TimelineEventType, TimelineConflict } from '@/utils/timelineExtractor'
import {
  extractTimelineEvents,
  generateTimelineGroups,
  detectTimelineConflicts,
  toVisTimelineData
} from '@/utils/timelineExtractor'

// vis-timeline 类型定义（简化版）
interface VisTimeline {
  setItems(items: any): void
  setGroups(groups: any): void
  fit(): void
  destroy(): void
  on(event: string, callback: Function): void
  off(event: string, callback: Function): void
  getVisibleItems(): string[]
  moveTo(time: number, options?: any): void
  setWindow(start: any, end: any, options?: any): void
}

interface VisDataSet {
  add(items: any): void
  update(items: any): void
  remove(id: string): void
  clear(): void
  get(): any[]
  getDataSet(): VisDataSet
}

const projectStore = useProjectStore()
const project = computed(() => projectStore.currentProject)
const characters = computed(() => project.value?.characters || [])

// 时间线相关
const timelineContainer = ref<HTMLElement>()
let timeline: VisTimeline | null = null
let items: VisDataSet | null = null
let groups: VisDataSet | null = null

// 事件数据
const timelineEvents = ref<TimelineEvent[]>([])
const conflicts = ref<TimelineConflict[]>([])

// 显示控制
const visibleGroups = ref(['main', 'chapters', 'events', 'goals', 'conflicts', 'foreshadowing', 'scenes'])
const visibleTypes = ref(['main', 'subplot', 'character', 'foreshadowing', 'custom'])
const viewMode = ref('week')

// 对话框
const showEventDialog = ref(false)
const showDetailDialog = ref(false)
const editingEvent = ref<TimelineEvent | null>(null)
const selectedEvent = ref<TimelineEvent | null>(null)

// 事件表单
const eventForm = ref<TimelineEvent>({
  id: '',
  content: '',
  start: 1,
  type: 'main',
  group: 'main',
  title: '',
  description: '',
  characterIds: [],
  tags: []
})

// 可用标签
const availableTags = ref(['重要', '关键', '转折', '伏笔', '高潮', '冲突', '解决'])

// 监听project变化
watch(project, (newProject) => {
  if (newProject) {
    extractFromProject()
  }
}, { immediate: true })

onMounted(async () => {
  await nextTick()
  initTimeline()
})

onBeforeUnmount(() => {
  if (timeline) {
    timeline.destroy()
    timeline = null
  }
})

/**
 * 初始化时间线
 */
async function initTimeline() {
  if (!timelineContainer.value) return

  try {
    // 动态导入 vis-timeline
    const vis = await import('vis-timeline/standalone')

    // 创建数据集
    items = new vis.DataSet([])
    groups = new vis.DataSet([])

    // 配置选项
    const options = {
      orientation: 'top',
      zoomable: true,
      moveable: true,
      editable: true,
      multiselect: true,
      stack: true,
      stackSubgroups: true,
      horizontalScroll: true,
      verticalScroll: true,
      zoomKey: 'ctrlKey',
      format: {
        minorLabels: {
          millisecond: '',
          second: '',
          minute: '',
          hour: '',
          weekday: '第 w 章',
          day: '第 D 章',
          week: '第 w 章',
          month: '第 M 章',
          year: 'Y年'
        },
        majorLabels: {
          millisecond: '',
          second: '',
          minute: '',
          hour: '',
          weekday: '',
          day: '',
          week: '',
          month: '',
          year: ''
        }
      },
      onAdd: (item: any, callback: Function) => {
        handleAddItem(item, callback)
      },
      onUpdate: (item: any, callback: Function) => {
        handleUpdateItem(item, callback)
      },
      onMove: (item: any, callback: Function) => {
        handleMoveItem(item, callback)
      },
      onRemove: (item: any, callback: Function) => {
        handleRemoveItem(item, callback)
      }
    }

    // 创建时间线实例
    timeline = new vis.Timeline(timelineContainer.value, items, groups, options)

    // 添加事件监听
    timeline.on('click', handleTimelineClick)
    timeline.on('contextmenu', handleTimelineRightClick)
    timeline.on('doubleClick', handleTimelineDoubleClick)

    // 如果已有项目，提取事件
    if (project.value) {
      extractFromProject()
    }
  } catch (error) {
    console.error('初始化时间线失败:', error)
    ElMessage.error('初始化时间线失败')
  }
}

/**
 * 从项目提取事件
 */
function extractFromProject() {
  if (!project.value) {
    ElMessage.warning('请先打开或创建项目')
    return
  }

  try {
    // 提取事件
    const events = extractTimelineEvents(project.value)
    timelineEvents.value = events

    // 生成分组
    const allGroups = generateTimelineGroups(project.value)

    // 过滤显示的分组和类型
    const filteredEvents = events.filter(event => {
      return visibleGroups.value.includes(event.group || '') &&
             visibleTypes.value.includes(event.type)
    })

    // 转换为vis-timeline数据格式
    const { items: visItems, groups: visGroups } = toVisTimelineData(filteredEvents)

    // 更新数据集
    if (items) {
      items.clear()
      items.add(visItems)
    }

    if (groups) {
      groups.clear()
      groups.add(allGroups.map(g => ({
        id: g.id,
        content: g.content,
        className: g.className
      })))
    }

    // 自适应视图
    if (timeline) {
      timeline.fit()
    }

    ElMessage.success(`成功提取 ${events.length} 个事件`)
  } catch (error) {
    console.error('提取事件失败:', error)
    ElMessage.error('提取事件失败')
  }
}

/**
 * 添加自定义事件
 */
function addCustomEvent() {
  editingEvent.value = null
  eventForm.value = {
    id: uuidv4(),
    content: '',
    start: 1,
    type: 'custom',
    group: 'custom',
    title: '',
    description: '',
    characterIds: [],
    tags: []
  }
  showEventDialog.value = true
}

/**
 * 保存事件
 */
function saveEvent() {
  if (!eventForm.value.content.trim()) {
    ElMessage.warning('请输入事件内容')
    return
  }

  try {
    const event: TimelineEvent = {
      ...eventForm.value,
      className: getEventClassName(eventForm.value.type)
    }

    if (editingEvent.value) {
      // 更新现有事件
      const index = timelineEvents.value.findIndex(e => e.id === event.id)
      if (index !== -1) {
        timelineEvents.value[index] = event
      }

      // 更新时间线
      if (items) {
        items.update({
          id: event.id,
          content: event.content,
          start: event.start,
          end: event.end,
          group: event.group,
          type: event.end ? 'range' : 'point',
          className: event.className,
          title: event.description || event.title || '',
          data: event
        })
      }
    } else {
      // 添加新事件
      timelineEvents.value.push(event)

      // 添加到时间线
      if (items) {
        items.add({
          id: event.id,
          content: event.content,
          start: event.start,
          end: event.end,
          group: event.group,
          type: event.end ? 'range' : 'point',
          className: event.className,
          title: event.description || event.title || '',
          data: event
        })
      }
    }

    showEventDialog.value = false
    ElMessage.success('保存成功')
  } catch (error) {
    console.error('保存事件失败:', error)
    ElMessage.error('保存失败')
  }
}

/**
 * 删除事件
 */
async function deleteEvent() {
  if (!editingEvent.value) return

  try {
    // 从列表中删除
    timelineEvents.value = timelineEvents.value.filter(e => e.id !== editingEvent.value!.id)

    // 从时间线删除
    if (items) {
      items.remove(editingEvent.value.id)
    }

    showEventDialog.value = false
    ElMessage.success('删除成功')
  } catch (error) {
    console.error('删除事件失败:', error)
    ElMessage.error('删除失败')
  }
}

/**
 * 检测冲突
 */
function checkConflicts() {
  const detectedConflicts = detectTimelineConflicts(timelineEvents.value)
  conflicts.value = detectedConflicts

  if (detectedConflicts.length === 0) {
    ElMessage.success('未检测到时间线冲突')
  } else {
    ElMessage.warning(`检测到 ${detectedConflicts.length} 个时间线冲突`)
  }
}

/**
 * 导出时间线为图片
 */
async function exportTimeline() {
  if (!timelineContainer.value) return

  try {
    const { exportTimelineAsImage } = await import('@/utils/timelineExtractor')
    const blob = await exportTimelineAsImage(timelineContainer.value)

    if (blob) {
      // 创建下载链接
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `timeline-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      ElMessage.success('导出成功')
    } else {
      ElMessage.error('导出失败')
    }
  } catch (error) {
    console.error('导出失败:', error)
    ElMessage.error('导出失败，请确保安装了html2canvas库')
  }
}

/**
 * 时间线点击事件
 */
function handleTimelineClick(params: any) {
  if (params.item) {
    // 点击了事件项
    const item = items?.get(params.item)
    if (item && item.data) {
      selectedEvent.value = item.data
      showDetailDialog.value = true
    }
  }
}

/**
 * 时间线双击事件
 */
function handleTimelineDoubleClick(params: any) {
  if (params.item) {
    // 双击编辑
    const item = items?.get(params.item)
    if (item && item.data) {
      editingEvent.value = item.data
      eventForm.value = { ...item.data }
      showEventDialog.value = true
    }
  }
}

/**
 * 时间线右键菜单
 */
function handleTimelineRightClick(params: any) {
  params.event.preventDefault()

  if (params.item) {
    // 右键点击事件项
    // TODO: 实现右键菜单
    console.log('右键点击事件:', params.item)
  } else {
    // 右键点击空白处，添加新事件
    const chapter = Math.ceil(params.time / (24 * 60 * 60 * 1000)) // 转换为章节号
    eventForm.value = {
      id: uuidv4(),
      content: '',
      start: chapter,
      type: 'custom',
      group: 'custom',
      title: '',
      description: '',
      characterIds: [],
      tags: []
    }
    showEventDialog.value = true
  }
}

/**
 * 添加项目回调
 */
function handleAddItem(item: any, callback: Function) {
  const chapter = Math.ceil(item.start.getTime() / (24 * 60 * 60 * 1000))
  eventForm.value = {
    id: uuidv4(),
    content: '新事件',
    start: chapter,
    type: 'custom',
    group: item.group || 'custom',
    title: '',
    description: '',
    characterIds: [],
    tags: []
  }
  showEventDialog.value = true
  callback(null) // 取消默认行为，通过对话框处理
}

/**
 * 更新项目回调
 */
function handleUpdateItem(item: any, callback: Function) {
  const originalItem = items?.get(item.id)
  if (originalItem && originalItem.data) {
    editingEvent.value = originalItem.data
    eventForm.value = { ...originalItem.data }
    showEventDialog.value = true
  }
  callback(null) // 取消默认行为，通过对话框处理
}

/**
 * 移动项目回调
 */
function handleMoveItem(item: any, callback: Function) {
  const chapter = Math.ceil(item.start.getTime() / (24 * 60 * 60 * 1000))
  const originalItem = items?.get(item.id)

  if (originalItem && originalItem.data) {
    // 更新事件数据
    const event: TimelineEvent = {
      ...originalItem.data,
      start: chapter,
      end: item.end ? Math.ceil(item.end.getTime() / (24 * 60 * 60 * 1000)) : undefined
    }

    // 更新列表
    const index = timelineEvents.value.findIndex(e => e.id === event.id)
    if (index !== -1) {
      timelineEvents.value[index] = event
    }

    // 允许移动
    callback(item)
  } else {
    callback(null)
  }
}

/**
 * 删除项目回调
 */
function handleRemoveItem(item: any, callback: Function) {
  const originalItem = items?.get(item.id)
  if (originalItem && originalItem.data) {
    editingEvent.value = originalItem.data
    ElMessageBox.confirm('确定要删除这个事件吗？', '删除事件', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    }).then(() => {
      timelineEvents.value = timelineEvents.value.filter(e => e.id !== item.id)
      callback(item)
      ElMessage.success('删除成功')
    }).catch(() => {
      callback(null)
    })
  } else {
    callback(null)
  }
}

/**
 * 视图模式改变
 */
function handleViewModeChange() {
  if (!timeline) return

  // 根据视图模式调整时间范围
  const minChapter = Math.min(...timelineEvents.value.map(e => e.start))
  const maxChapter = Math.max(...timelineEvents.value.map(e => e.end || e.start))

  // 这里需要根据viewMode调整显示范围
  timeline.fit()
}

/**
 * 获取事件样式类名
 */
function getEventClassName(type: TimelineEventType): string {
  const classNames: Record<TimelineEventType, string> = {
    main: 'event-main',
    subplot: 'event-subplot',
    character: 'event-character',
    foreshadowing: 'event-foreshadowing',
    custom: 'event-custom'
  }
  return classNames[type] || 'event-default'
}

/**
 * 获取事件类型标签
 */
function getEventTypeTag(type: TimelineEventType): string {
  const tags: Record<TimelineEventType, string> = {
    main: '',
    subplot: 'success',
    character: 'warning',
    foreshadowing: 'info',
    custom: 'info'
  }
  return tags[type] || 'info'
}

/**
 * 获取事件类型标签文本
 */
function getEventTypeLabel(type: TimelineEventType): string {
  const labels: Record<TimelineEventType, string> = {
    main: '主线',
    subplot: '支线',
    character: '人物',
    foreshadowing: '伏笔',
    custom: '自定义'
  }
  return labels[type] || type
}

/**
 * 获取人物名称
 */
function getCharacterName(charId: string): string {
  const char = characters.value.find(c => c.id === charId)
  return char?.name || charId
}
</script>

<style scoped>
.timeline-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
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

.toolbar-card {
  margin-bottom: 20px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: center;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.toolbar-group .label {
  font-weight: 600;
  color: #606266;
  white-space: nowrap;
}

.conflict-alert {
  margin-bottom: 20px;
}

.conflict-list {
  max-height: 200px;
  overflow-y: auto;
}

.conflict-item {
  padding: 5px 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.timeline-card {
  flex: 1;
  overflow: hidden;
}

.timeline-container {
  width: 100%;
  height: 600px;
}

.event-detail {
  padding: 10px 0;
}

.detail-item {
  margin-bottom: 15px;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
}

.detail-item .label {
  font-weight: 600;
  color: #606266;
  min-width: 80px;
}

.detail-item p {
  margin: 5px 0 0 0;
  line-height: 1.6;
}

.character-list,
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

/* vis-timeline 样式覆盖 */
:deep(.vis-timeline) {
  border: none !important;
  font-family: inherit;
}

:deep(.vis-panel) {
  border-color: #e4e7ed !important;
}

:deep(.vis-time-axis) {
  background-color: #f5f7fa;
}

:deep(.vis-item) {
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

:deep(.vis-item:hover) {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transform: translateY(-1px);
}

:deep(.vis-item.event-main) {
  background-color: #409eff;
  border-color: #409eff;
  color: white;
}

:deep(.vis-item.event-subplot) {
  background-color: #67c23a;
  border-color: #67c23a;
  color: white;
}

:deep(.vis-item.event-character) {
  background-color: #e6a23c;
  border-color: #e6a23c;
  color: white;
}

:deep(.vis-item.event-foreshadowing) {
  background-color: #909399;
  border-color: #909399;
  color: white;
}

:deep(.vis-item.event-custom) {
  background-color: #f56c6c;
  border-color: #f56c6c;
  color: white;
}

:deep(.vis-item.event-volume) {
  background-color: #8b5cf6;
  border-color: #8b5cf6;
  color: white;
}

:deep(.vis-item.event-chapter-draft) {
  background-color: #dcdfe6;
  border-color: #dcdfe6;
  color: #606266;
}

:deep(.vis-item.event-chapter-revised) {
  background-color: #b3e19d;
  border-color: #b3e19d;
  color: white;
}

:deep(.vis-item.event-chapter-final) {
  background-color: #67c23a;
  border-color: #67c23a;
  color: white;
}

:deep(.vis-item.event-goal) {
  background-color: #79bbff;
  border-color: #79bbff;
  color: white;
}

:deep(.vis-item.event-conflict) {
  background-color: #f56c6c;
  border-color: #f56c6c;
  color: white;
}

:deep(.vis-item.event-foreshadow-plant) {
  background-color: #c0c4cc;
  border-color: #c0c4cc;
  color: white;
}

:deep(.vis-item.event-foreshadow-resolve) {
  background-color: #95d475;
  border-color: #95d475;
  color: white;
}

:deep(.vis-item.event-scene) {
  background-color: #d9ecff;
  border-color: #d9ecff;
  color: #409eff;
}

:deep(.vis-group) {
  font-weight: 600;
}

:deep(.vis-labelset) {
  background-color: #f5f7fa;
}

:deep(.vis-labelset .vis-label) {
  border-bottom: 1px solid #e4e7ed;
  padding: 5px 10px;
}
</style>
