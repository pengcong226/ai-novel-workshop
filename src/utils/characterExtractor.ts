/**
 * 人物提取器
 * 使用AI从文本中提取人物信息
 */

import type { Character } from '@/types'
import { getLogger } from '@/utils/logger'
const logger = getLogger('utils:characterExtractor')

export interface ExtractedCharacter {
  name: string
  aliases: string[]
  description: string
  firstAppearance: string
  role: 'protagonist' | 'supporting' | 'antagonist' | 'minor' | 'other'
  confidence: number
  occurrences: number
  relationships?: Array<{
    target: string
    type: string
    strength: number
  }>
}

export interface CharacterExtractionResult {
  characters: ExtractedCharacter[]
  totalOccurrences: number
  processingTime: number
}

/**
 * 使用AI提取人物信息 (改进版：真正调用大模型)
 */
export async function extractCharactersWithAI(
  text: string,
  onProgress?: (progress: number) => void
): Promise<CharacterExtractionResult> {
  const startTime = Date.now()

  try {
    // 动态导入 AI store
    const { useAIStore } = await import('@/stores/ai')
    const aiStore = useAIStore()
    
    // 如果没有配置 AI，则直接返回空，绝不使用劣质正则
    if (!aiStore.checkInitialized()) {
      logger.warn('AI未初始化，拒绝使用正则提取垃圾数据')
      return { characters: [], totalOccurrences: 0, processingTime: Date.now() - startTime }
    }
    
    let truncatedText = text.substring(0, 15000); // 截断避免超出，调大到 15000 以处理更多内容
    if (truncatedText.length > 0) {
      const lastCode = truncatedText.charCodeAt(truncatedText.length - 1);
      if (lastCode >= 0xD800 && lastCode <= 0xDBFF) {
        truncatedText = truncatedText.substring(0, truncatedText.length - 1);
      }
    }

    const prompt = `你是一个专业的实体识别引擎。请从以下小说文本中提取出所有真正具有独立人格或生命的“人物（角色）”。
绝对不要提取无生命的物品、地点、功法、武器名称。

返回一个合法的 JSON 数组，数组里的每个对象包含以下字段：
- name: 人物全名
- role: "protagonist" (主角) | "supporting" (配角) | "antagonist" (反派) | "minor" (龙套)
- description: 一句话简介
- firstAppearance: 该人物在文中出场的原句片段（20字以内）
- occurrences: 估算他在本文中出现的次数（数字）

请只返回 JSON 数组，不要有任何多余的解释文字。

小说文本：
${truncatedText}
`

    const response = await aiStore.chat([{ role: 'user' as const, content: prompt }], { type: 'character' as any, complexity: 'low' as const, priority: 'quality' as const }, { maxTokens: 4000 })
    
    let jsonStr = response.content.trim()
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1]
    } else {
      // 尝试寻找被文字包裹的 JSON 数组
      const startIdx = jsonStr.indexOf('[');
      const endIdx = jsonStr.lastIndexOf(']');
      if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
        jsonStr = jsonStr.substring(startIdx, endIdx + 1);
      }
    }
    
    const parsed = JSON.parse(jsonStr)
    const characters = Array.isArray(parsed) ? parsed : (parsed.characters || [])
    
    if (onProgress) onProgress(100)
    
    return {
      characters: characters.map((c: any) => ({
        name: c.name,
        aliases: [],
        description: c.description || '',
        firstAppearance: c.firstAppearance || '',
        role: c.role || 'minor',
        confidence: 0.9,
        occurrences: c.occurrences || 3
      })),
      totalOccurrences: characters.length * 3,
      processingTime: Date.now() - startTime
    }
    
  } catch (error) {
    logger.error('真正的 AI 人物提取失败，已经停止使用正则降级，直接返回空', error)
    // 放弃使用糟糕的正则降级，直接返回空数组，避免脏数据污染设定库
    return {
      characters: [],
      totalOccurrences: 0,
      processingTime: Date.now() - startTime
    }
  }
}

/**
 * 从章节文本中提取人物信息
 */
export async function extractCharactersFromChapters(
  chapters: Array<{ content: string; title: string }>,
  onProgress?: (current: number, total: number) => void
): Promise<CharacterExtractionResult> {
  const allText = chapters.map(ch => ch.content).join('\n\n')
  const result = await extractCharactersWithAI(allText, (progress) => {
    if (onProgress) {
      onProgress(Math.floor(progress), 100)
    }
  })

  return result
}

/**
 * 将提取的人物转换为项目人物格式
 */
