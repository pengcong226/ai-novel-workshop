/**
 * Component-scoped logger composable.
 *
 * Automatically derives context from the current Vue component instance
 * (component name, current project ID) and provides a logger whose entries
 * are annotated with that context.
 *
 * Usage:
 * ```ts
 * import { useLogger } from '@/composables/useLogger'
 *
 * const logger = useLogger('MyComponent')
 * logger.info('mounted')               // auto-tagged with component name + projectId
 * logger.time('heavy-operation')
 * // ... work ...
 * logger.timeEnd('heavy-operation')
 * ```
 */
import { getCurrentInstance, onUnmounted } from 'vue'
import { getLogger, type LogContext } from '@/utils/logger'
import { useProjectStore } from '@/stores/project'

/** Shape returned by useLogger — mirrors the base logger with lazy context. */
export interface Logger {
  debug: (message: string, ...args: unknown[]) => void
  info: (message: string, ...args: unknown[]) => void
  warn: (message: string, ...args: unknown[]) => void
  error: (message: string, ...args: unknown[]) => void
  debugWithContext: (message: string, ctx: LogContext, ...args: unknown[]) => void
  infoWithContext: (message: string, ctx: LogContext, ...args: unknown[]) => void
  warnWithContext: (message: string, ctx: LogContext, ...args: unknown[]) => void
  errorWithContext: (message: string, ctx: LogContext, ...args: unknown[]) => void
}

/**
 * @param componentLabel  Human-readable label. If omitted, the name is
 *                        resolved from getCurrentInstance().
 * @param extraContext    Additional context fields to merge into every log
 *                        entry produced by this logger.
 */
export function useLogger(componentLabel?: string, extraContext?: LogContext): Logger {
  const vm = getCurrentInstance()

  const resolvedLabel =
    componentLabel ??
    (vm ? (vm.type as { __name?: string; name?: string }).__name ?? vm.type.name ?? 'Anonymous' : 'OutsideSetup')

  let projectIdCache: string | undefined

  function resolveProjectId(): string | undefined {
    try {
      if (projectIdCache !== undefined) return projectIdCache
      const projectStore = useProjectStore()
      projectIdCache = projectStore.currentProject?.id
      return projectIdCache
    } catch {
      // Pinia not available (e.g. unit tests or non-setup call sites).
      return undefined
    }
  }

  const context: LogContext = {
    module: resolvedLabel,
    ...extraContext
  }

  // Eagerly try to populate projectId; if the store is not ready yet it
  // will be resolved lazily on first log call.
  const projectId = resolveProjectId()
  if (projectId) {
    context.projectId = projectId
  }

  const baseLogger = getLogger(`component:${resolvedLabel}`, context)

  // Wrap each level so projectId is lazily re-resolved if it was not
  // available at setup time (e.g. before the project store is hydrated).
  function ensureProjectId(): void {
    if (context.projectId) return
    const pid = resolveProjectId()
    if (pid) context.projectId = pid
  }

  const logger: Logger = {
    debug: (message: string, ...args: unknown[]) => {
      ensureProjectId()
      return baseLogger.debug(message, ...args)
    },
    info: (message: string, ...args: unknown[]) => {
      ensureProjectId()
      return baseLogger.info(message, ...args)
    },
    warn: (message: string, ...args: unknown[]) => {
      ensureProjectId()
      return baseLogger.warn(message, ...args)
    },
    error: (message: string, ...args: unknown[]) => {
      ensureProjectId()
      return baseLogger.error(message, ...args)
    },
    debugWithContext: (message: string, ctx: LogContext, ...args: unknown[]) => {
      ensureProjectId()
      return baseLogger.debugWithContext(message, ctx, ...args)
    },
    infoWithContext: (message: string, ctx: LogContext, ...args: unknown[]) => {
      ensureProjectId()
      return baseLogger.infoWithContext(message, ctx, ...args)
    },
    warnWithContext: (message: string, ctx: LogContext, ...args: unknown[]) => {
      ensureProjectId()
      return baseLogger.warnWithContext(message, ctx, ...args)
    },
    errorWithContext: (message: string, ctx: LogContext, ...args: unknown[]) => {
      ensureProjectId()
      return baseLogger.errorWithContext(message, ctx, ...args)
    }
  }

  // Cleanup on unmount: clear the projectId cache so it does not leak across
  // hot-module replacements or re-mounts.
  if (vm) {
    onUnmounted(() => {
      projectIdCache = undefined
    })
  }

  return logger
}
