/**
 * AI增强分析器
 * 使用AI模型对小说内容进行智能分析
 */

import type { ExtractedCharacter } from './characterExtractor'
import type { ExtractedWorldInfo } from './worldExtractor'
import type { GeneratedOutline } from './outlineGenerator'

export interface AIAnalysisConfig {
  enabled: boolean
  provider: 'claude' | 'openai' | 'local'
  apiKey?: string
  baseURL?: string
  model?: string
}

export interface AICharacterAnalysis {
  name: string
  role: 'protagonist' | 'supporting' | 'antagonist' | 'minor' | 'other'
  gender?: string
  age?: string
  personality: string[]
  background: string
  abilities: string[]
  relationships: Array<{
    target: string
    relation: string
  }>
}

export interface AIWorldAnalysis {
  setting: string
  era: string
  technology: string
  magic_system?: string
  major_factions: string[]
  key_locations: string[]
}

export interface AIOutlineAnalysis {
  main_plot: string
  sub_plots: string[]
  key_events: Array<{
    chapter: number
    event: string
  }>
}

/**
 * 默认AI配置
 */
export const DEFAULT_AI_CONFIG: AIAnalysisConfig = {
  enabled: true,
  provider: 'claude',
  apiKey: undefined,
  baseURL: undefined,
  model: 'claude-3-5-sonnet-20241022'
}

/**
 * 调用AI API
 */
