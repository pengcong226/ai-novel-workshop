import type { StyleProfile } from '@/types'
import { useAIStore } from '@/stores/ai'
import { getStylePreset, mergeStyleProfile } from '@/data/stylePresets'
import { safeParseAIJson } from '@/utils/safeParseAIJson'

export interface StyleExtractionRequest {
  sampleText: string
  currentProfile?: StyleProfile
  projectGenre?: string
}

export interface StyleExtractionResponse {
  profile: StyleProfile
}

export async function extractStyleProfile(req: StyleExtractionRequest): Promise<StyleExtractionResponse> {
  const fallback = req.currentProfile ?? getStylePreset()
  const prompt = `请从以下中文小说样本文本中提取写作风格，返回严格 JSON，不要解释。

字段要求：
{
  "name": "风格名称",
  "description": "一句话说明",
  "genre": "题材，可选",
  "tone": "轻松|严肃|幽默|黑暗",
  "narrativePerspective": "第一人称|第三人称",
  "pacing": "舒缓|均衡|紧凑",
  "vocabulary": "通俗|典雅|专业|诗性",
  "sentenceStyle": "短句利落|长句铺陈|长短结合",
  "dialogueStyle": "简洁|华丽|幽默|严肃",
  "descriptionLevel": "详细|适中|简洁",
  "avoidList": ["应避免的写法"],
  "examplePhrases": ["样本文风短句"],
  "customInstructions": "用于后续生成的风格指令"
}

项目题材：${req.projectGenre || fallback.genre || '未指定'}

样本文本：
${req.sampleText.slice(0, 6000)}`

  const aiStore = useAIStore()
  const response = await aiStore.chat([
    { role: 'system', content: '你是中文小说文风分析师，只输出可解析的 JSON。' },
    { role: 'user', content: prompt }
  ], {
    type: 'check',
    complexity: 'medium',
    priority: 'balanced'
  })

  const parsed = safeParseAIJson<unknown>(response.content)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI 未返回可解析的风格 JSON')
  }

  const extracted = parsed as Partial<StyleProfile>
  return {
    profile: mergeStyleProfile({
      ...extracted,
      id: fallback.id,
      metadata: {
        ...fallback.metadata,
        ...(extracted.metadata && typeof extracted.metadata === 'object' ? extracted.metadata : {}),
        source: 'ai-extracted',
        updatedAt: Date.now()
      }
    }, fallback)
  }
}
