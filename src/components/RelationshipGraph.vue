<template>
  <div class="relationship-graph">
    <el-card class="header-card">
      <div class="header">
        <h2>人物关系图</h2>
        <div class="actions">
          <el-button @click="refreshGraph">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
          <el-button @click="exportImage" :loading="exporting">
            <el-icon><Download /></el-icon>
            导出图片
          </el-button>
        </div>
      </div>
    </el-card>

    <div class="content">
      <!-- 过滤器 -->
      <el-card class="filters-card">
        <div class="filters">
          <div class="filter-item">
            <span class="filter-label">关系类型：</span>
            <el-select
              v-model="selectedTypes"
              multiple
              collapse-tags
              placeholder="全部"
              style="width: 300px"
              @change="applyFilters"
            >
              <el-option
                v-for="(config, type) in RELATIONSHIP_TYPES"
                :key="type"
                :label="config.label"
                :value="type"
              >
                <span :style="{ color: config.color }">{{ config.label }}</span>
              </el-option>
            </el-select>
          </div>

          <div class="filter-item">
            <span class="filter-label">最小强度：</span>
            <el-rate v-model="minStrength" @change="applyFilters" />
          </div>

          <div class="filter-item">
            <span class="filter-label">显示隐式关系：</span>
            <el-switch v-model="showImplicit" @change="applyFilters" />
          </div>

          <div class="filter-item">
            <span class="filter-label">搜索人物：</span>
            <el-select
              v-model="selectedCharacters"
              multiple
              filterable
              collapse-tags
              placeholder="全部人物"
              style="width: 300px"
              @change="applyFilters"
            >
              <el-option
                v-for="char in characters"
                :key="char.id"
                :label="char.name"
                :value="char.id"
              />
            </el-select>
          </div>
        </div>
      </el-card>

      <!-- 图容器 -->
      <el-card class="graph-card">
        <div v-if="characters.length === 0" class="empty-state">
          <el-empty description="还没有人物数据">
            <el-button type="primary" @click="$router.push(`/project/${projectId}`)">
              去添加人物
            </el-button>
          </el-empty>
        </div>

        <div v-else-if="graphData.nodes.length === 0" class="empty-state">
          <el-empty description="没有关系数据，请在人物设定中添加关系" />
        </div>

        <div v-else ref="graphContainer" class="graph-container"></div>
      </el-card>

      <!-- 人物详情对话框 -->
      <el-dialog
        v-model="showDetailDialog"
        :title="selectedCharacter?.name"
        width="500px"
      >
        <div v-if="selectedCharacter" class="character-detail">
          <el-descriptions :column="1" border>
            <el-descriptions-item label="性别">
              {{ getGenderText(selectedCharacter.gender) }}
            </el-descriptions-item>
            <el-descriptions-item label="年龄">
              {{ selectedCharacter.age }}岁
            </el-descriptions-item>
            <el-descriptions-item label="性格">
              {{ Array.isArray(selectedCharacter.personality) ? selectedCharacter.personality.join('、') : selectedCharacter.personality || '无' }}
            </el-descriptions-item>
            <el-descriptions-item label="能力">
              {{ Array.isArray(selectedCharacter.abilities) ? selectedCharacter.abilities.map(a => a.name).join('、') : '无' }}
            </el-descriptions-item>>
            <el-descriptions-item label="出场次数">
              {{ selectedCharacter.appearances.length }}章
            </el-descriptions-item>
          </el-descriptions>

          <div class="related-characters" v-if="relatedCharacters.length > 0">
            <h4>相关人物</h4>
            <el-tag
              v-for="rel in relatedCharacters"
              :key="rel.character.id"
              :type="getRelationTagType(rel.type)"
              @click="focusCharacter(rel.character.id)"
              style="margin: 5px; cursor: pointer"
            >
              {{ rel.character.name }} - {{ rel.label }}
            </el-tag>
          </div>
        </div>
      </el-dialog>

      <!-- 关系编辑对话框 -->
      <el-dialog
        v-model="showEditDialog"
        title="编辑关系"
        width="500px"
      >
        <el-form v-if="editingEdge" :model="editingEdge" label-width="100px">
          <el-form-item label="关系类型">
            <el-select v-model="editingEdge.type" @change="onEdgeTypeChange">
              <el-option
                v-for="(config, type) in RELATIONSHIP_TYPES"
                :key="type"
                :label="config.label"
                :value="type"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="关系描述">
            <el-input
              v-model="editingEdge.description"
              type="textarea"
              :rows="3"
              placeholder="描述这段关系"
            />
          </el-form-item>
        </el-form>

        <template #footer>
          <el-button @click="showEditDialog = false">取消</el-button>
          <el-button type="primary" @click="saveEdgeEdit" :loading="saving">
            保存
          </el-button>
        </template>
      </el-dialog>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { ElMessage } from 'element-plus'
