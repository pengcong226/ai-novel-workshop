/**
 * 地图导出工具
 */

import type { MapData, Location, MapRegion, MapRoute } from '@/types'

/**
 * 导出地图为 JSON 数据
 */
export function exportMapToJSON(mapData: MapData): string {
  return JSON.stringify(mapData, null, 2)
}

/**
 * 从 JSON 导入地图数据
 */
export function importMapFromJSON(json: string): MapData {
  try {
    const data = JSON.parse(json)
    // 验证数据结构
    if (!data.width || !data.height || !Array.isArray(data.locations)) {
      throw new Error('Invalid map data structure')
    }
    return data as MapData
  } catch (error) {
    throw new Error(`Failed to import map: ${(error as Error).message}`)
  }
}

/**
 * 导出地图为 SVG 格式
 */
export function exportMapToSVG(
  mapData: MapData,
  options: {
    includeGrid?: boolean
    includeLabels?: boolean
    includeDescriptions?: boolean
  } = {}
): string {
  const {
    includeGrid = true,
    includeLabels = true,
    includeDescriptions = false
  } = options

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${mapData.width}" height="${mapData.height}" viewBox="0 0 ${mapData.width} ${mapData.height}">`

  // 背景
  svg += `<rect width="${mapData.width}" height="${mapData.height}" fill="${mapData.background || '#f5f5f5'}"/>`

  // 网格
  if (includeGrid && mapData.gridEnabled) {
    svg += `<defs><pattern id="grid" width="${mapData.gridSize}" height="${mapData.gridSize}" patternUnits="userSpaceOnUse"><path d="M ${mapData.gridSize} 0 L 0 0 0 ${mapData.gridSize}" fill="none" stroke="#e0e0e0" stroke-width="0.5"/></pattern></defs><rect width="100%" height="100%" fill="url(#grid)"/>`
  }

  // 区域
  mapData.regions.forEach(region => {
    if (region.points.length >= 3) {
      const pathData = region.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
      svg += `<path d="${pathData}" fill="${region.color}" stroke="${region.borderColor || '#333'}" stroke-width="2" opacity="0.5"/>`
    }
  })

  // 路线
  mapData.routes.forEach(route => {
    if (route.points.length >= 2) {
      const pathData = route.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
      const strokeWidth = route.type === 'road' ? 3 : route.type === 'river' ? 4 : 2
      svg += `<path d="${pathData}" fill="none" stroke="${route.color}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`
    }
  })

  // 地点
  mapData.locations.forEach(location => {
    if (location.position) {
      const size = location.importance === 'high' ? 12 : location.importance === 'medium' ? 9 : 6
      const color = location.color || getDefaultLocationColor(location.type)

      // 图标
      svg += `<circle cx="${location.position.x}" cy="${location.position.y}" r="${size}" fill="${color}" stroke="#333" stroke-width="1.5"/>`

      // 标签
      if (includeLabels) {
        svg += `<text x="${location.position.x}" y="${location.position.y - size - 5}" text-anchor="middle" font-size="12" font-weight="bold" fill="#333">${location.name}</text>`
      }

      // 描述（可选）
      if (includeDescriptions && location.description) {
        svg += `<text x="${location.position.x}" y="${location.position.y + size + 15}" text-anchor="middle" font-size="10" fill="#666">${location.description.substring(0, 20)}...</text>`
      }
    }
  })

  svg += '</svg>'
  return svg
}

/**
 * 导出地图为 PNG 图片（需要 canvas）
 */
export async function exportMapToPNG(
  mapData: MapData,
  stage: any // Konva Stage 对象
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const dataURL = stage.toDataURL({ pixelRatio: 2 })
      fetch(dataURL)
        .then(res => res.blob())
        .then(blob => resolve(blob))
        .catch(reject)
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * 下载文件
 */
export function downloadFile(content: string | Blob, filename: string, mimeType?: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType || 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * 获取地点类型的默认颜色
 */
function getDefaultLocationColor(type?: string): string {
  const colors: Record<string, string> = {
    city: '#E91E63',
    town: '#9C27B0',
    village: '#673AB7',
    mountain: '#795548',
    river: '#2196F3',
    lake: '#03A9F4',
    forest: '#4CAF50',
    desert: '#FF9800',
    ocean: '#00BCD4',
    island: '#8BC34A',
    ruins: '#607D8B',
    dungeon: '#424242',
    castle: '#FF5722',
    temple: '#FFC107',
    other: '#9E9E9E'
  }
  return colors[type || 'other'] || colors.other
}

/**
 * 导出地点数据为 CSV
 */
export function exportLocationsToCSV(locations: Location[]): string {
  const headers = ['ID', 'Name', 'Type', 'Description', 'Importance', 'X', 'Y', 'Faction ID']
  const rows = locations.map(loc => [
    loc.id,
    loc.name,
    loc.type || 'other',
    loc.description,
    loc.importance,
    loc.position?.x || '',
    loc.position?.y || '',
    loc.factionId || ''
  ])

  const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n')
  return csvContent
}

/**
 * 从 WorldSetting 提取地图数据
 */
export function extractMapDataFromWorld(worldSetting: any): Partial<MapData> {
  const locations: Location[] = (worldSetting.geography?.locations || []).map((loc: any) => ({
    ...loc,
    position: {
      x: Math.random() * 800 + 100,
      y: Math.random() * 600 + 100
    },
    type: inferLocationType(loc.name, loc.description),
    color: undefined
  }))

  // 提取势力范围作为区域
  const regions: MapRegion[] = (worldSetting.factions || []).map((faction: any, index: number) => {
    // 生成随机多边形区域
    const centerX = 100 + (index % 3) * 300
    const centerY = 100 + Math.floor(index / 3) * 250
    const points = [
      { x: centerX - 80, y: centerY - 60 },
      { x: centerX + 80, y: centerY - 60 },
      { x: centerX + 100, y: centerY + 40 },
      { x: centerX, y: centerY + 80 },
      { x: centerX - 100, y: centerY + 40 }
    ]

    return {
      id: faction.id,
      name: faction.name,
      description: faction.description,
      color: `hsl(${index * 60}, 70%, 80%)`,
      borderColor: `hsl(${index * 60}, 70%, 40%)`,
      points,
      factionId: faction.id
    }
  })

  return {
    width: 1200,
    height: 800,
    gridEnabled: true,
    gridSize: 50,
    locations,
    regions,
    routes: [],
    characterLocations: []
  }
}

/**
 * 根据名称和描述推断地点类型
 */
function inferLocationType(name: string, description: string): Location['type'] {
  const text = `${name} ${description}`.toLowerCase()

  if (/城|都|市/.test(text)) return 'city'
  if (/镇|镇/.test(text)) return 'town'
  if (/村|乡/.test(text)) return 'village'
  if (/山|峰|岭/.test(text)) return 'mountain'
  if (/河|江|水/.test(text)) return 'river'
  if (/湖|潭|池/.test(text)) return 'lake'
  if (/林|森|森林/.test(text)) return 'forest'
  if (/沙|漠|沙漠/.test(text)) return 'desert'
  if (/海|洋/.test(text)) return 'ocean'
  if (/岛|屿/.test(text)) return 'island'
  if (/遗迹|废墟/.test(text)) return 'ruins'
  if (/地下|迷宫|副本/.test(text)) return 'dungeon'
  if (/城|堡|堡垒/.test(text)) return 'castle'
  if (/庙|寺|神庙/.test(text)) return 'temple'

  return 'other'
}
