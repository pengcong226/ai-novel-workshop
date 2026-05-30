/**
 * Global Search Composable
 *
 * Provides a full-text search across project chapters, sandbox entities,
 * and outline data using the internal `SearchEngine`. Features debounced
 * search, recent search history (persisted to localStorage), and keyboard
 * navigation support.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useGlobalSearch } from '@/composables/useGlobalSearch'
 *
 * const { query, visible, results, open, close, activate } = useGlobalSearch()
 * </script>
 * ```
 */

import { ref, readonly, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { useSandboxStore } from '@/stores/sandbox'
import type { SearchEntityType } from '@/utils/eventTypeLabels'
import { SearchEngine, highlightText, type SearchableDocument, type ScoredResult } from '@/utils/searchEngine'

export interface SearchResult {
  type: SearchEntityType
  id: string
  title: string
  snippet: string
}

const RECENT_SEARCHES_KEY = 'ai-fanfic-workshop:recent-searches'
const MAX_RECENT = 8

// --- helpers ---

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : []
  } catch {
    return []
  }
}

function saveRecent(terms: string[]): void {
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(terms.slice(0, MAX_RECENT)))
  } catch {
    /* storage quota exceeded – silently ignore */
  }
}

function addRecent(terms: string[], query: string): string[] {
  const q = query.trim()
  if (!q) return terms
  const updated = [q, ...terms.filter(t => t !== q)].slice(0, MAX_RECENT)
  saveRecent(updated)
  return updated
}

function removeRecent(terms: string[], query: string): string[] {
  const updated = terms.filter(t => t !== query)
  saveRecent(updated)
  return updated
}

function rawSnippet(text: string, query: string, radius = 40): string {
  if (!text) return ''
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text.slice(0, 80)
  const start = Math.max(0, idx - radius)
  const end = Math.min(text.length, idx + query.length + radius)
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

// --- document builder (internal) ---

interface DocMeta {
  rawTitle: string
  rawContent: string
}

function docsFromEntities(
  entities: Array<{ id: string; name: string; type: string; systemPrompt?: string }>,
  resolvedState: Record<string, { properties?: Record<string, unknown> }>,
  meta: Map<string, DocMeta>,
): SearchableDocument[] {
  return entities.map(e => {
    const resolved = resolvedState[e.id]
    const propsText = resolved?.properties
      ? Object.values(resolved.properties).filter(v => typeof v === 'string').join(' ')
      : ''
    const contentText = [e.systemPrompt || '', propsText].join(' ')

    meta.set(`entity:${e.id}`, { rawTitle: e.name, rawContent: contentText })

    return {
      id: `entity:${e.id}`,
      type: e.type.toLowerCase(),
      fields: { name: e.name, content: contentText },
    }
  })
}

// --- module-scope singleton ---

let engine: SearchEngine | null = null
const docMeta = new Map<string, DocMeta>()

function ensureEngine(): SearchEngine {
  if (!engine) {
    engine = new SearchEngine({ fieldWeights: { name: 3, title: 3 }, maxResults: 20 })
  }
  return engine
}

export function useGlobalSearch() {
  const projectStore = useProjectStore()
  const sandboxStore = useSandboxStore()
  const router = useRouter()

  const query = ref('')
  const visible = ref(false)
  const results = ref<SearchResult[]>([])
  const recentSearches = ref<string[]>(loadRecent())

  // Debounce timer
  let searchTimer: ReturnType<typeof setTimeout> | null = null

  // Cleanup on unmount
  onUnmounted(() => {
    if (searchTimer !== null) {
      clearTimeout(searchTimer)
      searchTimer = null
    }
  })

  // ---- indexing ----

  function indexProjectData(): void {
    const eng = ensureEngine()
    docMeta.clear()
    eng.clear()

    const project = projectStore.currentProject
    if (!project) return

    // Chapters
    const chapterDocs: SearchableDocument[] = []
    for (const ch of project.chapters) {
      const title = ch.title || `第${ch.number}章`
      docMeta.set(`chapter:${ch.id}`, { rawTitle: title, rawContent: ch.content || '' })
      chapterDocs.push({
        id: `chapter:${ch.id}`,
        type: 'chapter',
        fields: { title, content: (ch.content || '').slice(0, 5000) },
      })
    }
    eng.addDocuments(chapterDocs)

    // Sandbox entities
    const entityDocs = docsFromEntities(
      sandboxStore.activeEntities,
      sandboxStore.activeEntitiesState,
      docMeta,
    )
    eng.addDocuments(entityDocs)

    // Outline
    const outline = project.outline
    if (outline?.mainPlot?.name) {
      const desc = outline.mainPlot.description || ''
      docMeta.set('outline:main-plot', { rawTitle: outline.mainPlot.name, rawContent: desc })
      eng.addDocuments([{
        id: 'outline:main-plot',
        type: 'outline',
        fields: { name: outline.mainPlot.name, content: desc },
      }])
    }
  }

  // ---- search ----

  function performSearch(q: string): SearchResult[] {
    const eng = ensureEngine()
    const scored: ScoredResult[] = eng.search(q)
    const qLower = q.toLowerCase()

    return scored
      .map(r => {
        const meta = docMeta.get(r.id)
        if (!meta) return null
        // Build snippet from raw text for a readable excerpt
        const bestField = r.matches.sort((a, b) => b.score - a.score)[0]
        const rawText = bestField?.field === 'name' || bestField?.field === 'title'
          ? meta.rawContent
          : meta.rawContent
        const snippet = rawSnippet(rawText, q)

        return {
          type: r.type as SearchEntityType,
          id: r.id,
          title: meta.rawTitle,
          snippet,
        } as SearchResult
      })
      .filter((r): r is SearchResult => r !== null)
      .filter(r => {
        // Final sanity: title or snippet must contain the query
        return r.title.toLowerCase().includes(qLower) || r.snippet.toLowerCase().includes(qLower)
      })
      .slice(0, 20)
  }

  // Debounced search on query change
  watch(query, (newQuery) => {
    if (searchTimer) clearTimeout(searchTimer)

    if (!newQuery.trim()) {
      results.value = []
      return
    }

    searchTimer = setTimeout(() => {
      results.value = performSearch(newQuery.trim())
    }, 200)
  })

  // Re-index when project data changes (only when dialog is open)
  watch(visible, (v) => {
    if (v) indexProjectData()
  })

  // ---- recent searches ----

  function commitRecent(queryStr: string): void {
    recentSearches.value = addRecent(recentSearches.value, queryStr)
  }

  function deleteRecent(queryStr: string): void {
    recentSearches.value = removeRecent(recentSearches.value, queryStr)
  }

  // ---- open / close ----

  function open(): void {
    visible.value = true
    query.value = ''
    results.value = []
    indexProjectData()
  }

  function close(): void {
    visible.value = false
    query.value = ''
    results.value = []
  }

  function activate(result: SearchResult): void {
    commitRecent(query.value)
    close()

    // Navigate to the appropriate section
    const [type, ...idParts] = result.id.split(':')
    const rawId = idParts.join(':')

    if (type === 'chapter') {
      // Navigate to chapter editor - just push to project route, chapters tab
      router.push({ hash: '#chapters' })
    }
    // For entities and outline, stay on the current page
    // (user is already in the workspace where these are visible)
  }

  return {
    query,
    visible,
    /** Search results (read-only) */
    results: readonly(results),
    /** Recent search terms (read-only) */
    recentSearches: readonly(recentSearches),
    commitRecent,
    deleteRecent,
    open,
    close,
    activate,
  }
}
