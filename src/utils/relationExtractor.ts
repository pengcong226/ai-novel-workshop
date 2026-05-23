/**
 * 人物关系提取工具
 * 从人物设定和章节内容中提取关系数据
 */

import type { Chapter } from '@/types'
import type { ResolvedEntity } from '@/stores/sandbox'
import { RELATION_TYPE_CONFIG } from '@/utils/eventTypeLabels'

/**
 * 关系类型配置 — delegates to shared RELATION_TYPE_CONFIG
 */
export const RELATIONSHIP_TYPES = RELATION_TYPE_CONFIG

/**
 * G6 图数据节点
 */
export interface GraphNode {
  id: string
  label: string
  gender: 'male' | 'female' | 'other'
  age: number
  powerLevel?: string
  personality: string[]
  appearances: number
  isMain?: boolean
}

/**
 * G6 图数据边
 */
export interface GraphEdge {
  source: string
  target: string
  type: string
  label: string
  description: string
  strength: number
  color: string
}

/**
 * G6 图数据
 */
export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/**
 * 从人物列表提取关系图数据
 */
export function extractRelationships(entities: ResolvedEntity[]): GraphData {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const addedEdges = new Set<string>()

  // 创建节点
  entities.forEach(char => {
    const gender = (char.properties['gender'] as GraphNode['gender']) || 'other'
    const age = Number(char.properties['age']) || 0
    const powerLevel = char.properties['powerLevel']
    const personality = JSON.parse(char.properties['personality'] || '[]') as string[]
    const appearances = char.abilities.length > 0 ? char.abilities.length : 1

    nodes.push({
      id: char.id,
      label: char.name,
      gender,
      age,
      powerLevel,
      personality,
      appearances,
      isMain: appearances > 0
    })
  })

  // 创建边（关系）
  entities.forEach(char => {
    char.relations.forEach(rel => {
      // 避免重复边（A->B 和 B->A 视为同一条边）
      const edgeKey = [char.id, rel.targetId].sort().join('-')

      if (!addedEdges.has(edgeKey)) {
        const relConfig = RELATIONSHIP_TYPES[rel.type as keyof typeof RELATIONSHIP_TYPES] || RELATIONSHIP_TYPES.other
        edges.push({
          source: char.id,
          target: rel.targetId,
          type: rel.type,
          label: relConfig.label,
          description: rel.attitude || '',
          strength: relConfig.strength,
          color: relConfig.color
        })
        addedEdges.add(edgeKey)
      }
    })
  })

  return { nodes, edges }
}

/**
 * 从章节内容中提取人物互动关系
 * 分析章节内容，识别人物之间的互动
 */
export function extractFromChapters(
  chapters: Chapter[],
  entities: ResolvedEntity[]
): Map<string, { count: number; chapters: number[] }> {
  const interactions = new Map<string, { count: number; chapters: number[] }>()
  const characterNames = new Map<string, string>()

  // 建立名字到ID的映射（包括别名）
  entities.forEach(char => {
    characterNames.set(char.name, char.id)
    char.aliases.forEach(alias => {
      characterNames.set(alias, char.id)
    })
  })

  // 分析每章内容
  chapters.forEach(chapter => {
    const content = chapter.content
    const chapterNumber = chapter.number
    const foundChars = new Set<string>()

    // 查找出现在章节中的人物
    characterNames.forEach((id, name) => {
      if (content.includes(name)) {
        foundChars.add(id)
      }
    })

    // 同一章出现的人物视为有互动
    const charIds = Array.from(foundChars)
    for (let i = 0; i < charIds.length; i++) {
      for (let j = i + 1; j < charIds.length; j++) {
        const key = [charIds[i], charIds[j]].sort().join('-')
        const current = interactions.get(key) || { count: 0, chapters: [] }

        interactions.set(key, {
          count: current.count + 1,
          chapters: [...current.chapters, chapterNumber]
        })
      }
    }
  })

  return interactions
}

/**
 * 合并显式关系和隐式互动关系
 */
export function mergeRelationships(
  explicitData: GraphData,
  interactions: Map<string, { count: number; chapters: number[] }>
): GraphData {
  const merged = JSON.parse(JSON.stringify(explicitData)) as GraphData
  const existingEdges = new Set<string>()

  // 标记已存在的边
  merged.edges.forEach(edge => {
    const key = [edge.source, edge.target].sort().join('-')
    existingEdges.add(key)
  })

  // 添加隐式互动关系
  interactions.forEach((data, key) => {
    if (!existingEdges.has(key) && data.count >= 3) {
      // 至少3次互动才认为是隐式关系
      const [source, target] = key.split('-')
      merged.edges.push({
        source,
        target,
        type: 'other',
        label: '互动',
        description: `共同出场${data.count}次（章节：${data.chapters.slice(0, 5).join(', ')}${data.chapters.length > 5 ? '...' : ''}）`,
        strength: Math.min(5, Math.floor(data.count / 2)),
        color: '#C0C4CC'
      })
    }
  })

  return merged
}

/**
 * 过滤关系图数据
 */
export function filterGraphData(
  data: GraphData,
  filters: {
    relationshipTypes?: string[]
    minStrength?: number
    characterIds?: string[]
    showImplicit?: boolean
  }
): GraphData {
  let filteredEdges = [...data.edges]

  // 按关系类型过滤
  if (filters.relationshipTypes && filters.relationshipTypes.length > 0) {
    filteredEdges = filteredEdges.filter(edge =>
      filters.relationshipTypes!.includes(edge.type)
    )
  }

  // 按强度过滤
  if (filters.minStrength !== undefined) {
    filteredEdges = filteredEdges.filter(edge => edge.strength >= filters.minStrength!)
  }

  // 是否显示隐式关系
  if (filters.showImplicit === false) {
    filteredEdges = filteredEdges.filter(edge => edge.type !== 'other')
  }

  // 获取涉及的节点
  const involvedNodeIds = new Set<string>()
  filteredEdges.forEach(edge => {
    involvedNodeIds.add(edge.source)
    involvedNodeIds.add(edge.target)
  })

  // 如果指定了特定人物，只显示他们
  let filteredNodes = [...data.nodes]
  if (filters.characterIds && filters.characterIds.length > 0) {
    const targetIds = new Set(filters.characterIds)
    filteredNodes = filteredNodes.filter(node => {
      // 包含指定的人物
      if (targetIds.has(node.id)) return true
      // 或者与指定人物有关系
      return filteredEdges.some(
        edge =>
          (targetIds.has(edge.source) && edge.target === node.id) ||
          (targetIds.has(edge.target) && edge.source === node.id)
      )
    })
  } else {
    filteredNodes = filteredNodes.filter(node => involvedNodeIds.has(node.id))
  }

  return { nodes: filteredNodes, edges: filteredEdges }
}

/**
 * 导出图数据为图片（在组件中实现）
 */
export async function exportGraphAsImage(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) resolve(blob)
        else reject(new Error('Failed to export image'))
      },
      'image/png',
      1.0
    )
  })
}
