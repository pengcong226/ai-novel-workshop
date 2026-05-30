/**
 * Rewrite / Continuation Composable
 *
 * Reactive Vue wrapper around RewriteContinuationService.
 * This is a **module-scope singleton** -- all consumers share the same state.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useRewriteContinuation } from '@/composables/useRewriteContinuation'
 *
 * const {
 *   isRunning, mode, diffReport, error,
 *   startRewrite, acceptRewrite, rejectRewrite, cancel,
 * } = useRewriteContinuation()
 * </script>
 * ```
 */

import { ref, readonly } from 'vue'
import { rewriteContinuationService } from '@/services/rewrite-continuation'
import type {
  ContinuationOptions,
  RewriteOptions,
  StateDiffReport
} from '@/types/rewrite-continuation'
import { getErrorMessage } from '@/utils/getErrorMessage'

const isRunning = ref(false)
const mode = ref<'continuation' | 'rewrite' | null>(null)
const diffReport = ref<StateDiffReport | null>(null)
const error = ref<string | null>(null)

export function useRewriteContinuation() {
  async function startContinuation(options: ContinuationOptions): Promise<void> {
    isRunning.value = true
    mode.value = 'continuation'
    error.value = null
    diffReport.value = null

    try {
      await rewriteContinuationService.continueNovel(options)
    } catch (err) {
      error.value = getErrorMessage(err)
    } finally {
      isRunning.value = false
    }
  }

  async function startRewrite(options: RewriteOptions): Promise<void> {
    if (isRunning.value) {
      error.value = '已有改写/续写任务进行中'
      return
    }

    isRunning.value = true
    mode.value = 'rewrite'
    error.value = null
    diffReport.value = null

    try {
      diffReport.value = await rewriteContinuationService.startRewrite(options)
    } catch (err) {
      error.value = getErrorMessage(err)
    } finally {
      isRunning.value = false
    }
  }

  async function acceptRewrite(): Promise<void> {
    if (!diffReport.value) return

    try {
      await rewriteContinuationService.acceptRewrite()
      diffReport.value = null
      mode.value = null
    } catch (err) {
      error.value = getErrorMessage(err)
    }
  }

  async function rejectRewrite(): Promise<void> {
    try {
      await rewriteContinuationService.rejectRewrite()
      diffReport.value = null
      mode.value = null
    } catch (err) {
      error.value = getErrorMessage(err)
    }
  }

  function cancel(): void {
    rewriteContinuationService.cancel()
    isRunning.value = false
    mode.value = null
  }

  return {
    /** Whether a rewrite/continuation is in progress (read-only) */
    isRunning: readonly(isRunning),
    /** Current mode: 'continuation', 'rewrite', or null (read-only) */
    mode: readonly(mode),
    /** State diff report for rewrite operations (read-only) */
    diffReport: readonly(diffReport),
    /** Current error message or null (read-only) */
    error: readonly(error),
    startContinuation, startRewrite, acceptRewrite, rejectRewrite, cancel
  }
}