import { ref, onMounted, onUnmounted } from 'vue'
import { useProjectStore } from '@/stores/project'
import { getLogger } from '@/utils/logger'

const logger = getLogger('composable:useAutoSave')

export function useAutoSave() {
  const projectStore = useProjectStore()

  const isDirty = ref(false)
  const isSaving = ref(false)
  const lastSavedAt = ref<Date | null>(null)

  function markDirty() {
    isDirty.value = true
    projectStore.debouncedSaveCurrentProject()
  }

  async function save() {
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

  function onBeforeUnload(e: BeforeUnloadEvent) {
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
    isDirty,
    isSaving,
    lastSavedAt,
    markDirty,
    save
  }
}
