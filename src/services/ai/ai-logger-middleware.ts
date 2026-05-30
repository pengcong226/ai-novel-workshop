/**
 * AI request/response logging middleware.
 *
 * Wraps ChatMessage[] -> ChatResponse calls with structured timing,
 * token accounting, error capture, and context-enriched log entries.
 *
 * Usage (standalone or inside the AI store):
 * ```ts
 * import { withAILogging } from '@/services/ai/ai-logger-middleware'
 *
 * const response = await withAILogging(
 *   { taskType: 'chapter', requestedBy: 'generation-scheduler' },
 *   messages,
 *   () => aiService.chat(messages, context, options)
 * )
 * ```
 */
import { getLogger, type LogContext } from '@/utils/logger'
import type { ChatMessage, ChatResponse } from '@/types/ai'

const aiLogger = getLogger('ai:middleware')

export interface AILogContext extends LogContext {
  /** Task type that triggered the AI call (chapter, outline, check, etc.) */
  taskType?: string
  /** Identifier of the caller (generation-scheduler, assistantChat, etc.) */
  requestedBy?: string
  /** Model override, if any */
  preferredModel?: string
  /** Whether the call is streaming */
  isStream?: boolean
  /** Additional arbitrary context */
  [key: string]: unknown
}

/**
 * Compute a rough character/token estimate for log visibility
 * without hitting an external tokenizer.
 */
function estimateTokensFromMessages(messages: ChatMessage[]): number {
  let total = 0
  for (const msg of messages) {
    // ~4 chars per token (rough GPT-family estimate)
    total += Math.ceil((msg.content?.length || 0) / 4)
    if (msg.role) total += 2 // role token overhead
  }
  return total
}

/**
 * Summarize a ChatResponse for logging (avoids dumping full content).
 */
function summarizeResponse(response: ChatResponse) {
  const contentPreview = response.content.length > 200
    ? response.content.slice(0, 200) + '...'
    : response.content

  return {
    model: response.model,
    finishReason: response.finishReason,
    latencyMs: response.latency,
    inputTokens: response.usage?.inputTokens,
    outputTokens: response.usage?.outputTokens,
    totalTokens: response.usage?.totalTokens,
    costUSD: response.cost?.totalUSD,
    contentLength: response.content.length,
    contentPreview
  }
}

/**
 * Wrap an AI call with structured logging (request, timing, response, error).
 *
 * @param aiContext   Structured context describing who/why the call is made.
 * @param messages    The messages being sent (used for token estimation only).
 * @param call        Async function that performs the actual AI request.
 * @returns           The ChatResponse from the wrapped call.
 */
export async function withAILogging(
  aiContext: AILogContext,
  messages: ChatMessage[],
  call: () => Promise<ChatResponse>
): Promise<ChatResponse> {
  const requestId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const mergedContext: AILogContext = { ...aiContext, requestId }

  const estimatedInputTokens = estimateTokensFromMessages(messages)
  const messageCount = messages.length

  aiLogger.infoWithContext(
    `[AI Request] ${aiContext.taskType || 'unknown'} | ${messageCount} messages, ~${estimatedInputTokens} tokens`,
    mergedContext
  )

  const startTime = performance.now()

  try {
    const response = await call()
    const elapsed = performance.now() - startTime

    const summary = summarizeResponse(response)

    aiLogger.infoWithContext(
      `[AI Response] ${response.model} | ${response.finishReason} | ${elapsed.toFixed(0)}ms | ` +
      `in=${response.usage?.inputTokens} out=${response.usage?.outputTokens} | cost=$${(response.cost?.totalUSD ?? 0).toFixed(4)}`,
      { ...mergedContext, ...summary }
    )

    // Warn on unusually slow or expensive calls
    if (elapsed > 30_000) {
      aiLogger.warnWithContext(
        `[AI Slow] ${response.model} took ${(elapsed / 1000).toFixed(1)}s`,
        mergedContext
      )
    }
    if ((response.cost?.totalUSD ?? 0) > 0.05) {
      aiLogger.warnWithContext(
        `[AI Expensive] ${response.model} cost $${response.cost!.totalUSD.toFixed(4)}`,
        mergedContext
      )
    }

    return response
  } catch (error: unknown) {
    const elapsed = performance.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    aiLogger.errorWithContext(
      `[AI Error] ${elapsed.toFixed(0)}ms | ${errorMessage}`,
      { ...mergedContext, error: errorMessage, elapsedMs: elapsed }
    )

    throw error
  }
}

/**
 * Decorate a streaming callback to log chunk-level progress.
 *
 * @param aiContext   Structured context for the enclosing request.
 * @param callback    The original stream event callback from the caller.
 * @returns           A wrapped callback that logs before forwarding.
 */
export function wrapStreamCallback(
  aiContext: AILogContext,
  callback: (event: { type: string; chunk?: string; response?: ChatResponse }) => void
): (event: { type: string; chunk?: string; response?: ChatResponse }) => void {
  let chunkCount = 0
  let totalChunkChars = 0

  return (event) => {
    if (event.type === 'chunk') {
      chunkCount++
      totalChunkChars += event.chunk?.length || 0

      // Log every 50 chunks to avoid log flooding
      if (chunkCount % 50 === 0) {
        aiLogger.debugWithContext(
          `[AI Stream] chunk #${chunkCount}, total ${totalChunkChars} chars`,
          { ...aiContext, chunkCount, totalChunkChars }
        )
      }
    } else if (event.type === 'done') {
      aiLogger.debugWithContext(
        `[AI Stream Done] ${chunkCount} chunks, ${totalChunkChars} chars`,
        { ...aiContext, chunkCount, totalChunkChars }
      )
    }

    callback(event)
  }
}
