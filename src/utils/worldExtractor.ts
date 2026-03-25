/**
 * 世界观提取器
 * 从文本中提取世界设定信息
 */

import type { WorldSetting } from '@/types'

export interface ExtractedWorldInfo {
  era: {
    time: string
    techLevel: string
    socialForm: string
  }
  locations: Array<{
    name: string
    description: string
    type: string
  }>
  powerSystem?: {
    name: string
    description: string
    levels: Array<{
      name: string
      description: string
    }>
  }
  factions: Array<{
    name: string
    type: string
    description: string
  }>
}

/**
 * 提取时代背景信息
 */
function extractEraInfo(text: string): ExtractedWorldInfo['era'] {
  const eraPatterns = {
    ancient: /古代|封建|王朝|皇帝|皇宫|朝廷|武侠|江湖/g,
    modern: /现代|都市|公司|手机|电脑|互联网|汽车/g,
    future: /未来|星际|宇宙|飞船|科技|人工智能|机器人/g,
    fantasy: /修炼|灵气|仙界|魔界|神界|法术|魔法/g
  }

  const scores: Record<string, number> = {}
  for (const [era, pattern] of Object.entries(eraPatterns)) {
    const matches = text.match(pattern)
    scores[era] = matches ? matches.length : 0
  }

  // 找出得分最高的时代
  const maxEra = Object.entries(scores).reduce((a, b) =>
    a[1] > b[1] ? a : b
  )

  const eraNames: Record<string, { time: string; techLevel: string; socialForm: string }> = {
    ancient: {
      time: '古代',
      techLevel: '冷兵器时代',
      socialForm: '封建社会'
    },
    modern: {
      time: '现代',
      techLevel: '信息时代',
      socialForm: '现代社会'
    },
    future: {
      time: '未来',
      techLevel: '高科技时代',
      socialForm: '星际文明'
    },
    fantasy: {
      time: '架空',
      techLevel: '超自然力量',
      socialForm: '修炼世界'
    }
  }

  return eraNames[maxEra[0]] || eraNames.modern
}

/**
 * 提取地点信息
 */
function extractLocations(text: string, chapters: Array<{ content: string }>): ExtractedWorldInfo['locations'] {
  const locationPatterns = [
    /在([^\s，。！？]{2,8})(?:城|镇|村|山|谷|岛|国|界|域|殿|宫|阁|楼|院|府)/g,
    /来到([^\s，。！？]{2,8})(?:城|镇|村|山|谷|岛|国|界|域|殿|宫|阁|楼|院|府)/g,
    /位于([^\s，。！？]{2,8})(?:城|镇|村|山|谷|岛|国|界|域|殿|宫|阁|楼|院|府)/g
  ]

  const locationCounts = new Map<string, number>()

  for (const pattern of locationPatterns) {
    const allText = chapters.map(ch => ch.content).join('\n')
    const matches = allText.matchAll(pattern)

    for (const match of matches) {
      const location = match[1] + match[0].slice(-1) // 完整地名
      locationCounts.set(location, (locationCounts.get(location) || 0) + 1)
    }
  }

  // 过滤出现次数 >= 2 的地点，按出现次数排序
  const locations = [...locationCounts]
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20) // 最多20个地点
    .map(([name, count]) => ({
      name,
      description: `在故事中出现 ${count} 次`,
      type: inferLocationType(name)
    }))

  return locations
}

/**
 * 推断地点类型
 */
function inferLocationType(name: string): string {
  if (name.includes('城') || name.includes('镇')) return '城镇'
  if (name.includes('山') || name.includes('谷')) return '自然景观'
  if (name.includes('殿') || name.includes('宫')) return '建筑'
  if (name.includes('国') || name.includes('界')) return '地域'
  return '其他'
}

/**
 * 提取力量体系
 */
