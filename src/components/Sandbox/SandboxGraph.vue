<template>
  <div class="sandbox-graph-container">
    <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom: 10px;">
      <p style="font-size: 12px; color: var(--text-muted);">
        <i class="ri-information-line"></i> 图谱由实体的双向链接(#标签)自动生成，无须手动绘制。拖拽节点可重排。
      </p>
      <div class="status-badge" id="graph-status" v-if="nodes.length > 0">
        <i class="ri-refresh-line"></i> 节点已自动热更新
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

// 1. Prepare data reactively from SandboxStore
const nodes = computed(() => {
  const result: any[] = []
  const activeState = sandboxStore.activeEntitiesState as Record<string, any>
  const visibleSet = new Set<string>()

  for (const [id, state] of Object.entries(activeState)) {
    // Only render if entity has some relations or is related to
    if (state.relations?.length > 0 || Object.values(activeState).some((s: any) => s.relations?.some((r: any) => r.targetId === id))) {
      result.push({
        id: id,
        label: state.name || id,
        type: 'circle',
        style: getStyleForCategory(state.category),
        labelCfg: { style: { fill: '#e2e8f0', fontSize: 12 } }
      })
      visibleSet.add(id);
    }
  }

  // Append Draft Nodes
  if (sandboxStore.isWizardMode) {
    for (const draft of sandboxStore.draftEntities) {
      result.push({
        id: draft.id,
        label: draft.name,
        type: 'circle',
        style: {
          ...getStyleForCategory(draft.category),
          lineDash: [4, 4], // Dashed border indicates draft
          shadowColor: '#fcd34d',
          shadowBlur: 20
        },
        labelCfg: { style: { fill: '#fcd34d', fontSize: 12, fontWeight: 'bold' } }
      });
      visibleSet.add(draft.id);
    }
  }

  return result
})

const edges = computed(() => {
  const result: any[] = []
  const activeState = sandboxStore.activeEntitiesState as Record<string, any>
  const visibleNodes = new Set<string>(nodes.value.map(n => n.id))

  for (const [sourceId, state] of Object.entries(activeState)) {
    if (state.relations && state.relations.length > 0) {
      state.relations.forEach((rel: any) => {
        result.push({
          source: sourceId,
          target: rel.targetId,
          label: rel.type || '',
          style: {
            stroke: 'rgba(60, 130, 246, 0.4)',
            lineWidth: 2,
            endArrow: {
              path: 'M 0,0 L 8,4 L 8,-4 Z',
              fill: 'rgba(60, 130, 246, 0.4)'
            }
          },
          labelCfg: {
            style: { fill: '#94a3b8', fontSize: 10, background: { fill: '#0a0a0f', padding: [2, 4], radius: 4 } }
          }
        })
      })
    }
  }

  // Append Draft Edges
  if (sandboxStore.isWizardMode) {
    sandboxStore.draftRelations.forEach(draftRel => {
      if (visibleNodes.has(draftRel.sourceId) && visibleNodes.has(draftRel.relation.targetId)) {
        let labelText = draftRel.relation.type || '';
        if (draftRel.relation.attitude) {
          const shortAttitude = draftRel.relation.attitude.length > 8 ? draftRel.relation.attitude.substring(0, 8) + '...' : draftRel.relation.attitude;
          labelText = `${labelText} (${shortAttitude})`;
        }

        result.push({
          source: draftRel.sourceId,
          target: draftRel.relation.targetId,
          label: labelText,
          style: {
            stroke: 'rgba(245, 158, 11, 0.8)', // Gold/Amber to signify draft
            lineWidth: 2,
            lineDash: [4, 4],
            endArrow: {
              path: 'M 0,0 L 8,4 L 8,-4 Z',
              fill: 'rgba(245, 158, 11, 0.8)'
            }
          },
          labelCfg: {
            style: { fill: '#fcd34d', fontSize: 10, background: { fill: '#0a0a0f', padding: [2, 4], radius: 4 } }
          }
        });
      }
    });
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
    } as any)

    renderGraph()
  }
})

// 4. Update on state change
watch([nodes, edges], () => {
  renderGraph()
}, { deep: true })

function renderGraph() {
  if (!graph) return
  (graph as any).data({
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