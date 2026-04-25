import type { StyleProfile } from '@/types'
import { useAIStore } from '@/stores/ai'
import { safeParseAIJson } from '@/utils/safeParseAIJson'

export interface StyleCheckIssue {
  severity: 'low' | 'medium' | 'high'
  title: string
  description: string
  suggestion: string
  excerpt?: string
}

export interface StyleCheckResult {
  score: number
  summary: string
  issues: StyleCheckIssue[]
}

export interface StyleCheckRequest {
  text: string
  styleProfile: StyleProfile
  chapterTitle?: string
}

export async function checkStyleConsistency(req: StyleCheckRequest): Promise<StyleCheckResult> {
  const style = req.styleProfile
  const prompt = `请检查章节文本是否符合项目写作风格，返回严格 JSON，不要解释。

项目风格：
- 名称：${style.name}
- 说明：${style.description}
- 基调：${style.tone}
- 叙事视角：${style.narrativePerspective}
- 节奏：${style.pacing}
- 词汇：${style.vocabulary}
- 句式：${style.sentenceStyle}
- 对话：${style.dialogueStyle}
- 描写密度：${style.descriptionLevel}
- 避免：${style.avoidList.join('、') || '无'}
- 补充要求：${style.customInstructions || '无'}

返回格式：
{
  "score": 1-10,
  "summary": "整体评价",
  "issues": [
    {
      "severity": "low|medium|high",
      "title": "问题标题",
      "description": "问题说明",
      "suggestion": "修改建议",
      "excerpt": "相关原文片段"
    }
  ]
}

章节：${req.chapterTitle || '未命名章节'}

正文：
${req.text.slice(0, 8000)}`

  const aiStore = useAIStore()
  const response = await aiStore.chat([
    { role: 'system', content: '你是中文小说风格一致性审校员，只输出可解析的 JSON。' },
    { role: 'user', content: prompt }
  ], {
    type: 'check',
    complexity: 'medium',
    priority: 'balanced'
  })

  const parsed = safeParseAIJson<unknown>(response.content)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI 未返回可解析的风格检查 JSON')
  }

  const result = parsed as Partial<Record<keyof StyleCheckResult, unknown>>
  return {
    score: normalizeScore(result.score),
    summary: typeof result.summary === 'string' ? result.summary : '未返回总结',
    issues: Array.isArray(result.issues) ? result.issues.map(normalizeIssue).filter(isStyleCheckIssue) : []
  }
}

function isStyleCheckIssue(issue: StyleCheckIssue | null): issue is StyleCheckIssue {
  return issue !== null
}

function normalizeScore(score: unknown): number {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 1
  return Math.min(10, Math.max(1, Math.round(score)))
}

function normalizeIssue(issue: unknown): StyleCheckIssue | null {
  if (!issue || typeof issue !== 'object' || Array.isArray(issue)) return null
  const item = issue as Partial<Record<keyof StyleCheckIssue, unknown>>
  return {
    severity: item.severity === 'high' || item.severity === 'medium' || item.severity === 'low' ? item.severity : 'medium',
    title: typeof item.title === 'string' ? item.title : '风格偏差',
    description: typeof item.description === 'string' ? item.description : '',
    suggestion: typeof item.suggestion === 'string' ? item.suggestion : '',
    excerpt: typeof item.excerpt === 'string' ? item.excerpt : undefined
  }
}
