/**
 * Unified search composable with debounced input, fuzzy matching,
 * multi-field search, result highlighting, and filter support.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useSearch } from '@/composables/useSearch'
 *
 * const { query, results, searching, isEmpty, addDocuments } = useSearch({
 *   fieldWeights: { title: 3, content: 1 },
 *   debounceMs: 300,
 * })
 *
 * // Add documents to the index
 * addDocuments([{ id: '1', type: 'note', fields: { title: 'Hello' } }])
 * </script>
 * ```
 */
import { ref, readonly, computed, watch, onUnmounted, type Ref } from 'vue'
import { SearchEngine, type SearchableDocument, type ScoredResult, type SearchEngineOptions } from '@/utils/searchEngine'

export interface SearchFilter {
  key: string
  label: string
  value: string
  options: Array<{ value: string; label: string }>
}

export interface UseSearchOptions extends SearchEngineOptions {
  /** Debounce delay in ms (default: 200) */
  debounceMs?: number
}

export interface UseSearchReturn {
  /** Current search query */
  query: Ref<string>
  /** Whether a search is in progress */
  searching: Readonly<Ref<boolean>>
  /** Search results */
  results: Readonly<Ref<ScoredResult[]>>
  /** Active filters */
  filters: Ref<SearchFilter[]>
  /** Update a filter value */
  setFilter: (key: string, value: string) => void
  /** Clear all filters */
  clearFilters: () => void
  /** Add documents to the index */
  addDocuments: (docs: SearchableDocument[]) => void
  /** Clear the index (optionally by type) */
  clearIndex: (type?: string) => void
  /** Total indexed document count */
  indexSize: Readonly<Ref<number>>
  /** Whether the search query is empty */
  isEmpty: Ref<boolean>
}

export function useSearch(options?: UseSearchOptions): UseSearchReturn {
  const engine = new SearchEngine(options)
  const query = ref('')
  const searching = ref(false)
  const results = ref<ScoredResult[]>([])
  const filters = ref<SearchFilter[]>([])
  const indexSize = ref(0)

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  const debounceMs = options?.debounceMs ?? 200

  // Cleanup on unmount
  onUnmounted(() => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  })

  const isEmpty = computed(() => !query.value.trim())

  function doSearch() {
    const q = query.value.trim()
    if (!q) {
      results.value = []
      searching.value = false
      return
    }

    searching.value = true

    // Determine active filter type
    const typeFilter = filters.value.find(f => f.key === 'type' && f.value)
    const filterType = typeFilter?.value || undefined

    const scored = engine.search(q, filterType)
    results.value = scored
    searching.value = false
  }

  watch(query, () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    if (!query.value.trim()) {
      results.value = []
      return
    }
    debounceTimer = setTimeout(doSearch, debounceMs)
  })

  // Re-search when filters change
  watch(filters, () => {
    if (query.value.trim()) doSearch()
  }, { deep: true })

  function setFilter(key: string, value: string) {
    const existing = filters.value.find(f => f.key === key)
    if (existing) {
      existing.value = value
    }
  }

  function clearFilters() {
    for (const f of filters.value) {
      f.value = ''
    }
  }

  function addDocuments(docs: SearchableDocument[]) {
    engine.addDocuments(docs)
    indexSize.value = engine.size
    // Re-run search if query is active
    if (query.value.trim()) doSearch()
  }

  function clearIndex(type?: string) {
    engine.clear(type)
    indexSize.value = engine.size
    if (query.value.trim()) doSearch()
  }

  return {
    query,
    /** Whether a search is in progress (read-only) */
    searching: readonly(searching),
    /** Search results (read-only) */
    results: readonly(results),
    filters,
    setFilter,
    clearFilters,
    addDocuments,
    clearIndex,
    /** Total indexed document count (read-only) */
    indexSize: readonly(indexSize),
    /** Whether the search query is empty */
    isEmpty,
  }
}
