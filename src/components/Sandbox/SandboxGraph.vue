<template>
  <div class="sandbox-graph-container">
    <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom: 10px;">
      <p style="font-size: 12px; color: var(--text-muted);">
        <i class="ri-information-line"></i> 图谱由实体的双向链接(#标签)自动生成，无须手动绘制。拖拽节点可重排。
      </p>
      <div style="display:flex; align-items:center; gap:10px;">
        <el-cascader
          v-model="focusSelection"
          :options="focusOptions"
          size="small"
          placeholder="选择图谱中心"
        />
        <div class="status-badge" id="graph-status" v-if="nodes.length > 0">
          <i class="ri-refresh-line"></i> 节点已自动热更新
        </div>
      </div>
    </div>

    <!-- The container where AntV G6 will mount -->
    <div id="g6-graph-container" ref="graphContainer" class="graph-canvas"></div>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { Graph } from '@antv/g6'
import { useSandboxStore } from '@/stores/sandbox'

const graphContainer = ref<HTMLElement | null>(null)
let graph: Graph | null = null
const sandboxStore = useSandboxStore()

const focusSelection = ref(['chapter', 'current'])

const focusOptions = computed(() => {
  const charOptions = sandboxStore.entities
    .filter(e => e.type === 'CHARACTER')
    .map(c => ({ value: c.id, label: c.name }))

  return [
    {
      value: 'chapter',
      label: '按章节出场人物',
      children: [
        { value: 'current', label: `当前章节 (第 ${sandboxStore.currentChapter} 章)` }
      ]
    },
    {
      value: 'character',
      label: '按特定人物为中心',
      children: charOptions
    }
  ]
})

// 1. Prepare data reactively from SandboxStore
const nodes = computed(() => {
  const result: any[] = []
  const activeState = sandboxStore.activeEntitiesState
  const focusMode = focusSelection.value[0]
  const focusTarget = focusSelection.value[1]

  // Create a Set of visible entity IDs (1-degree BFS)
  const visibleSet = new Set<string>()

  if (focusMode === 'character' && focusTarget && activeState[focusTarget]) {
    // Focus on specific character
    visibleSet.add(focusTarget)
    const targetState = activeState[focusTarget]

    // Add forward relations
    if (targetState.relations) {
      targetState.relations.forEach((rel) => visibleSet.add(rel.targetId))
    }

    // Add backward relations
    for (const [id, state] of Object.entries(activeState)) {
      if (state.relations?.some((r) => r.targetId === focusTarget)) {
        visibleSet.add(id)
      }
    }
  } else {
    // Default or chapter focus: Since we don't have chapter data loaded yet,
    // fallback to showing the protagonist and their 1-degree connections
    const protagonistId = Object.keys(activeState).find(id =>
      activeState[id].category === 'Protagonist' || activeState[id].category === '核心人物'
    )

    if (protagonistId) {
      visibleSet.add(protagonistId)
      const pState = activeState[protagonistId]
      if (pState.relations) {
        pState.relations.forEach((rel) => visibleSet.add(rel.targetId))
      }
      for (const [id, state] of Object.entries(activeState)) {
        if (state.relations?.some((r) => r.targetId === protagonistId)) {
          visibleSet.add(id)
        }
      }
    } else {
      // Fallback: show everything with relations
      // O(N) evaluation
      const allTargetIds = new Set<string>();
      for (const state of Object.values(activeState)) {
        state.relations?.forEach((r) => allTargetIds.add(r.targetId));
      }
      for (const [id, state] of Object.entries(activeState)) {
        if (state.relations?.length > 0 || allTargetIds.has(id)) {
          visibleSet.add(id)
        }
      }
    }
  }

  for (const [id, state] of Object.entries(activeState)) {
    if (visibleSet.has(id)) {
      result.push({
        id: id,
        label: state.name || id,
        type: 'circle',
        style: getStyleForCategory(state.category),
        labelCfg: { style: { fill: '#e2e8f0', fontSize: 12 } }
      })
    }
  }
  return result
})

const edges = computed(() => {
  const result: any[] = []
  const activeState = sandboxStore.activeEntitiesState
  // Use nodes as the definitive list of visible items
  const visibleNodes = new Set(nodes.value.map(n => n.id))

  for (const [sourceId, state] of Object.entries(activeState)) {
    if (visibleNodes.has(sourceId) && state.relations && state.relations.length > 0) {
      state.relations.forEach((rel) => {
        if (visibleNodes.has(rel.targetId)) {
          let labelText = rel.type || '';
          if (rel.attitude) {
            const shortAttitude = rel.attitude.length > 8 ? rel.attitude.substring(0, 8) + '...' : rel.attitude;
            labelText = `${labelText} (${shortAttitude})`;
          }

          let edgeColor = 'rgba(60, 130, 246, 0.4)'; // Default blue
          if (rel.attitude) {
            const negativeWords = ['恨', '敌', '杀', '死', '仇', '怒', '厌', '利用', '背叛', '嫌隙'];
            const positiveWords = ['爱', '喜', '信任', '生死', '倾心', '护', '忠'];
            if (negativeWords.some(w => rel.attitude.includes(w))) {
              edgeColor = 'rgba(239, 68, 68, 0.6)'; // Red
            } else if (positiveWords.some(w => rel.attitude.includes(w))) {
              edgeColor = 'rgba(16, 185, 129, 0.6)'; // Green
            }
          }

          result.push({
            source: sourceId,
            target: rel.targetId,
            label: labelText,
            style: {
              stroke: edgeColor,
              lineWidth: 2,
              endArrow: {
                path: 'M 0,0 L 8,4 L 8,-4 Z',
                fill: edgeColor
              }
            },
            labelCfg: {
              style: { fill: '#94a3b8', fontSize: 10, background: { fill: '#0a0a0f', padding: [2, 4], radius: 4 } }
            }
          })
        }
      })
    }
  }
  return result
})

// 2. Styling Helper for Sci-Fi Theme
function getStyleForCategory(category: string) {
  const baseStyle = { lineWidth: 2, r: 24, cursor: 'pointer' }
  switch (category) {
    case 'Protagonist':
    case '核心人物':
      return { ...baseStyle, fill: 'rgba(59, 130, 246, 0.2)', stroke: '#3b82f6', shadowColor: '#60a5fa', shadowBlur: 15 }
    case 'Faction':
    case '势力/门派':
      return { ...baseStyle, fill: 'rgba(139, 92, 246, 0.2)', stroke: '#8b5cf6', shadowColor: '#c4b5fd', shadowBlur: 10 }
    case 'Lore':
    case 'Item':
    case '功法/物品':
      return { ...baseStyle, fill: 'rgba(245, 158, 11, 0.2)', stroke: '#f59e0b', shadowColor: '#fcd34d', shadowBlur: 10 }
    case 'Antagonist':
    case '反派':
      return { ...baseStyle, fill: 'rgba(239, 68, 68, 0.2)', stroke: '#ef4444', shadowColor: '#fca5a5', shadowBlur: 10 }
    default:
      return { ...baseStyle, fill: 'rgba(16, 185, 129, 0.2)', stroke: '#10b981', shadowColor: '#6ee7b7', shadowBlur: 10 }
  }
}

// 3. Initialize Graph
onMounted(() => {
  if (graphContainer.value) {
    const width = graphContainer.value.scrollWidth || 800
    const height = graphContainer.value.scrollHeight || 500

    graph = new Graph({
      container: graphContainer.value,
      width,
      height,
      layout: {
        type: 'force',
        preventOverlap: true,
        nodeSize: 50,
        linkDistance: 150,
      },
      modes: {
        default: ['drag-canvas', 'zoom-canvas', 'drag-node']
      },
      defaultNode: {
        type: 'circle',
        size: 48
      },
      defaultEdge: {
        type: 'line',
        color: '#e2e8f0'
      }
    })

    renderGraph()
  }
})

// 4. Update on state change
watch([nodes, edges], () => {
  renderGraph()
}, { deep: true })

function renderGraph() {
  if (!graph) return
  graph.data({
    nodes: nodes.value,
    edges: edges.value
  })
  graph.render()
}

onUnmounted(() => {
  if (graph) {
    graph.destroy()
  }
})
</script>

<style scoped>
.sandbox-graph-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
}
.graph-canvas {
  flex: 1;
  background: radial-gradient(circle at center, rgba(30,41,59,0.8) 0%, rgba(0,0,0,0.5) 100%);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  overflow: hidden;
}
.status-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  background: rgba(16, 185, 129, 0.2);
  color: var(--accent-success);
  border: 1px solid var(--accent-success);
}
</style>