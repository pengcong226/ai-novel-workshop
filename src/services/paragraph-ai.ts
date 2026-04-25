import { useAIStore } from '@/stores/ai'

export type ParagraphAction = 'rewrite' | 'expand' | 'compress' | 'style'
export const PARAGRAPH_ACTIONS: readonly ParagraphAction[] = ['rewrite', 'expand', 'compress', 'style']

export function isParagraphAction(action: string): action is ParagraphAction {
  return (PARAGRAPH_ACTIONS as readonly string[]).includes(action)
}

export interface ParagraphAIRequest {
  action: ParagraphAction
  text: string
  styleTarget?: string
  context?: {
    chapterTitle: string
    chapterNumber: number
    beforeText: string
    afterText: string
  }
}

export interface ParagraphAIResponse {
  result: string
}

const PROMPTS: Record<ParagraphAction, (req: ParagraphAIRequest) => string> = {
  rewrite: (req) => `请重写以下段落，保持语义不变但改变措辞和表达方式。
上下文：...${req.context?.beforeText?.slice(-200)}...
【需要重写的段落】
${req.text}
请直接输出重写后的段落，不要解释。`,

  expand: (req) => `请将以下段落扩写为更详细、生动的描写，增加细节和画面感。
上下文：...${req.context?.beforeText?.slice(-200)}...
【需要扩写的段落】
${req.text}
请直接输出扩写后的段落，不要解释。`,

  compress: (req) => `请将以下段落精简压缩，保留核心信息，去除冗余描写。
【需要缩写的段落】
${req.text}
请直接输出缩写后的段落，不要解释。`,

  style: (req) => `请将以下段落改写为${req.styleTarget}风格，保持故事内容不变。
【需要改写的段落】
${req.text}
请直接输出改写后的段落，不要解释。`,
}

export async function executeParagraphAI(
  req: ParagraphAIRequest
): Promise<ParagraphAIResponse> {
  const aiStore = useAIStore()
  const prompt = PROMPTS[req.action](req)
  const messages = [
    { role: 'system' as const, content: '你是一位专业的中文小说文笔打磨师。只输出修改后的文本，不要包含任何解释、引言或多余内容。' },
    { role: 'user' as const, content: prompt }
  ]
  const response = await aiStore.chat(messages, {
    type: 'chapter',
    complexity: 'medium',
    priority: 'balanced'
  })
  return { result: response.content.trim() }
}