import { Refresh, Download } from '@element-plus/icons-vue'
import * as G6 from '@antv/g6'
import type { Character, Relationship } from '@/types'
import {
  extractRelationships,
  extractFromChapters,
  mergeRelationships,
  filterGraphData,
  RELATIONSHIP_TYPES,
  type GraphData,
  type GraphNode,
  type GraphEdge
} from '@/utils/relationExtractor'

const route = useRoute()
const projectStore = useProjectStore()

const projectId = computed(() => route.params.id as string)
const project = computed(() => projectStore.currentProject)
const characters = computed(() => project.value?.characters || [])
const chapters = computed(() => project.value?.chapters || [])

// 图实例
const graphContainer = ref<HTMLDivElement>()
let graph: G6.Graph | null = null

// 过滤器
const selectedTypes = ref<string[]>([])
const minStrength = ref(1)
const showImplicit = ref(true)
const selectedCharacters = ref<string[]>([])
const autoFiltered = ref(false) // 记录是否已经自动过滤过

// 对话框
const showDetailDialog = ref(false)
const showEditDialog = ref(false)
const selectedCharacter = ref<Character | null>(null)
const relatedCharacters = ref<Array<{ character: Character; type: string; label: string }>>([])
const editingEdge = ref<GraphEdge | null>(null)
const saving = ref(false)
const exporting = ref(false)

// 图数据
const graphData = ref<GraphData>({ nodes: [], edges: [] })

// 监听项目加载
watch(project, (newProject) => {
  if (newProject) {
    refreshGraph()
  }
}, { immediate: true })

onMounted(async () => {
  await nextTick()
  if (characters.value.length > 0) {
    initGraph()
    refreshGraph()
  }
})

onBeforeUnmount(() => {
  if (graph) {
    graph.destroy()
    graph = null
  }
})

/**
 * 初始化图实例
 */
function initGraph() {
  if (!graphContainer.value || graph) return

  const container = graphContainer.value
  const width = container.offsetWidth
  const height = container.offsetHeight

  graph = new (G6.Graph as any)({
    container,
    width,
    height,
    modes: {
      default: [
        'drag-canvas',
        'zoom-canvas',
        'drag-node',
        {
          type: 'tooltip',
          formatText: (model: any) => {
            const node = model as GraphNode
            return `${node.label}\n年龄: ${node.age}\n性格: ${node.personality.slice(0, 3).join(', ')}`
          },
          offset: 10
        }
      ]
    },
    layout: {
      type: 'force',
      preventOverlap: true,
      linkDistance: 150,
      nodeStrength: -30,
      edgeStrength: 0.1,
      coulombDisScale: 0.005,
      damping: 0.9,
      maxSpeed: 1000
    },
    defaultNode: {
      size: 50,
      style: {
        fill: '#409EFF',
        stroke: '#fff',
        lineWidth: 2
      },
      labelCfg: {
        style: {
          fill: '#303133',
          fontSize: 14,
          fontWeight: 'bold'
        },
        position: 'bottom'
      }
    },
    defaultEdge: {
      style: {
        opacity: 0.6,
        lineWidth: 2
      },
      labelCfg: {
        style: {
          fontSize: 12,
          fill: '#606266'
        },
        refY: 10
      }
    },
    nodeStateStyles: {
      hover: {
        fillOpacity: 0.8
      },
      selected: {
        stroke: '#409EFF',
        lineWidth: 3
      }
    },
    edgeStateStyles: {
      hover: {
        strokeOpacity: 1,
        lineWidth: 3
      }
    }
  })

  // 注册事件
  (graph as any)?.on('node:click', handleNodeClick)
  (graph as any)?.on('node:contextmenu', handleNodeContextMenu)
  (graph as any)?.on('edge:click', handleEdgeClick)
  (graph as any)?.on('edge:contextmenu', handleEdgeContextMenu)
  graph?.on('canvas:click', () => {
    (graph as any)!.getNodes().forEach((node: any) => {
      (graph as any)!.clearItemStates(node)
    })
  })

  // 窗口大小变化
  window.addEventListener('resize', handleResize)
}

