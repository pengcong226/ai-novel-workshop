/**
 * Rewrite/Continuation Composable
 *
 * Reactive Vue wrapper around RewriteContinuationService.
 * Module-scope refs ensure all consumers share the same reactive state.
 */

import { ref } from 'vue'
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
    isRunning, mode, diffReport, error,
    startContinuation, startRewrite, acceptRewrite, rejectRewrite, cancel
  }
}