function extractPowerSystem(text: string): ExtractedWorldInfo['powerSystem'] | undefined {
  // 修炼体系模式
  const cultivationPatterns = [
    /(\w+境)\s*[:：]\s*([^\n]+)/g,
    /(\w+级)\s*[:：]\s*([^\n]+)/g,
    /(\w+阶)\s*[:：]\s*([^\n]+)/g
  ]

  const levels: Array<{ name: string; description: string }> = []

  for (const pattern of cultivationPatterns) {
    const matches = text.matchAll(pattern)
    for (const match of matches) {
      levels.push({
        name: match[1],
        description: match[2].trim()
      })
    }
  }

  if (levels.length === 0) {
    // 尝试自动提取修炼等级
    const levelKeywords = ['练气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫']
    const foundLevels = levelKeywords.filter(level => text.includes(level))

    if (foundLevels.length >= 3) {
      return {
        name: '修炼体系',
        description: '从文本中提取的修炼等级',
        levels: foundLevels.map(level => ({
          name: level,
          description: `${level}期`
        }))
      }
    }

    return undefined
  }

  return {
    name: '力量体系',
    description: '从文本中提取的力量等级',
    levels: levels.slice(0, 10) // 最多10个等级
  }
}

/**
 * 提取势力信息
 */
function extractFactions(text: string, chapters: Array<{ content: string }>): ExtractedWorldInfo['factions'] {
  const factionPatterns = [
    /([^\s，。！？]{2,6})(?:门|派|宗|阁|楼|盟|会|帮|教|族)/g
  ]

  const factionCounts = new Map<string, number>()
  const allText = chapters.map(ch => ch.content).join('\n')

  for (const pattern of factionPatterns) {
    const matches = allText.matchAll(pattern)

    for (const match of matches) {
      const faction = match[0]
      factionCounts.set(faction, (factionCounts.get(faction) || 0) + 1)
    }
  }

  // 过滤出现次数 >= 3 的势力
  const factions = [...factionCounts]
    .filter(([_, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({
      name,
      type: inferFactionType(name),
      description: `在故事中出现 ${count} 次`
    }))

  return factions
}

/**
 * 推断势力类型
 */
function inferFactionType(name: string): string {
  if (name.includes('门') || name.includes('派')) return '门派'
  if (name.includes('宗')) return '宗门'
  if (name.includes('阁') || name.includes('楼')) return '组织'
  if (name.includes('盟') || name.includes('会')) return '联盟'
  if (name.includes('帮')) return '帮派'
  if (name.includes('教')) return '教派'
  if (name.includes('族')) return '家族'
  return '组织'
}

/**
 * 从章节文本中提取世界设定
 */
export async function extractWorldInfo(
  text: string,
  chapters: Array<{ content: string }>,
  onProgress?: (progress: number) => void
): Promise<ExtractedWorldInfo> {
  // 提取时代背景
  const era = extractEraInfo(text)
  onProgress?.(30)

  // 提取地点
  const locations = extractLocations(text, chapters)
  onProgress?.(50)

  // 提取力量体系
  const powerSystem = extractPowerSystem(text)
  onProgress?.(70)

  // 提取势力
  const factions = extractFactions(text, chapters)
  onProgress?.(100)

  return {
    era,
    locations,
    powerSystem,
    factions
  }
}

/**
 * 将提取的世界信息转换为项目格式
 */
export function convertToWorldTemplate(
  extracted: ExtractedWorldInfo,
  projectName: string
): WorldSetting {
  return {
    name: `${projectName}的世界`,
    description: '从导入小说中提取的世界设定',
    era: extracted.era,
    locations: extracted.locations.map(loc => ({
      id: `loc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: loc.name,
      description: loc.description,
      type: loc.type,
      attributes: [],
      notes: ''
    })),
    powerSystem: extracted.powerSystem ? {
      name: extracted.powerSystem.name,
      description: extracted.powerSystem.description,
      levels: extracted.powerSystem.levels.map(level => ({
        name: level.name,
        description: level.description,
        abilities: []
      }))
    } : undefined,
    rules: [],
    customs: [],
    factions: extracted.factions.map(fac => ({
      id: `fac_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: fac.name,
      type: fac.type,
      description: fac.description,
      members: [],
      relationships: [],
      territory: '',
      resources: [],
      goals: '',
      history: ''
    }))
  }
}