async function callAI(
  prompt: string,
  config: AIAnalysisConfig
): Promise<string> {
  if (!config.enabled) {
    throw new Error('AI分析未启用')
  }

  // 构建请求体（OpenAI格式）
  const body = {
    model: config.model || DEFAULT_AI_CONFIG.model,
    max_tokens: 4000,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  }

  let apiURL = ''
  let headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  // 根据provider选择不同的API路径
  if (config.provider === 'claude') {
    // Claude API - 使用代理
    apiURL = '/api/claude/v1/messages'
    headers['x-api-key'] = config.apiKey || ''
    headers['anthropic-version'] = '2023-06-01'
    headers['anthropic-dangerous-direct-browser-access'] = 'true'

    // Claude使用不同的请求格式
    body.messages = undefined
    body.system = "You are a professional novel analysis expert."
    body.prompt = prompt

  } else if (config.provider === 'openai') {
    // OpenAI API - 使用代理
    apiURL = '/api/openai/v1/chat/completions'
    headers['Authorization'] = `Bearer ${config.apiKey}`

  } else if (config.provider === 'custom' && config.baseURL) {
    // 自定义API - 直接调用，不使用代理
    const baseURL = config.baseURL.replace(/\/$/, '')
    apiURL = `${baseURL}/chat/completions`
    headers['Authorization'] = `Bearer ${config.apiKey}`

    console.log('[AI分析] 直接调用自定义API:', apiURL)
  } else {
    throw new Error('未配置AI API密钥或地址')
  }

  try {
    console.log('[AI分析] 调用API:', apiURL)

    const response = await fetch(apiURL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[AI分析] API错误响应:', errorText)
      throw new Error(`AI API调用失败: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()

    // Claude和OpenAI的响应格式不同
    if (config.provider === 'claude') {
      const text = data.content?.[0]?.text || data.completion || ''
      console.log('[AI分析] Claude响应长度:', text.length)
      return text
    } else {
      const text = data.choices?.[0]?.message?.content || ''
      console.log('[AI分析] OpenAI响应长度:', text.length)
      return text
    }
  } catch (error) {
    console.error('[AI分析] API调用失败:', error)

    // 提供更详细的错误信息
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      throw new Error('网络请求失败，可能是CORS问题。请联系API提供商添加Access-Control-Allow-Origin头部，或在服务器端配置代理')
    }

    throw error
  }
}

/**
 * AI增强人物识别
 */
export async function aiExtractCharacters(
  text: string,
  existingCharacters: ExtractedCharacter[],
  config: AIAnalysisConfig,
  onProgress?: (progress: number) => void
): Promise<AICharacterAnalysis[]> {
  // 取前10000字作为样本
  const sampleText = text.slice(0, 10000)

  const prompt = `你是一位专业的小说分析专家。请分析以下小说片段，识别其中的主要人物。

小说片段：
${sampleText}

已有的人物识别结果（可能不准确）：
${existingCharacters.slice(0, 20).map(c => `- ${c.name} (出现${c.occurrences}次)`).join('\n')}

请以JSON格式返回识别到的人物，格式如下：
[
  {
    "name": "人物姓名",
    "role": "protagonist/supporting/antagonist/minor/other",
    "gender": "性别（如果可推断）",
    "age": "年龄段（如果可推断）",
    "personality": ["性格特征1", "性格特征2"],
    "background": "简要背景描述",
    "abilities": ["能力1", "能力2"],
    "relationships": [
      {"target": "其他人物姓名", "relation": "关系描述"}
    ]
  }
]

注意：
1. 只返回真正的角色人物，不要返回"起来"、"的时候"等词语
2. 主要人物必须出场多次且有明确的行为描述
3. 根据人物在文本中的重要性和出场频率判断角色类型
4. 只返回JSON数组，不要有其他说明文字`

  onProgress?.(30)

  try {
    const response = await callAI(prompt, config)
    onProgress?.(90)

    // 解析JSON
    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const characters = JSON.parse(jsonMatch[0])
      onProgress?.(100)
      return characters
    }

    throw new Error('AI返回格式不正确')
  } catch (error) {
    console.error('AI人物识别失败:', error)
    onProgress?.(100)
    throw error
  }
}

/**
 * AI增强世界观分析
 */
export async function aiAnalyzeWorld(
  text: string,
  config: AIAnalysisConfig,
  onProgress?: (progress: number) => void
): Promise<AIWorldAnalysis> {
  const sampleText = text.slice(0, 15000)

  const prompt = `你是一位专业的小说世界观分析专家。请分析以下小说片段的世界设定。

小说片段：
${sampleText}

请以JSON格式返回世界设定分析：
{
  "setting": "世界类型（如：修仙世界、现代都市、科幻星际、武侠江湖等）",
  "era": "时代背景",
  "technology": "科技水平描述",
  "magic_system": "力量体系/修炼体系（如果有）",
  "major_factions": ["主要势力1", "主要势力2"],
  "key_locations": ["重要地点1", "重要地点2"]
}

只返回JSON对象，不要有其他说明文字。`

  onProgress?.(30)

  try {
    const response = await callAI(prompt, config)
    onProgress?.(90)

    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const world = JSON.parse(jsonMatch[0])
      onProgress?.(100)
      return world
    }

    throw new Error('AI返回格式不正确')
  } catch (error) {
    console.error('AI世界观分析失败:', error)
    onProgress?.(100)
    throw error
  }
}

/**
 * AI增强大纲生成
 */
export async function aiGenerateOutline(
  chapters: Array<{ number: number; title: string; content: string }>,
  config: AIAnalysisConfig,
  onProgress?: (progress: number) => void
): Promise<AIOutlineAnalysis> {
  // 取前20章的摘要
  const chapterSummaries = chapters.slice(0, 20).map(ch =>
    `第${ch.number}章 ${ch.title}: ${ch.content.slice(0, 200)}...`
  ).join('\n')

  const prompt = `你是一位专业的小说大纲分析专家。请分析以下章节内容，生成结构化大纲。

章节内容：
${chapterSummaries}

请以JSON格式返回大纲分析：
{
  "main_plot": "主线剧情描述",
  "sub_plots": ["支线剧情1", "支线剧情2"],
  "key_events": [
    {"chapter": 1, "event": "关键事件描述"},
    {"chapter": 2, "event": "关键事件描述"}
  ]
}

只返回JSON对象，不要有其他说明文字。`

  onProgress?.(30)

  try {
    const response = await callAI(prompt, config)
    onProgress?.(90)

    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const outline = JSON.parse(jsonMatch[0])
      onProgress?.(100)
      return outline
    }

    throw new Error('AI返回格式不正确')
  } catch (error) {
    console.error('AI大纲生成失败:', error)
    onProgress?.(100)
    throw error
  }
}

/**
 * 将AI分析结果转换为程序识别格式
 */
export function convertAICharactersToExtracted(
  aiCharacters: AICharacterAnalysis[],
  programCharacters: ExtractedCharacter[]
): ExtractedCharacter[] {
  // 合并AI识别和程序识别的结果
  const merged = new Map<string, ExtractedCharacter>()

  // 先添加程序识别的结果
  for (const char of programCharacters) {
    merged.set(char.name, char)
  }

  // 用AI识别的结果更新
  for (const aiChar of aiCharacters) {
    const existing = merged.get(aiChar.name)
    if (existing) {
      // 更新现有信息
      existing.role = aiChar.role
      existing.confidence = 0.95 // AI识别的置信度较高
      existing.description = aiChar.background || existing.description

      // 添加关系信息
      for (const rel of aiChar.relationships || []) {
        if (!existing.relationships) {
          existing.relationships = []
        }
        existing.relationships.push({
          target: rel.target,
          type: rel.relation,
          strength: 0.8
        })
      }
    } else {
      // 添加新识别的人物
      merged.set(aiChar.name, {
        name: aiChar.name,
        aliases: [],
        description: aiChar.background || '',
        firstAppearance: '',
        role: aiChar.role,
        confidence: 0.9,
        occurrences: 1, // AI识别但程序未找到，至少出现过
        relationships: (aiChar.relationships || []).map(rel => ({
          target: rel.target,
          type: rel.relation,
          strength: 0.8
        }))
      })
    }
  }

  // 按重要性排序
  const rolePriority = { protagonist: 0, supporting: 1, antagonist: 2, minor: 3, other: 4 }
  return Array.from(merged.values())
    .sort((a, b) => {
      const priorityDiff = rolePriority[a.role] - rolePriority[b.role]
      if (priorityDiff !== 0) return priorityDiff
      return b.occurrences - a.occurrences
    })
    .slice(0, 50) // 最多返回50个人物
}