/**
 * 刷新图数据
 */
function refreshGraph() {
  if (!graph || characters.value.length === 0) return

  // 提取显式关系
  const explicitData = extractRelationships(characters.value)

  // 提取章节互动
  const interactions = extractFromChapters(chapters.value, characters.value)

  // 合并关系
  graphData.value = mergeRelationships(explicitData, interactions)

  // 数据量过大时自动提高过滤阈值以防止卡顿（仅自动执行一次）
  if (!autoFiltered.value) {
    if (graphData.value.nodes.length > 200) {
      minStrength.value = Math.max(minStrength.value, 3)
      showImplicit.value = false
      ElMessage.warning('人物节点过多，已自动提高关系强度阈值以优化性能')
    } else if (graphData.value.nodes.length > 100) {
      minStrength.value = Math.max(minStrength.value, 2)
    }
    autoFiltered.value = true
  }

  // 应用过滤器
  applyFilters()
}

/**
 * 应用过滤器
 */
function applyFilters() {
  if (!graph) return

  const filtered = filterGraphData(graphData.value, {
    relationshipTypes: selectedTypes.value.length > 0 ? selectedTypes.value : undefined,
    minStrength: minStrength.value,
    characterIds: selectedCharacters.value.length > 0 ? selectedCharacters.value : undefined,
    showImplicit: showImplicit.value
  })

  // 更新节点样式
  const nodes = filtered.nodes.map(node => ({
    id: node.id,
    label: node.label,
    style: {
      fill: node.gender === 'male' ? '#409EFF' : node.gender === 'female' ? '#F56C6C' : '#909399',
      stroke: node.isMain ? '#E6A23C' : '#fff',
      lineWidth: node.isMain ? 3 : 2
    },
    size: 40 + node.appearances * 5
  }))

  // 更新边样式
  const edges = filtered.edges.map(edge => ({
    source: edge.source,
    target: edge.target,
    label: edge.label,
    style: {
      stroke: edge.color,
      lineWidth: edge.strength,
      opacity: 0.6
    }
  }));

  (graph as any).changeData({ nodes, edges } as any);
  (graph as any).fitView(20)
}

/**
 * 节点点击事件
 */
function handleNodeClick(evt: any) {
  const nodeId: string = (evt.item.getModel().id as any) + ''
  const character = characters.value.find(c => c.id === nodeId)

  if (character) {
    selectedCharacter.value = character

    // 查找相关人物
    relatedCharacters.value = []
    character.relationships.forEach(rel => {
      const relChar = characters.value.find(c => c.id === rel.targetId)
      if (relChar) {
        relatedCharacters.value.push({
          character: relChar,
          type: rel.type,
          label: RELATIONSHIP_TYPES[rel.type].label
        })
      }
    })

    showDetailDialog.value = true
  }
}

/**
 * 节点右键事件（高亮相关节点）
 */
function handleNodeContextMenu(evt: any) {
  evt.preventDefault()
  const evtNodeId: string = (evt.item.getModel().id as any) + '';

  // 高亮相关节点
  (graph as any)!.getEdges().forEach((edge: any) => {
    const model = edge.getModel()
    if (model.source === evtNodeId || model.target === evtNodeId) {
      (graph as any)!.setItemState(edge, 'hover', true)
      const relatedNodeId = model.source === evtNodeId ? model.target : model.source;
      (graph as any)!.setItemState(relatedNodeId as string, 'selected', true)
    }
  })

  (graph as any)!.setItemState(evtNodeId, 'selected', true)
}

