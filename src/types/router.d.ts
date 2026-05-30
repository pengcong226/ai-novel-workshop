import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    /** Page title shown in browser tab */
    title?: string
    /** Breadcrumb label for navigation */
    breadcrumb?: string
    /** Transition animation name for route change */
    transition?: string
    /** Whether this route requires a valid project to be loaded */
    requiresProject?: boolean
  }
}
