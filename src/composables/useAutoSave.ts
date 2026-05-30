/**
 * Auto-Save Composable
 *
 * Provides dirty-tracking, debounced persistence, and a beforeunload guard.
 * Integrates with the project store's `debouncedSaveCurrentProject` for
 * automatic saves and exposes manual `save()` for explicit persistence.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useAutoSave } from '@/composables/useAutoSave'
 *
 * const { isDirty, isSaving, lastSavedAt, markDirty, save } = useAutoSave()
 *
 * // Call markDirty() when content changes
 * function onContentChange() { markDirty() }
 *
 * // Save explicitly on button click
 * async function handleSave() { await save() }
 * </script>
 * ```
 */

import { ref, readonly, onMounted, onUnmounted } from 'vue'
import { useProjectStore } from '@/stores/project'
import { getLogger } from '@/utils/logger'

const logger = getLogger('composable:useAutoSave')

export function useAutoSave() {
  const projectStore = useProjectStore()

  const isDirty = ref(false)
  const isSaving = ref(false)
  const lastSavedAt = ref<Date | null>(null)

  /** Mark content as dirty and trigger a debounced save. */
  function markDirty(): void {
    isDirty.value = true
    projectStore.debouncedSaveCurrentProject()
  }

  /** Manually persist dirty content. No-op when not dirty. */
  async function save(): Promise<void> {
    if (!isDirty.value) return
    isSaving.value = true
    try {
      await projectStore.saveCurrentProject()
      isDirty.value = false
      lastSavedAt.value = new Date()
    } catch (e) {
      logger.error('自动保存失败', e)
    } finally {
      isSaving.value = false
    }
  }

  function onBeforeUnload(e: BeforeUnloadEvent): void {
    if (isDirty.value) {
      e.preventDefault()
    }
  }

  onMounted(() => {
    window.addEventListener('beforeunload', onBeforeUnload)
  })

  onUnmounted(() => {
    window.removeEventListener('beforeunload', onBeforeUnload)
  })

  return {
    /** Whether content has unsaved changes (read-only) */
    isDirty: readonly(isDirty),
    /** Whether a save is in progress (read-only) */
    isSaving: readonly(isSaving),
    /** Timestamp of the last successful save (read-only) */
    lastSavedAt: readonly(lastSavedAt),
    markDirty,
    save
  }
}