export function convertToCharacters(
  extracted: ExtractedCharacter[]
): Partial<Character>[] {
  return extracted.map(ext => ({
    name: ext.name,
    aliases: ext.aliases,
    description: ext.description || `在故事中${ext.role === 'protagonist' ? '作为主角' : ext.role === 'supporting' ? '作为配角' : '出场'}`,
    background: '',
    personality: [],
    appearance: '',
    motivation: '',
    tags: [ext.role],
    appearances: [],
    relationships: [],
    notes: `首次出现: ${ext.firstAppearance.slice(0, 100)}...`
  }))
}

/**
 * 分析人物关系（简化版）
 */
export function analyzeRelationships(
  text: string,
  characters: ExtractedCharacter[]
): Array<{ from: string; to: string; type: string; strength: number }> {
  const relationships: Array<{ from: string; to: string; type: string; strength: number }> = []

  // 检查两个人物是否在同一个段落中出现
  const paragraphs = text.split(/\n\n+/)

  for (let i = 0; i < characters.length; i++) {
    for (let j = i + 1; j < characters.length; j++) {
      const char1 = characters[i]
      const char2 = characters[j]

      let coOccurrences = 0
      for (const para of paragraphs) {
        if (para.includes(char1.name) && para.includes(char2.name)) {
          coOccurrences++
        }
      }

      // 如果共同出现超过3次，认为有关系
      if (coOccurrences >= 3) {
        relationships.push({
          from: char1.name,
          to: char2.name,
          type: '关联',
          strength: Math.min(coOccurrences / 10, 1)
        })
      }
    }
  }

  return relationships
}

// ==========================================
// 零触感：全量实体提取引擎 (Phase 2 Zero-Touch)
// ==========================================

export interface ZeroTouchEntities {
  characters: Array<{ name: string; role: 'protagonist'|'supporting'|'antagonist'|'minor'; description: string }>;
  worldbook: Array<{ keyword: string; category: string; content: string }>;
  events: Array<{ description: string; importance: number; involved: string[] }>;
}

/**
 * 零触感：全域实体抽取器
 * 在后台分析章节文本时，一次性把人物、世界观（设定库词条）、重要大事件全部提取出来。
 */
export async function extractEntitiesWithAI(
  text: string
): Promise<ZeroTouchEntities> {
  const { useAIStore } = await import('@/stores/ai')
  const aiStore = useAIStore()
  if (!aiStore.checkInitialized()) throw new Error('AI未初始化')

  let truncatedText = text.substring(0, 15000);
  if (truncatedText.length > 0) {
    const lastCode = truncatedText.charCodeAt(truncatedText.length - 1);
    if (lastCode >= 0xD800 && lastCode <= 0xDBFF) {
      truncatedText = truncatedText.substring(0, truncatedText.length - 1);
    }
  }

  const prompt = `你是一个小说的“全域实体雷达系统”。请从下面的章节中，静默提取出三大类核心级情报。
返回严格的 JSON 对象结构如下：
{
  "characters": [ { "name": "人物全名", "role": "supporting", "description": "出场时的状态和身份特征" } ],
  "worldbook": [ { "keyword": "词条名（如地名/武器/门派/功法）", "category": "分类类别（如地点/物品/势力）", "content": "词条的作用和描述" } ],
  "events": [ { "description": "一句话概括章节发生的重要事件（如主角突破、反派死亡）", "importance": 8, "involved": ["参与者A"] } ]
}

【提取规则】：
- characters：只提取本章出现的且值得收录的生命实体。
- worldbook：只提取能够作为维基百科词条沉淀的世界观设定，常见的比如门派、地名、功法、武器。无意义的地名不提取。
- events：只提取推动了主线剧情的分水岭大事件！如果只是普通的日常对话，请将其留空 []。importance 代表事件影响主线的严重程度（0为日常，10为改变世界格局）。

小说文本片段：
${truncatedText}`

  const response = await aiStore.chat([{ role: 'user', content: prompt }], { type: 'check' as const, complexity: 'low', priority: 'quality' }, { maxTokens: 4000 })
  let jsonStr = response.content.trim()
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (jsonMatch) jsonStr = jsonMatch[1]
  else {
    const startIdx = jsonStr.indexOf('{');
    const endIdx = jsonStr.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) jsonStr = jsonStr.substring(startIdx, endIdx + 1);
  }

  try {
    const parsed = JSON.parse(jsonStr) as ZeroTouchEntities;
    return {
      characters: Array.isArray(parsed.characters) ? parsed.characters : [],
      worldbook: Array.isArray(parsed.worldbook) ? parsed.worldbook : [],
      events: Array.isArray(parsed.events) ? parsed.events : []
    }
  } catch (err) {
    logger.error('全量实体提取失败:', err)
    return { characters: [], worldbook: [], events: [] }
  }
}
