export function getVectorDimensionByModel(provider: 'local' | 'openai', model?: string): number {
  if (provider === 'openai') {
    const openaiDimensions: Record<string, number> = {
      'text-embedding-3-small': 1536,
      'text-embedding-3-large': 3072,
      'text-embedding-ada-002': 1536,
    }
    return openaiDimensions[model || ''] || 1536
  }

  if (!model) return 384

  const m = model.toLowerCase()
  if (m.includes('bge-m3')) return 1024
  if (m.includes('bge-small-zh-v1.5')) return 512
  if (m.includes('all-mpnet-base-v2')) return 768
  if (m.includes('all-minilm-l6-v2')) return 384
  if (m.includes('paraphrase-multilingual-minilm-l12-v2')) return 384

  return 384
}
