import { ref, computed } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useSandboxStore } from '@/stores/sandbox'
import type { SearchEntityType } from '@/utils/eventTypeLabels'

export interface SearchResult {
  type: SearchEntityType
  id: string
  title: string
  snippet: string
}

export function useGlobalSearch() {
  const projectStore = useProjectStore()
  const sandboxStore = useSandboxStore()
  const query = ref('')
  const visible = ref(false)

  const results = computed<SearchResult[]>(() => {
    const q = query.value.trim().toLowerCase()
    if (!q) return []

    const out: SearchResult[] = []
    const project = projectStore.currentProject
    if (!project) return out

    // Chapters
    for (const ch of project.chapters) {
      const titleMatch = ch.title?.toLowerCase().includes(q)
      const contentMatch = ch.content?.toLowerCase().includes(q)
      if (titleMatch || contentMatch) {
        const snippet = contentMatch
          ? excerpt(ch.content, q)
          : (ch.summary || '').slice(0, 80)
        out.push({ type: 'chapter', id: ch.id, title: ch.title || `第${ch.number}章`, snippet })
      }
    }

    // Sandbox entities
    const resolvedState = sandboxStore.activeEntitiesState
    for (const entity of sandboxStore.activeEntities) {
      const nameMatch = entity.name.toLowerCase().includes(q)
      const promptMatch = entity.systemPrompt?.toLowerCase().includes(q)
      if (!nameMatch && !promptMatch) continue

      const resolved = resolvedState[entity.id]
      const snippet = promptMatch
        ? excerpt(entity.systemPrompt, q)
        : Object.values(resolved?.properties || {}).find(v => typeof v === 'string' && v.toLowerCase().includes(q))?.toString().slice(0, 80) || ''

      out.push({
        type: entity.type.toLowerCase() as SearchResult['type'],
        id: entity.id,
        title: entity.name,
        snippet
      })
    }

    // Outline
    const outline = project.outline
    if (outline?.mainPlot?.name?.toLowerCase().includes(q) || outline?.mainPlot?.description?.toLowerCase().includes(q)) {
      out.push({
        type: 'outline',
        id: 'main-plot',
        title: outline.mainPlot.name,
        snippet: excerpt(outline.mainPlot.description, q)
      })
    }

    return out.slice(0, 30)
  })

  function open() {
    visible.value = true
    query.value = ''
  }

  function close() {
    visible.value = false
    query.value = ''
  }

  return { query, visible, results, open, close }
}

function excerpt(text: string | undefined, query: string, radius = 40): string {
  if (!text) return ''
  const lower = text.toLowerCase()
  const idx = lower.indexOf(query)
  if (idx === -1) return text.slice(0, 80)
  const start = Math.max(0, idx - radius)
  const end = Math.min(text.length, idx + query.length + radius)
  return (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '')
}