/**
 * 边点击事件
 */
function handleEdgeClick(evt: any) {
  const edgeModel = evt.item.getModel() as GraphEdge
  console.log('Edge clicked:', edgeModel)
}

/**
 * 边右键事件（编辑关系）
 */
function handleEdgeContextMenu(evt: any) {
  evt.preventDefault()
  const edgeModel = evt.item.getModel() as GraphEdge
  editingEdge.value = { ...edgeModel }
  showEditDialog.value = true
}

/**
 * 关系类型改变
 */
function onEdgeTypeChange(type: string) {
  if (editingEdge.value) {
    const config = RELATIONSHIP_TYPES[type as keyof typeof RELATIONSHIP_TYPES]
    editingEdge.value.label = config.label
    editingEdge.value.color = config.color
    editingEdge.value.strength = config.strength
  }
}

/**
 * 保存关系编辑
 */
async function saveEdgeEdit() {
  if (!editingEdge.value || !project.value) return

  saving.value = true
  try {
    const { source, target, type, description } = editingEdge.value

    // 更新源人物的关系
    const sourceChar = characters.value.find(c => c.id === source)
    if (sourceChar) {
      const relIndex = sourceChar.relationships.findIndex(r => r.targetId === target)
      if (relIndex !== -1) {
        sourceChar.relationships[relIndex].type = type as Relationship['type']
        sourceChar.relationships[relIndex].description = description
      }
    }

    // 保存项目
    await projectStore.saveCurrentProject()
    ElMessage.success('关系已更新')
    showEditDialog.value = false
    refreshGraph()
  } catch (error) {
    console.error('保存失败:', error)
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

/**
 * 聚焦到指定人物
 */
function focusCharacter(characterId: string) {
  if (!graph) return

  showDetailDialog.value = false
  selectedCharacters.value = [characterId]
  applyFilters()

  // 高亮该节点
  nextTick(() => {
    (graph as any)!.setItemState(characterId, 'selected', true)
  })
}

/**
 * 导出图片
 */
async function exportImage() {
  if (!graph) return

  exporting.value = true
  try {
    const canvas = (graph as any).get('canvas') as HTMLCanvasElement
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        blob => {
          if (blob) resolve(blob)
          else reject(new Error('Failed to export'))
        },
        'image/png',
        1.0
      )
    })

    // 下载图片
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `人物关系图-${project.value?.title || '未命名'}.png`
    a.click()
    URL.revokeObjectURL(url)

    ElMessage.success('图片已导出')
  } catch (error) {
    console.error('导出失败:', error)
    ElMessage.error('导出失败')
  } finally {
    exporting.value = false
  }
}

/**
 * 窗口大小变化
 */
function handleResize() {
  if (!graph || !graphContainer.value) return

  const width = graphContainer.value.offsetWidth
  const height = graphContainer.value.offsetHeight;
  (graph as any).changeSize(width, height);
  (graph as any).fitView(20)
}

/**
 * 辅助函数
 */
function getGenderText(gender: string) {
  const texts: Record<string, string> = {
    male: '男',
    female: '女',
    other: '其他'
  }
  return texts[gender] || gender
}

function getRelationTagType(type: string) {
  const types: Record<string, any> = {
    family: 'success',
    friend: 'primary',
    enemy: 'danger',
    lover: 'warning',
    rival: 'info',
    other: ''
  }
  return types[type] || ''
}
</script>

<style scoped>
.relationship-graph {
  max-width: 1600px;
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
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.filters-card {
  margin-bottom: 0;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: center;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-label {
  font-size: 14px;
  color: #606266;
  white-space: nowrap;
}

.graph-card {
  position: relative;
  min-height: 600px;
}

.graph-container {
  width: 100%;
  height: 600px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 600px;
}

.character-detail {
  padding: 10px 0;
}

.related-characters {
  margin-top: 20px;
}

.related-characters h4 {
  margin-bottom: 10px;
  font-size: 16px;
  color: #303133;
}
</style>
