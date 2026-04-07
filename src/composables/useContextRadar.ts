import { ref, watch, onUnmounted, type Ref } from 'vue'
import { debounce } from 'lodash-es'
import type { Project } from '@/types'

export function useContextRadar(
  projectRef: Ref<Project | null | undefined>,
  textRef: Ref<string>,
  isActiveRef: Ref<boolean>
) {
  const activeContextCharacters = ref<any[]>([])
  const activeContextWorldbook = ref<any[]>([])

  const scanContextDebounced = debounce((text: string) => {
    if (!projectRef.value) return
    const project = projectRef.value

    const chars = project.characters?.filter(c => text.includes(c.name)) || []
    activeContextCharacters.value = chars

    const wbs = project.worldbook?.entries?.filter(wb => wb.key?.some(k => text.includes(k))) || []
    activeContextWorldbook.value = wbs
  }, 1500)

  // Watch for text changes
  watch(textRef, (newVal) => {
    if (isActiveRef.value) {
      scanContextDebounced(newVal)
    }
  })

  // Scan immediately or cancel when visibility changes
  watch(isActiveRef, (isActive) => {
    if (isActive) {
      scanContextDebounced(textRef.value)
    } else {
      scanContextDebounced.cancel()
    }
  })

  onUnmounted(() => {
    scanContextDebounced.cancel()
  })

  return { activeContextCharacters, activeContextWorldbook }
}
