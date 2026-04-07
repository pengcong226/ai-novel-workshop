/**
 * 安全解析 AI 返回的 JSON 内容
 * 统一处理 markdown 代码块包裹、多余文本、格式偏差等常见问题
 * V3 重构：抽取为公共工具，消除散落在各文件中的重复逻辑
 */
export function safeParseAIJson<T = any>(raw: string): T | null {
  if (!raw || typeof raw !== 'string') return null

  let cleaned = raw.trim()

  // 1. 尝试提取 ```json ... ``` 代码块
  const jsonBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (jsonBlockMatch) {
    cleaned = jsonBlockMatch[1].trim()
  }

  // 2. 尝试直接解析
  try {
    return JSON.parse(cleaned) as T
  } catch { /* continue */ }

  // 3. 尝试提取最外层 { ... } 或 [ ... ]
  const objectMatch = cleaned.match(/(\{[\s\S]*\})/)
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[1]) as T
    } catch { /* continue */ }
  }

  const arrayMatch = cleaned.match(/(\[[\s\S]*\])/)
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[1]) as T
    } catch { /* continue */ }
  }

  // 4. 全部失败
  console.warn('[safeParseAIJson] 无法解析 AI 返回的 JSON:', cleaned.substring(0, 200))
  return null
}
