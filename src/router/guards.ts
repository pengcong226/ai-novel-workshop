import { useProjectStore } from '@/stores/project'
import { getLogger } from '@/utils/logger'
import type { NavigationGuardWithThis, RouteLocationNormalized } from 'vue-router'

const logger = getLogger('router:guards')

/**
 * Validates that the target project exists before entering the editor.
 * Redirects to project list with a notification if the ID is invalid.
 */
export const projectExistsGuard: NavigationGuardWithThis<undefined> = async (to) => {
  if (to.name !== 'ProjectEditor') return true

  const projectId = to.params.id as string
  if (!projectId) {
    logger.warn('Project editor accessed without ID, redirecting to project list')
    return { name: 'ProjectList' }
  }

  const projectStore = useProjectStore()

  // If projects haven't been loaded yet, load them first
  if (!projectStore.projects.length) {
    try {
      await projectStore.loadProjects()
    } catch (err) {
      logger.error('Failed to load projects during route guard', err)
      return { name: 'ProjectList' }
    }
  }

  const exists = projectStore.projects.some((p) => p.id === projectId)
  if (!exists) {
    logger.warn(`Project not found: ${projectId}, redirecting to project list`)
    return { name: 'ProjectList' }
  }

  return true
}

/**
 * Resolves dynamic page title based on route meta and project name.
 */
export function resolvePageTitle(to: RouteLocationNormalized): string {
  const baseTitle = 'AI小说工坊'
  const metaTitle = to.meta.title as string | undefined

  if (to.name === 'ProjectEditor') {
    const projectStore = useProjectStore()
    const projectId = to.params.id as string
    const project = projectStore.projects.find((p) => p.id === projectId)
    if (project?.title) {
      return `${project.title} - ${baseTitle}`
    }
  }

  return metaTitle ? `${metaTitle} - ${baseTitle}` : baseTitle
}
