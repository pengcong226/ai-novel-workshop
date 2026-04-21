import { ref, watch, onUnmounted, type Ref } from 'vue'
import { debounce } from 'lodash-es'
import { useSandboxStore, type ResolvedEntity } from '@/stores/sandbox'
import type { Entity } from '@/types/sandbox'
import type { Project } from '@/types'

export function useContextRadar(
  projectRef: Ref<Project | null | undefined>,
  textRef: Ref<string>,
  isActiveRef: Ref<boolean>
): {
  activeContextCharacters: Ref<ResolvedEntity[]>
  activeContextWorldbook: Ref<Entity[]>
} {
  const sandboxStore = useSandboxStore()

  const activeContextCharacters = ref<ResolvedEntity[]>([])
  const activeContextWorldbook = ref<Entity[]>([])

  function entityMatchesText(entity: Entity, text: string): boolean {
    if (text.includes(entity.name)) return true
    return entity.aliases?.some(alias => alias && text.includes(alias)) ?? false
  }

  const scanContextDebounced = debounce((text: string) => {
    const project = projectRef.value
    if (!project) return

    // Ensure sandbox data is loaded for this project
    if (!sandboxStore.isLoaded && !sandboxStore.isLoading) {
      void sandboxStore.loadData(project.id)
    }

    // Scan CHARACTER entities by name or alias
    const matchedCharacterIds = new Set<string>()
    for (const entity of sandboxStore.entities) {
      if (entity.isArchived || entity.type !== 'CHARACTER') continue
      if (entityMatchesText(entity, text)) {
        matchedCharacterIds.add(entity.id)
      }
    }

    // Resolve matched characters through the state reducer
    const resolvedState = sandboxStore.activeEntitiesState
    activeContextCharacters.value = Array.from(matchedCharacterIds)
      .map(id => resolvedState[id])
      .filter((e): e is ResolvedEntity => e !== undefined)

    // Scan LORE entities by name or alias keyword match
    activeContextWorldbook.value = sandboxStore.entities.filter(entity => {
      if (entity.isArchived || entity.type !== 'LORE') return false
      return entityMatchesText(entity, text)
    })
  }, 1500)

  watch(textRef, (newVal) => {
    if (isActiveRef.value) {
      scanContextDebounced(newVal)
    }
  })

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
