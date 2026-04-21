/**
 * SSE 流读取工具
 *
 * 消除 ai-service.ts 中 3 处近相同的 SSE 流读取样板代码
 */

/**
 * 从 SSE 响应流中提取文本增量
 *
 * @param body - fetch Response 的 body (ReadableStream)
 * @param extractContent - 从解析后的 JSON 中提取文本增量的回调
 * @param signal - 可选的 AbortSignal，用于中断流读取
 */
export async function* readSSEStream(
  body: ReadableStream<Uint8Array> | null | undefined,
  extractContent: (parsed: Record<string, unknown>) => string | undefined,
  signal?: AbortSignal
): AsyncGenerator<string> {
  if (!body) {
    throw new Error('Failed to get stream reader')
  }

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      if (signal?.aborted) break

      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') return

          try {
            const parsed = JSON.parse(data) as Record<string, unknown>
            const content = extractContent(parsed)
            if (content) {
              yield content
            }
          } catch {
            // 忽略不完整的 JSON 帧
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * OpenAI / Local 兼容格式的内容提取器
 */
export function openAIContentExtractor(parsed: Record<string, unknown>): string | undefined {
  const choices = parsed.choices as Array<{ delta?: { content?: string } }> | undefined
  return choices?.[0]?.delta?.content
}

/**
 * Anthropic Claude 格式的内容提取器
 */
export function claudeContentExtractor(parsed: Record<string, unknown>): string | undefined {
  if (parsed.type === 'content_block_delta') {
    const delta = parsed.delta as { text?: string } | undefined
    return delta?.text
  }
  return undefined
}
